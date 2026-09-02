#!/usr/bin/env node
/* ============================================================================
   tools/build-doc-standalone.mjs — produit une version autonome de doc.html.

       node tools/build-doc-standalone.mjs [sortie.html]

   Tout est incorpore : les feuilles de style, la police, et les modules de
   dessin concatenes en un seul script. Le fichier obtenu s'ouvre n'importe ou,
   sans serveur et sans reseau. Utile pour lire la documentation sur un autre
   appareil, ou pour l'archiver.
   ========================================================================== */
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = (...p) => join(ROOT, 'public', ...p);
const OUT = process.argv[2] || join(ROOT, 'doc-autonome.html');

const read = (p) => readFile(p, 'utf8');
const b64 = async (p) => (await readFile(p)).toString('base64');

/* --- la police, en data-URL --- */
const fontFace = async () => {
  const reg = await b64(P('fonts', 'mono-regular.woff'));
  const bold = await b64(P('fonts', 'mono-bold.woff'));
  return `@font-face{font-family:"PilulierMono";src:url(data:font/woff;base64,${reg}) format("woff");font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:"PilulierMono";src:url(data:font/woff;base64,${bold}) format("woff");font-weight:700;font-style:normal;font-display:swap}`;
};

/* --- les modules de dessin, concatenes dans l'ordre des dependances --- */
const flatten = async (files) => {
  const parts = [];
  for (const f of files) {
    const src = await read(P('js', f));
    parts.push(`/* ---- ${f} ---- */\n` + src
      .replace(/^import[\s\S]*?;$/gm, '')
      .replace(/^export \{[^}]*\}( from '[^']*')?;$/gm, '')
      .replace(/^export /gm, ''));
  }
  return parts.join('\n');
};

let html = await read(P('doc.html'));
const theme = (await read(P('css', 'theme.css')))
  .replace(/@font-face\s*\{[\s\S]*?\}\s*/g, '');        /* remplacee par la version incorporee */
const doc = await read(P('css', 'doc.css'));
const js = await flatten(['draw.js', 'icons.js', 'illus.js', 'app-version.js']);

html = html
  .replace(/<link rel="icon"[^>]*>\s*/g, '')
  .replace(/<link rel="stylesheet"[^>]*>\s*/g, '')
  .replace('</head>', `<style>\n${await fontFace()}\n${theme}\n${doc}\n</style>\n</head>`)
  .replace(/<script type="module">/, `<script type="module">\n${js}\n`)
  .replace(/^import[\s\S]*?from '\/js\/[^']*';$/gm, '')
  .replace(/<a href="\/(dessins|faces)\.html">([^<]*)<\/a>/g, '<code>/$1.html</code>');

await writeFile(OUT, html, 'utf8');
console.log(`ecrit  ${OUT}  (${Math.round(Buffer.byteLength(html) / 1024)} Ko)`);

/* --- variante « artefact » : contenu seul, sans squelette de document --- */
if (process.env.ARTIFACT) {
  const body = html
    .replace(/^[\s\S]*?<body>/, '')
    .replace(/<\/body>[\s\S]*$/, '');
  const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
  const titre = '<title>La planche du Pilulier</title>';
  await writeFile(process.env.ARTIFACT, `${titre}\n${style}\n${body}`, 'utf8');
  console.log('ecrit  ' + process.env.ARTIFACT + '  (variante artefact)');
}
