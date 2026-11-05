"""Tests for checkouts.py (#835). Temporary git repositories, no network, and
made-up settings: nothing here touches a real checkout.

  python -m unittest        (from this folder)
"""

import json
import os
import shutil
import subprocess
import tempfile
import unittest

import checkouts


def run(cwd, *args):
    env = dict(os.environ, GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@example.com",
               GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@example.com")
    out = subprocess.run(["git", "-C", cwd] + list(args), capture_output=True,
                         text=True, env=env)
    if out.returncode != 0:
        raise AssertionError("git {}: {}".format(" ".join(args), out.stderr))
    return out.stdout.strip()


def write(path, text, append=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "a" if append else "w", newline="\n") as fh:
        fh.write(text)


def commit(repo, name, text, message="c", append=False):
    write(os.path.join(repo, name), text, append)
    run(repo, "add", "-A")
    run(repo, "commit", "-q", "-m", message)


class Remote:
    """A bare `origin`, a clone to push from, and helpers to add commits."""

    def __init__(self, base, name):
        self.bare = os.path.join(base, name + ".git")
        self.pusher = os.path.join(base, name + "-pusher")
        run(base, "init", "-q", "--bare", "-b", "main", self.bare)
        run(base, "clone", "-q", self.bare, self.pusher)
        run(self.pusher, "checkout", "-q", "-b", "main")
        commit(self.pusher, ".gitattributes", "log.md merge=union\n")
        commit(self.pusher, "log.md", "start\n")
        commit(self.pusher, "page.md", "one\n")
        run(self.pusher, "push", "-q", "origin", "main")

    def advance(self, name="page.md", text="more\n", append=True):
        run(self.pusher, "pull", "-q", "--rebase", "origin", "main")
        commit(self.pusher, name, text, "remote", append)
        run(self.pusher, "push", "-q", "origin", "main")

    def clone(self, dest, detach=False):
        run(os.path.dirname(dest), "clone", "-q", self.bare, dest)
        run(dest, "checkout", "-q", "--detach" if detach else "main")
        return dest

    def tip(self):
        return run(self.bare, "rev-parse", "main")


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.folder = os.path.join(self.tmp, "briefs")
        os.makedirs(self.folder)

    def settings(self, wiki=None, where=None):
        text = "- **home**: `1.00, 2.00`. name: Home\n"
        if wiki:
            text += "- **wiki**: `{}`\n".format(wiki)
        write(os.path.join(where or self.folder, checkouts.SETTINGS), text)

    def sync(self, keel=None):
        return checkouts.sync(keel or os.path.join(self.folder, "keel"),
                              self.folder)

    def refs(self, repo):
        """Local branches and tags: a fetch moves origin/* by design."""
        return run(repo, "for-each-ref", "--format=%(refname) %(objectname)",
                   "refs/heads", "refs/tags")


class KeelSync(Base):
    def setUp(self):
        super().setUp()
        self.remote = Remote(self.tmp, "keel")
        self.keel = self.remote.clone(os.path.join(self.folder, "keel"),
                                      detach=True)
        self.settings()

    def test_behind_clean_moves_to_origin_main(self):
        self.remote.advance()
        report = self.sync()
        self.assertEqual(report["keel"]["state"], "updated")
        self.assertEqual(run(self.keel, "rev-parse", "HEAD"), self.remote.tip())
        self.assertEqual(current(self.keel), None)  # still detached

    def test_already_there_is_current(self):
        self.assertEqual(self.sync()["keel"]["state"], "current")

    def test_uncommitted_change_is_left_and_stale(self):
        self.remote.advance()
        write(os.path.join(self.keel, "page.md"), "mine\n")
        before = run(self.keel, "rev-parse", "HEAD")
        keel = self.sync()["keel"]
        self.assertEqual(keel, {"state": "stale", "reason": "changes"})
        self.assertEqual(run(self.keel, "rev-parse", "HEAD"), before)
        with open(os.path.join(self.keel, "page.md")) as fh:
            self.assertEqual(fh.read(), "mine\n")

    def test_unreachable_is_left_and_stale(self):
        run(self.keel, "remote", "set-url", "origin",
            os.path.join(self.tmp, "nowhere.git"))
        before = run(self.keel, "rev-parse", "HEAD")
        keel = self.sync()["keel"]
        self.assertEqual(keel, {"state": "stale", "reason": "unreachable"})
        self.assertEqual(run(self.keel, "rev-parse", "HEAD"), before)

    def test_a_branch_checkout_is_never_moved(self):
        run(self.keel, "checkout", "-q", "main")
        self.remote.advance()
        before = self.refs(self.keel)
        self.assertEqual(self.sync()["keel"]["state"], "skipped")
        self.assertEqual(self.refs(self.keel), before)


def current(repo):
    return checkouts.current_branch(repo)


class WikiSync(Base):
    def setUp(self):
        super().setUp()
        self.remote = Remote(self.tmp, "wiki")
        self.wiki = self.remote.clone(os.path.join(self.tmp, "wiki"))
        self.settings(wiki=self.wiki)

    def wiki_report(self):
        return self.sync()["wiki"]

    def assertUntouched(self, before_refs, before_files):
        self.assertEqual(self.refs(self.wiki), before_refs)
        for name, text in before_files.items():
            with open(os.path.join(self.wiki, name)) as fh:
                self.assertEqual(fh.read(), text)

    def snapshot(self):
        files = {}
        for name in ("page.md", "log.md"):
            with open(os.path.join(self.wiki, name)) as fh:
                files[name] = fh.read()
        return self.refs(self.wiki), files

    def test_behind_clean_fast_forwards_and_is_writable(self):
        self.remote.advance()
        report = self.wiki_report()
        self.assertEqual(report["state"], "updated")
        self.assertTrue(report["writable"])
        self.assertEqual(run(self.wiki, "rev-parse", "HEAD"), self.remote.tip())

    def test_current_is_writable(self):
        report = self.wiki_report()
        self.assertEqual((report["state"], report["writable"]), ("current", True))

    def test_uncommitted_changes_leave_everything_untouched(self):
        self.remote.advance()
        write(os.path.join(self.wiki, "page.md"), "mine\n")
        write(os.path.join(self.wiki, "new.md"), "untracked\n")
        refs = self.refs(self.wiki)
        report = self.wiki_report()
        self.assertEqual(report["writable"], False)
        self.assertEqual(report["reason"], "changes")
        self.assertEqual(self.refs(self.wiki), refs)
        with open(os.path.join(self.wiki, "page.md")) as fh:
            self.assertEqual(fh.read(), "mine\n")

    def test_other_branch_leaves_everything_untouched(self):
        self.remote.advance()
        run(self.wiki, "checkout", "-q", "-b", "side")
        before = self.snapshot()
        report = self.wiki_report()
        self.assertEqual((report["writable"], report["reason"]), (False, "branch"))
        self.assertUntouched(*before)
        self.assertEqual(current(self.wiki), "side")

    def test_diverged_leaves_everything_untouched(self):
        commit(self.wiki, "page.md", "local\n", "local", append=True)
        self.remote.advance()
        before = self.snapshot()
        report = self.wiki_report()
        self.assertEqual((report["writable"], report["reason"]),
                         (False, "diverged"))
        self.assertUntouched(*before)

    def test_unreachable_leaves_everything_untouched(self):
        run(self.wiki, "remote", "set-url", "origin",
            os.path.join(self.tmp, "nowhere.git"))
        before = self.snapshot()
        report = self.wiki_report()
        self.assertEqual((report["writable"], report["reason"]),
                         (False, "unreachable"))
        self.assertUntouched(*before)

    def test_only_ahead_is_writable(self):
        commit(self.wiki, "page.md", "local\n", "local", append=True)
        report = self.wiki_report()
        self.assertEqual((report["state"], report["writable"]), ("ahead", True))

    def test_no_wiki_line_is_not_writable(self):
        self.settings()
        report = self.wiki_report()
        self.assertFalse(report["writable"])


class Writeback(Base):
    def setUp(self):
        super().setUp()
        self.remote = Remote(self.tmp, "wiki")
        self.wiki = self.remote.clone(os.path.join(self.tmp, "wiki"))
        self.settings(wiki=self.wiki)
        self.sync_report = self.sync()

    def wb(self, message, *paths):
        return checkouts.writeback(message, list(paths),
                                   os.path.join(self.folder, "keel"), self.folder)

    def test_commits_only_the_given_paths_and_pushes(self):
        write(os.path.join(self.wiki, "log.md"), "start\nrun A\n")
        write(os.path.join(self.wiki, "grades.md"), "g\n")
        # a change outside the paths would refuse; keep the tree to the paths
        result = self.wb("grade", "log.md", "grades.md")
        self.assertEqual(result["status"], "pushed")
        self.assertEqual(run(self.wiki, "rev-parse", "HEAD"), self.remote.tip())
        files = run(self.wiki, "show", "--name-only", "--format=", "HEAD")
        self.assertEqual(sorted(files.split()), ["grades.md", "log.md"])

    def test_other_changes_refuse_and_write_nothing(self):
        write(os.path.join(self.wiki, "log.md"), "start\nrun A\n")
        write(os.path.join(self.wiki, "page.md"), "owner's work\n")
        head = run(self.wiki, "rev-parse", "HEAD")
        result = self.wb("grade", "log.md")
        self.assertEqual(result, {"status": "refused", "reason": "changes"})
        self.assertEqual(run(self.wiki, "rev-parse", "HEAD"), head)
        self.assertEqual(self.remote.tip(), head)

    def test_concurrent_log_lines_both_survive(self):
        write(os.path.join(self.wiki, "log.md"), "this run\n", append=True)
        self.remote.advance("log.md", "other run\n")
        result = self.wb("log", "log.md")
        self.assertEqual(result["status"], "pushed")
        shown = run(self.wiki, "show", "origin/main:log.md")
        self.assertIn("this run", shown)
        self.assertIn("other run", shown)

    def test_refuses_when_sync_said_not_writable(self):
        write(os.path.join(self.wiki, "page.md"), "owner's work\n")
        self.sync()  # now sees uncommitted changes
        write(os.path.join(self.wiki, "page.md"), "owner's work\n")
        run(self.wiki, "checkout", "--", "page.md")
        head = run(self.wiki, "rev-parse", "HEAD")
        write(os.path.join(self.wiki, "log.md"), "start\nrun\n")
        result = self.wb("grade", "log.md")
        self.assertEqual(result["status"], "refused")
        self.assertEqual(run(self.wiki, "rev-parse", "HEAD"), head)
        self.assertEqual(self.remote.tip(), head)

    def test_refuses_without_a_sync(self):
        os.remove(checkouts.state_path(os.path.join(self.folder, "keel"),
                                       self.folder))
        write(os.path.join(self.wiki, "log.md"), "x\n")
        self.assertEqual(self.wb("m", "log.md")["status"], "refused")

    def test_stopped_rebase_is_aborted_and_commit_kept(self):
        write(os.path.join(self.wiki, "page.md"), "mine\n")
        self.remote.advance("page.md", "theirs\n", append=False)
        result = self.wb("edit", "page.md")
        self.assertEqual(result["status"], "not pushed")
        self.assertEqual(result["reason"], "rebase stopped")
        self.assertEqual(run(self.wiki, "status", "--porcelain"), "")
        self.assertFalse(checkouts.rebase_in_progress(self.wiki))
        self.assertEqual(run(self.wiki, "log", "-1", "--format=%s"), "edit")
        self.assertNotEqual(run(self.wiki, "rev-parse", "HEAD"), self.remote.tip())

    def test_rejected_push_keeps_the_commit(self):
        hook = os.path.join(self.remote.bare, "hooks", "pre-receive")
        write(hook, "#!/bin/sh\nexit 1\n")
        os.chmod(hook, 0o755)
        write(os.path.join(self.wiki, "log.md"), "start\nrun\n")
        head = run(self.wiki, "rev-parse", "HEAD")
        result = self.wb("log", "log.md")
        self.assertEqual(result, {"status": "not pushed", "reason": "push rejected"})
        self.assertEqual(run(self.wiki, "log", "-1", "--format=%s"), "log")
        self.assertEqual(run(self.wiki, "status", "--porcelain"), "")
        self.assertEqual(self.remote.tip(), head)

    def test_next_sync_carries_an_unpushed_commit(self):
        hook = os.path.join(self.remote.bare, "hooks", "pre-receive")
        write(hook, "#!/bin/sh\nexit 1\n")
        os.chmod(hook, 0o755)
        write(os.path.join(self.wiki, "log.md"), "start\nold run\n")
        self.assertEqual(self.wb("old", "log.md")["status"], "not pushed")
        os.remove(hook)
        report = self.sync()["wiki"]
        self.assertEqual((report["state"], report["writable"]), ("ahead", True))
        write(os.path.join(self.wiki, "log.md"), "new run\n", append=True)
        self.assertEqual(self.wb("new", "log.md")["status"], "pushed")
        self.assertEqual(self.remote.tip(), run(self.wiki, "rev-parse", "HEAD"))
        log = run(self.wiki, "log", "origin/main", "--format=%s", "-3")
        self.assertIn("old", log)
        self.assertIn("new", log)

    def test_the_script_never_forces_resets_or_stashes(self):
        with open(os.path.join(os.path.dirname(checkouts.__file__),
                               "checkouts.py")) as fh:
            code = "\n".join(l for l in fh.read().splitlines()
                             if not l.lstrip().startswith("#"))
        body = code.split('"""', 2)[2]  # drop the module docstring
        for word in ("--force", "reset", "stash", '"-f"'):
            self.assertNotIn(word, body)


class Settings(Base):
    def test_beside_the_worktree_wins(self):
        keel = os.path.join(self.folder, "keel")
        os.makedirs(keel)
        self.settings()
        self.assertEqual(checkouts.find_settings(keel),
                         os.path.join(self.folder, checkouts.SETTINGS))

    def test_falls_back_to_the_skill_folder(self):
        keel = os.path.join(self.folder, "keel")
        os.makedirs(keel)
        here = os.path.join(checkouts.HERE, checkouts.SETTINGS)
        found = checkouts.find_settings(keel)
        self.assertEqual(found, here if os.path.isfile(here) else None)

    def test_wiki_path_is_read_and_placeholder_ignored(self):
        self.settings(wiki="C:\\made\\up")
        path = os.path.join(self.folder, checkouts.SETTINGS)
        self.assertEqual(checkouts.read_wiki_path(path), "C:\\made\\up")
        write(path, "- **wiki**: `<path to the wiki checkout>`\n")
        self.assertIsNone(checkouts.read_wiki_path(path))


if __name__ == "__main__":
    unittest.main()
