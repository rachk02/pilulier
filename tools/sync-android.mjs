#!/usr/bin/env node
/* ============================================================================
   tools/sync-android.mjs — recopie `public/` dans les assets de l'APK.

       node tools/sync-android.mjs

   Il n'y a qu'une seule application : celle de `public/`. L'APK n'en est
   qu'une coque. Ce script est donc la seule chose qui relie les deux, et il
   doit tourner avant chaque compilation — le `build.gradle` l'appelle tout
   seul, mais on peut le lancer a la main pour verifier.

   Ce qui n'est PAS copie : le service worker (inutile dans l'APK, les
   fichiers sont deja dans le telephone), le manifeste web, et les planches
   de travail (dessins, sorties, style, marques, schema) qui n'ont rien a
   faire dans le telephone du patient.
   ========================================================================== */
import { readdir, mkdir, copyFile, rm, stat, writeFile, readFile } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'public');
const DST = join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'web');

/* Les planches servent au developpement, pas au patient. */
const ECARTES = new Set([
  'sw.js', 'manifest.webmanifest',
  'dessins.html', 'faces.html', 'sorties.html', 'style.html',
  'marques.html', 'schema.html', 'graphiques.html',
]);

async function lister(dir, base = dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    const rel = relative(base, p);
    if (ECARTES.has(rel)) continue;
    if (e.isDirectory()) out.push(...await lister(p, base));
    else out.push(rel);
  }
  return out;
}

const fichiers = await lister(SRC);
await rm(DST, { recursive: true, force: true });

let octets = 0;
for (const f of fichiers) {
  const de = join(SRC, f), vers = join(DST, f);
  await mkdir(dirname(vers), { recursive: true });
  await copyFile(de, vers);
  octets += (await stat(de)).size;
}

/* ==========================================================================
   L'ADRESSE DU RELAIS

   Elle n'est PAS dans le depot : `public/js/relais.js` y reste vide, et
   `check.mjs` echoue si quelqu'un l'y ecrit — Git n'oublie rien. Elle est
   posee ici, au moment de fabriquer les assets, depuis :

       android/relais.properties     (ignore par Git)  relais=https://…
       ou la variable PILULIER_RELAIS

   A dire clairement : cela evite de taper l'adresse sur chaque telephone et
   la garde hors de l'historique. Cela ne la rend pas secrete — une APK est
   une archive, `unzip` puis `grep` la retrouvent. Ce qui protege les
   donnees, c'est le chiffrement fait avant l'envoi.
   ========================================================================== */
async function adresseDuRelais() {
  if (process.env.PILULIER_RELAIS) return process.env.PILULIER_RELAIS.trim();
  try {
    const txt = await readFile(join(ROOT, 'android', 'relais.properties'), 'utf8');
    const m = txt.match(/^\s*relais\s*=\s*(.+)$/m);
    if (m) return m[1].trim();
  } catch { /* pas de fichier : c'est le cas normal */ }
  return '';
}

const relais = await adresseDuRelais();
if (relais) {
  /* On ecrit la MEME normalisation que l'application : un domaine seul
     devient une adresse complete, sans quoi `fetch` la prendrait pour un
     chemin relatif. */
  let url = relais;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const u = new URL(url);
  if (u.pathname === '/' || u.pathname === '') u.pathname = '/api/sync';
  u.search = ''; u.hash = '';
  url = u.href.replace(/\/+$/, '');

  await writeFile(join(DST, 'js', 'relais.js'),
    "/* Pose par tools/sync-android.mjs a la compilation. Ne pas editer :\n" +
    "   ce fichier est refait a chaque build. La source du reglage est\n" +
    "   android/relais.properties, ignore par Git. */\n" +
    `export const RELAIS_COMPILE = ${JSON.stringify(url)};\n`);
  console.log(`relais pose dans l'APK : ${url}`);
} else {
  console.log("aucun relais pose (android/relais.properties absent) — " +
              "il se saisira dans les reglages, ou arrivera par le QR d'appairage");
}

/* Une note dans les assets : si quelqu'un ouvre l'APK et se demande d'ou
   vient ce dossier, la reponse est ecrite dedans. */
await writeFile(join(DST, 'PROVENANCE.txt'),
  "Ce dossier est une copie de public/, faite par tools/sync-android.mjs.\n" +
  "Ne l'edite pas : toute modification serait effacee a la compilation\n" +
  "suivante. La source est public/.\n");

console.log(`${fichiers.length} fichiers copies vers android/…/assets/web ` +
            `(${(octets / 1024).toFixed(0)} Ko)`);
