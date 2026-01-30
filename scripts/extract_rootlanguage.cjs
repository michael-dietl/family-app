const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const I18N_DE = path.join(SRC, 'i18n', 'de.ts');
const OUT = path.join(ROOT, 'rootlanguage.txt');

function walk(dir, filelist = []) {
  const files = fs.readdirSync(dir);
  files.forEach(f => {
    const p = path.join(dir, f);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      walk(p, filelist);
    } else if (stat.isFile()) {
      if (/\.(vue|ts|js|jsx|tsx)$/.test(p)) filelist.push(p);
    }
  });
  return filelist;
}

function collectKeys(files) {
  const keySet = new Set();
  const re = /(?:\$t|\b t)\(\s*['"`]([^'"`]+?)['"`]\s*\)/g;
  const reAlt = /(?:\$t|\bt)\(\s*['"`]([^'"`]+?)['"`]\s*\)/g;
  files.forEach(file => {
    let txt = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = reAlt.exec(txt)) !== null) {
      keySet.add(m[1]);
    }
  });
  return Array.from(keySet).sort();
}

function parseDeFile(filepath) {
  if (!fs.existsSync(filepath)) {
    console.error('de.ts not found at', filepath);
    return {};
  }
  const src = fs.readFileSync(filepath, 'utf8');
  const idx = src.indexOf('export default');
  if (idx === -1) {
    console.error('Could not find "export default" in de.ts');
    return {};
  }
  let objText = src.slice(idx + 'export default'.length).trim();
  // strip leading =
  if (objText.startsWith('=')) objText = objText.slice(1).trim();
  // remove trailing semicolon if present
  if (objText.endsWith(';')) objText = objText.slice(0, -1);
  // Ensure we have an object literal
  if (!objText.startsWith('{')) {
    // try to find first '{'
    const first = objText.indexOf('{');
    if (first >= 0) objText = objText.slice(first);
  }
  // Evaluate in a sandbox
  try {
    const sandbox = {};
    const script = 'result = ' + objText;
    vm.createContext(sandbox);
    vm.runInContext(script, sandbox, { timeout: 2000 });
    return sandbox.result || {};
  } catch (e) {
    console.error('Failed to parse de.ts via vm:', e.message);
    return {};
  }
}

function lookup(obj, key) {
  const parts = key.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur && Object.prototype.hasOwnProperty.call(cur, p)) cur = cur[p];
    else return undefined;
  }
  return cur;
}

(function main(){
  console.log('Scanning source files for $t/t usages...');
  const files = walk(SRC);
  const keys = collectKeys(files);
  console.log('Found', keys.length, 'unique keys.');

  console.log('Parsing', I18N_DE);
  const deObj = parseDeFile(I18N_DE);
  const lines = [];
  for (const k of keys) {
    const v = lookup(deObj, k);
    if (v === undefined) {
      lines.push(k + ' = <MISSING>');
    } else if (typeof v === 'string') {
      // single-line escape
      const safe = v.replace(/\r?\n/g, '\\n');
      lines.push(k + ' = ' + safe);
    } else {
      // non-string (object/array/function)
      try {
        lines.push(k + ' = ' + JSON.stringify(v));
      } catch (e) {
        lines.push(k + ' = <UNSERIALIZABLE>');
      }
    }
  }
  fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
  console.log('Wrote', OUT);
})();
