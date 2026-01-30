#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const EX = path.join(ROOT, 'i18n_extracted.json');
if (!fs.existsSync(EX)) {
  console.error('i18n_extracted.json not found. Run extract-i18n first.');
  process.exit(1);
}

const map = JSON.parse(fs.readFileSync(EX, 'utf8'));
const inv = Object.fromEntries(Object.entries(map).map(([k,v]) => [v,k]));

function walk(dir) {
  const res = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) res.push(...walk(p));
    else if (/\.vue$/.test(e.name)) res.push(p);
  }
  return res;
}

const files = walk(SRC);
const untranslated = {};

for (const [orig, key] of Object.entries(inv)) {
  const esc = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reOrig = new RegExp(esc, 'm');
  const reKey = new RegExp(`\\$t\\(['\"]auto\\.${key}['\"]\\)`);
  let foundRaw = false;
  let foundKey = false;
  const locations = [];
  for (const f of files) {
    const txt = fs.readFileSync(f, 'utf8');
    if (reKey.test(txt)) foundKey = true;
    if (reOrig.test(txt)) {
      foundRaw = true;
      locations.push(f);
    }
  }
  if (foundRaw && !foundKey) untranslated[orig] = locations;
}

const out = path.join(ROOT, 'i18n_untranslated_report.json');
fs.writeFileSync(out, JSON.stringify(untranslated, null, 2));
console.log('Untranslated strings written to', out, 'count:', Object.keys(untranslated).length);
