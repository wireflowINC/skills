#!/usr/bin/env node
// Lint for this skills repo. Node 18+, no dependencies.
// Usage: node scripts/lint-skills.mjs            (development: {{OWNER}} tokens allowed)
//        node scripts/lint-skills.mjs --release  (before a push: no {{OWNER}} tokens left)
// Checks: skill name rules, description length, SKILL.md length, Wireflow link tags,
// banned Wireflow paths, secrets and pipe-to-shell installs, sibling similarity,
// skill.json, README H1, file types and sizes, image dimensions.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE = process.argv.includes('--release');
const ROOT_SLUG = 'wireflow-skills';
const MAX_DESC = 1024;
const MAX_SKILL_LINES = 500;
const MAX_SIMILARITY = 0.5;
const SHINGLE = 3;
const MAX_IMAGE_EDGE = 1280;
const MAX_TEXT_BYTES = 256 * 1024;
const BANNED_PATHS = ['/templates', '/community', '/workflows'];
// Functional endpoints and media hosts that are not marketing links.
const LINK_EXEMPT = [/^https:\/\/www\.wireflow\.ai\/api\/mcp\/?$/, /^https?:\/\/cdn\.wireflow\.ai\//];

const errors = [];
const warnings = [];
const err = (file, msg) => errors.push(`${path.relative(ROOT, file) || file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${path.relative(ROOT, file) || file}: ${msg}`);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'wireflow-outputs'].includes(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// Minimal YAML frontmatter reader for the flat shape these skills use.
function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: null, body: text };
  const data = {};
  let parent = null;
  for (const raw of m[1].split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const nested = raw.match(/^\s+([A-Za-z0-9_-]+):\s*(.*)$/);
    const top = raw.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    const val = (v) => v.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    if (top) {
      parent = top[2] === '' ? top[1] : null;
      data[top[1]] = top[2] === '' ? {} : val(top[2]);
    } else if (nested && parent) {
      data[parent][nested[1]] = val(nested[2]);
    }
  }
  return { data, body: text.slice(m[0].length) };
}

function shingles(text) {
  const words = text.toLowerCase().replace(/`[^`]*`/g, ' ').replace(/https?:\/\/\S+/g, ' ').match(/[a-z0-9']+/g) || [];
  const set = new Set();
  for (let i = 0; i + SHINGLE <= words.length; i++) set.add(words.slice(i, i + SHINGLE).join(' '));
  return set;
}
function jaccard(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}

function slugForFile(file) {
  const rel = path.relative(ROOT, file).split(path.sep);
  return rel[0] === 'skills' && rel.length > 2 ? rel[1] : ROOT_SLUG;
}

const files = walk(ROOT);
const textExt = new Set(['.md', '.json', '.mjs', '.js', '.txt', '.yml', '.yaml', '']);
const imageExt = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

// 1. Every file: allowed type, size, links, secrets, tokens.
for (const file of files) {
  const base = path.basename(file);
  const ext = path.extname(file).toLowerCase();
  const stat = fs.statSync(file);
  if (['.DS_Store', 'Thumbs.db', 'desktop.ini'].includes(base) || file.includes('__MACOSX')) err(file, 'system file must not be committed');
  if (imageExt.has(ext)) {
    const size = imageSize(file);
    if (size && file.includes(`${path.sep}examples${path.sep}`) && Math.max(size.w, size.h) > MAX_IMAGE_EDGE) err(file, `example image is ${size.w}x${size.h}, max edge ${MAX_IMAGE_EDGE}px`);
    if (stat.size > 5 * 1024 * 1024) err(file, 'image over 5 MiB');
    continue;
  }
  if (!textExt.has(ext) && base !== 'LICENSE' && base !== '.gitignore') { err(file, `file type ${ext || base} is not text or a web image`); continue; }
  if (stat.size > MAX_TEXT_BYTES) err(file, `text file over 256 KiB (${stat.size} bytes)`);
  if (path.relative(ROOT, file).startsWith(`scripts${path.sep}`)) continue; // the linter itself names the patterns it bans
  const text = fs.readFileSync(file, 'utf8');
  const slug = slugForFile(file);

  for (const m of text.matchAll(/https?:\/\/(?:[a-z0-9-]+\.)*wireflow\.ai[^\s)"'`<>\]]*/gi)) {
    const url = m[0].replace(/[.,;:]+$/, '');
    if (LINK_EXEMPT.some((re) => re.test(url))) continue;
    let u;
    try { u = new URL(url); } catch { err(file, `unparseable link ${url}`); continue; }
    if (BANNED_PATHS.some((p) => u.pathname === p || u.pathname.startsWith(`${p}/`))) err(file, `banned Wireflow path ${u.pathname} in ${url}`);
    const want = { ref: `skill-${slug}`, utm_source: 'github', utm_medium: 'skill', utm_campaign: slug };
    for (const [k, v] of Object.entries(want)) {
      if (u.searchParams.get(k) !== v) err(file, `link missing ${k}=${v}: ${url}`);
    }
  }

  const secretPatterns = [
    [/\bsk-[A-Za-z0-9_-]{16,}/, 'looks like an API key (sk-...)'],
    [/\bwf_live_[A-Za-z0-9]{8,}/, 'looks like a Wireflow key'],
    [/Bearer\s+[A-Za-z0-9._-]{20,}/, 'bearer token'],
    [/WIREFLOW_API_KEY\s*=/, 'API key assignment (skills must use the MCP connector)'],
    [/\b(curl|wget)\b[^\n|]*\|\s*(ba|z)?sh\b/, 'pipe-to-shell install'],
    [/\b(iex|Invoke-Expression)\b/, 'PowerShell Invoke-Expression'],
  ];
  for (const [re, label] of secretPatterns) if (re.test(text)) err(file, label);

  if (RELEASE && text.includes('{{OWNER}}')) err(file, 'still contains {{OWNER}}; run scripts/set-owner.mjs <owner>');
}

// 2. Plugin files.
for (const rel of ['.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', '.mcp.json', 'README.md', 'LICENSE']) {
  if (!fs.existsSync(path.join(ROOT, rel))) err(path.join(ROOT, rel), 'missing');
}
try {
  const mcp = JSON.parse(fs.readFileSync(path.join(ROOT, '.mcp.json'), 'utf8'));
  const s = mcp.mcpServers?.wireflow;
  if (!s || s.type !== 'http' || s.url !== 'https://www.wireflow.ai/api/mcp') err(path.join(ROOT, '.mcp.json'), 'wireflow server must be type http at https://www.wireflow.ai/api/mcp');
} catch (e) { err(path.join(ROOT, '.mcp.json'), `invalid JSON: ${e.message}`); }
for (const rel of ['.claude-plugin/plugin.json', '.claude-plugin/marketplace.json']) {
  try { JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch (e) { err(path.join(ROOT, rel), `invalid JSON: ${e.message}`); }
}

// 3. Skills.
const skillsDir = path.join(ROOT, 'skills');
const skills = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const bodies = {};
const readmes = {};
for (const name of skills) {
  const dir = path.join(skillsDir, name);
  const skillFile = path.join(dir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) { err(dir, 'missing SKILL.md'); continue; }
  const text = fs.readFileSync(skillFile, 'utf8');
  const lines = text.split(/\r?\n/).length;
  if (lines >= MAX_SKILL_LINES) err(skillFile, `${lines} lines, must be under ${MAX_SKILL_LINES}`);
  const { data, body } = frontmatter(text);
  bodies[name] = body;
  if (!data) { err(skillFile, 'no YAML frontmatter'); continue; }
  const n = data.name || '';
  if (n !== name) err(skillFile, `name "${n}" must equal folder "${name}"`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(n) || n.length > 64) err(skillFile, 'name must be 1-64 chars of a-z, 0-9 and single hyphens');
  if (/claude|anthropic/.test(n)) err(skillFile, 'name must not contain claude or anthropic');
  const d = data.description || '';
  if (!d) err(skillFile, 'description missing');
  if (d.length > MAX_DESC) err(skillFile, `description is ${d.length} chars, max ${MAX_DESC}`);
  for (const word of ['Claude Code', 'Wireflow']) if (!d.includes(word)) warn(skillFile, `description does not mention "${word}"`);
  if (data.license !== 'MIT') err(skillFile, 'license must be MIT');
  if (data.compatibility && data.compatibility.length > 500) err(skillFile, 'compatibility over 500 chars');
  const allowed = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
  for (const k of Object.keys(data)) if (!allowed.has(k)) warn(skillFile, `frontmatter key "${k}" only works in Claude Code`);

  const cfgFile = path.join(dir, 'skill.json');
  if (!fs.existsSync(cfgFile)) err(dir, 'missing skill.json');
  else {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
      if (!cfg.appSlug || !cfg.workflowId) err(cfgFile, 'needs appSlug and workflowId');
      if (cfg.appSlug && !body.includes(cfg.appSlug)) err(skillFile, `body does not name the app slug ${cfg.appSlug}`);
      if (data.metadata?.['app-slug'] && data.metadata['app-slug'] !== cfg.appSlug) err(skillFile, 'metadata app-slug differs from skill.json');
    } catch (e) { err(cfgFile, `invalid JSON: ${e.message}`); }
  }

  const readme = path.join(dir, 'README.md');
  if (!fs.existsSync(readme)) err(dir, 'missing README.md');
  else {
    const r = fs.readFileSync(readme, 'utf8');
    readmes[name] = r;
    const h1 = (r.match(/^# (.+)$/m) || [])[1] || '';
    if (!/ for Claude Code$/.test(h1)) err(readme, `H1 should end with "for Claude Code" (got "${h1}")`);
    if (!/!\[[^\]]*\]\(examples\//.test(r)) err(readme, 'README must show a real example image from examples/');
    if ((r.replace(/```[\s\S]*?```/g, '').match(/\b\w+\b/g) || []).length < 40) err(readme, 'README under 40 words');
  }
  for (const sub of ['reference', 'examples']) {
    if (!fs.existsSync(path.join(dir, sub)) || fs.readdirSync(path.join(dir, sub)).length === 0) err(dir, `${sub}/ is empty`);
  }
}

// 4. Sibling similarity (SKILL.md bodies fail, READMEs warn).
const pairs = [];
for (let i = 0; i < skills.length; i++) {
  for (let j = i + 1; j < skills.length; j++) {
    const a = skills[i]; const b = skills[j];
    if (bodies[a] && bodies[b]) {
      const s = jaccard(shingles(bodies[a]), shingles(bodies[b]));
      pairs.push(`${a} vs ${b}: SKILL.md ${s.toFixed(3)}`);
      if (s > MAX_SIMILARITY) err(path.join(skillsDir, a, 'SKILL.md'), `body similarity with ${b} is ${s.toFixed(3)} (max ${MAX_SIMILARITY})`);
    }
    if (readmes[a] && readmes[b]) {
      const s = jaccard(shingles(readmes[a]), shingles(readmes[b]));
      pairs.push(`${a} vs ${b}: README ${s.toFixed(3)}`);
      if (s > MAX_SIMILARITY) warn(path.join(skillsDir, a, 'README.md'), `README similarity with ${b} is ${s.toFixed(3)}`);
    }
  }
}

console.log(`Skills: ${skills.join(', ')}`);
for (const p of pairs) console.log(`  similarity ${p}`);
for (const w of warnings) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(errors.length ? `\nLint failed: ${errors.length} error(s).` : `\nLint passed${warnings.length ? ` with ${warnings.length} warning(s)` : ''}.`);
process.exit(errors.length ? 1 : 0);
