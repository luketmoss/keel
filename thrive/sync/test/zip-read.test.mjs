// #510 — the zip reader: lists and inflates entries without extracting, and
// refuses what it cannot read.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listZip, readEntry, ZipError } from '../src/zip-read.mjs';
import { tempDir, writeZip, zipBytes } from './zip-fixture.mjs';

const BIG = Buffer.alloc(5000, 'abc');

test('lists stored and deflated entries and reads each back', () => {
  const dir = tempDir();
  const path = writeZip(dir, 'a.zip', [
    { name: 'one.fit', data: BIG, method: 8 },
    { name: 'two.fit', data: Buffer.from('plain'), method: 0 },
    { name: 'folder/', data: Buffer.alloc(0), method: 0 },
  ]);
  const { entries } = listZip(path);
  assert.deepEqual(entries.map((e) => e.name), ['one.fit', 'two.fit']); // a folder entry is not a file
  assert.ok(readEntry(path, entries[0]).equals(BIG));
  assert.equal(readEntry(path, entries[1]).toString(), 'plain');
});

test('refuses a file that is not a zip', () => {
  const dir = tempDir();
  const path = join(dir, 'x.zip');
  writeFileSync(path, Buffer.from('this is not a zip file at all, it is just text'));
  assert.throws(() => listZip(path), ZipError);
});

test('a corrupt entry throws a ZipError without quoting its content', () => {
  const dir = tempDir();
  const bytes = zipBytes([{ name: 'one.fit', data: BIG, method: 8 }]);
  bytes[30 + 'one.fit'.length + 2] ^= 0xff; // damage the deflate stream
  const path = join(dir, 'bad.zip');
  writeFileSync(path, bytes);
  const [entry] = listZip(path).entries;
  assert.throws(() => readEntry(path, entry), (err) => err instanceof ZipError && !/abc/.test(err.message));
});

test('an entry using an unsupported method is refused by name of the method only', () => {
  const dir = tempDir();
  const path = writeZip(dir, 'a.zip', [{ name: 'one.fit', data: Buffer.from('x'), method: 0 }]);
  const [entry] = listZip(path).entries;
  assert.throws(() => readEntry(path, { ...entry, method: 14 }), /unsupported compression method 14/);
});
