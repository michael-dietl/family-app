#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC = path.resolve(__dirname, '../src');
const EXTRACTED = path.resolve(__dirname, '../i18n_extracted.json');

if (!fs.existsSync(EXTRACTED)) {
  console.error('i18n_extracted.json not found. Run extract script first.');
  process.exit(1);
}

const map = JSON.parse(fs.readFileSync(EXTRACTED, 'utf8'));
// invert to original -> key
const inv = {};
for (const k of Object.keys(map)) inv[map[k]] = k;

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files = files.concat(walk(p));
    else if (/\.(vue)$/.test(e.name)) files.push(p);
  }
  return files;
}

function escapeForRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const files = walk(SRC);
let replaced = 0;
for (const f of files) {
  let txt = fs.readFileSync(f, 'utf8');
  const tplMatch = /<template([\s\S]*?)>([\s\S]*?)<\/template>/m.exec(txt);
  if (!tplMatch) continue;
  const tpl = tplMatch[2];
  let newTpl = tpl;

  // iterate over inv entries and replace text nodes
  for (const [orig, key] of Object.entries(inv)) {
    const trimmed = orig.trim();
    if (!trimmed) continue;
    // match as text node between tags: >...<, allow whitespace around
    const re = new RegExp('>(\\s*)' + escapeForRegex(trimmed) + '(\\s*)<', 'g');
    if (re.test(newTpl)) {
      newTpl = newTpl.replace(re, `>$1{{ $t('auto.${key}') }}$2<`);
    }
  }

  if (newTpl !== tpl) {
    const newTxt = txt.slice(0, tplMatch.index) + tplMatch[0].replace(tpl, newTpl) + txt.slice(tplMatch.index + tplMatch[0].length);
    fs.writeFileSync(f, newTxt, 'utf8');
    replaced++;
    console.log('Patched', f);
  }
}

console.log('Templates patched:', replaced);
