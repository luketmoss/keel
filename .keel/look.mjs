#!/usr/bin/env node
// Browser checks where the desktop app's preview pane is missing (cloud Claude
// Code sessions). Starts a web project through its .claude/launch.json entry,
// as stack-web requires, and drives it with the container's Playwright and
// Chromium. Screenshots are files the agent opens with Read.
//
//   node .keel/look.mjs <launch-config> [path] [--width 375] [--theme light|dark]
//                       [--wait ms] [--env KEY=VALUE]... [--out shot.png]
//     e.g. node .keel/look.mjs cairn / --env VITE_FAKE_DRIVE=1
//     Prints the screenshot path and any console errors.
//
//   import { open } from '<repo>/.keel/look.mjs';
//   const { page, errors, close } = await open({ config: 'cairn', env: { VITE_FAKE_DRIVE: '1' } });
//     Read state out of the DOM and dispatch events, per stack-web's
//     "Verifying a browser UI"; page.screenshot once the DOM says it settled.
//
// The dev server is started on first use (npm ci too, if needed) and left
// running for the next call. --env only applies when it starts, so stop it to
// change them: pkill -f vite

import { execSync, spawn } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function launchConfig(name) {
  const { configurations } = JSON.parse(readFileSync(join(root, '.claude', 'launch.json'), 'utf8'));
  const config = configurations.find((c) => c.name === name);
  if (!config) {
    throw new Error(`No "${name}" in .claude/launch.json. Have: ${configurations.map((c) => c.name).join(', ')}`);
  }
  return config;
}

// A dev server answers on its port whatever project it belongs to, so match the
// <title> of the project's index.html to tell ours from another repo's.
async function serving(url, title) {
  try {
    const res = await fetch(url);
    return res.ok && (!title || (await res.text()).includes(title));
  } catch {
    return false;
  }
}

async function ensureServer(name, config, env) {
  const project = join(root, config.cwd ?? name);
  const url = `http://localhost:${config.port}/`;
  const title = readFileSync(join(project, 'index.html'), 'utf8').match(/<title>([^<]*)<\/title>/)?.[1];
  if (await serving(url, title)) return url;
  if (await serving(url)) {
    throw new Error(`Port ${config.port} is serving something other than ${name}. Stop it (pkill -f vite) and retry.`);
  }
  if (!existsSync(join(project, 'node_modules'))) {
    execSync('npm ci --no-audit --no-fund', { cwd: project, stdio: 'inherit' });
  }
  spawn(config.runtimeExecutable, config.runtimeArgs ?? [], {
    cwd: root, detached: true, stdio: 'ignore', env: { ...process.env, ...env },
  }).unref();
  for (let i = 0; i < 60; i++) {
    if (await serving(url, title)) return url;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${name} did not come up on :${config.port}.`);
}

// Cloud containers send HTTPS through a proxy that re-signs it with its own CA.
// curl and Node trust that CA; Playwright's Chromium does not, so every
// external script (Maps, Google sign-in) fails with ERR_CERT_AUTHORITY_INVALID.
// Trust exactly that CA's key, which is what adding it to the store would do.
// Checking stays on.
function proxyTrust() {
  const ca = '/root/.ccr/agent-proxy-ca.crt';
  if (!existsSync(ca)) return [];
  const spki = new X509Certificate(readFileSync(ca)).publicKey.export({ type: 'spki', format: 'der' });
  return [`--ignore-certificate-errors-spki-list=${createHash('sha256').update(spki).digest('base64')}`];
}

// Not a project dependency: cloud containers install it globally.
async function playwright() {
  try {
    return await import('playwright');
  } catch {
    const npmRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return createRequire(join(npmRoot, 'noop.js'))('playwright');
  }
}

export async function open({ config: name, path = '/', width = 375, height = 812, theme = 'light', env = {} }) {
  const url = await ensureServer(name, launchConfig(name), env);
  const { chromium } = await playwright();
  const browser = await chromium.launch({ args: proxyTrust() });
  const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(new URL(path.replace(/^\//, ''), url).href, { waitUntil: 'networkidle' });
  return { page, errors, close: () => browser.close() };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? fallback : argv[i + 1];
  };
  const positional = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
  const [name, path = '/'] = positional;
  if (!name) {
    console.error('Usage: look.mjs <launch-config> [path] [--width 375] [--theme light|dark] [--wait ms] [--env KEY=VALUE]... [--out shot.png]');
    process.exit(1);
  }
  const env = Object.fromEntries(argv
    .filter((a, i) => argv[i - 1] === '--env')
    .map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)]));
  const width = Number(flag('width', 375));
  const theme = flag('theme', 'light');
  const out = resolve(flag('out', `look-${name}-${width}-${theme}.png`));

  const { page, errors, close } = await open({ config: name, path, width, theme, env });
  await page.waitForTimeout(Number(flag('wait', 0)));
  await page.screenshot({ path: out, fullPage: true });
  await close();
  console.log(out);
  if (errors.length) console.log(`Console errors:\n${errors.map((e) => `  ${e}`).join('\n')}`);
}
