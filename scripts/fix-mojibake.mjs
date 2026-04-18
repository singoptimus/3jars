/**
 * Fix double-encoded mojibake in HTML files.
 *
 * Walks the repo, finds HTML files whose bytes contain the well-known
 * "UTF-8 reinterpreted as Latin-1 then re-encoded as UTF-8" sequences
 * (e.g. an em-dash "—" ends up as the three-character sequence "â\x80\x94"
 * stored as six bytes c3 a2 c2 80 c2 94), and rewrites them in place.
 *
 * Only touches files that contain at least one known bad sequence, so it
 * is safe to run repeatedly. Does NOT attempt the "generic" mojibake
 * reversal (.encode('latin-1').decode('utf-8')) which would silently
 * break any valid non-ASCII content.
 */

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['.git', 'node_modules']);

// Ordered so multi-byte replacements happen before overlapping prefixes
// would cause mis-matches. Each entry: bad bytes (as a binary string) → fixed bytes.
const FIXES = [
  // Double-encoded common punctuation (c3 a2 c2 80 c2 XX family)
  [Buffer.from([0xc3, 0xa2, 0xc2, 0x80, 0xc2, 0x94]), Buffer.from([0xe2, 0x80, 0x94])], // —
  [Buffer.from([0xc3, 0xa2, 0xc2, 0x80, 0xc2, 0x93]), Buffer.from([0xe2, 0x80, 0x93])], // –
  [Buffer.from([0xc3, 0xa2, 0xc2, 0x80, 0xc2, 0x98]), Buffer.from([0xe2, 0x80, 0x98])], // '
  [Buffer.from([0xc3, 0xa2, 0xc2, 0x80, 0xc2, 0x99]), Buffer.from([0xe2, 0x80, 0x99])], // '
  [Buffer.from([0xc3, 0xa2, 0xc2, 0x80, 0xc2, 0x9c]), Buffer.from([0xe2, 0x80, 0x9c])], // "
  [Buffer.from([0xc3, 0xa2, 0xc2, 0x80, 0xc2, 0x9d]), Buffer.from([0xe2, 0x80, 0x9d])], // "
  [Buffer.from([0xc3, 0xa2, 0xc2, 0x80, 0xc2, 0xa6]), Buffer.from([0xe2, 0x80, 0xa6])], // …
  // Arrows
  [Buffer.from([0xc3, 0xa2, 0xc2, 0x86, 0xc2, 0x92]), Buffer.from([0xe2, 0x86, 0x92])], // →
  [Buffer.from([0xc3, 0xa2, 0xc2, 0x86, 0xc2, 0x90]), Buffer.from([0xe2, 0x86, 0x90])], // ←
  // Symbols
  [Buffer.from([0xc3, 0xa2, 0xc2, 0x9c, 0xc2, 0x85]), Buffer.from([0xe2, 0x9c, 0x85])], // ✅
  [Buffer.from([0xc3, 0xa2, 0xc2, 0x9d, 0xc2, 0x8c]), Buffer.from([0xe2, 0x9d, 0x8c])], // ❌
  // Latin-1 range double-encodings (c3 82 c2 XX family)
  [Buffer.from([0xc3, 0x82, 0xc2, 0xb7]), Buffer.from([0xc2, 0xb7])],   // · middle dot
  [Buffer.from([0xc3, 0x82, 0xc2, 0xa0]), Buffer.from([0xc2, 0xa0])],   // nbsp
  [Buffer.from([0xc3, 0x82, 0xc2, 0xa9]), Buffer.from([0xc2, 0xa9])],   // ©
  [Buffer.from([0xc3, 0x82, 0xc2, 0xae]), Buffer.from([0xc2, 0xae])],   // ®
];

function fixBuffer(buf) {
  let out = buf;
  let replacements = 0;
  for (const [bad, good] of FIXES) {
    while (true) {
      const idx = out.indexOf(bad);
      if (idx < 0) break;
      out = Buffer.concat([out.subarray(0, idx), good, out.subarray(idx + bad.length)]);
      replacements++;
    }
  }
  return { out, replacements };
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(join(dir, entry.name));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      yield join(dir, entry.name);
    }
  }
}

async function main() {
  let totalFiles = 0;
  let touched = 0;
  let totalReplacements = 0;
  for await (const path of walk(ROOT)) {
    totalFiles++;
    const buf = await readFile(path);
    const { out, replacements } = fixBuffer(buf);
    if (replacements > 0) {
      await writeFile(path, out);
      touched++;
      totalReplacements += replacements;
      console.log(`  ${replacements.toString().padStart(3)} fix${replacements === 1 ? '' : 'es'}: ${relative(ROOT, path)}`);
    }
  }
  console.log(`\nScanned ${totalFiles} HTML files, touched ${touched}, ${totalReplacements} sequence${totalReplacements === 1 ? '' : 's'} fixed.`);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
