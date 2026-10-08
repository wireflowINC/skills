#!/usr/bin/env node
// Replace the GitHub owner placeholder in every text file, once the org is decided.
// Usage: node scripts/set-owner.mjs <github-owner>     e.g. node scripts/set-owner.mjs wireflowINC
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);
const TOKEN = ['{{', 'OWNER', '}}'].join('');
const owner = process.argv[2];
if (!owner || !/^[A-Za-z0-9-]{1,39}$/.test(owner)) {
  console.error('Give a GitHub owner, e.g. node scripts/set-owner.mjs wireflowINC');
  process.exit(1);
}
const textExt = new Set(['.md', '.json', '.mjs', '.js', '.txt', '.yml', '.yaml']);
let changed = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'wireflow-outputs'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (p === SELF || !textExt.has(path.extname(p))) continue;
    const t = fs.readFileSync(p, 'utf8');
    if (t.includes(TOKEN)) {
      fs.writeFileSync(p, t.split(TOKEN).join(owner));
      changed++;
      console.log(`updated ${path.relative(ROOT, p)}`);
    }
  }
}
walk(ROOT);
console.log(`${changed} file(s) now use owner "${owner}".`);
