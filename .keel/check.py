#!/usr/bin/env python3
"""
Keel repository checks.

The mechanically checkable part of keel's own work. Skills are prose and prose
does not compile, but three things about this repo can be verified without
judgment, and all three have broken silently before they would have been caught
by reading:

  - .keel/*.py compiles
  - every skill's frontmatter parses, and its name matches its directory
  - every relative link in a tracked .md file resolves
  - every design note cited by filename is committed
  - pr.py's path-filter matcher, report and Results editor behave on fixtures
  - board.py's epic grouping and promotion decisions behave on fixtures

Run it locally exactly as CI runs it:

  python .keel/check.py

Standard library only, deliberately. Keeping this dependency-free is what keeps
keel's workflow to a single step with nothing to install and no cache to prime.
"""

import os
import py_compile
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SKILLS_DIR = os.path.join(ROOT, ".claude", "skills")

# [text](target) and ![alt](target). Targets with nested parens are not
# supported and are not worth supporting - no link in this repo has them.
LINK = re.compile(r"!?\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")

FENCE = re.compile(r"^\s*(```|~~~)")

# A design note is cited by its filename - the NNN-slug.md form - from a source
# comment, from prose, or from another note. A bare #NNN is not a citation:
# most issues have no note at all, so the filename is the only form that can be
# checked without guessing.
#
# Deliberately written without a real note's name. An example here would be a
# citation like any other, and this check would then require that one note to
# exist forever.
NOTE_REF = re.compile(r"\b(\d+-[a-z0-9-]+\.md)\b")

# Everything a citation has ever appeared in. Extensions rather than a
# blocklist, so a binary added later is never read as text.
CITING_SUFFIXES = (".md", ".py", ".ts", ".tsx", ".js", ".jsx", ".css",
                   ".yml", ".yaml")


def rel(path):
    """Repo-relative path with forward slashes, so output reads the same on
    Windows and in CI."""
    return os.path.relpath(path, ROOT).replace(os.sep, "/")


def tracked(pattern, others=True):
    """Files git knows about, plus new ones that aren't ignored.

    --others is what makes a local run match CI: a file added but not yet
    committed is exactly the file most likely to be broken, and skipping it
    would mean the first run that checks it is the one in the pull request.

    others=False asks the opposite question - what is actually committed -
    and only check_design_notes wants it, because an uncommitted note is the
    failure it exists to find rather than a file to check.
    """
    argv = ["git", "-C", ROOT, "ls-files", "--cached"]
    if others:
        argv += ["--others", "--exclude-standard"]
    result = subprocess.run(
        argv + [pattern],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        sys.exit("git ls-files failed:\n" + result.stderr.strip())
    return [
        os.path.join(ROOT, line.replace("/", os.sep))
        for line in result.stdout.splitlines()
        if line
    ]


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def strip_fences(text):
    """Blank out fenced code blocks, keeping line numbers intact.

    Templates in the stack skills contain example paths that are not links to
    anywhere; scanning them would fail every skill that documents a scaffold.
    """
    lines = text.splitlines()
    out = []
    fence = None
    for line in lines:
        match = FENCE.match(line)
        if fence is None and match:
            fence = match.group(1)
            out.append("")
            continue
        if fence is not None:
            out.append("")
            if match and match.group(1) == fence:
                fence = None
            continue
        out.append(line)
    return out


# --- checks -----------------------------------------------------------------


def check_python():
    """Every .py under .keel/ compiles."""
    files = sorted(tracked(".keel/*.py"))
    problems = []
    for path in files:
        try:
            py_compile.compile(path, cfile=os.path.join(tempfile.gettempdir(),
                                                        "keel-check.pyc"),
                               doraise=True)
        except py_compile.PyCompileError as err:
            problems.append("{}: {}".format(rel(path), err.msg.strip()))
    return "python compiles", "{} files".format(len(files)), problems


def check_frontmatter():
    """Every SKILL.md has name and description, and name matches its folder."""
    if not os.path.isdir(SKILLS_DIR):
        return "skill frontmatter", "0 skills", [
            ".claude/skills/ does not exist"
        ]

    problems = []
    skills = sorted(
        name for name in os.listdir(SKILLS_DIR)
        if os.path.isdir(os.path.join(SKILLS_DIR, name))
    )
    for skill in skills:
        path = os.path.join(SKILLS_DIR, skill, "SKILL.md")
        if not os.path.isfile(path):
            problems.append("{}: no SKILL.md".format(skill))
            continue

        lines = read(path).splitlines()
        if not lines or lines[0].strip() != "---":
            problems.append(
                "{}: no frontmatter - first line is not ---".format(skill))
            continue
        try:
            end = lines.index("---", 1)
        except ValueError:
            problems.append("{}: frontmatter is never closed".format(skill))
            continue

        fields = {}
        for line in lines[1:end]:
            if line.startswith((" ", "\t")) or ":" not in line:
                continue
            key, value = line.split(":", 1)
            fields[key.strip()] = value.strip()

        for key in ("name", "description"):
            if not fields.get(key):
                problems.append("{}: frontmatter has no {}".format(skill, key))
        if fields.get("name") and fields["name"] != skill:
            problems.append(
                "{}: frontmatter name is {!r}, expected {!r}".format(
                    skill, fields["name"], skill))

    return "skill frontmatter", "{} skills".format(len(skills)), problems


def check_links():
    """Every relative link in a tracked .md file points at something real."""
    files = sorted(tracked("*.md"))
    problems = []
    count = 0
    for path in files:
        for number, line in enumerate(strip_fences(read(path)), start=1):
            for target in LINK.findall(line):
                if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target):
                    continue  # http:, mailto:, anything with a scheme
                if target.startswith("#"):
                    continue  # same-document anchor
                count += 1
                resolved = target.split("#", 1)[0]
                if not resolved:
                    continue
                full = os.path.normpath(
                    os.path.join(os.path.dirname(path),
                                 resolved.replace("/", os.sep)))
                if not os.path.exists(full):
                    problems.append(
                        "{}:{}: {} does not exist".format(
                            rel(path), number, target))
    return ("markdown links",
            "{} files, {} links".format(len(files), count),
            problems)


def check_design_notes():
    """Every design note cited by filename is committed.

    /ux writes the note and /develop commits it - except when it doesn't.
    #250 and #251 reached Done with theirs untracked, leaving comments in
    cairn's source pointing at reasoning no clone of main could read.

    Notes resolve by basename against every project's docs/design/, not
    against the citing file's own project: CONVENTIONS.md cites
    109-shell-column.md from the repository root while the file lives under
    cairn/, and a check whose first act is to make the conventions illegal is
    a check nobody keeps.

    Committed, not merely present - the note this exists to catch is sitting
    untracked in a working tree, and --others would hide exactly that.
    """
    notes = set()
    for path in tracked("*.md", others=False):
        where = rel(path)
        # keel's own notes live at docs/design/ - its project folder is the
        # repository root - so the prefix has to be matched as well as the
        # segment, or the one project that owns this check is the one it
        # would not cover.
        if where.startswith("docs/design/") or "/docs/design/" in where:
            notes.add(os.path.basename(path))
    files = sorted(
        path for path in tracked("*")
        if os.path.splitext(path)[1] in CITING_SUFFIXES
    )
    problems = []
    count = 0
    for path in files:
        for number, line in enumerate(read(path).splitlines(), start=1):
            for name in NOTE_REF.findall(line):
                count += 1
                if name not in notes:
                    problems.append(
                        "{}:{}: {} is cited but not committed".format(
                            rel(path), number, name))
    return ("design notes",
            "{} notes, {} references".format(len(notes), count),
            problems)


def check_pr_script():
    """pr.py's matcher, workflow reader, report and Results editor.

    The CI wait is the only thing between a red build and a merge, so the part
    of it that can be wrong without a network is held to fixtures here: path
    filters (`*` against `**`, a workflow's own file, a rename), the shapes a
    workflow's `on:` block takes, the report and exit code for each outcome,
    and the Results edit leaving every other section byte for byte.
    """
    sys.path.insert(0, os.path.join(ROOT, ".keel"))
    try:
        import pr
    finally:
        sys.path.pop(0)

    problems = []
    count = [0]

    def expect(label, got, want):
        count[0] += 1
        if got != want:
            problems.append("{}: got {!r}, want {!r}".format(label, got, want))

    def wf(on):
        return "name: x\non:\n" + on + "\njobs:\n  a:\n    name: not-it\n"

    def names(workflows, files):
        return [n for n, _ in pr.expected_workflows(workflows, files)]

    def match(pattern, path):
        return bool(pr.matching_entry([pattern], path))

    # `*` stops at a slash, `**` does not.
    expect("* one level", match("hive/*", "hive/a.ts"), True)
    expect("* not deeper", match("hive/*", "hive/a/b.ts"), False)
    expect("** deeper", match("hive/**", "hive/a/b.ts"), True)
    expect("** leading", match("**/x.md", "x.md"), True)
    expect("** leading nested", match("**/x.md", "a/b/x.md"), True)
    expect("literal dot", match("a.yml", "abyml"), False)
    expect("token name", match("ui/**/tokens*", "ui/tokens.css"), True)
    expect("token dir is not a name", match("ui/**/tokens*",
                                            "ui/tokens/suite.css"), False)
    expect("negation", pr.matching_entry(["hive/**", "!hive/docs/**"],
                                         "hive/docs/a.md"), None)

    mcp = wf("  pull_request:\n    paths: ['mcp/**', '.github/workflows/mcp.yml']")
    thrive = wf("  pull_request:\n    paths:\n      - 'thrive/**'\n"
                "      - geo/**  # shared\n  push:\n    branches: [main]")
    keel = wf("  pull_request:\n  push:\n    branches: [main]")
    pages = wf("  push:\n    branches: [main]\n  workflow_dispatch:")
    both = "name: b\non: [push, pull_request]\n"
    solo = "name: s\non: push\n"
    ignore = wf("  pull_request:\n    paths-ignore:\n      - 'docs/**'")
    flows = {"mcp.yml": mcp, "thrive.yml": thrive, "keel.yml": keel,
             "pages.yml": pages}

    expect("on shapes", [pr.pull_request_filter(t)[1] is not None
                         for t in (both, solo, pages, keel)],
           [True, False, False, True])
    expect("block list with comment",
           pr.pull_request_filter(thrive)[1]["paths"],
           ["thrive/**", "geo/**"])
    expect("job name is not the workflow's", pr.pull_request_filter(mcp)[0],
           "x")
    expect("filtered out, push-only skipped",
           names(flows, [("hive/a.ts", "")]), ["x"])
    expect("filter reaches the change",
           names({"t.yml": thrive, "k.yml": keel}, [("geo/a.ts", "")]),
           ["x", "x"])
    expect("workflow's own file",
           names({"mcp.yml": mcp}, [(".github/workflows/mcp.yml", "")]),
           ["x"])
    expect("unrelated file", names({"mcp.yml": mcp}, [("hive/a.ts", "")]), [])
    expect("rename counts at the old path",
           names({"mcp.yml": mcp}, [("hive/a.ts", "mcp/a.ts")]), ["x"])
    expect("rename counts at the new path",
           names({"mcp.yml": mcp}, [("mcp/a.ts", "hive/a.ts")]), ["x"])
    expect("paths-ignore, all ignored",
           names({"i.yml": ignore}, [("docs/a.md", "")]), [])
    expect("paths-ignore, one survives",
           names({"i.yml": ignore}, [("docs/a.md", ""), ("a.md", "")]), ["x"])

    # Human-reviewed paths.
    files = [("mcp/a.ts", "hive/a.ts"), ("mcp/b.ts", ""), ("mcp/c.ts", ""),
             ("mcp/d.ts", ""), ("hive/z.ts", "")]
    expect("human-reviewed, rename at both ends",
           pr.human_reviewed([("hive/a.ts", "mcp/a.ts")]), ["mcp/a.ts"])
    expect("human-reviewed line",
           pr.human_reviewed_line(pr.human_reviewed(files)),
           "Human-reviewed: this PR changes mcp/a.ts, mcp/b.ts, mcp/c.ts "
           "and 1 more. It will not merge unattended; /ship will ask first.")
    expect("human-reviewed absent", pr.human_reviewed_line(
        pr.human_reviewed([("hive/a.ts", "")])), None)
    expect("human-reviewed list matches CONVENTIONS.md",
           "`mcp/**`" in read(os.path.join(ROOT, "CONVENTIONS.md")), True)

    # Reports and exit codes.
    def run(name, status="completed", conclusion="success", ident=1,
            event="pull_request"):
        return {"workflowName": name, "status": status,
                "conclusion": conclusion, "databaseId": ident,
                "event": event, "url": ""}

    def render(expected, runs):
        done, running, absent = pr.verdict(expected, runs)
        return pr.report("9f3c2abdeadbeef", done, running, absent,
                         lambda r: r["conclusion"])

    green = render([("cairn", ""), ("keel", "")],
                   [run("keel"), run("cairn", ident=2)])
    expect("green", green, ("Build — 2 runs on 9f3c2ab, all passed:\n"
                            "  cairn  success\n  keel   success", 0))
    absent = render([("cairn", "cairn/** (matches cairn/a.ts)"), ("keel", "")],
                    [run("keel")])
    expect("absent code", absent[1], 1)
    expect("absent heading", absent[0].splitlines()[0],
           "Build — no run for cairn on 9f3c2ab.")
    expect("absent names the paths entry",
           "no run — paths entry cairn/** (matches cairn/a.ts)" in absent[0],
           True)
    expect("nothing ran", render([("keel", "")], [])[1], 1)
    failed = render([("keel", "")], [run("keel", conclusion="failure")])
    expect("failed", (failed[0].splitlines()[0], failed[1]),
           ("Build — 1 run on 9f3c2ab, 1 failed:", 1))
    expect("newest attempt wins",
           render([("keel", "")], [run("keel", conclusion="cancelled", ident=1),
                                   run("keel", ident=2)])[1], 0)
    expect("other event ignored",
           render([("keel", "")], [run("keel", event="push")])[1], 1)
    busy = render([("keel", "")], [run("keel", status="in_progress",
                                       conclusion=None)])
    expect("in progress", busy, ("Build — 1 run still in progress on 9f3c2ab\n"
                                 "  keel  in_progress", 2))

    # The wait: a timeout shorter than the run, and a re-query for a late run.
    clock = [0]

    def sleep(seconds):
        clock[0] += seconds

    def now():
        return clock[0]

    polls = []

    def never():
        polls.append(1)
        return "abc", [("keel", "")], [run("keel", status="in_progress",
                                           conclusion=None)]

    _, _, running, _ = pr.wait_for_runs(never, 20, sleep, now)
    expect("timeout leaves the run unfinished", len(running), 1)
    expect("timeout is honoured", clock[0] <= 20, True)
    clock[0] = 0
    polls[:] = []
    _, _, running, _ = pr.wait_for_runs(never, 0, sleep, now)
    expect("zero timeout does not wait", (len(running), clock[0], len(polls)),
           (1, 0, 1))

    clock[0] = 0
    late = [[], [run("keel", status="in_progress", conclusion=None)],
            [run("keel")]]

    def arrives():
        return "abc", [("keel", "")], late.pop(0)

    _, done, running, missing = pr.wait_for_runs(arrives, 600, sleep, now)
    expect("late run is found and waited for",
           (len(done), len(running), len(missing)), (1, 0, 0))
    clock[0] = 0
    _, _, _, missing = pr.wait_for_runs(lambda: ("abc", [("keel", "")], []),
                                        600, sleep, now)
    expect("re-queried once, then absent", (len(missing), clock[0]),
           (1, pr.REQUERY_WAIT))

    # The failure quote.
    log = ("check\tpython .keel/check.py\t2026-10-19T17:10:33.1Z ok\n"
           "check\tpython .keel/check.py\t2026-10-19T17:10:34.1Z FAIL  "
           "markdown links\n"
           "check\tpython .keel/check.py\t2026-10-19T17:10:35.1Z "
           "##[error]Process completed with exit code 1.\n"
           "check\tlater step\t2026-10-19T17:10:36.1Z error: not this\n")
    expect("first error line of first failing step", pr.pick_error(log),
           ("python .keel/check.py", "FAIL  markdown links"))

    expect("##[error] outranks a line that merely says fail",
           pr.pick_error("j\ts\t2026-10-19T17:10:33.1Z test reports a failure\n"
                         "j\ts\t2026-10-19T17:10:34.1Z ##[error]Real one\n"),
           ("s", "Real one"))

    # Results.
    other = "## Problem\n\nBody\nkept  \n\n```\n## Results\n```\n\n"
    tail = "## Out of Scope\n\nNothing.\n"
    first = other + tail
    expect("append when absent",
           pr.put_results(first, "Done well.\n"),
           first + "\n## Results\n\nDone well.\n")
    existing = other + "## Results\n\nFilled in at Done.\n\n" + tail
    expect("replace in place", pr.put_results(existing, "Done well.\n"),
           other + "## Results\n\nDone well.\n\n" + tail)
    last = other + tail + "\n## Results\n\nFilled in at Done.\n"
    expect("replace the last section", pr.put_results(last, "A\nB\n"),
           other + tail + "\n## Results\n\nA\nB\n")
    once = pr.put_results(existing, "Done well.\n")
    expect("idempotent", pr.put_results(once, "Done well.\n"), once)
    expect("heading in the file is not doubled",
           pr.put_results(existing, "## Results\n\nDone well.\n"), once)
    expect("fenced heading is not the section",
           pr.results_span(other + tail), None)
    expect("crlf kept",
           pr.put_results("## A\r\n\r\nx\r\n", "one\ntwo\n"),
           "## A\r\n\r\nx\r\n\r\n## Results\r\n\r\none\r\ntwo\r\n")
    expect("empty body", pr.put_results("", "x\n"), "## Results\n\nx\n")

    return "pr.py", "{} cases".format(count[0]), problems


def check_board_group():
    """board.py's grouping order and promotion decision, without a network.

    `group` is the only board command whose decisions are worth holding to
    fixtures: which sub-issues sit under an epic and in what order, whether the
    epic is promoted, and whether a second run moves anything.
    """
    sys.path.insert(0, os.path.join(ROOT, ".keel"))
    try:
        import board
    finally:
        sys.path.pop(0)

    problems = []
    count = [0]

    def expect(label, got, want):
        count[0] += 1
        if got != want:
            problems.append("{}: got {!r}, want {!r}".format(label, got, want))

    tree = {1: [2, 3], 2: [4], 3: [2, 5]}
    expect("depth first, once",
           board.descendants(1, lambda n: tree.get(n, [])), [2, 4, 3, 5])
    expect("no children", board.descendants(9, lambda n: []), [])

    expect("all refined or later promotes",
           board.promotion("PM Refining", [(2, "Refined"), (3, "Done")]),
           (True, []))
    expect("one in To Do blocks",
           board.promotion("PM Refining", [(2, "Refined"), (3, "To Do")]),
           (False, [3]))
    expect("a child with no status blocks",
           board.promotion("PM Refining", [(2, None)]), (False, [2]))
    expect("only PM Refining moves",
           board.promotion("UX", [(2, "Refined")]), (False, []))
    expect("never out of Refined",
           board.promotion("Refined", [(2, "Refined")]), (False, []))

    ordered = [(1, "Refined"), (2, "Refined"), (3, "Refined")]
    expect("contiguous and in order moves nothing",
           board.group_moves(ordered, 1, [2, 3]), [])
    expect("another stage between does not break it",
           board.group_moves([(1, "Refined"), (8, "To Do"), (2, "Refined")],
                             1, [2]), [])
    scattered = [(2, "Refined"), (7, "Refined"), (1, "Refined"),
                 (9, "Refined"), (3, "Refined")]
    expect("scattered children go after the epic in order",
           board.group_moves(scattered, 1, [2, 3]), [(2, 1), (3, 2)])
    expect("wrong order is moved",
           board.group_moves([(1, "Refined"), (3, "Refined"), (2, "Refined")],
                             1, [2, 3]), [(2, 1), (3, 2)])
    expect("a child in another stage is left alone",
           board.group_moves([(1, "Refined"), (5, "To Do"), (2, "Refined")],
                             1, [5, 2]), [])
    expect("sort by field warns",
           len(board.sort_warnings([{"name": "Board", "sort": ["Priority"]},
                                    {"name": "Manual", "sort": []}])), 1)

    return "board.py group", "{} cases".format(count[0]), problems


CHECKS = [check_python, check_frontmatter, check_links, check_design_notes,
          check_pr_script, check_board_group]


def main():
    failed = False
    for check in CHECKS:
        name, detail, problems = check()
        if problems:
            failed = True
            print("FAIL  {:<20} {}".format(name, detail))
            for problem in problems:
                print("        " + problem)
        else:
            print("ok    {:<20} {}".format(name, detail))
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
