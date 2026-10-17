# apps-script stack scaffold

Moved out of [SKILL.md](SKILL.md) so that the file every lifecycle command
reads carries only what those commands act on. Nothing here is reachable from
`/pm`, `/develop`, `/test` or `/review` — it is read once, by `/new-project`,
when a component of this stack is created.

Drawn from Thrive's `apps-script/`, cut down to the part every Apps Script
backend needs: one escaping helper, a fake sheet that interprets writes the way
Sheets does, and a test that fails when the helper is bypassed.

## Scaffold

`<component>` is the path the project's `## Stacks` table gives this stack,
usually `apps-script`.

```
<slug>/<component>/
├── package.json
├── package-lock.json
├── tsconfig.json
├── vitest.config.ts
├── .claspignore
├── .clasp.json.example
├── .gitignore            # node_modules/, .clasp.json
├── src/
│   ├── appsscript.json
│   └── utils.js
└── tests/
    ├── apps-script-sandbox.ts
    └── writes-are-text.test.ts
```

And in the repository's root `.gitattributes`, if it is not there already:

```
*.js text eol=lf
*.mjs text eol=lf
```

Transcribe the files below rather than inventing them. CI runs `npm test` and
`npm run typecheck` by name. Run `npm install` once after writing
`package.json` and commit the `package-lock.json` it produces: CI uses `npm ci`,
which refuses to run without one.

### package.json

```json
{
  "name": "<slug>-apps-script",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/google-apps-script": "^1.0.83",
    "@types/node": "^20.19.43",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["google-apps-script", "node"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

### vitest.config.ts

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true,
  },
});
```

### .claspignore

```
tests/**
node_modules/**
package.json
package-lock.json
tsconfig.json
*.test.ts
README.md
.claspignore
```

### .clasp.json.example

Committed. The filled-in copy is `.clasp.json`, which `.gitignore` covers: it
holds the script id. `rootDir` makes `clasp push` send `src/` and nothing else.

```json
{
  "scriptId": "YOUR_SCRIPT_ID_HERE",
  "rootDir": "src"
}
```

### .gitignore

```
node_modules/
.clasp.json
```

### src/appsscript.json

The manifest, pinned. Listing `oauthScopes` stops Apps Script inferring them
from the services the code touches; add a scope here when a function first
needs one, and see SKILL.md for the re-authorization that follows. A web app
that must answer a browser `fetch` is `ANYONE_ANONYMOUS`; set `timeZone` to the
zone the sheet's dates are written in.

```json
{
  "timeZone": "America/Denver",
  "dependencies": {
  },
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets"
  ],
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

### src/utils.js

Plain Apps Script: one shared global scope, no modules, no exports, and nothing
that touches a Google global at load time — the sandbox below depends on that.

```javascript
/**
 * A cell as a string, with unset meaning ''. `undefined` (a row written before
 * a column existed) and `null` must never become 0 or "undefined".
 */
function cell(value) {
  return value === undefined || value === null ? '' : String(value);
}

/**
 * Prefix each value with an apostrophe, Sheets' own escape.
 *
 * appendRow and setValues behave like typing into a cell: "2026-03-04"
 * becomes a date, "3720" a number, "=anything" a live formula. The apostrophe
 * makes the value stored exactly as given, and a formula can never be
 * injected. Every write goes through here. '' stays '' .
 */
function asText(values) {
  return values.map(function (v) {
    var s = cell(v);
    return s === '' ? '' : "'" + s;
  });
}

/** Append one record to a sheet, as text. */
function appendRecord(sheet, values) {
  sheet.appendRow(asText(values));
}
```

### tests/apps-script-sandbox.ts

The harness. It reads the **real** `src/*.js` and evaluates them into a
`node:vm` context, so a test cannot pass against a transcribed copy while the
source is broken. `makeSheet` is the point of the whole stack: its writes go
through `storeAsTyped`, so a write that skips `asText` stores a date, a number
or a formula, and the suite fails. Grow it a stub at a time, as sources need
them (`LockService`, `PropertiesService`, `ContentService`, `Utilities`,
`CacheService`, `UrlFetchApp`); leave anything that affects behaviour to the
test, so a missing stub fails loudly.

```ts
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

// The sandbox holds the globals the sources declared. Its shape is only
// knowable at runtime, so `any` is the honest type.
export type Sandbox = Record<string, any>;

/** What a cell holds when a write began with `=`: a live formula, not text. */
export class SheetFormula {
  constructor(public source: string) {}
}

export type CellValue = string | number | boolean | Date | SheetFormula;

/**
 * What Sheets stores when a script writes `value` with appendRow/setValues.
 * A date- or time-shaped string becomes a date, a number-shaped one a number,
 * a leading `=` a formula. A leading apostrophe is the escape: the rest is
 * stored as literal text and the apostrophe dropped.
 */
export function storeAsTyped(value: CellValue): CellValue {
  if (typeof value !== 'string') return value;
  if (value.startsWith("'")) return value.slice(1);
  if (value.startsWith('=')) return new SheetFormula(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00`);
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

/** A fake Sheet. `rows` is the live backing array: assert on it after a write. */
export function makeSheet(rows: CellValue[][]) {
  return {
    rows,
    appendRow(row: CellValue[]) {
      rows.push(row.map(storeAsTyped));
    },
  };
}

/** Evaluate the named `src` files into one shared sandbox, in order. */
export function loadSources(files: string[], globals: Sandbox = {}): Sandbox {
  const context = createContext({ Logger: { log() {} }, console, ...globals });
  for (const file of files) {
    const filename = path.join(SRC_DIR, file);
    runInContext(readFileSync(filename, 'utf8'), context, { filename, displayErrors: true });
  }
  return context;
}
```

### tests/writes-are-text.test.ts

The example test. Delete it once real tests cover the same ground; until then
it is the difference between `npm test` proving something and proving nothing.
Remove the `asText` call from `appendRecord` and the first two tests fail.

```ts
import { describe, expect, it } from 'vitest';
import { SheetFormula, loadSources, makeSheet, type CellValue } from './apps-script-sandbox';

describe('writes are stored as literal text', () => {
  function append(values: string[]) {
    const rows: CellValue[][] = [];
    const sandbox = loadSources(['utils.js']);
    sandbox.appendRecord(makeSheet(rows), values);
    return rows[0];
  }

  it('keeps a date and a number as the text they were', () => {
    const row = append(['2026-03-04', '3720']);
    expect(row[0]).toBe('2026-03-04');
    expect(row[1]).toBe('3720');
  });

  it('stores a value beginning with = as text, never a live formula', () => {
    const row = append(['=IMPORTXML("https://evil.test","//a")']);
    expect(row[0]).not.toBeInstanceOf(SheetFormula);
    expect(row[0]).toBe('=IMPORTXML("https://evil.test","//a")');
  });

  it('writes an unset value as an empty cell', () => {
    expect(append([''])[0]).toBe('');
  });
});
```

## CI job

One job in the project's `<slug>.yml`, named after the component. The project's
trigger filter (`<slug>/**` and the workflow's own file), concurrency group and
cache-key prefix are unchanged and are not repeated here; per
`CONVENTIONS.md` §Continuous integration this job runs on any change in the
project folder. `<slug>/<component>` is the component's directory. There is no
deploy step: `clasp push` and the new web-app version are the owner's, per
SKILL.md.

```yaml
  <component>:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: <slug>/<component>
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '20'
          cache: npm
          cache-dependency-path: <slug>/<component>/package-lock.json
      - run: npm ci
      - run: npm test
      - run: npm run typecheck
```
