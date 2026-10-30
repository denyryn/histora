#!/usr/bin/env node
// Builds both browser targets and packages release artifacts plus checksums.
// Plain Node ESM, no dependencies. Run via `npm run release`.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(root, 'dist', 'release');

const fail = (msg) => {
  console.error(`release: ${msg}`);
  process.exit(1);
};

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const human = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

// --- 1. Version must match in one place: package.json and src/manifest.json ---
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(root, 'src', 'manifest.json'), 'utf8'));
if (pkg.version !== manifest.version) {
  fail(`Version drift: package.json says ${pkg.version}, src/manifest.json says ${manifest.version}. Bump both to the same value.`);
}
console.log(`release: building version ${pkg.version}`);

// --- 2. Build both targets via the project's own npm scripts ---
for (const target of ['chrome', 'firefox']) {
  const r = spawnSync('npm', ['run', `build:${target}`], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) fail(`build:${target} exited with status ${r.status}`);
}

// --- 3. Package dist/<browser>/ into an archive with the manifest at its root ---
for (const dir of ['dist/chrome', 'dist/firefox']) {
  if (!existsSync(path.join(root, dir))) fail(`${dir} is missing after the build — refusing to package.`);
}

let haveZip = spawnSync('zip', ['-v'], { stdio: 'ignore' }).status === 0;

/** Fallback zip writer (store-free, deflateRaw). Used only when the zip CLI is absent. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function makeZip(files) {
  const chunks = [], central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const comp = zlib.deflateRawSync(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, comp);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(crc32(data), 16);
    cen.writeUInt32LE(comp.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cd, end]);
}
function collectFiles(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory()
      ? collectFiles(p, prefix + e.name + '/')
      : [{ name: prefix + e.name, data: readFileSync(p) }];
  });
}
function zipFallback(srcDir, outFile) {
  const files = collectFiles(srcDir).sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(outFile, makeZip(files));
}

mkdirSync(releaseDir, { recursive: true });
const artifacts = [
  { src: 'dist/chrome', out: `histora-${pkg.version}-chrome.zip` },
  { src: 'dist/firefox', out: `histora-${pkg.version}-firefox.xpi` },
];

for (const { src, out } of artifacts) {
  const outFile = path.join(releaseDir, out);
  rmSync(outFile, { force: true });
  if (haveZip) {
    const r = spawnSync('zip', ['-r', '-X', outFile, '.'], { cwd: path.join(root, src), stdio: 'pipe' });
    if (r.status !== 0) fail(`zip failed for ${out}: ${r.stderr?.toString()}`);
  } else {
    console.log('release: `zip` CLI not found, falling back to the built-in zip writer');
    try {
      zipFallback(path.join(root, src), outFile);
    } catch (e) {
      fail(`built-in zip writer failed for ${out}: ${e.message}`);
    }
  }
  const size = statSync(outFile).size;
  const hash = sha256(outFile);
  console.log(`release: ${outFile}`);
  console.log(`  size:    ${size} bytes (${human(size)})`);
  console.log(`  sha256:  ${hash}`);
}

// --- 4. SHA256SUMS (bare names, so the file travels with the artifacts) ---
const sums = artifacts
  .map(({ out }) => `${sha256(path.join(releaseDir, out))}  ${out}`)
  .join('\n');
writeFileSync(path.join(releaseDir, 'SHA256SUMS'), sums + '\n');
console.log(`release: ${path.join(releaseDir, 'SHA256SUMS')}`);
