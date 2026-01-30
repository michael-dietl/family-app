const fs = require('fs');
const path = require('path');

const i18nDir = path.join(__dirname, '..', 'src', 'i18n');
const outFile = path.join(process.cwd(), 'i18n_german_report.json');

const germanKeywords = [
  'Einstellungen','Sprache','Galerie','Foto','Fotos','Speichern','Abbrechen','Ja','Nein',
  'Fehler','Version','Letzte','Gallerie','Bild','Speichern','einstellungen','sprache','gallerie',
  'foto','fotos','speichern','abbrechen','fehler','letzte','version','möchtest','löschen'
];

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const matches = [];
  germanKeywords.forEach(k => {
    const regex = new RegExp('\\\b' + k.replace(/[-\\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b', 'i');
    lines.forEach((line, idx) => {
      if (regex.test(line)) {
        matches.push({ keyword: k, lineNumber: idx + 1, line: line.trim() });
      }
    });
  });
  return { matches, count: matches.length };
}

function main(){
  const files = fs.readdirSync(i18nDir).filter(f => f.endsWith('.ts'));
  const report = {};
  files.forEach(f => {
    if (f === 'de.ts') return; // skip German
    const p = path.join(i18nDir, f);
    try{
      const result = scanFile(p);
      report[f] = result;
    } catch (e) {
      report[f] = { error: String(e) };
    }
  });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');
  const summary = Object.entries(report).map(([file, r]) => ({ file, count: r.count || 0 }));
  console.log('Audit complete. Report written to', outFile);
  console.log('Summary:', JSON.stringify(summary, null, 2));
}

main();
