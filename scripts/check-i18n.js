#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const I18N_DIR = path.resolve(process.cwd(), 'src', 'i18n');
// Only check actual locale files
const LOCALES = ['de','en','it','fr','bar'];
const files = LOCALES.map(l => l + '.ts').filter(f => fs.existsSync(path.join(I18N_DIR, f)));

function parseAutoBlock(content) {
  const m = /\bauto\s*:\s*{([\s\S]*?)\n\s*}/m.exec(content);
  if (!m) return {};
  const inner = m[1];
  const lines = inner.split(/,\n/);
  const map = {};
  for (const line of lines) {
    const mm = /"([^\"]+)"\s*:\s*(?:"([\s\S]*?)"|''|``|\'\')/.exec(line);
    if (mm) map[mm[1]] = mm[2] ?? '';
  }
  return map;
}

const localeMaps = {};
for (const f of files) {
  const locale = path.basename(f, '.ts');
  const txt = fs.readFileSync(path.join(I18N_DIR, f), 'utf8');
  localeMaps[locale] = parseAutoBlock(txt);
}

const allKeys = new Set(Object.values(localeMaps).flatMap(m => Object.keys(m)));

const missingReport = {};
for (const key of allKeys) {
  const missing = [];
  for (const [locale, map] of Object.entries(localeMaps)) {
    if (!Object.prototype.hasOwnProperty.call(map, key) || map[key] === '') missing.push(locale);
  }
  if (missing.length) missingReport[key] = missing;
}

if (Object.keys(missingReport).length === 0) {
  console.log('All keys present and non-empty in all locales.');
  process.exit(0);
}

console.log('Missing or empty translations detected:');
for (const [k, locales] of Object.entries(missingReport)) {
  console.log(`- ${k}: missing in [${locales.join(', ')}]`);
}

// write report
fs.writeFileSync(path.resolve(process.cwd(), 'i18n_missing_report.json'), JSON.stringify(missingReport, null, 2));
console.log('\nWrote i18n_missing_report.json');
