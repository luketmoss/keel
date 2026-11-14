# 872 — Forage opens on Eaten, and the tab bar follows use

Specifies [#872](https://github.com/luketmoss/keel/issues/872), filed alongside epic
[#876](https://github.com/luketmoss/keel/issues/876). The sketch is the usuals prototype's Other feedback tab
(`876-usuals-prototype.html`). The shell, its routes and the tab bar are [`704-app-shell.md`](704-app-shell.md); the
dated Eaten hash is [`825-eaten-by-date.md`](825-eaten-by-date.md). Nothing here introduces a token.

## Decisions

1. **Eaten is the default tab.** `DEFAULT_TAB` in `frontend/src/shell/routes.ts` becomes `'eaten'`. A bare URL
   (`https://luketmoss.github.io/keel/forage/`, the installed app's `start_url: "./"`), an empty hash, and an unknown
   hash (`#/nope`) all open Eaten on today, and the hash is rewritten in place to `#/eaten` with no history entry,
   exactly as they were rewritten to `#/plan` before.
2. **The tab bar is ordered by use: Eaten · Library · Plan · Shop.** The `TABS` array in `frontend/src/shell/tabs.tsx`
   is reordered; nothing else about a tab changes (label, icon, hash, empty copy, active style). Chosen over keeping
   Plan · Shop · Eaten · Library because the prototype the owner tapped through used the new order, and the left-most
   tab should be the one the app opens on, so the open tab and the highlighted position agree. #704's "fixes the tab
   order" line is superseded by this note for the order only.

## Unchanged

- Every existing hash keeps working and opens its tab: `#/plan`, `#/shop`, `#/library`, `#/eaten`, `#/eaten/<date>`
  (with #825's rewrite rules), and `#/cook/<id>`. A bookmark to `#/plan` still opens Plan.
- The query is kept on every rewrite, so `?demo=true` survives (`?demo=true` with no hash opens Eaten in demo).
- Tapping the current tab still scrolls to the top; back and forward still move between tabs.
- The header for each tab (Eaten's date header, Plan's **Plan a meal**, Library's buttons) is untouched.

## Edge cases

- **Sign-in:** the login screen is not a tab and is unchanged; after signing in, a bare URL lands on Eaten.
- **A dated hash for today or later** still rewrites to `#/eaten` (#825), now also the default, so there is one place
  to land.
- **Wide screens:** the bar's centred inner column is unchanged; only the order of its four links changes.

## Accessibility

The links stay in DOM order, which is now the visual order, so Tab and a screen reader meet Eaten first.
`aria-current="page"` stays on the active link.
