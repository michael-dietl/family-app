#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const EX = path.join(ROOT, 'i18n_extracted.json');
const REPORT = path.join(ROOT, 'i18n_untranslated_report.json');
const I18N_DIR = path.join(ROOT, 'src', 'i18n');

if (!fs.existsSync(EX) || !fs.existsSync(REPORT)) {
  console.error('Required files missing: i18n_extracted.json and/or i18n_untranslated_report.json');
  process.exit(1);
}

const mapping = JSON.parse(fs.readFileSync(EX, 'utf8'));
const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));

function normalizeKey(s) {
  // produce a readable, unique-ish key from German text
  let k = s.toLowerCase();
  k = k.replace(/\$\{[^}]*\}/g, '');
  k = k.replace(/[^a-z0-9]+/g, '_');
  k = k.replace(/^_+|_+$/g, '');
  if (!k) k = 'key';
  return k.slice(0, 60);
}

const existingKeys = new Set(Object.values(mapping));
let added = 0;

for (const raw of Object.keys(report)) {
  if (mapping[raw]) continue;
  let base = normalizeKey(raw || 'empty');
  let key = base;
  let i = 1;
  while (existingKeys.has(key)) {
    key = `${base}_${i++}`;
  }
  mapping[raw] = key;
  existingKeys.add(key);
  added++;
}

if (added === 0) {
  console.log('No new keys to add.');
  process.exit(0);
}

// write back mapping
fs.writeFileSync(EX, JSON.stringify(mapping, null, 2));
console.log('Added keys:', added);

// Update locale files: insert under auto: { ... }
const locales = fs.readdirSync(I18N_DIR).filter(f => f.endsWith('.ts'));
for (const loc of locales) {
  const p = path.join(I18N_DIR, loc);
  let txt = fs.readFileSync(p, 'utf8');
  const autoStart = txt.indexOf('\n  auto: {');
  if (autoStart === -1) {
    console.warn('auto block not found in', loc);
    continue;
  }
  const after = txt.indexOf('\n  },', autoStart);
  if (after === -1) {
    console.warn('auto block end not found in', loc);
    continue;
  }
  const insertPos = after; // before the closing '  },'
  const lines = [];
  for (const [raw, key] of Object.entries(mapping)) {
    // only add if key not already present in file
    const keyPattern = new RegExp(`\"${key}\"\s*:\s*`);
    if (keyPattern.test(txt)) continue;
    // German locale gets raw as value; others copy German raw as placeholder
    const isGerman = /de\.ts$/.test(loc);
    const value = raw.replace(/\n/g, '\\n').replace(/\"/g, '\\"');
    const line = `    \"${key}\": \"${value}\",\n`;
    lines.push(line);
  }
  if (lines.length === 0) continue;
  const newTxt = txt.slice(0, insertPos) + lines.join('') + txt.slice(insertPos);
  fs.writeFileSync(p + '.bak-i18n', txt, 'utf8');
  fs.writeFileSync(p, newTxt, 'utf8');
  console.log('Updated locale file:', loc, 'added keys:', lines.length);
}
