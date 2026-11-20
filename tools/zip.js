// Minimal ZIP reader (stored + deflate entries) on Node's zlib. Enough for PGN archives;
// no ZIP64, no encryption. Returns [{ name, data: Buffer }].
const zlib = require("node:zlib");

function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a ZIP file (no end-of-central-directory record).");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = [];
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Bad central directory entry.");
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    if (!name.endsWith("/")) {
      if (method === 0) files.push({ name, data: Buffer.from(raw) });
      else if (method === 8) files.push({ name, data: zlib.inflateRawSync(raw) });
      else throw new Error("Unsupported ZIP compression method " + method + " in " + name);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

module.exports = { unzip };
