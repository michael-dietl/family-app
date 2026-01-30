#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const DIR = path.join(process.cwd(), 'src', 'i18n');
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.ts'));
for (const f of files) {
  const p = path.join(DIR, f);
  let txt = fs.readFileSync(p, 'utf8');
  const re = /\n\s*auto:\s*\{[\s\S]*?\n\s*\},/m;
  if (re.test(txt)) {
    fs.writeFileSync(p + '.bak-sanitize', txt, 'utf8');
    txt = txt.replace(re, '\n  auto: {},');
    fs.writeFileSync(p, txt, 'utf8');
    console.log('Sanitized', f);
  } else {
    console.log('No auto block found in', f);
  }
}
