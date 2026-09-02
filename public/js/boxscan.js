/* ============================================================================
   boxscan.js — lire une boite de medicament avec l'appareil photo.

   CE QUI MARCHE VRAIMENT, ET CE QUI N'EST PAS PROMIS
   Deux voies existent pour « extraire » les informations d'une boite :

   1. Le code-barres. Depuis 2019 la plupart des boites portent un Data Matrix
      GS1 qui contient, en clair, le code produit, le NUMERO DE LOT et surtout
      la DATE DE PEREMPTION. Chrome sur Android sait le lire nativement, hors
      ligne, sans rien telecharger. C'est fiable, instantane, et c'est ce que
      fait ce module.

   2. La lecture du texte imprime. Trois voies, essayees dans cet ordre :

      a) `TextDetector`, le lecteur de texte du telephone (meme famille que le
         lecteur de code-barres, adosse a ML Kit). Hors ligne, zero octet a
         telecharger. Attention : contrairement au lecteur de code-barres, il
         n'est pas active par defaut dans toutes les versions de Chrome — d'ou
         la detection systematique.

      b) Un moteur externe branche par `setOcrEngine()`. Rien n'est embarque
         (plusieurs megaoctets casseraient la promesse hors-ligne), mais le
         point d'accroche existe et tout ce qui suit est deja teste : brancher
         Tesseract tient en une quinzaine de lignes. Voir CLAUDE.md.

      c) Rien : on photographie quand meme les deux faces, une loupe permet de
         lire le petit texte, et la saisie reste manuelle.

   Dans tous les cas, l'analyse des lignes lues — nom, dosage, peremption, lot,
   forme — est faite ici par `extractFromLines()`, qui ne depend d'aucun moteur.
   C'est la partie qui contient la logique, et c'est celle qui est testee.
   ========================================================================== */

/** Le navigateur sait-il lire un code-barres ? (Chrome/Android : oui) */
export const detectorSupported = () => typeof window !== 'undefined' && 'BarcodeDetector' in window;

const WANTED = ['data_matrix', 'qr_code', 'ean_13', 'ean_8', 'code_128', 'itf', 'pdf417'];

let cachedFormats = null;
export async function availableFormats() {
  if (!detectorSupported()) return [];
  if (cachedFormats) return cachedFormats;
  try { cachedFormats = await window.BarcodeDetector.getSupportedFormats(); }
  catch { cachedFormats = []; }
  return cachedFormats;
}

/**
 * Cherche un code-barres dans une image.
 * @param {string|Blob} src data-URL ou Blob
 * @returns {Promise<Array<{format:string, rawValue:string}>>}
 */
export async function scanImage(src) {
  if (!detectorSupported()) return [];
  try {
    const formats = (await availableFormats()).filter((f) => WANTED.includes(f));
    const det = new window.BarcodeDetector(formats.length ? { formats } : undefined);
    const bmp = await toBitmap(src);
    const found = await det.detect(bmp);
    bmp.close?.();
    return found.map((b) => ({ format: b.format, rawValue: b.rawValue }));
  } catch (e) {
    console.warn('[boxscan]', e.message);
    return [];
  }
}

async function toBitmap(src) {
  if (src instanceof Blob) return createImageBitmap(src);
  const img = new Image();
  img.src = src;
  await img.decode();
  return createImageBitmap(img);
}

/* ==========================================================================
   LECTURE DU TEXTE
   ========================================================================== */

/** Le telephone sait-il lire du texte dans une image ? */
export const textDetectorSupported = () =>
  typeof window !== 'undefined' && 'TextDetector' in window;

let externalOcr = null;
/**
 * Branche un moteur OCR externe.
 * @param {Function} fn  (Blob|dataURL) => Promise<Array<{text, box?}>>
 * Voir CLAUDE.md pour un exemple avec Tesseract.
 */
export function setOcrEngine(fn) { externalOcr = typeof fn === 'function' ? fn : null; }
export const ocrAvailable = () => textDetectorSupported() || !!externalOcr;

/**
 * Lit les lignes de texte d'une image.
 * @returns {Promise<{lines:Array<{text,box}>, source:'natif'|'externe'|null}>}
 */
export async function readText(src) {
  if (textDetectorSupported()) {
    try {
      const det = new window.TextDetector();
      const bmp = await toBitmap(src);
      const blocks = await det.detect(bmp);
      bmp.close?.();
      const lines = [];
      for (const b of blocks) {
        const box = b.boundingBox || {};
        /* Certaines implementations rendent le bloc entier, d'autres ligne a
           ligne : on redecoupe pour que la suite voie toujours des lignes. */
        const morceaux = String(b.rawValue || '').split(/\r?\n/).filter((t) => t.trim());
        for (const t of morceaux) {
          lines.push({ text: t.trim(),
            box: { x: box.x || 0, y: box.y || 0, width: box.width || 0,
                   height: (box.height || 0) / Math.max(1, morceaux.length) } });
        }
      }
      if (lines.length) return { lines, source: 'natif' };
    } catch (e) { console.warn('[boxscan] texte natif', e.message); }
  }
  if (externalOcr) {
    try {
      const out = await externalOcr(src);
      const lines = (out || []).map((l) => typeof l === 'string'
        ? { text: l, box: {} } : { text: String(l.text || '').trim(), box: l.box || {} })
        .filter((l) => l.text);
      if (lines.length) return { lines, source: 'externe' };
    } catch (e) { console.warn('[boxscan] ocr externe', e.message); }
  }
  return { lines: [], source: null };
}

/* ==========================================================================
   GS1 : le contenu d'un Data Matrix de boite
   ==========================================================================
   Les donnees sont une suite d'« identifiants d'application » (AI) suivis de
   leur valeur. Certains ont une longueur fixe, les autres s'arretent au
   separateur FNC1 (0x1D) ou a la fin de la chaine.                          */

/* Table des identifiants d'application effectivement rencontres sur une
   boite de medicament. `n` = longueur fixe, 'var' = jusqu'au separateur.
   On essaie 4 chiffres, puis 3, puis 2 : sans cela, un numero de lot qui
   commence par un chiffre serait avale par un faux AI a 3 chiffres. */
const AI = {
  '00': 18, '01': 14, '02': 14, '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6, '20': 2,
  '10': 'var', '21': 'var', '22': 'var', '30': 'var', '37': 'var',
  '240': 'var', '241': 'var', '242': 'var', '250': 'var', '251': 'var', '253': 'var',
  '254': 'var', '400': 'var', '401': 'var', '410': 13, '411': 13, '412': 13, '413': 13,
  '414': 13, '415': 13, '416': 13, '420': 'var', '421': 'var', '422': 3, '424': 6,
  '710': 'var', '711': 'var', '712': 'var', '713': 'var', '714': 'var',
  '7003': 10, '7004': 'var', '8017': 18, '8018': 18, '8019': 'var', '8020': 'var',
};
const GS = String.fromCharCode(0x1D);

/** Longueur d'un AI de mesure (3100 a 3699) : toujours six chiffres. */
const isMeasure = (a) => /^3[1-6]\d\d$/.test(a);

/**
 * Decoupe une chaine GS1 en { ai: valeur }.
 * S'arrete proprement des qu'un identifiant est inconnu, plutot que de
 * produire n'importe quoi.
 */
export function parseGS1Raw(input) {
  let s = String(input || '');
  s = s.replace(/^\][A-Za-z]\d/, '');                 /* identifiant de symbologie */
  const out = {};
  let i = 0;
  while (i < s.length) {
    if (s[i] === GS) { i++; continue; }
    let ai = null, len = null;
    for (const size of [4, 3, 2]) {
      const cand = s.slice(i, i + size);
      if (cand.length < size) continue;
      if (AI[cand] !== undefined) { ai = cand; len = AI[cand]; break; }
      if (size === 4 && isMeasure(cand)) { ai = cand; len = 6; break; }
    }
    if (ai === null) break;                            /* identifiant inconnu : on arrete */
    i += ai.length;
    if (len === 'var') {
      const stop = s.indexOf(GS, i);
      const end = stop === -1 ? s.length : stop;
      out[ai] = s.slice(i, end);
      i = end;
    } else {
      out[ai] = s.slice(i, i + len);
      i += len;
    }
  }
  return out;
}

/** AAMMJJ -> date ISO. Un jour a « 00 » signifie « fin du mois ». */
function gs1Date(v) {
  if (!/^\d{6}$/.test(v)) return null;
  const yy = Number(v.slice(0, 2));
  const year = 2000 + yy;                              /* les boites ne sont jamais du siecle passe */
  const month = Number(v.slice(2, 4));
  let day = Number(v.slice(4, 6));
  if (month < 1 || month > 12) return null;
  if (!day) day = new Date(year, month, 0).getDate();
  const pad = (n) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Ce qu'on peut tirer d'un code lu.
 * @returns { gtin, expiry, lot, serial, kind }
 */
export function readBarcode(raw, format = '') {
  const s = String(raw || '').trim();
  if (!s) return null;

  /* Un EAN seul : juste un code produit. */
  if (/^\d{8}$|^\d{12,14}$/.test(s) && !/[\x1D]/.test(s) && format !== 'data_matrix') {
    return { kind: 'ean', gtin: s.padStart(14, '0'), expiry: null, lot: null, serial: null };
  }
  const ai = parseGS1Raw(s);
  const has = Object.keys(ai).length;
  if (!has) return { kind: 'texte', raw: s, gtin: null, expiry: null, lot: null, serial: null };

  return {
    kind: 'gs1',
    gtin: ai['01'] || ai['02'] || null,
    expiry: ai['17'] ? gs1Date(ai['17']) : null,
    fabrication: ai['11'] ? gs1Date(ai['11']) : null,
    lot: ai['10'] || null,
    serial: ai['21'] || null,
    cip: ai['710'] || ai['711'] || null,                /* codes nationaux, quand ils sont la */
    raw: s,
  };
}

/* ==========================================================================
   La date de peremption ecrite en clair
   ========================================================================== */
const MOIS = { jan: 1, fev: 2, feb: 2, mar: 3, avr: 4, apr: 4, mai: 5, may: 5, jun: 6, juin: 6,
               jul: 7, juil: 7, aou: 8, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/**
 * Accepte « 12/2027 », « 12-27 », « 2027-12 », « EXP 12 2027 », « DEC 2027 »,
 * « 31/12/2027 ». Sans jour, on retient le dernier jour du mois : c'est la
 * convention des laboratoires.
 */
export function parseExpiryText(text) {
  const t = String(text || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const pad = (n) => String(n).padStart(2, '0');
  const end = (y, m) => `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;
  const yr = (v) => (v < 100 ? 2000 + v : v);

  let m = t.match(/(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})/);           /* 2027-12-31 */
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = t.match(/(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})/);             /* 31/12/2027 */
  if (m) return `${yr(+m[3])}-${pad(+m[2])}-${pad(+m[1])}`;
  m = t.match(/(\d{4})[-/. ](\d{1,2})(?!\d)/);                        /* 2027-12 */
  if (m && +m[2] >= 1 && +m[2] <= 12) return end(+m[1], +m[2]);
  m = t.match(/(\d{1,2})[-/. ](\d{2,4})(?!\d)/);                      /* 12/2027 */
  if (m && +m[1] >= 1 && +m[1] <= 12) return end(yr(+m[2]), +m[1]);
  m = t.match(/([a-z]{3,4})[a-z]*[-/. ]*(\d{2,4})/);                  /* DEC 2027 */
  if (m && MOIS[m[1].slice(0, 3)]) return end(yr(+m[2]), MOIS[m[1].slice(0, 3)]);
  return null;
}

/* ==========================================================================
   Ou en est une boite
   ========================================================================== */
/**
 * @returns { days, level:'ok'|'soon'|'expired'|null, label }
 */
export function expiryStatus(iso, leadDays = 60) {
  if (!iso) return { days: null, level: null, label: '' };
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d)) return { days: null, level: null, label: '' };
  const days = Math.floor((d - Date.now()) / 86400000);
  if (days < 0) return { days, level: 'expired', label: `périmé depuis ${-days} jour${-days > 1 ? 's' : ''}` };
  if (days <= leadDays) return { days, level: 'soon', label: `périme dans ${days} jour${days > 1 ? 's' : ''}` };
  const mois = Math.round(days / 30);
  return { days, level: 'ok', label: `périme dans ${mois} mois` };
}

/* ==========================================================================
   ANALYSE DES LIGNES LUES
   Cette partie ne depend d'aucun moteur : elle prend des lignes de texte, d'ou
   qu'elles viennent, et en tire ce qu'il y a d'utile sur une boite. C'est ici
   que se trouve toute la logique, et c'est ici que portent les tests.
   ========================================================================== */

const up = (t) => String(t || '').toUpperCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const MOTS_PEREMPTION = ['EXP', 'PEREMPTION', 'PERIME', 'UTILISER AVANT', 'A UTILISER AVANT',
  'USE BY', 'USE BEFORE', 'EXPIRY', 'EXPIRE', 'VERWENDBAR BIS', 'CAD', 'VALIDITE'];
const MOTS_LOT = ['LOT', 'BATCH', 'CH.-B', 'CH.B', 'CHARGE', 'B.NO', 'BN', 'N LOT'];
const MOTS_FORME = [
  [/COMPRIME|TABLET|CP\b|FILMTABLET|DRAGEE/, 'comprime'],
  [/GELULE|CAPSULE|GELUL/, 'gelule'],
  [/SIROP|SUSPENSION BUVABLE|SOLUTION BUVABLE/, 'sirop'],
  [/GOUTTE|COLLYRE/, 'gouttes'],
  [/INJECT|AMPOULE|SERINGUE|FLACON INJ/, 'injection'],
  [/INHALAT|AEROSOL|SPRAY|BOUFFEE/, 'inhalateur'],
  [/PATCH|DISPOSITIF TRANSDERM/, 'patch'],
  [/SACHET|POUDRE/, 'sachet'],
  [/SUPPOSITOIRE/, 'suppositoire'],
  [/CREME|POMMADE|GEL DERM/, 'creme'],
];
/* Les unites telles qu'elles sont imprimees, et leur forme canonique. Les
   boites ecrivent aussi bien « 75 µg » que « 75 microgrammes ». */
const UNITES_CANON = {
  MILLIGRAMMES: 'mg', MILLIGRAMME: 'mg', MICROGRAMMES: 'µg', MICROGRAMME: 'µg',
  MILLILITRES: 'ml', MILLILITRE: 'ml', GRAMMES: 'g', GRAMME: 'g',
  UNITES: 'UI', UNITE: 'UI',
  MCG: 'µg', UG: 'µg', MG: 'mg', ML: 'ml', UI: 'UI', IU: 'UI', G: 'g', '%': '%',
};
/* Les plus longues d'abord, sinon « MG » avalerait le debut de « MILLIGRAMME ». */
const UNITES = Object.keys(UNITES_CANON)
  .sort((a, b) => b.length - a.length)
  .map((u) => u.replace('%', '\\%')).join('|');
/* Le signe micro se ramene a « U ». Attention : `toUpperCase()` transforme
   deja µ (U+00B5) en mu grec majuscule — il faut donc attraper les trois. */
const upU = (t) => up(t).replace(/[\u00B5\u03BC\u039C]/g, 'U');

const estDate = (t) => !!parseExpiryText(t);
const estMotCle = (t) => {
  const u = up(t);
  return MOTS_PEREMPTION.some((m) => u.includes(m)) || MOTS_LOT.some((m) => u.includes(m));
};

/** Trouve la peremption : d'abord aupres d'un mot-cle, sinon la date la plus lointaine. */
function trouverPeremption(lignes) {
  const txt = lignes.map((l) => l.text);
  for (let i = 0; i < txt.length; i++) {
    if (!MOTS_PEREMPTION.some((m) => up(txt[i]).includes(m))) continue;
    /* La date est sur la meme ligne, ou juste apres : « EXP » puis « 11/2027 ». */
    for (const cand of [txt[i], txt[i + 1], txt[i + 2]]) {
      const iso = cand && parseExpiryText(cand);
      if (iso) return { iso, indice: 'mot-clé' };
    }
  }
  /* Sans mot-cle : on retient la date la plus lointaine, car une boite porte
     souvent aussi sa date de fabrication — toujours anterieure. */
  const dates = txt.map(parseExpiryText).filter(Boolean).sort();
  return dates.length ? { iso: dates[dates.length - 1], indice: 'date isolée' } : null;
}

function trouverLot(lignes) {
  const txt = lignes.map((l) => l.text);
  for (let i = 0; i < txt.length; i++) {
    const u = up(txt[i]);
    const mot = MOTS_LOT.find((m) => u.includes(m));
    if (!mot) continue;
    const apres = u.slice(u.indexOf(mot) + mot.length).replace(/^[\s.:°N-]+/, '');
    const m = apres.match(/^([A-Z0-9][A-Z0-9\/-]{2,19})/);
    if (m) return m[1];
    const suivant = up(txt[i + 1] || '').match(/^([A-Z0-9][A-Z0-9\/-]{2,19})$/);
    if (suivant) return suivant[1];
  }
  return null;
}

/** Le dosage : associations, unites ecrites en toutes lettres, unite separee. */
function trouverDosage(lignes) {
  const txt = lignes.map((l) => l.text);
  const nb = (v) => v.replace('.', ',');
  const canon = (mot) => UNITES_CANON[mot.toUpperCase()] || mot.toLowerCase();

  /* D'abord les associations — « 20/120 mg » — sinon on ne retiendrait que la
     seconde moitie du dosage. Coartem, Augmentin, Bactrim s'ecrivent ainsi. */
  const combi = new RegExp(
    `(\\d+(?:[.,]\\d+)?)\\s*/\\s*(\\d+(?:[.,]\\d+)?)\\s*(${UNITES})(?![A-Z])`);
  for (const t of txt) {
    const m = upU(t).match(combi);
    if (m) return `${nb(m[1])}/${nb(m[2])} ${canon(m[3])}`;
  }
  const simple = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNITES})(?![A-Z])`);
  for (const t of txt) {
    const m = upU(t).match(simple);
    if (m) return `${nb(m[1])} ${canon(m[2])}`;
  }
  /* Le nombre et l'unite peuvent tomber sur deux lignes distinctes. */
  for (let i = 0; i < txt.length - 1; i++) {
    const nombre = upU(txt[i]).match(/^(\d+(?:[.,]\d+)?)$/);
    const u = upU(txt[i + 1]).match(new RegExp(`^(${UNITES})$`));
    if (nombre && u) return `${nb(nombre[1])} ${canon(u[1])}`;
  }
  return null;
}

function trouverForme(lignes) {
  const u = lignes.map((l) => up(l.text)).join(' ');
  for (const [re, forme] of MOTS_FORME) if (re.test(u)) return forme;
  return null;
}

/** « Boite de 30 comprimes » : la contenance, utile pour le stock. */
function trouverContenance(lignes) {
  const u = lignes.map((l) => up(l.text)).join(' ');
  const m = u.match(/(\d{1,3})\s*(COMPRIME|GELULE|CAPSULE|TABLET|SACHET|AMPOULE|FILMTABLET)/);
  return m ? Number(m[1]) : null;
}

/**
 * Le nom du medicament : sur une boite, c'est toujours le plus gros texte.
 * Quand les cadres de detection sont disponibles on s'en sert ; sinon on
 * retombe sur la position et la longueur.
 */
function trouverNoms(lignes) {
  const cands = lignes
    .map((l, i) => ({ ...l, i }))
    .filter((l) => {
      const t = l.text.trim();
      if (t.length < 3 || t.length > 40) return false;
      if (estMotCle(t) || estDate(t)) return false;
      if (/^\d+[\s.,]*$/.test(t)) return false;
      if (new RegExp(`^\\d+([.,]\\d+)?\\s*/?\\s*(\\d+([.,]\\d+)?)?\\s*(${UNITES})$`).test(upU(t))) return false;
      if (MOTS_FORME.some(([re]) => re.test(up(t))) && t.length < 22) return false;
      const lettres = (t.match(/[A-Za-zÀ-ÿ]/g) || []).length;
      return lettres >= 3 && lettres / t.length > 0.55;
    })
    .map((l) => ({
      texte: l.text.trim(),
      /* Hauteur du cadre d'abord, puis position en haut de boite, puis longueur. */
      score: (l.box?.height || 0) * 100 + (1 / (1 + l.i)) * 10 + Math.min(l.texte?.length || 0, 20),
    }))
    .sort((a, b) => b.score - a.score);
  return [...new Set(cands.map((c) => c.texte))];
}

/**
 * Tout ce qu'on peut tirer des lignes lues sur une boite.
 * @returns {{ name, names, strength, expiry, expirySource, lot, form, packQty }}
 */
export function extractFromLines(lines) {
  const l = (lines || []).map((x) => typeof x === 'string' ? { text: x, box: {} } : x)
    .filter((x) => x && String(x.text || '').trim());
  if (!l.length) return { name: null, names: [], strength: null, expiry: null,
                          expirySource: null, lot: null, form: null, packQty: null };
  const per = trouverPeremption(l);
  const noms = trouverNoms(l);
  return {
    name: noms[0] || null,
    names: noms.slice(0, 5),
    strength: trouverDosage(l),
    expiry: per?.iso || null,
    expirySource: per?.indice || null,
    lot: trouverLot(l),
    form: trouverForme(l),
    packQty: trouverContenance(l),
  };
}

/**
 * Fusionne ce que donnent le code-barres et le texte.
 * Le code-barres a toujours raison sur la peremption et le lot : il est
 * encode, pas devine.
 */
export function mergeReadings({ codes = [], lines = [] } = {}) {
  const out = { gtin: null, expiry: null, expirySource: null, lot: null,
                name: null, names: [], strength: null, form: null, packQty: null,
                sources: [] };
  for (const c of codes) {
    const r = readBarcode(c.rawValue, c.format);
    if (!r) continue;
    if (r.gtin && !out.gtin) out.gtin = r.gtin;
    if (r.expiry && !out.expiry) { out.expiry = r.expiry; out.expirySource = 'code-barres'; }
    if (r.lot && !out.lot) out.lot = r.lot;
    if (r.gtin || r.expiry || r.lot) out.sources.push('code-barres');
  }
  if (lines.length) {
    const t = extractFromLines(lines);
    out.name = t.name; out.names = t.names;
    out.strength = t.strength; out.form = t.form; out.packQty = t.packQty;
    if (!out.expiry && t.expiry) { out.expiry = t.expiry; out.expirySource = t.expirySource; }
    if (!out.lot && t.lot) out.lot = t.lot;
    if (t.name || t.strength || t.expiry) out.sources.push('texte');
  }
  out.sources = [...new Set(out.sources)];
  return out;
}

/* ==========================================================================
   Reduction d'image
   Le code-barres se lit sur le fichier d'origine, en pleine resolution ; ce
   n'est qu'ensuite qu'on reduit la photo pour la stocker. La proportion est
   conservee : une boite n'est pas carree.
   ========================================================================== */
export function shrinkImage(file, maxSide = 900, quality = 0.78) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) return reject(new Error('Fichier image attendu.'));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible.')); };
    img.src = url;
  });
}

/** Formatage court d'une date ISO, pour l'affichage. */
export const fmtExpiry = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
