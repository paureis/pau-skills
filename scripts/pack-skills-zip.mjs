// The zip writer of scripts/pack-skills.mjs: CRC-32, MS-DOS times and buildZip, with no clock and no time zone, so the
// same files and time always give the same bytes.
import zlib from 'node:zlib';

// CRC-32 (the zip polynomial). zlib.crc32 exists only from Node 20.15 and 22.2, and this repository supports Node 20+.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32Table(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const crc32 = typeof zlib.crc32 === 'function' ? (buf) => zlib.crc32(buf) >>> 0 : crc32Table;

// MS-DOS date and time, from UTC so the bytes do not depend on the time zone. Zip times start in 1980.
function dosTime(seconds) {
  const d = new Date(Math.max(seconds, 315532800) * 1000);
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1),
    date: ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

/**
 * A zip of `files` ([{ path, mode, data }], paths relative to the zip root, mode as a Unix file mode) with a folder
 * entry for every folder, sorted by path, every entry stamped with `seconds` (Unix time).
 */
export function buildZip(files, seconds) {
  const { time, date } = dosTime(seconds);
  const folders = new Set();
  for (const f of files) {
    const parts = f.path.split('/');
    for (let i = 1; i < parts.length; i++) folders.add(`${parts.slice(0, i).join('/')}/`);
  }
  const entries = [
    ...[...folders].map((path) => ({ path, mode: 0o040755, data: Buffer.alloc(0), folder: true })),
    ...files.map((f) => ({ ...f, folder: false })),
  ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.path, 'utf8');
    const flags = /[^\x00-\x7f]/.test(e.path) ? 0x0800 : 0; // bit 11: the name is UTF-8
    const deflated = e.folder ? e.data : zlib.deflateRawSync(e.data, { level: 9 });
    const method = !e.folder && deflated.length < e.data.length ? 8 : 0;
    const body = method === 8 ? deflated : e.data;
    const crc = crc32(e.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed: 2.0
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 30, 4); // made by Unix (3), so readers take the mode from the external attributes
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    // extra length, comment length, disk number, internal attributes: all 0 (bytes 30 to 37)
    central.writeUInt32LE(((e.mode << 16) | (e.folder ? 0x10 : 0)) >>> 0, 38); // Unix mode, plus the DOS folder bit
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
