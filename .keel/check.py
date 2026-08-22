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


CHECKS = [check_python, check_frontmatter, check_links, check_design_notes]


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
