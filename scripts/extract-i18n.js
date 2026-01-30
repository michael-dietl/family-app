#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC = path.resolve(__dirname, '../src');
const I18N_DIR = path.resolve(__dirname, '../src/i18n');
const LOCALES = ['de','en','it','fr','bar'];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files = files.concat(walk(p));
    else if (/\.(vue|ts|js)$/.test(e.name)) files.push(p);
  }
  return files;
}

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function extractStringsFromFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  const results = new Set();

  // Extract template text nodes: > ... < (ignore tags and moustache)
  const re = />\s*([^<>{}][^<>{}]*?)\s*</g;
  let m;
  while ((m = re.exec(content))) {
    const s = m[1].trim();
    if (!s) continue;
    if (s.length < 2) continue;
    // ignore interpolation-only
    if (/^{{.*}}$/.test(s)) continue;
    // ignore numbers only
    if (/^[0-9\s:.-]+$/.test(s)) continue;
    results.add(s);
  }

  // Also capture simple assignment strings in script: e.g. title: 'Einstellungen'
  const re2 = /[:=]\s*['`"]([^'"`\n]{2,200})['`"]\s*[,;\)]/g;
  while ((m = re2.exec(content))) {
    const s = m[1].trim();
    if (!s) continue;
    if (s.length < 2) continue;
    if (/^[0-9\s:.-]+$/.test(s)) continue;
    results.add(s);
  }

  return Array.from(results);
}

function mergeIntoLocale(localeFile, entries, locale) {
  let txt = fs.readFileSync(localeFile, 'utf8');

  // find final closing '};' of default export
  const idx = txt.lastIndexOf('};');
  if (idx === -1) {
    console.error('Unexpected locale file format:', localeFile);
    return;
  }

  const before = txt.slice(0, idx);
  const after = txt.slice(idx);

  // build auto block
  const autoEntries = Object.entries(entries).map(([k,v]) => {
    const val = locale === 'de' ? v : (v || '');
    return `    "${k}": ${JSON.stringify(val)}`;
  }).join(',\n');

  const autoBlock = `,\n  auto: {\n${autoEntries}\n  }`;

  // if file already contains 'auto:' replace merging
  if (/\bauto\s*:\s*{/.test(txt)) {
    // naive: insert only missing keys inside the auto object
    const autoStart = txt.indexOf('auto:');
    const braceStart = txt.indexOf('{', autoStart);
    const braceEnd = txt.indexOf('}', braceStart);
    const inner = txt.slice(braceStart+1, braceEnd).trim();
    const existingKeys = new Set();
    (inner.split(/,\s*/)).forEach(line => {
      const m = /"([^"]+)"\s*:\s*/.exec(line);
      if (m) existingKeys.add(m[1]);
    });
    const missing = Object.entries(entries).filter(([k]) => !existingKeys.has(k));
    if (missing.length === 0) return; // nothing to do
    const toAdd = missing.map(([k,v]) => `    "${k}": ${JSON.stringify(locale === 'de' ? v : (v||''))}`).join(',\n');
    // insert before braceEnd
    const newTxt = txt.slice(0, braceEnd) + (inner.trim() ? ',\n' : '') + toAdd + txt.slice(braceEnd);
    fs.writeFileSync(localeFile, newTxt, 'utf8');
    return;
  }

  const newTxt = before + autoBlock + after;
  fs.writeFileSync(localeFile, newTxt, 'utf8');
}

function main() {
  const files = walk(SRC);
  const map = {};
  for (const f of files) {
    const strs = extractStringsFromFile(f);
    for (const s of strs) {
      const key = slug(s);
      if (!map[key]) map[key] = s;
    }
  }

  const entries = map;

  for (const loc of LOCALES) {
    const lf = path.join(I18N_DIR, loc + '.ts');
    if (!fs.existsSync(lf)) {
      console.warn('Locale file missing:', lf);
      continue;
    }
    mergeIntoLocale(lf, entries, loc);
    console.log('Updated', lf);
  }

  // write extracted JSON for review
  fs.writeFileSync(path.resolve(__dirname, '../i18n_extracted.json'), JSON.stringify(entries, null, 2), 'utf8');
  console.log('Extraction complete. keys:', Object.keys(entries).length);
}

main();
