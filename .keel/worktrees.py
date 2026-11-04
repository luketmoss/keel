#!/usr/bin/env python3
"""
Keel worktree clean-up.

Subagents and parallel sessions leave worktrees under .claude/worktrees/ that
nothing removes once their work has merged. This removes the safe ones and says
why it kept the rest. Nothing here touches the board.

  worktrees.py clean [--apply]

Without --apply it prints one row per worktree, `remove` or `keep` and the
reason, and changes nothing. With it, a removable worktree is removed with
`git worktree remove` (never --force), its local branch is deleted, any folder
git left behind is deleted (Windows leaves some), and a registration under .claude/worktrees/
whose folder is already gone is dropped (never `git worktree prune`, which
would take the ones outside it too).

A worktree is removable only when all hold: it is under .claude/worktrees/ of
the main checkout, it is on a branch whose PR is merged and which has no remote
branch left, and `git status` in it is clean. Detached, unmerged, dirty, and
anything outside .claude/worktrees/ (another session may be using it) is kept.

Always exits 0: /ship runs it after the merge and a failure here must never
fail or reverse a ship. Problems are printed as `warn:` lines.

Requires `git` and `gh`. Standard library only.
"""

import argparse
import json
import os
import shutil
import stat
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(ROOT)
with open(os.path.join(ROOT, "board.json")) as fh:
    REPO = json.load(fh)["repo"]


# --- classification ---------------------------------------------------------


def norm(path):
    return os.path.normcase(os.path.abspath(path))


def under(path, base):
    path, base = norm(path), norm(base)
    return path != base and path.startswith(base + os.sep)


def classify(wt, base, merged, remote, dirty):
    """Decide one worktree: ('remove' | 'prune' | 'keep', reason).

    `wt` is {path, branch (None when detached), main, prunable}. `base` is the
    main checkout's .claude/worktrees/. `merged`, `remote` and `dirty` are the
    facts about it; they are only consulted when earlier reasons do not decide.
    """
    if wt["main"]:
        return "keep", "main checkout"
    if not under(wt["path"], base):
        return "keep", "outside .claude/worktrees/"
    if wt["prunable"]:
        return "prune", "folder already gone"
    if not wt["branch"]:
        return "keep", "detached"
    if not merged:
        return "keep", "no merged PR"
    if remote:
        return "keep", "branch still on origin"
    if dirty:
        return "keep", "uncommitted changes"
    return "remove", "PR merged, clean"


# --- git and gh -------------------------------------------------------------


def run(args, cwd=REPO_ROOT):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True)


def list_worktrees():
    out = run(["git", "worktree", "list", "--porcelain"]).stdout
    found, cur = [], None
    for line in out.splitlines() + [""]:
        if line.startswith("worktree "):
            cur = {"path": line[9:], "branch": None, "main": not found,
                   "prunable": False}
        elif line.startswith("branch ") and cur:
            cur["branch"] = line[7:].replace("refs/heads/", "", 1)
        elif line.startswith("prunable") and cur:
            cur["prunable"] = True
        elif not line and cur:
            found.append(cur)
            cur = None
    return found


def has_merged_pr(branch):
    r = run(["gh", "pr", "list", "--repo", REPO, "--head", branch,
             "--state", "merged", "--json", "number"])
    if r.returncode != 0:
        return False
    try:
        return bool(json.loads(r.stdout))
    except ValueError:
        return False


def on_origin(branch):
    r = run(["git", "ls-remote", "--heads", "origin", branch])
    return r.returncode != 0 or bool(r.stdout.strip())


def is_dirty(path):
    r = run(["git", "status", "--porcelain"], cwd=path)
    return r.returncode != 0 or bool(r.stdout.strip())


# --- removal ----------------------------------------------------------------


def force_rmtree(path):
    """Delete a folder git left behind. Read-only files and Windows' long
    paths are why `git worktree remove` leaves any."""
    target = path
    if os.name == "nt":
        target = "\\\\?\\" + os.path.abspath(path)

    def writable(func, p, _exc):
        os.chmod(p, stat.S_IWRITE)
        func(p)

    shutil.rmtree(target, onerror=writable)


def remove(wt):
    """Returns a list of warnings; empty means it went cleanly."""
    warns = []
    r = run(["git", "worktree", "remove", wt["path"]])
    if r.returncode != 0:
        # Git may have dropped the registration and failed on the folder.
        if any(w["path"] == wt["path"] for w in list_worktrees()):
            return ["{}: git worktree remove failed: {}".format(
                wt["path"], r.stderr.strip())]
    r = run(["git", "branch", "-D", wt["branch"]])
    if r.returncode != 0:
        warns.append("{}: branch {} not deleted: {}".format(
            wt["path"], wt["branch"], r.stderr.strip()))
    if os.path.exists(wt["path"]):
        try:
            force_rmtree(wt["path"])
        except OSError as err:
            warns.append("{}: folder left behind: {}".format(wt["path"], err))
    return warns


# --- command ----------------------------------------------------------------


def clean(apply):
    base = os.path.join(REPO_ROOT, ".claude", "worktrees")
    removed = kept = 0
    for wt in list_worktrees():
        # Facts are fetched only where classify() will reach for them.
        branch = wt["branch"]
        inside = not wt["main"] and under(wt["path"], base)
        candidate = inside and not wt["prunable"] and branch
        merged = has_merged_pr(branch) if candidate else False
        remote = on_origin(branch) if candidate and merged else False
        dirty = is_dirty(wt["path"]) if candidate and merged and not remote \
            else False
        action, reason = classify(wt, base, merged, remote, dirty)
        print("{:<6} {} [{}] {}".format(
            action, os.path.relpath(wt["path"], REPO_ROOT)
            if inside else wt["path"], branch or "detached", reason))
        if action == "keep":
            kept += 1
            continue
        removed += 1
        if not apply:
            continue
        try:
            if action == "prune":
                # Not `git worktree prune`, which would also take registrations
                # outside .claude/worktrees/. The folder is already gone, so
                # --force discards nothing.
                r = run(["git", "worktree", "remove", "--force", wt["path"]])
                if r.returncode != 0:
                    print("warn: {}: prune failed: {}".format(
                        wt["path"], r.stderr.strip()))
            else:
                for warning in remove(wt):
                    print("warn: " + warning)
        except Exception as err:  # never fail the caller
            print("warn: {}: {}".format(wt["path"], err))
    print("{} {}, {} kept".format(
        removed, "removed" if apply else "removable", kept))


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("clean", help="remove merged, clean worktrees")
    p.add_argument("--apply", action="store_true",
                   help="remove them; without it, only print")
    args = parser.parse_args()
    try:
        clean(args.apply)
    except Exception as err:  # never fail the caller
        print("warn: worktrees clean failed: {}".format(err))


if __name__ == "__main__":
    main()
    sys.exit(0)
