/* ============================================================================
   qr.js — encodeur QR ecrit a la main, sans aucune dependance.

   Sert a la fiche d'urgence : un secouriste scanne le carre avec n'importe
   quel telephone et lit le traitement complet, meme si l'application n'est pas
   installee et qu'il n'y a pas de reseau.

   Mode octet (UTF-8), versions 1 a 40, quatre niveaux de correction.
   Implementation conforme a ISO/IEC 18004.
   ========================================================================== */

/* Nombre de mots de correction par bloc, indexe [niveau][version]. */
const ECC_PER_BLOCK = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28,
      28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
      26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30,
      28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28,
      30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};
/* Nombre de blocs de correction, indexe [niveau][version]. */
const NUM_BLOCKS = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8,
      8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
      17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20,
      23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25,
      25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};
const ECL_BITS = { L: 1, M: 0, Q: 3, H: 2 };

/* ------------------------------------------------------------ Geometrie */
function rawDataModules(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}
const dataCodewords = (ver, ecl) =>
  Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * NUM_BLOCKS[ecl][ver];

function alignPositions(ver) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const size = ver * 4 + 17;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const res = [6];
  for (let pos = size - 7; res.length < n; pos -= step) res.splice(1, 0, pos);
  return res;
}

/* -------------------------------------------------------- Corps de Galois */
const gfMul = (x, y) => {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11D);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xFF;
};
function rsDivisor(degree) {
  const res = new Uint8Array(degree);
  res[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      res[j] = gfMul(res[j], root);
      if (j + 1 < degree) res[j] ^= res[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return res;
}
function rsRemainder(data, divisor) {
  const res = new Uint8Array(divisor.length);
  for (const b of data) {
    const factor = b ^ res[0];
    res.copyWithin(0, 1); res[res.length - 1] = 0;
    for (let i = 0; i < divisor.length; i++) res[i] ^= gfMul(divisor[i], factor);
  }
  return res;
}

/* ------------------------------------------------------------- Encodage */
function bytesOf(text) { return new TextEncoder().encode(String(text)); }

function chooseVersion(len, ecl, minVer = 1, maxVer = 40) {
  for (let v = minVer; v <= maxVer; v++) {
    const cap = dataCodewords(v, ecl);
    const countBits = v <= 9 ? 8 : 16;
    const need = Math.ceil((4 + countBits + len * 8) / 8);
    if (need <= cap) return v;
  }
  return -1;
}

function buildCodewords(bytes, ver, ecl) {
  const bits = [];
  const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  push(4, 4);                                   /* mode octet */
  push(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);

  const capBits = dataCodewords(ver, ecl) * 8;
  push(0, Math.min(4, capBits - bits.length));  /* terminateur */
  while (bits.length % 8) bits.push(0);
  for (let pad = 0xEC; bits.length < capBits; pad ^= 0xEC ^ 0x11) push(pad, 8);

  const data = new Uint8Array(bits.length / 8);
  bits.forEach((b, i) => { data[i >>> 3] |= b << (7 - (i & 7)); });

  /* Decoupage en blocs, correction d'erreur, puis entrelacement. */
  const numBlocks = NUM_BLOCKS[ecl][ver];
  const eccLen = ECC_PER_BLOCK[ecl][ver];
  const rawCw = Math.floor(rawDataModules(ver) / 8);
  const shortBlocks = numBlocks - (rawCw % numBlocks);
  const shortLen = Math.floor(rawCw / numBlocks);
  const divisor = rsDivisor(eccLen);

  const blocks = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const len = shortLen - eccLen + (i < shortBlocks ? 0 : 1);
    const dat = Array.from(data.slice(k, k + len)); k += len;
    const ecc = Array.from(rsRemainder(dat, divisor));
    if (i < shortBlocks) dat.push(0);           /* case fantome pour l'entrelacement */
    blocks.push(dat.concat(ecc));
  }
  const out = [];
  for (let i = 0; i < blocks[0].length; i++) {
    for (let j = 0; j < blocks.length; j++) {
      if (i !== shortLen - eccLen || j >= shortBlocks) out.push(blocks[j][i]);
    }
  }
  return out;
}

/* -------------------------------------------------------------- Matrice */
function makeMatrix(ver, ecl, codewords) {
  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };

  /* Motifs de reperage + separateurs */
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || x >= size || y < 0 || y >= size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(x, y, d !== 2 && d <= 3);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);

  /* Lignes de synchronisation */
  for (let i = 0; i < size; i++) {
    if (!fn[6][i]) set(i, 6, i % 2 === 0);
    if (!fn[i][6]) set(6, i, i % 2 === 0);
  }

  /* Motifs d'alignement */
  const ap = alignPositions(ver);
  for (let i = 0; i < ap.length; i++) for (let j = 0; j < ap.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) ||
        (i === ap.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      set(ap[j] + dx, ap[i] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }

  /* Reserve pour l'information de format et de version */
  for (let i = 0; i < 9; i++) { if (!fn[i][8]) set(8, i, false); if (!fn[8][i]) set(i, 8, false); }
  for (let i = 0; i < 8; i++) { set(size - 1 - i, 8, false); set(8, size - 1 - i, false); }
  set(8, size - 8, true);                       /* module toujours noir */
  if (ver >= 7) {
    for (let i = 0; i < 18; i++) {
      set(Math.floor(i / 3), size - 11 + (i % 3), false);
      set(size - 11 + (i % 3), Math.floor(i / 3), false);
    }
  }

  /* Placement des donnees en zigzag */
  let bit = 0;
  const total = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (fn[y][x] || bit >= total) continue;
        mod[y][x] = ((codewords[bit >>> 3] >>> (7 - (bit & 7))) & 1) !== 0;
        bit++;
      }
    }
  }
  return { mod, fn, size };
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
  (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0,
  (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0,
];

function applyMask(mod, fn, size, m) {
  const f = MASKS[m];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!fn[y][x] && f(x, y)) mod[y][x] = !mod[y][x];
  }
}

function drawFormat(mod, fn, size, ecl, mask) {
  let data = (ECL_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bitsF = ((data << 10) | rem) ^ 0x5412;
  const get = (i) => ((bitsF >>> i) & 1) !== 0;
  /* put(x, y) : la matrice est indexee [ligne][colonne], donc mod[y][x]. */
  const put = (x, y, v) => { mod[y][x] = v; fn[y][x] = true; };
  for (let i = 0; i <= 5; i++) put(8, i, get(i));
  put(8, 7, get(6));
  put(8, 8, get(7));
  put(7, 8, get(8));
  for (let i = 9; i < 15; i++) put(14 - i, 8, get(i));
  for (let i = 0; i < 8; i++) put(size - 1 - i, 8, get(i));
  for (let i = 8; i < 15; i++) put(8, size - 15 + i, get(i));
  put(8, size - 8, true);
}

function drawVersion(mod, fn, size, ver) {
  if (ver < 7) return;
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
  const bitsV = (ver << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const bit = ((bitsV >>> i) & 1) !== 0;
    const a = size - 11 + (i % 3), b = Math.floor(i / 3);
    mod[a][b] = bit; fn[a][b] = true;
    mod[b][a] = bit; fn[b][a] = true;
  }
}

/* Score de penalite : on retient le masque qui rend le code le plus lisible. */
function penalty(mod, size) {
  let p = 0;
  const runScore = (run) => run >= 5 ? 3 + (run - 5) : 0;
  for (let y = 0; y < size; y++) {
    let run = 1;
    for (let x = 1; x < size; x++) {
      if (mod[y][x] === mod[y][x - 1]) run++;
      else { p += runScore(run); run = 1; }
    }
    p += runScore(run);
  }
  for (let x = 0; x < size; x++) {
    let run = 1;
    for (let y = 1; y < size; y++) {
      if (mod[y][x] === mod[y - 1][x]) run++;
      else { p += runScore(run); run = 1; }
    }
    p += runScore(run);
  }
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
    const c = mod[y][x];
    if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
  }
  const PAT = [true, false, true, true, true, false, true];
  const hasPattern = (get, i) => {
    for (let k = 0; k < 7; k++) if (get(i + k) !== PAT[k]) return false;
    const before = [i - 4, i - 3, i - 2, i - 1].every((j) => j < 0 || get(j) === false);
    const after = [i + 7, i + 8, i + 9, i + 10].every((j) => j >= size || get(j) === false);
    return before || after;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x <= size - 7; x++) {
    if (hasPattern((i) => (i >= 0 && i < size ? mod[y][i] : false), x)) p += 40;
  }
  for (let x = 0; x < size; x++) for (let y = 0; y <= size - 7; y++) {
    if (hasPattern((i) => (i >= 0 && i < size ? mod[i][x] : false), y)) p += 40;
  }
  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (mod[y][x]) dark++;
  const total = size * size;
  p += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
  return p;
}

/**
 * Encode un texte en matrice QR.
 * @returns {{size:number, mod:boolean[][], version:number, ecl:string}}
 */
export function encode(text, opt = {}) {
  const ecl = opt.ecl || 'M';
  const bytes = bytesOf(text);
  const ver = chooseVersion(bytes.length, ecl, opt.minVersion || 1, opt.maxVersion || 40);
  if (ver < 0) throw new Error('Texte trop long pour un QR code.');
  const cw = buildCodewords(bytes, ver, ecl);

  let best = null;
  for (let m = 0; m < 8; m++) {
    const { mod, fn, size } = makeMatrix(ver, ecl, cw);
    drawVersion(mod, fn, size, ver);
    drawFormat(mod, fn, size, ecl, m);
    applyMask(mod, fn, size, m);
    const p = penalty(mod, size);
    if (!best || p < best.p) best = { p, mod, size };
  }
  return { size: best.size, mod: best.mod, version: ver, ecl };
}

/**
 * Rend le QR en SVG (un seul chemin : leger et net a toute taille).
 * @param {string} text
 * @param {object} o { ecl, quiet:marge en modules, dark, light, px }
 */
export function svg(text, o = {}) {
  const { mod, size } = encode(text, o);
  const quiet = o.quiet ?? 4;
  const dim = size + quiet * 2;
  let d = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (mod[y][x]) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }
  }
  const dark = o.dark || 'var(--ink)';
  const light = o.light || 'var(--paper-hi)';
  /* Sans largeur demandee, on n'ecrit pas l'attribut : un `width=""` est
     invalide et le navigateur s'en plaint a chaque rendu. Le SVG prend alors
     la taille que lui donne son conteneur, ce qui est le comportement voulu. */
  const px = o.px ? ` width="${o.px}" height="${o.px}"` : '';
  return `<svg viewBox="0 0 ${dim} ${dim}"${px} shape-rendering="crispEdges"
    role="img" aria-label="Code QR de la fiche d'urgence" xmlns="http://www.w3.org/2000/svg">
    <rect width="${dim}" height="${dim}" fill="${light}"/>
    <path d="${d}" fill="${dark}"/></svg>`;
}

export const capacity = (ver, ecl) => dataCodewords(ver, ecl) - (ver <= 9 ? 2 : 3);
