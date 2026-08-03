#!/usr/bin/env node
/* corpus.json is the single source of truth. This regenerates the CORPUS
   block inside ui/hire-billy.html so the page and the servers never drift. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI = join(HERE, '..', 'ui', 'hire-billy.html');
const corpus = JSON.parse(readFileSync(join(HERE, '..', 'corpus.json'), 'utf8'));

const forUi = {
  meta: corpus.meta,
  sections: corpus.sections.map(s => ({ ...s, body: '<p>' + s.body + '</p>' })),
};

const BEGIN = '/* CORPUS:BEGIN generated from corpus.json, edit there then npm run sync */';
const END = '/* CORPUS:END */';
let html = readFileSync(UI, 'utf8');
const a = html.indexOf(BEGIN), b = html.indexOf(END);
if (a < 0 || b < 0) { console.error('corpus markers not found in ui/hire-billy.html'); process.exit(1); }
html = html.slice(0, a + BEGIN.length) + '\nconst CORPUS=' + JSON.stringify(forUi) + ';\n' + html.slice(b);
writeFileSync(UI, html);
console.log('ui/hire-billy.html corpus block regenerated from corpus.json');
