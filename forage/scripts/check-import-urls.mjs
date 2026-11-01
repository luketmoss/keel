#!/usr/bin/env node
/**
 * check-import-urls.mjs - Prove recipe import (#706) against the deployed API.
 *
 * Calls `importRecipe` as a dry run (nothing is written) for every URL in a
 * list and prints, for each, the name, servings, ingredient and step counts and
 * step sections, or the reason it gave no recipe. The lists the import was
 * built against are in scripts/import-urls/: urls.txt and heldout.txt, the
 * #700 spike's. Lines starting with # are skipped.
 *
 * Usage (PowerShell; the values are prompted for, never typed into the command):
 *   $env:FORAGE_API_URL = Read-Host 'FORAGE_API_URL'
 *   $key = Read-Host 'FORAGE_API_KEY' -AsSecureString
 *   $env:FORAGE_API_KEY = [System.Net.NetworkCredential]::new('', $key).Password
 *   node scripts/check-import-urls.mjs scripts/import-urls/urls.txt scripts/import-urls/heldout.txt
 */
import { readFileSync } from 'node:fs';

const url = process.env.FORAGE_API_URL;
const key = process.env.FORAGE_API_KEY;
const files = process.argv.slice(2);
if (!url || !key || !files.length) {
  console.error('Set FORAGE_API_URL and FORAGE_API_KEY, and name at least one URL list (see the top of this file).');
  process.exit(1);
}

/** One dry run. POST, form-encoded: the key stays out of the URL. */
async function preview(recipeUrl) {
  const res = await fetch(url, {
    method: 'POST',
    body: new URLSearchParams({ action: 'importRecipe', key, payload: JSON.stringify({ url: recipeUrl, dry_run: true }) }),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, error: `HTTP ${res.status}, not JSON. Is FORAGE_API_URL the web-app URL?` };
  }
}

let ok = 0;
let total = 0;
const failed = [];
for (const file of files) {
  const urls = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'));
  console.log(`\n# ${file}`);
  for (const u of urls) {
    total++;
    const body = await preview(u);
    if (!body.success) {
      failed.push(u);
      console.log(`FAIL ${u}\n     ${body.code ?? 'error'}: ${body.error}`);
      continue;
    }
    const p = body.data;
    const sections = [...new Set(p.steps.map((s) => s.section).filter(Boolean))];
    const complete = p.recipe.name && p.recipe.servings && p.lines.length && p.steps.length;
    if (complete) ok++;
    else failed.push(u);
    console.log(`${complete ? 'OK  ' : 'PART'} ${u}`);
    console.log(
      `     ${p.recipe.name || '(no name)'} · serves ${p.recipe.servings ?? '?'} · ${p.lines.length} lines · ` +
        `${p.steps.length} steps${sections.length ? ' · sections: ' + sections.join(' | ') : ''}` +
        (p.needs.length ? ` · needs ${p.needs.join(', ')}` : ''),
    );
  }
}
console.log(`\n${ok} of ${total} complete.`);
if (failed.length) {
  console.log('Import these from the open page (the bookmarklet) or a saved page instead:');
  for (const u of failed) console.log(`  ${u}`);
}
