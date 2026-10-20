// A read-only zip reader for the Garmin export's FIT archives (#510), on
// node:zlib alone: the sync takes no dependency it can avoid.
//
// It lists a zip's entries from the central directory and inflates one at a
// time, so a 55 MB zip is never held whole in memory and nothing is written to
// disk. Stored (0) and deflated (8) entries only; zip64 is refused with a
// message, since the export's zips are well under 4 GB.

import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

export class ZipError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ZipError';
  }
}

function readAt(fd, position, length) {
  const buf = Buffer.alloc(length);
  let done = 0;
  while (done < length) {
    const n = readSync(fd, buf, done, length - done, position + done);
    if (n === 0) throw new ZipError('the zip ends early');
    done += n;
  }
  return buf;
}

/**
 * @param {string} path
 * @returns {{ path: string, entries: { name: string, size: number, method: number, offset: number, compressedSize: number }[] }}
 */
export function listZip(path) {
  const fd = openSync(path, 'r');
  try {
    const total = fstatSync(fd).size;
    const tailLength = Math.min(total, 22 + 0xffff);
    const tail = readAt(fd, total - tailLength, tailLength);
    let at = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === EOCD_SIG) { at = i; break; }
    }
    if (at === -1) throw new ZipError('not a zip: no end-of-directory record');
    const count = tail.readUInt16LE(at + 10);
    const size = tail.readUInt32LE(at + 12);
    const offset = tail.readUInt32LE(at + 16);
    if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) throw new ZipError('zip64 archives are not supported');

    const dir = readAt(fd, offset, size);
    const entries = [];
    let p = 0;
    for (let i = 0; i < count; i++) {
      if (p + 46 > dir.length || dir.readUInt32LE(p) !== CEN_SIG) throw new ZipError('the zip directory is damaged');
      const nameLength = dir.readUInt16LE(p + 28);
      const extraLength = dir.readUInt16LE(p + 30);
      const commentLength = dir.readUInt16LE(p + 32);
      const flags = dir.readUInt16LE(p + 8);
      const entry = {
        name: dir.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nameLength),
        method: dir.readUInt16LE(p + 10),
        compressedSize: dir.readUInt32LE(p + 20),
        size: dir.readUInt32LE(p + 24),
        offset: dir.readUInt32LE(p + 42),
      };
      if (entry.compressedSize === 0xffffffff || entry.size === 0xffffffff) throw new ZipError('zip64 archives are not supported');
      if (!entry.name.endsWith('/')) entries.push(entry);
      p += 46 + nameLength + extraLength + commentLength;
    }
    return { path, entries };
  } finally {
    closeSync(fd);
  }
}

/** One entry's bytes. Throws ZipError for a damaged entry or an unsupported method. */
export function readEntry(path, entry) {
  const fd = openSync(path, 'r');
  try {
    const head = readAt(fd, entry.offset, 30);
    if (head.readUInt32LE(0) !== LOC_SIG) throw new ZipError('an entry header is damaged');
    const dataAt = entry.offset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
    const raw = readAt(fd, dataAt, entry.compressedSize);
    let bytes;
    if (entry.method === 0) bytes = raw;
    else if (entry.method === 8) {
      try {
        bytes = inflateRawSync(raw);
      } catch {
        throw new ZipError('an entry could not be inflated');
      }
    } else throw new ZipError(`an entry uses unsupported compression method ${entry.method}`);
    if (bytes.length !== entry.size) throw new ZipError('an entry is not the size the directory says');
    return bytes;
  } finally {
    closeSync(fd);
  }
}
