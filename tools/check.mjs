#!/usr/bin/env node
/* ============================================================================
   tools/check.mjs — la verification qui ne demande rien.

       node tools/check.mjs

   Aucune dependance, aucun navigateur. Deux choses :
     1. chaque fichier JS est analyse syntaxiquement ;
     2. tout ce qui est pur (dessin, QR, code-barres, carnet, regles) est
        reellement execute et compare a un resultat attendu.

   Les parcours d'interface, eux, se testent avec tools/e2e.py.
   ========================================================================== */
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;

const ok = (nom, cond, detail = '') => {
  if (cond) { pass++; console.log('  ok   ' + nom); }
  else { fail++; console.log('  ECHEC ' + nom + (detail ? '  → ' + detail : '')); }
};
const eq = (nom, a, b) => ok(nom, a === b, `attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);

/** Liste tous les fichiers d'un dossier, quelle que soit leur extension. */
async function walkAll(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walkAll(p));
    else out.push(p);
  }
  return out;
}

/* ------------------------------------------------------- 1. syntaxe */
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
/* Les scripts de `tools/` tournent sous Node et utilisent import.meta :
   ils ne passent pas dans un contexte de script isole. */
const SOURCES = [join(ROOT, 'public', 'js'), join(ROOT, 'api')];
console.log('\nSYNTAXE');
for (const f of (await Promise.all(SOURCES.map(walk))).flat()) {
  const src = await readFile(f, 'utf8');
  const stripped = src
    .replace(/^import[\s\S]*?;$/gm, '')
    /* `export default {` deviendrait un BLOC en tete de ligne, et un
       catalogue de traduction y serait lu comme des etiquettes : on en fait
       une affectation pour que ca reste une expression. */
    .replace(/^export default /gm, 'const __defaut__ = ')
    .replace(/^export \{[^}]*\}( from '[^']*')?;$/gm, '')
    .replace(/^export /gm, '');
  try { new vm.Script(stripped); pass++; }
  catch (e) { fail++; console.log('  ECHEC ' + relative(ROOT, f) + ' → ' + e.message); }
}
console.log(`  ${pass} fichiers analyses sans erreur`);

/* ---------------------------------------------- 2. modules purs */
const load = (p) => import(pathToFileURL(join(ROOT, 'public/js', p)).href);
const draw = await load('draw.js');
const icons = await load('icons.js');
const illus = await load('illus.js');
const qr = await load('qr.js');
const box = await load('boxscan.js');
const bookM = await load('drugbook.js');
const safety = await load('safety.js');
const schema = await load('schema.js');

console.log('\nDESSIN');
ok('toutes les icones produisent un SVG',
  icons.ICON_NAMES.every((n) => {
    const s = icons.ico(n);
    return s.startsWith('<svg') && s.includes('</svg>') && s.length > 120;
  }));
console.log(`  (${icons.ICON_NAMES.length} icones, ${illus.SCENE_NAMES.length} scenes)`);
{
  /* Toute icone citee quelque part doit exister : c'est la panne la plus
     facile a introduire et la plus penible a voir passer. */
  const files = (await Promise.all(SOURCES.map(walk))).flat();
  const cites = new Set();
  for (const f of files) {
    const src = await readFile(f, 'utf8');
    for (const m of src.matchAll(/\bico(?:El)?\('([a-zA-Z]+)'/g)) cites.add(m[1]);
    for (const m of src.matchAll(/\bicon: '([a-zA-Z]+)'/g)) cites.add(m[1]);
  }
  const manquantes = [...cites].filter((n) => !icons.ICON_NAMES.includes(n));
  ok(`les ${cites.size} icones citees dans le code existent toutes`,
    manquantes.length === 0, 'manquantes : ' + manquantes.join(', '));
}
ok('le meme nom redonne le meme dessin', icons.ico('pill') === icons.ico('pill'));
ok('deux icones differentes different', icons.ico('pill') !== icons.ico('capsule'));
ok('aucune couleur en dur dans les icones',
  icons.ICON_NAMES.every((n) => !/#[0-9a-f]{3,6}/i.test(icons.ico(n))));
ok('la marque se dessine', illus.logoMark({ size: 100 }).startsWith('<svg'));
ok('toutes les scenes vides se dessinent',
  illus.SCENE_NAMES.every((n) => (illus.emptyIllus(n) || '').startsWith('<svg')));
ok('le trait tremble est deterministe',
  draw.sketch([[0, 0], [10, 10]], draw.dice(7)) === draw.sketch([[0, 0], [10, 10]], draw.dice(7)));

console.log('\nQR');
{
  const m = qr.encode('PILULIER', { ecl: 'M' });
  eq('version minimale pour un texte court', m.version, 1);
  eq('taille correspondante', m.size, 21);
  const long = qr.encode('X'.repeat(400), { ecl: 'M' });
  ok('un texte long tient dans une version superieure', long.version > 10);
  ok('le SVG est produit', qr.svg('test').startsWith('<svg'));
  let leve = false;
  try { qr.encode('X'.repeat(9000), { ecl: 'H' }); } catch { leve = true; }
  ok('un texte impossible est refuse proprement', leve);
}

console.log('\nCODE-BARRES');
{
  const GS = String.fromCharCode(0x1D);
  const r = box.readBarcode(']d2' + '01' + '03400930000120' + '17' + '271130' + '10' + 'L4521A', 'data_matrix');
  eq('GS1 : code produit', r.gtin, '03400930000120');
  eq('GS1 : peremption', r.expiry, '2027-11-30');
  eq('GS1 : lot', r.lot, 'L4521A');
  const r2 = box.readBarcode('01034009300001201727123110' + '1234AB', 'data_matrix');
  eq('lot commencant par un chiffre', r2.lot, '1234AB');
  const r3 = box.readBarcode('0103400930000120' + '17' + '271200', 'data_matrix');
  eq('jour 00 = fin du mois', r3.expiry, '2027-12-31');
  const r4 = box.readBarcode('10AB12' + GS + '0103400930000120' + '17' + '280131', 'data_matrix');
  eq('ordre inverse', r4.expiry, '2028-01-31');
  eq('EAN seul', box.readBarcode('3400930000120', 'ean_13').kind, 'ean');
  for (const [txt, attendu] of [['12/2027', '2027-12-31'], ['DEC 2027', '2027-12-31'],
    ['31/12/2027', '2027-12-31'], ['2027-12', '2027-12-31'], ['Exp.: 03/29', '2029-03-31']]) {
    eq(`date ecrite « ${txt} »`, box.parseExpiryText(txt), attendu);
  }
  eq('date illisible', box.parseExpiryText('bonjour'), null);
  eq('boite perimee', box.expiryStatus('2020-01-01').level, 'expired');
}

console.log('\nTEXTE LU SUR LA BOITE');
{
  const B = (t, h) => ({ text: t, box: { height: h } });
  const boites = [
    ['Clopi Denk (allemand)', [B('Denk', 14), B('Clopi Denk', 46), B('75 mg', 26),
      B('Clopidogrel', 18), B('30 Filmtabletten', 14), B('Exp.: 11/2027', 12),
      B('Ch.-B.: L4521A', 12)],
      { name: 'Clopi Denk', strength: '75 mg', expiry: '2027-11-30', lot: 'L4521A',
        form: 'comprime', packQty: 30 }],
    ['Aspirine (nom sur deux lignes)', [B('ASPIRINE', 44), B('CARDIO', 40), B('100 mg', 24),
      B('comprime gastro-resistant', 13), B('30 comprimes', 13), B('EXP 03/2028', 12),
      B('LOT 22B145', 12)],
      { name: 'ASPIRINE', strength: '100 mg', expiry: '2028-03-31', lot: '22B145' }],
    ['Lasilix (date a la ligne suivante)', [B('LASILIX', 46), B('40 mg', 26),
      B('Furosemide', 18), B('Boite de 30 comprimes', 13), B('A utiliser avant', 12),
      B('12/2026', 12), B('Lot: AX9931', 12)],
      { name: 'LASILIX', strength: '40 mg', expiry: '2026-12-31', lot: 'AX9931' }],
    ['Dapaglin (nombre et unite separes)', [B('DAPAGLIN', 44), B('10', 26), B('mg', 20),
      B('Dapagliflozine', 16), B('EXP', 12), B('2027-06', 12), B('B.No. DPG7742', 11)],
      { name: 'DAPAGLIN', strength: '10 mg', expiry: '2027-06-30', lot: 'DPG7742' }],
    ['fabrication + peremption', [B('NEBIMAC', 42), B('5 mg', 24), B('Nebivolol', 16),
      B('MFG 06/2024', 11), B('EXP 06/2027', 11)],
      { name: 'NEBIMAC', expiry: '2027-06-30' }],
    ['sans geometrie', ['COARTEM', '20/120 mg', 'Artemether Lumefantrine',
      '24 comprimes', 'EXP 09/2028', 'LOT BF2291'],
      { name: 'COARTEM', strength: '20/120 mg', expiry: '2028-09-30', packQty: 24 }],
    ['illisible', [B('...', 10), B('%%%', 9)], { name: null, strength: null, expiry: null }],
  ];
  for (const [nom, lignes, attendu] of boites) {
    const r = box.extractFromLines(lignes);
    const champs = Object.keys(attendu);
    const mauvais = champs.filter((c) => r[c] !== attendu[c]);
    ok(`boite : ${nom}`, mauvais.length === 0,
      mauvais.map((c) => `${c}=${JSON.stringify(r[c])} au lieu de ${JSON.stringify(attendu[c])}`).join(', '));
  }
  for (const [txt, att] of [['75 microgrammes', '75 µg'], ['100 µg/dose', '100 µg'],
    ['100 UI/ml', '100 UI'], ['500/62,5 mg', '500/62,5 mg'], ['1 g', '1 g']]) {
    eq(`dosage « ${txt} »`, box.extractFromLines(['NOM', txt]).strength, att);
  }

  /* Le code-barres est encode, le texte est devine : le premier gagne. */
  const f = box.mergeReadings({
    codes: [{ format: 'data_matrix',
      rawValue: '01' + '04012345678901' + '17' + '271130' + '10' + 'VRAI01' }],
    lines: [B('CLOPI DENK', 44), B('75 mg', 24), B('EXP 12/2030', 11), B('LOT FAUX99', 11)],
  });
  eq('fusion : la peremption vient du code-barres', f.expiry, '2027-11-30');
  eq('fusion : le lot vient du code-barres', f.lot, 'VRAI01');
  eq('fusion : le nom vient du texte', f.name, 'CLOPI DENK');
  ok('fusion : les deux sources sont citees',
    f.sources.includes('code-barres') && f.sources.includes('texte'));
  ok('le point d\'accroche OCR existe', typeof box.setOcrEngine === 'function');
}

console.log('\nCARNET ET REGLES');
{
  const attendus = [['clopi denk', 'Clopidogrel'], ['lasilix', 'Furosémide'],
    ['nebimac', 'Nébivolol'], ['dapaglin', 'Dapagliflozine'],
    ['aspirine cardio', 'Acide acétylsalicylique'], ['coartem', 'Artéméther + Luméfantrine']];
  for (const [saisie, dci] of attendus) {
    eq(`carnet : « ${saisie} »`, bookM.lookup(saisie)[0]?.entry.dci, dci);
  }
  eq('carnet : saisie trop courte', bookM.lookup('cl').length, 0);
  ok('chaque entree propose au moins un schema',
    bookM.BOOK.every((e) => bookM.plansOf(e).length >= 1));
  ok('les formes du carnet existent dans le catalogue',
    bookM.BOOK.every((e) => schema.FORMS.some((f) => f.id === e.form)));

  const fam = (dci) => safety.familyOf({ dci, name: '' })?.id;
  eq('regle : beta-bloquant', fam('Nébivolol'), 'betabloquant');
  eq('regle : IEC', fam('Captopril'), 'iec');
  eq('regle : diuretique', fam('Furosémide'), 'diuretique_anse');
  ok('le beta-bloquant ne s\'arrete jamais seul',
    safety.adviceFor({ dci: 'Nébivolol', name: '' }).neverStop === true);
  ok('un diuretique programme le soir declenche une alerte',
    safety.timingIssues({ name: 'Lasilix', dci: 'Furosémide', food_rule: 'any' },
      [{ t: '19:00', dose: 1 }]).length > 0);
  ok('les symptomes graves sont declares',
    safety.RED_FLAGS.length >= 3 && safety.RED_FLAGS.includes('gonflement_visage'));
}

console.log("\nL'EXEMPLE ET LA VIE PRIVEE");
{
  const schemaSrc = await readFile(join(ROOT, 'public/js/schema.js'), 'utf8');
  const storeSrc  = await readFile(join(ROOT, 'public/js/store.js'), 'utf8');

  /* L'application doit s'installer vide : aucune creation automatique. */
  ok('aucun profil n\'est cree au demarrage',
    !/if \(!db\.all\('profiles'\)\.length\)\s*(seed|charger)/.test(storeSrc));
  ok('l\'exemple ne se charge qu\'a la demande',
    /export function chargerExemple/.test(storeSrc));

  eq('l\'exemple compte quatre medicaments', schema.EXEMPLE.meds.length, 4);
  ok('chacun a au moins une heure',
    schema.EXEMPLE.meds.every((m) => m.times.length >= 1));
  ok('l\'exemple montre un demi-comprime',
    schema.EXEMPLE.meds.some((m) => m.times.some((t) => t.dose === 0.5)));
  ok('l\'exemple montre une cure qui se termine',
    schema.EXEMPLE.meds.some((m) => m.end_after_days > 0));
  ok('l\'exemple ne decrit aucune pathologie',
    !schema.EXEMPLE.profile.conditions);
  ok('l\'exemple ne nomme ni etablissement ni prescripteur reel',
    !/h[oô]pital|clinique|centre de sant/i.test(JSON.stringify(schema.EXEMPLE)));

  /*
   * LA GARDE DE VIE PRIVEE.
   * Le depot ne doit contenir aucune donnee reelle de personne : ni nom, ni
   * indicatif telephonique, ni etablissement, ni pathologie nommee. C'est une
   * regle qui se verifie, pas une intention.
   */
  /* Les noms de familles de molecules (« antiagrégant », « diurétique »)
     sont du savoir medical general : ils ont leur place dans safety.js. Ce
     qu'on traque ici, c'est ce qui designe QUELQU'UN — un nom, un numero, un
     lieu de soin — ou ce qui decrit l'etat de sante d'une personne. */
  const INTERDITS = [
    /\+\s?\d{2,3}[\s.-]?\d{2}[\s.-]?\d{2}/,          /* un numero avec indicatif */
    /\b0[1-9](?:[\s.-]?[1-9]\d){4}\b/,                /* un numero national plausible */
    /\bFofana\b/i, /\bMouni\b/i, /\bRachid\b/i, /\bKabor[eé]\b/i, /\bTanko\b/i,
    /\bOuagadougou\b/i, /\bBurkina\b/i, /\bSig-?Noghin\b/i,
    /\bH[oô]pital\s+\p{Lu}/u, /\bPaul\s?VI\b/i,
    /\bSuivi cardiologique\b/i,
  ];
  const aInspecter = (await walkAll(join(ROOT, 'public')))
    .filter((f) => !f.includes('/fonts/') && !/\.(png|ico|woff2?|jpg)$/.test(f))
    .concat(await walkAll(join(ROOT, 'android/app/src/main/java')))
    .concat([join(ROOT, 'README.md'), join(ROOT, 'CLAUDE.md'),
             join(ROOT, 'android/README.md')]);
  const fuites = [];
  for (const f of aInspecter) {
    let t;
    try { t = await readFile(f, 'utf8'); } catch { continue; }
    for (const rx of INTERDITS) {
      const m = t.match(rx);
      if (m) fuites.push(`${relative(ROOT, f)} : « ${m[0].slice(0, 28)} »`);
    }
  }
  ok('aucune donnee personnelle dans le depot', fuites.length === 0,
    [...new Set(fuites)].slice(0, 5).join(' | '));

  /* Les placeholders doivent rester des placeholders. */
  const vues = (await walkAll(join(ROOT, 'public/js')))
    .filter((f) => f.endsWith('.js'));
  const suspects = [];
  for (const f of vues) {
    const t = await readFile(f, 'utf8');
    for (const [, ph] of t.matchAll(/placeholder:\s*'([^']+)'/g)) {
      if (/\+\d|\b0[1-9](\s?\d{2}){4}\b/.test(ph)) suspects.push(relative(ROOT, f) + ' : ' + ph);
    }
  }
  ok('aucun numero de telephone en exemple', suspects.length === 0, suspects.join(' | '));
}

/* ==========================================================================
   LA REGLE DU THEME
   `app.css` ne doit contenir aucune valeur brute : tout vient de theme.css.
   C'est cette regle qui permet de rehabiller l'application sans la refaire —
   elle merite donc d'etre gardee par un test, pas par la bonne volonte.
   ========================================================================== */
console.log('\nLA REGLE DU THEME');
{
  const appCss = await readFile(join(ROOT, 'public/css/app.css'), 'utf8');
  const theme  = await readFile(join(ROOT, 'public/css/theme.css'), 'utf8');

  /* Le bloc @media print decrit du papier blanc : ses valeurs ne dependent
     d'aucun theme, elles sont donc legitimement ecrites en clair. */
  const ecran = appCss.replace(/@media print \{[\s\S]*?\n\}/g, '');
  ok('app.css ne contient aucune couleur en dur (hors impression)',
    !/:\s*#[0-9a-fA-F]{3,8}\b/.test(ecran));
  ok('app.css ne force plus aucune capitale',
    !/text-transform:\s*uppercase/.test(appCss));
  ok('app.css n\'a plus d\'interlettrage en dur',
    !/letter-spacing:\s*\.\d+em/.test(appCss));
  ok('la casse des micro-libelles est une variable',
    /--tt-label:\s*uppercase/.test(theme));
  ok('theme.css porte bien les etats poses sur l\'encre',
    /--ok-on-ink/.test(theme) && /--bad-on-ink/.test(theme));

  /*
   * Et l'autre moitie de la regle, celle qui manquait : une variable citee
   * doit EXISTER. `var(--ok-500)` ne provoque aucune erreur — la declaration
   * est simplement ignoree, la couleur ne s'applique pas, et personne ne le
   * voit avant de regarder un ecran de pres. Trois jauges sont restees sans
   * couleur pour cette raison.
   */
  const definies = new Set([...theme.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  /* Posee a l'execution sur l'element lui-meme : elle n'a pas sa place dans le theme. */
  definies.add('--pillcolor');
  const citees = new Map();
  for (const f of [join(ROOT, 'public/css/app.css'),
                   ...(await walk(join(ROOT, 'public/js')))]) {
    if (!/\.(css|js)$/.test(f)) continue;
    for (const m of (await readFile(f, 'utf8')).matchAll(/var\((--[\w-]+)/g)) {
      if (!definies.has(m[1])) citees.set(m[1], relative(ROOT, f));
    }
  }
  ok('toute variable citee est definie dans theme.css', citees.size === 0,
    [...citees].map(([v, f]) => `${v} (${f})`).slice(0, 4).join(', '));

  /* Aucun emoji nulle part. Ils ne se rendent pas pareil d'un telephone a
     l'autre, un lecteur d'ecran ne les lit pas, et ils sont etrangers au
     registre de la planche : les statuts s'ecrivent [x] [!] [-] [ ]. */
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
  const sources = (await walk(join(ROOT, 'public')))
    .concat(await walk(join(ROOT, 'api')));
  const salis = [];
  for (const f of sources) {
    if (EMOJI.test(await readFile(f, 'utf8'))) salis.push(relative(ROOT, f));
  }
  ok('aucun emoji dans le code', salis.length === 0, salis.join(', '));

  /* Deux registres de marques : des caracteres pour le texte envoye, des
     cases dessinees pour tout ce qui est rendu a l'ecran ou imprime. */
  const bulM = await import(pathToFileURL(join(ROOT, 'public/js/bulletin.js')));
  const iconsM = await import(pathToFileURL(join(ROOT, 'public/js/icons.js')));
  const marques = Object.values(bulM.MARK_TEXT);
  ok('le texte envoye porte des marques typographiques',
    marques.length >= 4 && marques.every((m) => m.length === 1 && !EMOJI.test(m)),
    marques.join(' '));
  ok('chaque statut a sa case dessinee',
    Object.values(bulM.MARK_ICON).every((n) => iconsM.ICON_NAMES.includes(n)));
  ok('les quatre cases sont vraiment differentes',
    new Set(['markTaken', 'markMissed', 'markSkipped', 'markDue']
      .map((n) => iconsM.ico(n))).size === 4);
  ok('une ligne de prise est reconnue par sa marque',
    bulM.statusOfLine(bulM.MARK_TEXT.taken + ' 08:00 Captopril') === 'taken' &&
    bulM.statusOfLine('Prises validées : 5 / 7') === null);

  const bul = await readFile(join(ROOT, 'public/js/bulletin.js'), 'utf8');
  ok('le bulletin donne sa legende', /pris/.test(bul) && /à venir/.test(bul));

  /* Un fichier vide passe l'analyse syntaxique sans broncher : c'est le genre
     de degat qu'une redirection maladroite fait, et qui ne se voit qu'au
     demarrage. On verifie donc que chaque module exporte quelque chose. */
  const vides = [];
  for (const f of sources) {
    const t = await readFile(f, 'utf8');
    if (t.trim().length < 20 || !/export|self\.|addEventListener/.test(t)) {
      vides.push(relative(ROOT, f));
    }
  }
  ok('aucun module vide ou sans export', vides.length === 0, vides.join(', '));

  /*
   * Les fabriques de traces ne rendent QUE des <path> : sans le <svg> qui les
   * porte, un navigateur ne dessine rien du tout et n'a rien a signaler. Une
   * planche de portraits est donc restee vide un moment sans qu'un seul test
   * rougisse. Ces fonctions ne sortent plus de leur module : au-dehors, on
   * passe par les emballeurs (avatarMarkup, seedMarkup).
   */
  const CLOISONNES = { faceSVG: 'public/js/avatars.js' };
  const fuites = [];
  for (const f of sources) {
    const rel = relative(ROOT, f).replaceAll('\\\\', '/');
    const t = await readFile(f, 'utf8');
    for (const [nom, chez] of Object.entries(CLOISONNES)) {
      if (rel === chez) continue;
      if (new RegExp('\\b' + nom + '\\s*\\(').test(t)) fuites.push(`${rel} appelle ${nom}()`);
    }
  }
  ok('les fabriques de traces ne sortent pas de leur module',
    fuites.length === 0, fuites.join(', '));

  /* Et l'inverse : tout ce qui est colle en innerHTML comme un dessin doit
     etre un <svg> complet. On verifie que les emballeurs en ouvrent un. */
  const av = await readFile(join(ROOT, 'public/js/avatars.js'), 'utf8');
  ok('les emballeurs d\'avatar ouvrent un <svg>',
    /export function avatarMarkup[\s\S]*?<svg/.test(av) &&
    /export function seedMarkup[\s\S]*?<svg/.test(av));
}

/* ==========================================================================
   L'ADRESSE DU RELAIS
   Une adresse tapee a la main est la premiere chose qui casse. « vercel.app »
   sans schema est comprise par `fetch()` comme un CHEMIN RELATIF : le vrai
   serveur n'est jamais appele, et un 404 local ressemble a une boite vide.
   ========================================================================== */
console.log('\nL\'ADRESSE DU RELAIS');
{
  const sync = await import(pathToFileURL(join(ROOT, 'public/js/sync.js')));
  const n = sync.normaliserAdresse;
  eq('un domaine seul devient une adresse complete',
    n('sync-one-virid.vercel.app'), 'https://sync-one-virid.vercel.app/api/sync');
  eq('le schema manquant est ajoute',
    n('mon.vercel.app/api/sync'), 'https://mon.vercel.app/api/sync');
  eq('une adresse complete ne bouge pas',
    n('https://mon.vercel.app/api/sync'), 'https://mon.vercel.app/api/sync');
  eq('la barre finale saute', n('https://mon.vercel.app/api/sync/'), 'https://mon.vercel.app/api/sync');
  eq('un chemin choisi est respecte',
    n('https://mon.vercel.app/relais'), 'https://mon.vercel.app/relais');
  eq('les parametres sont retires',
    n('https://mon.vercel.app/api/sync?id=1'), 'https://mon.vercel.app/api/sync');
  eq('le vide reste vide', n('   '), '');
  /* Un chemin absolu se resout contre l'origine : sous Node il n'y en a pas,
     on verifie seulement qu'il ne devient pas un domaine invente. */
  ok('un chemin absolu ne devient pas un domaine',
    !/^https:\/\/api/.test(n('/api/sync')));
  eq('une horreur ne casse rien', n('ht!tp://'), '');

  /* Le lien d'appairage doit porter une adresse absolue : un chemin relatif
     ne veut rien dire sur l'autre telephone. */
  const lu = sync.lireLienDAppairage('PILULIER1|ABCD2345EFGH|https://x.vercel.app/api/sync');
  ok('le lien d\'appairage se relit', lu && lu.code === 'ABCD2345EFGH');
  ok('un lien etranger est refuse', sync.lireLienDAppairage('https://exemple.fr') === null);
  ok('un lien tronque est refuse', sync.lireLienDAppairage('PILULIER1|TROPCOURT|') === null);
}

/* ==========================================================================
   LA BASE DU RELAIS
   Vercel propose un « Custom Prefix » quand on branche Upstash : les
   variables peuvent donc s'appeler a peu pres n'importe comment. Coder deux
   noms en dur, c'est faire dependre le suivi a distance d'une case de
   formulaire remplie six mois plus tot.
   ========================================================================== */
console.log('\nLA BASE DU RELAIS');
{
  const { trouverLaBase } = await import(pathToFileURL(join(ROOT, 'api/sync.js')));
  const cas = [
    ['les noms de Vercel KV',
      { KV_REST_API_URL: 'https://a.upstash.io/', KV_REST_API_TOKEN: 'AAA' }, 'AAA'],
    ['les noms d\'Upstash',
      { UPSTASH_REDIS_REST_URL: 'https://b.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'BBB' }, 'BBB'],
    ['un prefixe choisi a la main',
      { STORAGE_REST_API_URL: 'https://c.upstash.io', STORAGE_REST_API_TOKEN: 'CCC' }, 'CCC'],
    ['un prefixe imprevisible',
      { PEU_IMPORTE_REST_API_URL: 'https://d.upstash.io', PEU_IMPORTE_REST_API_TOKEN: 'DDD' }, 'DDD'],
  ];
  for (const [nom, env, jeton] of cas) {
    const r = trouverLaBase(env);
    ok(`la base se trouve avec ${nom}`, r.token === jeton && /^https:/.test(r.url),
      JSON.stringify(r));
  }
  eq('la barre finale de l\'adresse saute',
    trouverLaBase({ KV_REST_API_URL: 'https://a.upstash.io/', KV_REST_API_TOKEN: 'x' }).url,
    'https://a.upstash.io');
  /* `rediss://` demande un vrai client Redis, donc une dependance npm : jamais. */
  ok('une chaine rediss:// n\'est pas prise pour une adresse REST',
    trouverLaBase({ KV_URL: 'rediss://x', REDIS_URL: 'rediss://y' }).url === '');
  /* Un jeton en lecture seule ferait echouer la PUBLICATION, et elle seule :
     le proche verrait « rien de publie » sans qu'aucune erreur ne le dise. */
  ok('un jeton en lecture seule est refuse',
    trouverLaBase({ X_REST_API_URL: 'https://e.upstash.io',
                    X_REST_API_READ_ONLY_TOKEN: 'E' }).url === '');
  ok('sans rien, on le sait', trouverLaBase({}).url === '');
}

/* ==========================================================================
   LES LANGUES
   Le mecanisme est a repli : une phrase non traduite s'affiche en francais.
   L'application ne peut donc pas se casser en changeant de langue — mais elle
   peut se retrouver a moitie traduite sans que personne le voie. On mesure
   donc la couverture, et on la dit.
   ========================================================================== */
console.log('\nLES LANGUES');
{
  const i18n = await import(pathToFileURL(join(ROOT, 'public/js/i18n.js')));
  ok('le francais est la langue source', i18n.LANGUES.fr?.source === true);
  ok('au moins une autre langue existe', Object.keys(i18n.LANGUES).length >= 2);

  for (const code of Object.keys(i18n.LANGUES)) {
    if (code === 'fr') continue;
    const f = join(ROOT, 'public/js/lang', code + '.js');
    let cat = null;
    try { cat = (await import(pathToFileURL(f))).default; } catch { /* absent */ }
    ok(`le catalogue ${code} existe et se charge`, !!cat);
    if (!cat) continue;
    const vides = Object.entries(cat).filter(([, v]) => !v || !String(v).trim())
      .map(([k]) => k);
    ok(`aucune entree ${code} vide`, vides.length === 0, vides.slice(0, 3).join(' | '));
    /* Une entree identique au francais n'est pas une erreur — « Stock »,
       « Volume », « Patch » s'ecrivent pareil. On la compte, sans juger. */
    const memes = Object.entries(cat).filter(([k, v]) => v === k).length;
    /* Les variables entre accolades doivent survivre a la traduction : une
       phrase qui perd son {n} affiche un trou a l'ecran. */
    const casses = Object.entries(cat).filter(([k, v]) => {
      const a = (k.match(/\{\w+\}/g) || []).sort().join(',');
      const b = (v.match(/\{\w+\}/g) || []).sort().join(',');
      return a !== b;
    }).map(([k]) => k);
    ok(`les variables sont preservees en ${code}`, casses.length === 0,
      casses.slice(0, 3).join(' | '));
    console.log(`  info   catalogue ${code} : ${Object.keys(cat).length} phrases, ` +
      `dont ${memes} identiques au francais`);
  }

  /* Le crochet de traduction doit rester unique : si quelqu'un le retire de
     `el()`, l'application redevient monolingue sans un seul test rouge. */
  const util = await readFile(join(ROOT, 'public/js/util.js'), 'utf8');
  ok('le crochet de traduction est bien dans el()',
    /k === 'text'[^\n]*t\(v\)/.test(util));
  ok('les placeholders et les libelles d\'accessibilite sont traduits',
    /placeholder' \|\| k === 'title'/.test(util));
}

/* ==========================================================================
   L'APPLICATION ANDROID
   La coque ne peut pas etre compilee ici (il faut le SDK), mais tout ce qui
   se verifie sans compilateur se verifie : la regle « zero dependance », la
   coherence entre le manifeste et les classes, et surtout l'accord entre le
   pont JavaScript et le pont Java — c'est la que deux mondes peuvent se
   mettre a mentir l'un a l'autre sans que rien ne plante.
   ========================================================================== */
console.log('\nL\'APPLICATION ANDROID');
{
  const A = (p) => join(ROOT, 'android', p);
  const lire = (p) => readFile(A(p), 'utf8');

  const gradle = await lire('app/build.gradle');
  ok('l\'APK ne depend d\'aucune bibliotheque',
    /dependencies\s*\{\s*\}/.test(gradle));
  ok('l\'APK n\'embarque pas AndroidX',
    !/androidx|com\.google\.android\.material/.test(gradle));

  const manifeste = await lire('app/src/main/AndroidManifest.xml');
  const javaDir = A('app/src/main/java/com/elimmeka/pilulier');
  const classes = (await readdir(javaDir))
    .filter((f) => f.endsWith('.java')).map((f) => f.replace('.java', ''));

  /* Chaque composant declare doit exister, et reciproquement. */
  const declares = [...manifeste.matchAll(/android:name="\.([A-Za-z]+)"/g)].map((m) => m[1]);
  const manquants = declares.filter((c) => !classes.includes(c));
  ok('chaque composant du manifeste a sa classe', manquants.length === 0, manquants.join(', '));
  /* EcranAlarme a disparu : c'etait un ecran dessine en Java, que le systeme
     ne laissait de toute facon plus s'ouvrir depuis l'arriere-plan. L'ecran
     de rappel est desormais celui du web, ouvert par l'intention plein
     ecran. Une seule alarme a maintenir, et c'est celle qu'on voit. */
  for (const c of ['MainActivity', 'RecepteurAlarme', 'RecepteurDemarrage']) {
    ok(`${c} est declaree dans le manifeste`, declares.includes(c));
  }

  /* Les permissions : chacune doit servir a quelque chose dans le code. */
  const perms = [...manifeste.matchAll(/uses-permission android:name="android\.permission\.([A-Z_]+)"/g)]
    .map((m) => m[1]);
  for (const p of ['SCHEDULE_EXACT_ALARM', 'POST_NOTIFICATIONS', 'RECEIVE_BOOT_COMPLETED',
                   'VIBRATE', 'CAMERA', 'USE_FULL_SCREEN_INTENT']) {
    ok(`la permission ${p} est demandee`, perms.includes(p));
  }
  /*
   * L'ecran de rappel doit passer par l'intention plein ecran. Sans elle, la
   * notification s'affiche et l'ecran ne s'ouvre jamais : c'est exactement la
   * panne qu'on vient de corriger, et elle ne se voit qu'en installant l'APK
   * sur un vrai telephone. On la garde donc ici.
   */
  const recepteur = await lire('app/src/main/java/com/elimmeka/pilulier/RecepteurAlarme.java');
  ok('le rappel ouvre un ecran plein format',
    /setFullScreenIntent\s*\(/.test(recepteur));
  ok('il vise l\'application, pas un ecran natif',
    /new Intent\(c, MainActivity\.class\)/.test(recepteur));
  ok('il ne tente plus de demarrer une activite depuis l\'arriere-plan',
    !/c\.startActivity\(/.test(recepteur));
  const mainA = await lire('app/src/main/java/com/elimmeka/pilulier/MainActivity.java');
  ok('l\'application se montre par-dessus le verrouillage',
    /setShowWhenLocked\(true\)/.test(mainA) && /setTurnScreenOn\(true\)/.test(mainA));
  ok('elle relit l\'alarme quand elle est deja ouverte',
    /onNewIntent/.test(mainA));

  ok('aucune permission de localisation ni de contacts',
    !perms.some((p) => /LOCATION|CONTACTS|READ_SMS|CALL/.test(p)), perms.join(' '));

  /* Les ressources appelees depuis Java doivent exister. */
  const resDir = A('app/src/main/res');
  const resFiles = [];
  for (const d of await readdir(resDir)) {
    for (const f of await readdir(join(resDir, d))) resFiles.push(d + '/' + f);
  }
  const valeurs = (await Promise.all(
    resFiles.filter((f) => f.startsWith('values')).map((f) => readFile(join(resDir, f), 'utf8'))
  )).join('\n');
  const introuvables = [];
  for (const f of classes) {
    const src = await readFile(join(javaDir, f + '.java'), 'utf8');
    for (const [, type, nom] of src.matchAll(/\bR\.(string|drawable|mipmap|color|xml)\.([a-z_0-9]+)/g)) {
      const existe = type === 'string' || type === 'color'
        ? new RegExp(`name="${nom}"`).test(valeurs)
        : resFiles.some((r) => r.includes('/' + nom + '.'));
      if (!existe) introuvables.push(`R.${type}.${nom} (${f})`);
    }
  }
  ok('toutes les ressources appelees existent', introuvables.length === 0,
    introuvables.join(', '));

  /* LE POINT SENSIBLE : le pont JS et le pont Java doivent s'accorder. */
  const pontJava = await lire('app/src/main/java/com/elimmeka/pilulier/Pont.java');
  const exposees = [...pontJava.matchAll(/@JavascriptInterface\s+public\s+\S+\s+([a-zA-Z]+)\s*\(/g)]
    .map((m) => m[1]);
  const natif = await readFile(join(ROOT, 'public/js/native.js'), 'utf8');
  const appelees = new Set([
    ...[...natif.matchAll(/pont\??\.([a-zA-Z]+)\s*\(/g)].map((m) => m[1]),
    ...[...natif.matchAll(/lire\('([a-zA-Z]+)'/g)].map((m) => m[1]),
  ].filter((m) => m !== 'lePont'));
  const absentes = [...appelees].filter((m) => !exposees.includes(m));
  ok('chaque methode appelee par le web existe cote Java', absentes.length === 0,
    absentes.join(', '));
  ok('le pont Java expose bien la pose des rappels', exposees.includes('publierPrises'));
  /*
   * Le pont doit rester petit, pas rester fige. Il est passe de 9 a 17
   * methodes le jour ou l'APK a ete essaye pour de vrai : une WebView ne sait
   * ni imprimer, ni telecharger, ni notifier, ni parler. Ce qui compte n'est
   * donc pas le compte brut mais ce qu'on expose : rien qui lise ou ecrive
   * hors de l'application, rien qui evalue du code.
   */
  ok('le pont reste petit', exposees.length <= 20, exposees.length + ' methodes');
  const dangereuses = exposees.filter((m) => /^(eval|exec|shell|lireFichier|supprimer|requete|fetch)/i.test(m));
  ok('le pont n\'expose rien d\'arbitraire', dangereuses.length === 0, dangereuses.join(', '));

  /*
   * L'adresse du relais ne doit JAMAIS entrer dans le depot. Git n'oublie
   * rien : une adresse commitee une fois y reste, meme effacee ensuite. Elle
   * est posee a la compilation par tools/sync-android.mjs, depuis
   * android/relais.properties ou la variable PILULIER_RELAIS.
   */
  const relaisSrc = await readFile(join(ROOT, 'public/js/relais.js'), 'utf8');
  const valeur = relaisSrc.match(/RELAIS_COMPILE\s*=\s*['"`]([^'"`]*)['"`]/);
  ok('aucune adresse de relais dans le depot',
    !!valeur && valeur[1] === '', valeur ? valeur[1] : 'declaration introuvable');

  /* Les assets sont une copie : ils doivent l'etre vraiment. */
  const pub = (await walkAll(join(ROOT, 'public'))).map((f) => relative(join(ROOT, 'public'), f));
  const assetsDir = A('app/src/main/assets/web');
  let assets = [];
  try {
    assets = (await walkAll(assetsDir)).map((f) => relative(assetsDir, f));
  } catch { /* pas encore synchronise */ }
  const ECARTES = ['sw.js', 'manifest.webmanifest', 'dessins.html', 'faces.html',
                   'sorties.html', 'style.html', 'marques.html', 'schema.html',
                   'graphiques.html'];
  const attendus = pub.filter((f) => !ECARTES.includes(f)).sort();
  const presents = assets.filter((f) => f !== 'PROVENANCE.txt').sort();
  ok('les assets de l\'APK sont a jour avec public/',
    attendus.length > 0 && attendus.join('|') === presents.join('|'),
    `attendu ${attendus.length}, present ${presents.length}`);
  ok('le service worker n\'est pas embarque dans l\'APK', !presents.includes('sw.js'));

  /* Le Java ne peut pas etre compile ici (il faudrait le SDK Android), mais
     ce qui se lit sans compilateur se verifie : les accolades se referment,
     et le nom de classe suit le nom du fichier.

     L'ordre du nettoyage compte : les chaines d'abord, les commentaires
     ensuite. Retirer les `//` avant les chaines couperait l'URL
     `https://pilulier.local/` en plein milieu et laisserait un guillemet
     ouvert, qui avalerait alors la moitie du fichier. */
  const casses = [];
  for (const f of classes) {
    const src = await readFile(join(javaDir, f + '.java'), 'utf8');
    const nu = src
      .replace(/"(\\.|[^"\\])*"/g, '""')      /* les chaines, en premier */
      .replace(/'(\\.|[^'\\])'/g, "'x'")      /* les caracteres          */
      .replace(/\/\*[\s\S]*?\*\//g, '')       /* les blocs               */
      .replace(/\/\/.*/g, '');                /* les lignes              */
    const o = (nu.match(/\{/g) || []).length, c = (nu.match(/\}/g) || []).length;
    if (o !== c) casses.push(`${f}: ${o} accolades ouvertes, ${c} fermees`);
    if (!new RegExp(`(class|interface)\\s+${f}\\b`).test(nu)) {
      casses.push(`${f}: la classe ne porte pas le nom du fichier`);
    }
    if (!/^package com\.elimmeka\.pilulier;/m.test(nu)) casses.push(`${f}: paquet absent`);
  }
  /*
   * Deux methodes du meme nom et de la meme signature : Java refuse net, mais
   * seulement au moment de compiler — donc sur la machine de quelqu'un
   * d'autre, apres coup. C'est arrive en ajoutant un `onNewIntent` a une
   * classe qui en avait deja un. On le voit ici, sans compilateur.
   */
  {
    const doublons = [];
    for (const f of classes) {
      const src = (await readFile(join(javaDir, f + '.java'), 'utf8'))
        .replace(/"(?:[^"\\]|\\.)*"/g, '""')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      const vues = new Set();
      const re = /(?:public|private|protected|static|final|synchronized|\s)+[\w.<>\[\]]+\s+(\w+)\s*\(([^)]*)\)\s*\{/g;
      for (const m of src.matchAll(re)) {
        if (['if', 'for', 'while', 'switch', 'catch', 'return', 'new'].includes(m[1])) continue;
        /* la signature, c'est le nom plus les TYPES des parametres */
        const types = m[2].split(',').map((p) => p.trim().split(/\s+/)[0]).filter(Boolean).join(',');
        const cle = `${m[1]}(${types})`;
        if (vues.has(cle)) doublons.push(`${f}.java → ${cle}`);
        vues.add(cle);
      }
    }
    ok('aucune methode Java definie deux fois', doublons.length === 0, doublons.join(', '));
  }

  ok('le Java se tient (accolades, noms, paquets)', casses.length === 0,
    casses.slice(0, 3).join(' | '));

  /* La version, au meme endroit partout. */
  const ver = (await readFile(join(ROOT, 'public/js/app-version.js'), 'utf8'))
    .match(/'([\d.]+)'/)[1];
  ok('la version de l\'APK suit celle de l\'application',
    gradle.includes(`versionName '${ver}'`), ver);
}

console.log(`\n${pass} verifications passees, ${fail} echec(s).`);
process.exit(fail ? 1 : 0);
