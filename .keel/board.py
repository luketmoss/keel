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
  board.py projects
  board.py add-project <slug>
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
    """Board item id for an issue, or None if the issue is not on the board."""
    cursor = "null"
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
                      content { ... on Issue { number } }
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
            if content.get("number") == number:
                return item["id"]
        if not items["pageInfo"]["hasNextPage"]:
            return None
        cursor = q(items["pageInfo"]["endCursor"])


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
    print(json.dumps(values, indent=2))


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


def cmd_list(args):
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
            if args.status and values.get("Status") != args.status:
                continue
            if args.project and values.get("Project") != args.project:
                continue
            rows.append(
                {
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
    print(json.dumps(rows, indent=2))


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

    p = sub.add_parser("projects", help="list project options")
    p.set_defaults(func=cmd_projects)

    p = sub.add_parser("add-project", help="append a project option safely")
    p.add_argument("slug")
    p.set_defaults(func=cmd_add_project)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
