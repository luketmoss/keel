#!/usr/bin/env python3
"""
Keep the two checkouts a brief reads up to date, and write back to the wiki (#835).

  checkouts.py sync [--keel DIR] [--folder DIR]
  checkouts.py writeback [--folder DIR] <message> <path>...
  checkouts.py settings [--keel DIR] [--folder DIR]

`sync` runs first on every scheduled brief, from the briefs' worktree, and
prints one JSON line the skill reads:

  {"keel": {"state": "updated|current|stale|skipped", "reason": ...},
   "wiki": {"state": "updated|current|ahead|left", "writable": true|false,
            "reason": ...}}

Keel: a detached worktree is fetched and moved to origin/main. With changes of
its own, or no GitHub, it is left as it is and reported `stale`. A checkout on a
branch (the development checkout) is never touched: `skipped`.

The wiki (the `wiki:` line of settings.local.md): fetched and fast-forwarded on
main. Left alone, and not writable for the run, when it has uncommitted changes
(reason `changes`), is on another branch (`branch`), has diverged from
origin/main (`diverged`) or cannot be fetched (`unreachable`). A wiki only
ahead of origin/main, an earlier run's unpushed commit, is writable.

`writeback` commits exactly the given paths (relative to the wiki), rebases onto
origin/main and pushes. It refuses, writing nothing, when `sync` did not report
the wiki writable. If the rebase stops it is aborted and the local commit kept;
a failed push keeps the commit too. Both print `not pushed`, and the next
`sync` sees the wiki as ahead and carries it. Never a reset, a stash, a force
or a merge commit.

Where things live: the briefs' folder holds `keel\\` (the worktree) and
`settings.local.md`. Without one there, settings are read from the skill's own
folder, so a hand run from the development checkout still works. `sync` leaves
its report in `checkouts-state.json` beside the settings for `writeback`.

Exit status: 0 unless `writeback` refused or did not push. Standard library only.
"""

import argparse
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SETTINGS = "settings.local.md"
STATE = "checkouts-state.json"
BRANCH = "main"
REMOTE = "origin"
NET_TIMEOUT = 90


# --- git --------------------------------------------------------------------


def git(repo, *args, timeout=None, raw=False):
    """Run git in `repo`. Returns (returncode, stdout). Never prompts."""
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0")
    try:
        proc = subprocess.run(
            ["git", "-C", repo] + list(args), capture_output=True, text=True,
            env=env, timeout=timeout)
    except (subprocess.TimeoutExpired, OSError):
        return 1, ""
    out = proc.stdout.rstrip() if raw else proc.stdout.strip()
    return proc.returncode, out


def toplevel(path):
    code, out = git(path, "rev-parse", "--show-toplevel")
    return os.path.normpath(out) if code == 0 and out else None


def changes(repo, ignore=()):
    """Porcelain lines for uncommitted changes, untracked files included,
    leaving out the paths in `ignore` (relative to the repo, forward slashes)."""
    code, out = git(repo, "status", "--porcelain", "--untracked-files=all",
                    raw=True)
    if code != 0:
        return ["?"]
    ignore = set(ignore)
    lines = []
    for line in out.splitlines():
        path = line[3:].strip().strip('"')
        if " -> " in path:
            path = path.split(" -> ")[-1]
        if path not in ignore:
            lines.append(line)
    return lines


def rebase_in_progress(repo):
    for name in ("rebase-merge", "rebase-apply"):
        _, path = git(repo, "rev-parse", "--git-path", name)
        if path and os.path.isdir(os.path.join(repo, path)):
            return True
    return False


def fetch(repo):
    code, _ = git(repo, "fetch", "--quiet", REMOTE, timeout=NET_TIMEOUT)
    return code == 0


def is_ancestor(repo, older, newer):
    code, _ = git(repo, "merge-base", "--is-ancestor", older, newer)
    return code == 0


def current_branch(repo):
    """The branch name, or None when HEAD is detached."""
    code, out = git(repo, "symbolic-ref", "--short", "-q", "HEAD")
    return out if code == 0 and out else None


# --- settings ---------------------------------------------------------------


def briefs_folder(keel):
    """The folder holding the briefs' worktree: the worktree's parent."""
    return os.path.dirname(os.path.normpath(keel))


def find_settings(keel=None, folder=None):
    """Path of settings.local.md: beside the worktree, else the skill folder.

    Returns the path that exists, or None when neither has one."""
    if folder is None and keel:
        folder = briefs_folder(keel)
    for base in (folder, HERE):
        if base and os.path.isfile(os.path.join(base, SETTINGS)):
            return os.path.join(base, SETTINGS)
    return None


def read_wiki_path(settings):
    """The `wiki:` path from a settings file, or None."""
    if not settings:
        return None
    with open(settings, encoding="utf-8") as fh:
        text = fh.read()
    match = re.search(r"\*\*wiki\*\*:?\s*`?([^`\r\n]+?)`?\s*$", text, re.M)
    if not match:
        return None
    path = match.group(1).strip()
    if not path or path.startswith("<"):
        return None
    return path


# --- sync -------------------------------------------------------------------


def sync_keel(keel):
    if not keel or not os.path.isdir(keel):
        return {"state": "skipped", "reason": "no worktree"}
    if current_branch(keel):
        return {"state": "skipped", "reason": "not a briefs worktree"}
    if not fetch(keel):
        return {"state": "stale", "reason": "unreachable"}
    if changes(keel):
        return {"state": "stale", "reason": "changes"}
    target = "{}/{}".format(REMOTE, BRANCH)
    _, head = git(keel, "rev-parse", "HEAD")
    _, tip = git(keel, "rev-parse", target)
    if head == tip:
        return {"state": "current"}
    code, _ = git(keel, "checkout", "--quiet", "--detach", target)
    if code != 0:
        return {"state": "stale", "reason": "changes"}
    return {"state": "updated"}


def left(reason):
    return {"state": "left", "writable": False, "reason": reason}


def sync_wiki(wiki):
    if not wiki:
        return {"state": "skipped", "writable": False, "reason": "no wiki"}
    if not os.path.isdir(wiki) or not toplevel(wiki):
        return left("missing")
    # Local checks first: a checkout we will not touch is not even fetched.
    if changes(wiki):
        return left("changes")
    if current_branch(wiki) != BRANCH:
        return left("branch")
    if not fetch(wiki):
        return left("unreachable")
    target = "{}/{}".format(REMOTE, BRANCH)
    _, head = git(wiki, "rev-parse", "HEAD")
    _, tip = git(wiki, "rev-parse", target)
    if head == tip:
        return {"state": "current", "writable": True}
    if is_ancestor(wiki, target, "HEAD"):
        return {"state": "ahead", "writable": True}
    if is_ancestor(wiki, "HEAD", target):
        code, _ = git(wiki, "merge", "--quiet", "--ff-only", target)
        if code != 0:
            return left("changes")
        return {"state": "updated", "writable": True}
    return left("diverged")


def state_path(keel=None, folder=None):
    settings = find_settings(keel, folder)
    base = os.path.dirname(settings) if settings else (folder or HERE)
    return os.path.join(base, STATE)


def sync(keel=None, folder=None):
    settings = find_settings(keel, folder)
    wiki = read_wiki_path(settings)
    report = {"keel": sync_keel(keel), "wiki": sync_wiki(wiki)}
    if wiki:
        report["wiki"]["path"] = wiki
    try:
        with open(state_path(keel, folder), "w", encoding="utf-8") as fh:
            json.dump(report, fh)
    except OSError:
        pass
    return report


# --- writeback --------------------------------------------------------------


def refuse(reason):
    return {"status": "refused", "reason": reason}


def writeback(message, paths, keel=None, folder=None):
    """Commit exactly `paths` in the wiki and push. Returns a result dict."""
    try:
        with open(state_path(keel, folder), encoding="utf-8") as fh:
            wiki = json.load(fh).get("wiki", {})
    except (OSError, ValueError):
        return refuse("no sync this run")
    if not wiki.get("writable") or not wiki.get("path"):
        return refuse(wiki.get("reason") or "wiki not writable")
    repo = wiki["path"]
    root = toplevel(repo)
    if not root:
        return refuse("missing")

    rel = []
    for path in paths:
        full = path if os.path.isabs(path) else os.path.join(root, path)
        name = os.path.relpath(full, root).replace(os.sep, "/")
        if name.startswith(".."):
            return refuse("path outside the wiki")
        rel.append(name)
    # The state is from earlier in the run: look again before touching anything.
    if current_branch(root) != BRANCH:
        return refuse("branch")
    if changes(root, ignore=rel):
        return refuse("changes")

    git(root, "add", "--", *rel)
    code, _ = git(root, "diff", "--cached", "--quiet", "--", *rel)
    if code != 0:
        code, _ = git(root, "commit", "--quiet", "-m", message, "--", *rel)
        if code != 0:
            return {"status": "not pushed", "reason": "commit failed"}

    code, _ = git(root, "pull", "--rebase", "--quiet", REMOTE, BRANCH,
                  timeout=NET_TIMEOUT)
    if code != 0:
        stopped = rebase_in_progress(root)
        if stopped:
            git(root, "rebase", "--abort")
            return {"status": "not pushed", "reason": "rebase stopped"}
        return {"status": "not pushed", "reason": "unreachable"}

    code, _ = git(root, "push", "--quiet", REMOTE, BRANCH, timeout=NET_TIMEOUT)
    if code != 0:
        return {"status": "not pushed", "reason": "push rejected"}
    return {"status": "pushed"}


# --- cli --------------------------------------------------------------------


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    sub = parser.add_subparsers(dest="cmd", required=True)
    for name in ("sync", "settings", "writeback"):
        p = sub.add_parser(name)
        p.add_argument("--keel", help="the Keel worktree (default: the one "
                       "holding this script)")
        p.add_argument("--folder", help="the briefs' folder (default: the "
                       "worktree's parent)")
        if name == "writeback":
            p.add_argument("message")
            p.add_argument("paths", nargs="+")
    args = parser.parse_args(argv)

    keel = args.keel or toplevel(HERE)
    if args.cmd == "settings":
        print(find_settings(keel, args.folder) or "")
        return 0
    if args.cmd == "sync":
        print(json.dumps(sync(keel, args.folder)))
        return 0
    result = writeback(args.message, args.paths, keel, args.folder)
    print(json.dumps(result))
    return 0 if result["status"] == "pushed" else 1


if __name__ == "__main__":
    sys.exit(main())
