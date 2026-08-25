#!/usr/bin/env python3
"""
Keel board operations.

Every write to the GitHub Projects board goes through this script. Skills call
it instead of hand-writing GraphQL, because one of these operations - appending
an option to a single-select field - silently destroys data if done naively.

  board.py show <issue>
  board.py sync <issue>
  board.py set <issue> [--status S] [--project P] [--priority P] [--size S] [--type T]
  board.py list --status <stage> [--project <slug>]
  board.py holds-branch [--project <slug>]
  board.py next --status <stage> [--project <slug>]
  board.py projects
  board.py add-project <slug>

`holds-branch` and `next` exit non-zero to mean "something holds a branch" and
"nothing to pick" - they are read-only, and written to be called by a schedule
that has no one to read its output.
"""

import argparse
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(ROOT, "board.json")) as fh:
    CFG = json.load(fh)

PROJECT_ID = CFG["projectId"]
REPO = CFG["repo"]

# Field name on the board -> key used on the command line.
FIELDS = {
    "Status": "status",
    "Project": "project",
    "Priority": "priority",
    "Size": "size",
    "Type": "type",
}


def gh(args):
    result = subprocess.run(["gh"] + args, capture_output=True, text=True)
    if result.returncode != 0:
        sys.exit("gh failed: gh {}\n{}".format(" ".join(args), result.stderr.strip()))
    return result.stdout


def graphql(query):
    payload = json.loads(gh(["api", "graphql", "-f", "query=" + query]))
    if "errors" in payload:
        sys.exit("GraphQL error: " + json.dumps(payload["errors"], indent=2))
    return payload["data"]


def q(value):
    """Quote a string for safe inline interpolation into a GraphQL document."""
    return json.dumps(value)


_schema = None


def schema():
    """Field and option metadata, read live so stale IDs are impossible."""
    global _schema
    if _schema is None:
        data = graphql(
            """
            query {
              node(id: %s) {
                ... on ProjectV2 {
                  fields(first: 50) {
                    nodes {
                      ... on ProjectV2FieldCommon { id name }
                      ... on ProjectV2SingleSelectField {
                        id name options { id name }
                      }
                    }
                  }
                }
              }
            }
            """
            % q(PROJECT_ID)
        )
        _schema = {
            node["name"]: node
            for node in data["node"]["fields"]["nodes"]
            if node.get("name")
        }
    return _schema


def field(name):
    found = schema().get(name)
    if not found:
        sys.exit("No field named {!r} on the board".format(name))
    return found


def option_id(field_name, value):
    options = field(field_name).get("options", [])
    for option in options:
        if option["name"].lower() == value.lower():
            return option["id"]
    sys.exit(
        "{!r} is not a valid {} value. Options: {}".format(
            value, field_name, ", ".join(o["name"] for o in options)
        )
    )


def issue_node_id(number):
    return gh(
        ["api", "repos/{}/issues/{}".format(REPO, number), "--jq", ".node_id"]
    ).strip()


def find_item(number):
    """Board item id for an issue, or None if the issue is not on the board.

    Reads through `board_rows` rather than running its own query - see its
    docstring for why there is only one paginated items() query in this file.
    """
    for row in board_rows():
        if row["number"] == number:
            return row["id"]
    return None


def ensure_item(number):
    existing = find_item(number)
    if existing:
        return existing
    data = graphql(
        """
        mutation {
          addProjectV2ItemById(input: {projectId: %s, contentId: %s}) {
            item { id }
          }
        }
        """
        % (q(PROJECT_ID), q(issue_node_id(number)))
    )
    return data["addProjectV2ItemById"]["item"]["id"]


def set_field(item, field_name, value):
    graphql(
        """
        mutation {
          updateProjectV2ItemFieldValue(input: {
            projectId: %s, itemId: %s, fieldId: %s
            value: {singleSelectOptionId: %s}
          }) { projectV2Item { id } }
        }
        """
        % (
            q(PROJECT_ID),
            q(item),
            q(field(field_name)["id"]),
            q(option_id(field_name, value)),
        )
    )


def item_values(number):
    """Current field values for an issue, as a plain dict."""
    item = find_item(number)
    if not item:
        return None
    data = graphql(
        """
        query {
          node(id: %s) {
            ... on ProjectV2Item {
              fieldValues(first: 20) {
                nodes {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name field { ... on ProjectV2FieldCommon { name } }
                  }
                }
              }
            }
          }
        }
        """
        % q(item)
    )
    values = {}
    for node in data["node"]["fieldValues"]["nodes"]:
        if node and node.get("field"):
            values[node["field"]["name"]] = node.get("name")
    return values


# --- commands ---------------------------------------------------------------


def cmd_show(args):
    values = item_values(args.issue)
    if values is None:
        sys.exit("Issue #{} is not on the board. Run: board.py sync {}".format(
            args.issue, args.issue))
    full = {name: values.get(name) for name in FIELDS}
    print(json.dumps(full, indent=2))


def cmd_sync(args):
    print(ensure_item(args.issue))


def cmd_set(args):
    updates = [
        (name, getattr(args, key))
        for name, key in FIELDS.items()
        if getattr(args, key)
    ]
    if not updates:
        sys.exit("Nothing to set. Pass at least one of --status/--project/"
                 "--priority/--size/--type")
    item = ensure_item(args.issue)
    for field_name, value in updates:
        set_field(item, field_name, value)
        print("#{} {} -> {}".format(args.issue, field_name, value))


def board_rows(status=None, project=None):
    """Every issue on the board, optionally narrowed to one stage or project.

    The only place the project-items query lives. `find_item`, `list`,
    `holds-branch` and `next` all read through here - one paginated GraphQL
    query rather than several copies that can go stale independently.

    Each row carries the project item `id` alongside the display fields, since
    `find_item` needs it and callers that don't (`list`) drop it before
    printing.
    """
    cursor = "null"
    rows = []
    while True:
        data = graphql(
            """
            query {
              node(id: %s) {
                ... on ProjectV2 {
                  items(first: 100, after: %s) {
                    pageInfo { hasNextPage endCursor }
                    nodes {
                      id
                      content { ... on Issue { number title url } }
                      fieldValues(first: 20) {
                        nodes {
                          ... on ProjectV2ItemFieldSingleSelectValue {
                            name field { ... on ProjectV2FieldCommon { name } }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
            """
            % (q(PROJECT_ID), cursor)
        )
        items = data["node"]["items"]
        for item in items["nodes"]:
            content = item.get("content") or {}
            if not content.get("number"):
                continue
            values = {}
            for node in item["fieldValues"]["nodes"]:
                if node and node.get("field"):
                    values[node["field"]["name"]] = node.get("name")
            if status and values.get("Status") != status:
                continue
            if project and values.get("Project") != project:
                continue
            rows.append(
                {
                    "id": item["id"],
                    "number": content["number"],
                    "title": content["title"],
                    "url": content["url"],
                    "status": values.get("Status"),
                    "project": values.get("Project"),
                    "priority": values.get("Priority"),
                    "size": values.get("Size"),
                }
            )
        if not items["pageInfo"]["hasNextPage"]:
            break
        cursor = q(items["pageInfo"]["endCursor"])
    return rows


def without_id(row):
    """Drop the internal item `id` before a row reaches printed output."""
    return {k: v for k, v in row.items() if k != "id"}


def cmd_list(args):
    rows = [without_id(row) for row in board_rows(args.status, args.project)]
    print(json.dumps(rows, indent=2))


# The stages that own an open branch. Ready to Ship is one of them: #170 made
# it where a delivery run *parks* rather than where it ends, and an issue
# resting there still has its pull request open.
BRANCH_STAGES = ["In Development", "Testing", "Code Review", "Ready to Ship"]

# Highest first. An issue with no priority set sorts last rather than being
# skipped - unprioritised is still work, it is just not the work to pick while
# anything else is waiting.
PRIORITY_ORDER = ["P0", "P1", "P2"]


def cmd_holds_branch(args):
    """What is mid-flight, and a non-zero exit if anything is.

    The guard a scheduled run checks before cutting a branch. There is one
    working tree, so a second `git checkout -b` while another issue holds a
    branch either refuses or drags that issue's uncommitted work onto the new
    branch. Exiting non-zero is what makes this usable from a shell without
    parsing anything.
    """
    rows = [row for row in board_rows(project=args.project) if row["status"] in BRANCH_STAGES]
    print(json.dumps([without_id(row) for row in rows], indent=2))
    if rows:
        sys.exit(1)


def pick_order(row):
    """Sort key for `next`: priority first, then the lowest issue number.

    Named rather than inlined so it can be checked against rows that are not
    on the board - the live board is usually one priority, which proves the
    tie-break and nothing about the ordering above it.
    """
    priority = row.get("priority")
    rank = PRIORITY_ORDER.index(priority) if priority in PRIORITY_ORDER else len(PRIORITY_ORDER)
    return (rank, row["number"])


def cmd_next(args):
    """The one issue a run should take out of `--status`, or a non-zero exit.

    Priority first, then the lowest issue number - oldest wins a tie, so a
    queue drains in the order it was filled rather than by whatever the board
    happens to return.
    """
    rows = board_rows(args.status, args.project)
    if not rows:
        sys.exit(1)
    print(json.dumps(without_id(min(rows, key=pick_order)), indent=2))


def cmd_projects(args):
    for option in field("Project").get("options", []):
        print(option["name"])


def cmd_add_project(args):
    """Append an option to the Project field, preserving every existing one.

    updateProjectV2Field replaces the whole option list. Existing options must
    be written back with their IDs or every item assigned to them is orphaned,
    so this reads the current list first and never rebuilds it from scratch.
    """
    project_field = field("Project")
    existing = project_field.get("options", [])
    if any(o["name"].lower() == args.slug.lower() for o in existing):
        print("{} already exists".format(args.slug))
        return

    options = [
        "{{id: {}, name: {}, color: {}, description: {}}}".format(
            q(o["id"]), q(o["name"]), "GRAY", q("")
        )
        for o in existing
    ]
    options.append(
        "{{name: {}, color: {}, description: {}}}".format(q(args.slug), "GRAY", q(""))
    )

    graphql(
        """
        mutation {
          updateProjectV2Field(input: {fieldId: %s, singleSelectOptions: [%s]}) {
            projectV2Field {
              ... on ProjectV2SingleSelectField { options { id name } }
            }
          }
        }
        """
        % (q(project_field["id"]), " ".join(options))
    )
    print("Added project option: {}".format(args.slug))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("show", help="current field values for an issue")
    p.add_argument("issue", type=int)
    p.set_defaults(func=cmd_show)

    p = sub.add_parser("sync", help="ensure an issue is on the board")
    p.add_argument("issue", type=int)
    p.set_defaults(func=cmd_sync)

    p = sub.add_parser("set", help="set field values on an issue")
    p.add_argument("issue", type=int)
    p.add_argument("--status")
    p.add_argument("--project")
    p.add_argument("--priority")
    p.add_argument("--size")
    p.add_argument("--type")
    p.set_defaults(func=cmd_set)

    p = sub.add_parser("list", help="issues filtered by stage and project")
    p.add_argument("--status")
    p.add_argument("--project")
    p.set_defaults(func=cmd_list)

    p = sub.add_parser("holds-branch", help="issues holding an open branch; non-zero if any")
    p.add_argument("--project")
    p.set_defaults(func=cmd_holds_branch)

    p = sub.add_parser("next", help="the one issue to pick from a stage; non-zero if none")
    p.add_argument("--status", required=True)
    p.add_argument("--project")
    p.set_defaults(func=cmd_next)

    p = sub.add_parser("projects", help="list project options")
    p.set_defaults(func=cmd_projects)

    p = sub.add_parser("add-project", help="append a project option safely")
    p.add_argument("slug")
    p.set_defaults(func=cmd_add_project)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
