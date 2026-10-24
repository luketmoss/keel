#!/usr/bin/env python3
"""
Keel pull request operations.

The mechanical halves of /review and /ship, as code, so each run does not work
them out again. Nothing here touches the board - that stays in board.py.

  pr.py ci <pr> [--timeout SECONDS]
  pr.py results <issue> <file>

`ci` is /review's "Verify the build". It works out which workflows the PR had
to pass from the base branch's .github/workflows/*.yml, waits for their runs on
the head commit, and prints the block /review specifies. Exit codes: 0 every
expected run succeeded, 1 a run failed or is absent, 2 the timeout passed with
runs still in progress.

`results` puts the file's contents into the issue body as its `## Results`
section, replacing an existing one up to the next `## ` heading or appending one
if there is none. Every other section is left byte for byte as it was.

Requires `gh`, and calls only repo-scoped REST through `gh api`, so it also runs
in a cloud session whose `gh` is refused GraphQL. A session with no `gh` at all
keeps the skills' GitHub MCP prose.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.parse

ROOT = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(ROOT, "board.json")) as fh:
    REPO = json.load(fh)["repo"]

POLL = 15          # seconds between queries while a run is in progress
REQUERY_WAIT = 10  # seconds before looking again for a run not yet listed
DEFAULT_TIMEOUT = 900

# CONVENTIONS.md §Human-reviewed paths. check.py confirms the first is still
# named there. The token pattern follows the prose - a file under ui/ whose
# name begins `tokens` - until #386 settles a real filename and amends it.
HUMAN_REVIEWED = ["mcp/**", "ui/**/tokens*"]

# Statuses that mean a run has not finished and will still change.
UNFINISHED = ("queued", "in_progress", "waiting", "pending", "requested")


# --- gh ----------------------------------------------------------------------


# REST only, through `gh api`: a cloud session's `gh` is refused GraphQL, which
# `gh pr view`, `gh run list` and `gh issue view` use underneath.


def gh(args, check=True):
    result = subprocess.run(["gh"] + args, capture_output=True,
                            encoding="utf-8")
    if result.returncode != 0:
        if not check:
            return None
        sys.exit("gh failed: gh {}\n{}".format(" ".join(args),
                                               result.stderr.strip()))
    return result.stdout


def pr_head(pr):
    """(head sha, base branch) - read fresh, because a push moves the head."""
    data = json.loads(gh(["api", "repos/{}/pulls/{}".format(REPO, pr)]))
    return data["head"]["sha"], data["base"]["ref"]


def pr_files(pr):
    """Every changed path as (new, old); old is "" unless the file moved.

    `gh pr diff --name-only` names only the new path of a rename, and the old
    one is half of what a path filter has to be tested against.
    """
    out = gh(["api", "--paginate",
              "repos/{}/pulls/{}/files".format(REPO, pr), "--jq",
              '.[] | [.filename, (.previous_filename // "")] | @tsv'])
    files = []
    for line in out.splitlines():
        new, _, old = line.partition("\t")
        if new:
            files.append((new, old))
    return files


def base_workflows(base):
    """{filename: text} for the base branch's workflows."""
    ref = "?ref=" + urllib.parse.quote(base, safe="")
    names = gh(["api", "repos/{}/contents/.github/workflows{}".format(REPO, ref),
                "--jq", '.[] | select(.name | test("\\\\.ya?ml$")) | .name'])
    found = {}
    for name in names.split():
        found[name] = gh(["api", "-H", "Accept: application/vnd.github.raw",
                          "repos/{}/contents/.github/workflows/{}{}".format(
                              REPO, name, ref)])
    return found


def head_runs(sha):
    """The head commit's runs, in the shape the rest of this script reads."""
    out = gh(["api", "repos/{}/actions/runs?head_sha={}&per_page=100".format(
        REPO, sha)])
    return [{"databaseId": run["id"], "workflowName": run["name"],
             "status": run["status"], "conclusion": run["conclusion"] or "",
             "url": run["html_url"], "event": run["event"]}
            for run in json.loads(out)["workflow_runs"]]


def failed_step(run_id):
    """(job, step) of the first failed step, from the jobs API.

    The fallback when the log can't be read: log downloads redirect to a blob
    host that cloud sessions are refused.
    """
    out = gh(["api", "repos/{}/actions/runs/{}/jobs".format(REPO, run_id)],
             check=False)
    for job in json.loads(out)["jobs"] if out else []:
        for step in job.get("steps") or []:
            if step.get("conclusion") == "failure":
                return job["name"], step["name"]
    return None


# --- path filters ------------------------------------------------------------


def glob_regex(pattern):
    """GitHub's filter glob as a regex: `*` stops at `/`, `**` does not."""
    out = []
    i = 0
    while i < len(pattern):
        ch = pattern[i]
        if pattern.startswith("**/", i):
            out.append("(?:.*/)?")
            i += 3
            continue
        if pattern.startswith("**", i):
            out.append(".*")
            i += 2
            continue
        if ch == "*":
            out.append("[^/]*")
        elif ch == "?":
            out.append("[^/]")
        elif ch == "[":
            end = pattern.find("]", i + 2)
            if end == -1:
                out.append(re.escape(ch))
            else:
                body = pattern[i + 1:end]
                if body.startswith("!"):
                    body = "^" + body[1:]
                out.append("[" + body.replace("\\", "\\\\") + "]")
                i = end
        else:
            out.append(re.escape(ch))
        i += 1
    return re.compile("^" + "".join(out) + "$")


def matching_entry(patterns, path):
    """The pattern that selects `path`, or None. A `!` pattern excludes what an
    earlier one selected, and the last pattern to match wins, as on GitHub."""
    chosen = None
    for pattern in patterns:
        if pattern.startswith("!"):
            if chosen and glob_regex(pattern[1:]).match(path):
                chosen = None
        elif glob_regex(pattern).match(path):
            chosen = pattern
    return chosen


def touched(files):
    """Every path a filter is tested against: a rename counts at both."""
    paths = []
    for new, old in files:
        for path in (new, old):
            if path and path not in paths:
                paths.append(path)
    return paths


# --- workflow files ----------------------------------------------------------


def strip_comment(text):
    quote = None
    for i, ch in enumerate(text):
        if quote:
            if ch == quote:
                quote = None
        elif ch in "'\"":
            quote = ch
        elif ch == "#" and (i == 0 or text[i - 1] in " \t"):
            return text[:i].rstrip()
    return text.rstrip()


def unquote(text):
    text = text.strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "'\"":
        return text[1:-1]
    return text


def flow_list(text):
    """`['a', "b", c]` -> ["a", "b", "c"]"""
    inner = text.strip()[1:-1]
    return [unquote(m.group(0)) for m in
            re.finditer(r"""'[^']*'|"[^"]*"|[^,\s][^,]*""", inner)]


def indent_of(line):
    return len(line) - len(line.lstrip(" "))


def pull_request_filter(text):
    """(workflow name, filter) for a workflow file.

    The filter is None when the workflow has no pull_request trigger, else a
    dict with `paths` and `paths-ignore`, each a list or None. A reader for the
    handful of shapes these files take, not a YAML parser: anything it cannot
    read is an error, because guessing here is how a workflow goes unexpected.
    """
    lines = [strip_comment(line) for line in text.splitlines()]
    name = None
    start = None
    for number, line in enumerate(lines):
        match = re.match(r"""name:\s*(.+)$""", line)
        if match and name is None:
            name = unquote(match.group(1))
        if start is None and re.match(r"""["']?on["']?:""", line):
            start = number
    if start is None:
        raise ValueError("no `on:` block")

    rest = lines[start].split(":", 1)[1].strip()
    if rest:
        events = flow_list(rest) if rest.startswith("[") else [unquote(rest)]
        if rest.startswith("{"):
            raise ValueError("`on:` as a flow mapping is not supported")
        return name, ({"paths": None, "paths-ignore": None}
                      if "pull_request" in events else None)

    block = []
    for line in lines[start + 1:]:
        if line.strip() and indent_of(line) == 0:
            break
        block.append(line)
    block = [line for line in block if line.strip()]
    if not block:
        raise ValueError("empty `on:` block")
    base = indent_of(block[0])

    for number, line in enumerate(block):
        if indent_of(line) != base:
            continue
        item = re.match(r"""-\s+(\S+)$""", line.strip())
        if item and item.group(1) == "pull_request":
            return name, {"paths": None, "paths-ignore": None}
        key = re.match(r"""(\w+):\s*(.*)$""", line.strip())
        if not key or key.group(1) != "pull_request":
            continue
        if key.group(2).startswith("{"):
            raise ValueError("a flow mapping under pull_request is not "
                             "supported")
        found = {"paths": None, "paths-ignore": None}
        inner = [x for x in block[number + 1:]]
        end = 0
        while end < len(inner) and indent_of(inner[end]) > base:
            end += 1
        inner = inner[:end]
        index = 0
        while index < len(inner):
            sub = re.match(r"""([\w-]+):\s*(.*)$""", inner[index].strip())
            index += 1
            if not sub or sub.group(1) not in found:
                continue
            value = sub.group(2)
            if value.startswith("["):
                found[sub.group(1)] = flow_list(value)
            elif not value:
                items = []
                while index < len(inner):
                    entry = re.match(r"""-\s+(.+)$""", inner[index].strip())
                    if not entry:
                        break
                    items.append(unquote(entry.group(1)))
                    index += 1
                found[sub.group(1)] = items
            else:
                raise ValueError("cannot read `{}: {}`".format(
                    sub.group(1), value))
        return name, found
    return name, None


def expected_workflows(workflows, files):
    """[(workflow name, why)] for the workflows a PR had to pass.

    `why` is the paths entry that matched, or "" for a workflow with no filter.
    Push-only, scheduled and dispatch workflows have no pull_request trigger
    and are never listed.
    """
    paths = touched(files)
    expected = []
    for filename in sorted(workflows):
        name, rule = pull_request_filter(workflows[filename])
        if rule is None:
            continue
        name = name or os.path.splitext(filename)[0]
        if rule["paths"] is None and rule["paths-ignore"] is None:
            expected.append((name, ""))
        elif rule["paths"] is not None:
            for path in paths:
                entry = matching_entry(rule["paths"], path)
                if entry:
                    expected.append((name, "{} (matches {})".format(entry,
                                                                    path)))
                    break
        else:
            for path in paths:
                if not matching_entry(rule["paths-ignore"], path):
                    expected.append((name, ""))
                    break
    return expected


def human_reviewed(files):
    """Changed paths that gate the PR, in changed-file order."""
    return [path for path in touched(files)
            if matching_entry(HUMAN_REVIEWED, path)]


def human_reviewed_line(matches):
    if not matches:
        return None
    shown = ", ".join(matches[:3])
    if len(matches) > 3:
        shown += " and {} more".format(len(matches) - 3)
    return ("Human-reviewed: this PR changes {}. It will not merge "
            "unattended; /ship will ask first.".format(shown))


# --- runs --------------------------------------------------------------------


def latest_runs(runs):
    """{workflow name: its newest pull_request run}. Runs for other commits
    were never fetched, and an older attempt or a run concurrency cancelled in
    favour of a newer one is superseded by the larger id."""
    latest = {}
    for run in runs:
        if run.get("event") not in (None, "pull_request"):
            continue
        name = run["workflowName"]
        if name not in latest or run["databaseId"] > latest[name]["databaseId"]:
            latest[name] = run
    return latest


def pick_error(log):
    """First failing step's first error line, from `gh run view --log-failed`.

    Lines read `job<TAB>step<TAB>timestamp text`. The step is the one the first
    line names. Its first `##[error]` line wins, then its first that says error
    or fail. The bare "Process completed with exit code" line is what GitHub
    adds after the real one, so it only counts when nothing better exists.
    """
    rows = []
    for raw in log.splitlines():
        parts = raw.split("\t", 2)
        if len(parts) < 3:
            continue
        text = re.sub(r"\x1b\[[0-9;]*m", "", parts[2])
        text = re.sub(r"^\S+Z\s?", "", text).strip()
        marked = text.startswith("##[error]")
        text = re.sub(r"^##\[error\]", "", text).strip()
        rows.append((parts[1], text, marked))
    if not rows:
        return None
    step = rows[0][0]
    mine = [(text, marked) for name, text, marked in rows
            if name == step and text]
    lines = [text for text, _ in mine]
    bare = "Process completed with exit code"
    for text, marked in mine:
        if marked and not text.startswith(bare):
            return step, text[:200]
    for text in lines:
        if re.search(r"error|fail|exception", text, re.I) and \
                not text.startswith(bare):
            return step, text[:200]
    return step, (lines[0] if lines else "")[:200]


def failure_quote(run):
    conclusion = run["conclusion"]
    if conclusion == "failure":
        log = gh(["run", "view", str(run["databaseId"]), "--repo", REPO,
                  "--log-failed"], check=False)
        found = pick_error(log) if log else None
        if found:
            return "failure  {}: {}".format(*found)
        step = failed_step(run["databaseId"])
        if step:
            return "failure  {} / {}".format(*step)
        return "failure"
    if conclusion == "action_required":
        return "action_required  (waiting for approval)"
    return conclusion or run["status"]


def verdict(expected, runs):
    """Sort the expected workflows against the runs found.

    Returns (done, running, absent): `done` is [(name, run)] for finished runs,
    `running` for unfinished ones, `absent` the (name, why) with no run.
    """
    latest = latest_runs(runs)
    done, running, absent = [], [], []
    for name, why in expected:
        run = latest.get(name)
        if run is None:
            absent.append((name, why))
        elif run["status"] in UNFINISHED:
            running.append((name, run))
        else:
            done.append((name, run))
    return done, running, absent


def report(sha, done, running, absent, quote):
    """The block /review specifies, and the exit code that goes with it."""
    short = sha[:7]
    rows = sorted(done + running, key=lambda item: item[0])
    width = max([len(name) for name, _ in rows + absent] + [0]) + 2
    failed = [name for name, run in done if run["conclusion"] != "success"]
    lines = []
    if running:
        lines.append("Build — {} run{} still in progress on {}".format(
            len(running), "" if len(running) == 1 else "s", short))
        code = 2
    elif absent:
        lines.append("Build — no run for {} on {}.".format(
            ", ".join(name for name, _ in absent), short))
        code = 1
    elif failed:
        lines.append("Build — {} run{} on {}, {} failed:".format(
            len(rows), "" if len(rows) == 1 else "s", short, len(failed)))
        code = 1
    else:
        lines.append("Build — {} run{} on {}, all passed:".format(
            len(rows), "" if len(rows) == 1 else "s", short))
        code = 0
    for name, run in rows:
        if run["status"] in UNFINISHED:
            state = run["status"]
        elif run["conclusion"] == "success":
            state = "success"
        else:
            state = quote(run)
        lines.append("  {}{}".format(name.ljust(width), state))
    for name, why in absent:
        lines.append("  {}no run{}".format(
            name.ljust(width),
            " — paths entry " + why if why else " — no paths filter"))
    if absent:
        lines.append("Another workflow's green run does not cover it. Either "
                     "the filter doesn't reach the change or the workflow "
                     "didn't start.")
    return "\n".join(lines), code


def wait_for_runs(fetch, timeout, sleep=time.sleep, clock=time.time):
    """Poll until nothing expected is unfinished, or the timeout passes.

    `fetch()` returns (sha, expected, runs) for the PR's head right now, so a
    push during the wait rebuilds all three. A workflow with no run yet is
    looked for again once per head commit before it counts as absent.
    """
    deadline = clock() + timeout
    requeried = None
    while True:
        sha, expected, runs = fetch()
        done, running, absent = verdict(expected, runs)
        if absent and not running and requeried != sha:
            requeried = sha
            if clock() < deadline:
                sleep(min(REQUERY_WAIT, max(deadline - clock(), 0)))
                continue
        if not running:
            return sha, done, running, absent
        if clock() >= deadline:
            return sha, done, running, absent
        sleep(min(POLL, max(deadline - clock(), 0)))


def cmd_ci(args):
    state = {}

    def fetch():
        sha, base = pr_head(args.pr)
        if state.get("sha") != sha:
            state["sha"] = sha
            state["expected"] = expected_workflows(base_workflows(base),
                                                   pr_files(args.pr))
        return sha, state["expected"], head_runs(sha)

    sha, done, running, absent = wait_for_runs(fetch, args.timeout)
    if not state["expected"]:
        print("Build — no workflow expected on {}; nothing can be green."
              .format(sha[:7]))
        return 1
    text, code = report(sha, done, running, absent, failure_quote)
    print(text)
    note = human_reviewed_line(human_reviewed(pr_files(args.pr)))
    if note:
        print(note)
    return code


# --- results -----------------------------------------------------------------


FENCE = re.compile(r"^\s*(```|~~~)")


def results_span(body):
    """(start, end) character offsets of the `## Results` section, heading
    included, ending at the next `## ` heading; None if there isn't one.
    Fenced code is skipped so a template quoted in the body is not a heading."""
    fence = None
    start = None
    offset = 0
    for line in body.splitlines(keepends=True):
        bare = line.rstrip("\r\n")
        match = FENCE.match(bare)
        if fence is None and match:
            fence = match.group(1)
        elif fence is not None:
            if match and match.group(1) == fence:
                fence = None
        elif start is None and re.match(r"## Results\s*$", bare):
            start = offset
        elif start is not None and bare.startswith("## "):
            return start, offset
        offset += len(line)
    if start is None:
        return None
    return start, len(body)


def put_results(body, text):
    """`body` with its Results section set to `text`; nothing else changes."""
    crlf = body.count("\r\n")
    eol = "\r\n" if crlf and crlf * 2 > body.count("\n") else "\n"
    lines = text.replace("\r\n", "\n").strip("\n").split("\n")
    if lines and re.match(r"## Results\s*$", lines[0]):
        lines = lines[1:]
    content = "\n".join(lines).strip("\n")
    if not content:
        raise ValueError("the Results text is empty")
    section = "## Results" + eol + eol + content.replace("\n", eol) + eol
    span = results_span(body)
    if span is None:
        joiner = "" if body.endswith("\n") or not body else eol
        gap = eol if body else ""
        return body + joiner + gap + section
    start, end = span
    after = body[end:]
    return body[:start] + section + (eol + after if after else "")


def cmd_results(args):
    with open(args.file, encoding="utf-8", newline="") as fh:
        text = fh.read()
    issue = "repos/{}/issues/{}".format(REPO, args.issue)
    body = json.loads(gh(["api", issue]))["body"] or ""
    try:
        updated = put_results(body, text)
    except ValueError as err:
        sys.exit("results: {}".format(err))
    if updated == body:
        print("#{} Results already up to date".format(args.issue))
        return 0
    handle, path = tempfile.mkstemp(suffix=".json")
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="") as out:
            json.dump({"body": updated}, out)
        gh(["api", "-X", "PATCH", issue, "--input", path])
    finally:
        os.remove(path)
    print("#{} Results written".format(args.issue))
    return 0


# --- main --------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    ci = sub.add_parser("ci", help="verify the build for a PR")
    ci.add_argument("pr", type=int)
    ci.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT,
                    help="seconds to wait for unfinished runs")
    ci.set_defaults(run=cmd_ci)

    results = sub.add_parser("results", help="write an issue's Results")
    results.add_argument("issue", type=int)
    results.add_argument("file")
    results.set_defaults(run=cmd_results)

    args = parser.parse_args()
    # The report carries an em dash; a Windows console defaults to cp1252.
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(args.run(args))


if __name__ == "__main__":
    main()
