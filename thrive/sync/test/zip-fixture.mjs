// A minimal zip writer for the #510 tests: stored and deflated entries, no
// zip64. Written to a temp file so the reader is tested on real bytes.

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';

/** @param {{ name: string, data: Buffer, method?: 0 | 8 }[]} files @returns {Buffer} */
export function zipBytes(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const { name, data, method = 8 } of files) {
    const nameBuf = Buffer.from(name);
    const body = method === 8 ? deflateRawSync(data) : data;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(method, 10);
    cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, body);
    central.push(cen, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

/** A new empty temp folder. */
export const tempDir = () => mkdtempSync(join(tmpdir(), 'thrive-zip-'));

/** Writes a zip into `dir` and returns its path. */
export function writeZip(dir, file, files) {
  const path = join(dir, file);
  writeFileSync(path, zipBytes(files));
  return path;
}
