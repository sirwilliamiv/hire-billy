#!/usr/bin/env node
/* Builds ui/summon.html (the in-chat summon card) from ui/summon.tpl.html by
   inlining the artwork that already ships in the desktop overlay. The overlay
   is the single source of truth for the sprites and the embedded fonts, so a
   redrawn, the new art only has to be pasted there; run `npm run build:summon` after.

   The card must be self-contained (hosts render it in a sandboxed iframe with
   no network), which is why everything arrives as a data: URI. Only the parts
   the card actually animates are pulled across: the walk puppet, the seated
   pose and the mouth frames. The pose sheet and the pre-rendered walk frames
   (620 KB together) stay behind in the overlay. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const overlay = readFileSync(join(ROOT, 'overlay', 'overlay.html'), 'utf8');
const tpl = readFileSync(join(ROOT, 'ui', 'summon.tpl.html'), 'utf8');

const fail = m => { console.error('build-summon: ' + m); process.exit(1); };

/* <img id="skSit" ... src="data:image/webp;base64,..."> */
function sprite(id) {
  const tag = overlay.match(new RegExp('<img[^>]*id="' + id + '"[^>]*>'));
  if (!tag) fail('sprite ' + id + ' not found in overlay/overlay.html');
  const src = tag[0].match(/src="(data:image\/[^"]+)"/);
  if (!src) fail('sprite ' + id + ' has no data: src');
  return src[1];
}

/* var MOUTHS = ["data:…", …]; */
function jsArray(name) {
  const m = overlay.match(new RegExp('var ' + name + '\\s*=\\s*(\\[[\\s\\S]*?\\]);'));
  if (!m) fail('array ' + name + ' not found in overlay/overlay.html');
  const a = JSON.parse(m[1]);
  if (!a.length) fail('array ' + name + ' is empty');
  return a;
}

const fonts = overlay.match(/@font-face\{[^}]*\}/g) || [];
if (fonts.length < 2) fail('expected the two embedded @font-face rules');

const fill = {
  FONTS: fonts.join('\n'),
  SPR_BODY: sprite('pBody'),
  SPR_LEGB: sprite('pLegB'),
  SPR_LEGF: sprite('pLegF'),
  SPR_SIT: sprite('skSit'),
  SPR_STAND: sprite('skStand'),
  MOUTHS: JSON.stringify(jsArray('MOUTHS')),
};

let out = tpl;
for (const [k, v] of Object.entries(fill)) {
  const token = '{{' + k + '}}';
  if (!out.includes(token)) fail('template has no ' + token);
  out = out.split(token).join(v);
}
const left = out.match(/\{\{[A-Z_]+\}\}/);
if (left) fail('template placeholder left unfilled: ' + left[0]);

const dest = join(ROOT, 'ui', 'summon.html');
writeFileSync(dest, out);
console.log('ui/summon.html  ' + (out.length / 1024).toFixed(0) + ' KB  (' +
  fonts.length + ' fonts, 5 sprites, ' + jsArray('MOUTHS').length + ' mouth frames)');
