#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const EX = path.join(ROOT, 'i18n_extracted.json');
const REPORT = path.join(ROOT, 'i18n_untranslated_report.json');
const SRC = path.join(ROOT, 'src');

if (!fs.existsSync(EX)) {
  console.error('Missing i18n_extracted.json — run extract-i18n.js first');
  process.exit(1);
}
if (!fs.existsSync(REPORT)) {
  console.error('Missing i18n_untranslated_report.json — edit/create it first');
  process.exit(1);
}

const mapping = JSON.parse(fs.readFileSync(EX, 'utf8'));
const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));

function escapeRegExp(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

let patchedFiles = new Set();
let totalReplacements = 0;

for (const [raw, files] of Object.entries(report)) {
  const key = mapping[raw];
  if (!key) {
    console.warn('No mapping key for:', raw);
    continue;
  }
  const replacement = `{{ $t('auto.${key}') }}`;
  const re = new RegExp(escapeRegExp(raw), 'g');
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    let txt = fs.readFileSync(f, 'utf8');
    const tmplMatch = txt.match(/<template[\s\S]*?<\/template>/m);
    if (!tmplMatch) continue;
    const tmpl = tmplMatch[0];
    const newTmpl = tmpl.replace(re, replacement);
    if (newTmpl !== tmpl) {
      // backup
      const bak = f + '.bak-i18n';
      if (!fs.existsSync(bak)) fs.writeFileSync(bak, txt, 'utf8');
      // replace in file
      txt = txt.replace(tmpl, newTmpl);
      fs.writeFileSync(f, txt, 'utf8');
      patchedFiles.add(f);
      const count = (tmpl.match(re) || []).length;
      totalReplacements += count;
      console.log(`Patched ${f} (replacements: ${count})`);
    }
  }
}

console.log('Files patched:', patchedFiles.size, 'Total replacements:', totalReplacements);
if (patchedFiles.size === 0) console.log('No template replacements made.');
