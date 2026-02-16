#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const I18N_DIR = path.resolve(process.cwd(), 'src', 'i18n');
// Only check actual locale files
const LOCALES = ['de','en','it','fr','bar'];
const files = LOCALES.map(l => l + '.ts').filter(f => fs.existsSync(path.join(I18N_DIR, f)));

const unwrapExpression = (node) => {
  let current = node;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current)) {
    current = current.expression;
  }
  return current;
};

const getPropertyName = (name) => {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name)) {
    const expression = unwrapExpression(name.expression);
    if (ts.isStringLiteral(expression) || ts.isNumericLiteral(expression)) {
      return expression.text;
    }
  }
  return undefined;
};

const extractValueString = (node) => {
  const valueNode = unwrapExpression(node);
  if (ts.isStringLiteral(valueNode) || ts.isNoSubstitutionTemplateLiteral(valueNode)) {
    return valueNode.text;
  }
  if (ts.isTemplateExpression(valueNode)) {
    let text = valueNode.head.text;
    valueNode.templateSpans.forEach(span => {
      const expression = span.expression.getText().trim();
      text += '${' + expression + '}' + span.literal.text;
    });
    return text;
  }
  return '';
};

const findAutoObject = (node) => {
  if (!ts.isObjectLiteralExpression(node)) return undefined;
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const keyName = getPropertyName(property.name);
    if (keyName !== 'auto') continue;
    const initializer = unwrapExpression(property.initializer);
    if (ts.isObjectLiteralExpression(initializer)) {
      return initializer;
    }
  }
  return undefined;
};

const parseAutoBlock = (content) => {
  const sourceFile = ts.createSourceFile('locale.ts', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let exportExpression = undefined;
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isExportAssignment(node)) {
      exportExpression = node.expression;
    }
  });
  if (!exportExpression) return {};
  const exported = unwrapExpression(exportExpression);
  const autoObject = findAutoObject(exported);
  if (!autoObject) return {};
  const map = {};
  for (const property of autoObject.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const keyName = getPropertyName(property.name);
    if (!keyName) continue;
    const value = extractValueString(property.initializer).trim();
    map[keyName] = value;
  }
  return map;
};

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
