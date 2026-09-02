#!/usr/bin/env node
/* ============================================================================
   tools/render-icons.mjs — fabrique les icones de l'application a partir du
   MEME code que celui qui dessine a l'ecran.

   Il n'y a donc pas deux verites : `illus.js` est la seule source. Ce script
   ecrit les SVG, puis les convertit en PNG si un navigateur est disponible.

     node tools/render-icons.mjs

   Sans navigateur, les SVG sont quand meme ecrits et le script explique
   comment terminer. Aucune dependance obligatoire.
   ========================================================================== */
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { logoMark } from '../public/js/illus.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'icons');

const PAPER = '#cdc499';
const INK = '#1e1c14';

/* Les tailles reclamees par le manifeste, plus les usages annexes. */
const TARGETS = [
  { file: 'icon-192.png', size: 192, pad: 0.14, bg: PAPER },
  { file: 'icon-512.png', size: 512, pad: 0.14, bg: PAPER },
  { file: 'maskable-512.png', size: 512, pad: 0.26, bg: PAPER },   /* marge de securite Android */
  { file: 'apple-touch-icon.png', size: 180, pad: 0.14, bg: PAPER },
  { file: 'badge-72.png', size: 72, pad: 0.06, bg: null, ink: '#ffffff', frame: false },
];

/** Enveloppe le dessin dans un SVG autonome, prêt a rasteriser. */
function page(t) {
  const inner = 100;
  const scale = 1 - t.pad * 2;
  const off = (inner * t.pad).toFixed(2);
  const mark = logoMark({ size: inner, frame: t.frame !== false, w: 5 });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${t.size}" height="${t.size}"
    viewBox="0 0 ${inner} ${inner}">
    ${t.bg ? `<rect width="${inner}" height="${inner}" fill="${t.bg}"/>` : ''}
    <g transform="translate(${off} ${off}) scale(${scale.toFixed(3)})"
       color="${t.ink || INK}">${mark}</g></svg>`;
}

await mkdir(OUT, { recursive: true });
const svgs = [];
for (const t of TARGETS) {
  const svg = page(t);
  const name = t.file.replace(/\.png$/, '.svg');
  await writeFile(join(OUT, name), svg, 'utf8');
  svgs.push({ ...t, svg, name });
  console.log('svg  ', name);
}

/* --------------------------------------------------- rasterisation */
let chromium = null;
try { ({ chromium } = await import('playwright')); }
catch { try { ({ chromium } = await import('playwright-core')); } catch { /* absent */ } }

if (!chromium) {
  console.log('\nAucun navigateur pilotable trouve : les PNG n\'ont pas ete regeneres.');
  console.log('Pour les produire :  npm i -D playwright && npx playwright install chromium');
  console.log('puis relancer ce script. Les SVG ci-dessus sont deja a jour.');
  process.exit(0);
}

const launch = process.env.CHROME_PATH
  ? { executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] }
  : { args: ['--no-sandbox'] };
const browser = await chromium.launch(launch);
for (const t of svgs) {
  const pg = await browser.newPage({
    viewport: { width: t.size, height: t.size },
    deviceScaleFactor: 1,
  });
  await pg.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>${t.svg}`,
    { waitUntil: 'load' });
  await pg.screenshot({ path: join(OUT, t.file), omitBackground: !t.bg });
  await pg.close();
  console.log('png  ', t.file);
}
await browser.close();
console.log('\nTermine. Les icones viennent du meme code que l\'application.');
