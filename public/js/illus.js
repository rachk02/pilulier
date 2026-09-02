/* ============================================================================
   illus.js — les illustrations du projet.

   Meme principe que les icones et les visages : rien n'est importe, tout est
   trace. Les icones sont geometriques parce que ce sont des reperes ; les
   illustrations sont crayonnees parce qu'elles racontent quelque chose.
   Chacune a une graine fixe : elle est donc toujours identique a elle-meme.
   ========================================================================== */
import { dice, hashSeed, sketch, sketchArc, blob, hatch, line, poly, rect, circle, dot,
         capsuleShape, capsuleOutline, pen, penLoop, fan, arcPoints, corner, g, P,
         svgWrap } from './draw.js';

/* ==========================================================================
   LA MARQUE
   Un comprime pose au centre d'un cadre de coupe : l'objet du projet, dans le
   registre de la planche technique.
   ========================================================================== */
export function logoMark(o = {}) {
  const { size = 100, frame = true, w = 5 } = o;
  const k = size / 100;
  const d = dice(hashSeed('marque'));
  const C = size / 2;
  let s = '';

  if (frame) {                                   /* reperes de coupe, traces */
    const m = 9 * k, L = 17 * k, tw = Math.max(1.4, 3 * k);
    s += pen([[m + L, m], [m, m], [m, m + L]], d, { w: tw, amp: 0.5 * k, over: 1.2 * k });
    s += pen([[size - m - L, m], [size - m, m], [size - m, m + L]], d,
      { w: tw, amp: 0.5 * k, over: 1.2 * k });
    s += pen([[m, size - m - L], [m, size - m], [m + L, size - m]], d,
      { w: tw, amp: 0.5 * k, over: 1.2 * k });
    s += pen([[size - m - L, size - m], [size - m, size - m], [size - m, size - m - L]], d,
      { w: tw, amp: 0.5 * k, over: 1.2 * k });
  }

  /* La gelule : contour d'un geste, barre centrale, moitie ombree a
     l'eventail. C'est le dessin dont tout le reste decoule. */
  const len = 58 * k, dia = 27 * k, r = dia / 2;
  s += g(penLoop(capsuleOutline(C, C, len, dia, 13), d, { w: w * k, amp: 0.32 * k, over: 2.2 * k }) +
         pen([[C, C - r], [C, C + r]], d, { w: w * k * 0.82, amp: 0.4 * k, over: 0.6 * k }) +
         fan(C - 0.6 * k, C - r + 1.4 * k,
             arcPoints(C + len / 2 - r, C, r - 1.4 * k, -76, 76, 9), d,
             { w: Math.max(1, w * k * 0.34), amp: 0.4 * k, op: 0.95 }),
         `rotate(-45 ${C} ${C})`);

  return svgWrap(s, { size, box: `0 0 ${size} ${size}`, cls: o.cls || '',
                      label: o.label || 'Pilulier' });
}

/* ==========================================================================
   LE TAMPON « FAIT »
   Utilise en grand quand la journee est bouclee.
   ========================================================================== */
export function doneStamp(o = {}) {
  const d = dice(4242);
  const s = blob(50, 50, 38, 37, d, { steps: 22, warp: 0.05, w: 3, amp: 0.9 }) +
    sketch([[30, 51], [44, 65], [72, 33]], d, { w: 5, amp: 1.1 });
  return svgWrap(s, { size: 100, box: '0 0 100 100', cls: o.cls || '',
                      label: 'Journée complète' });
}

/* ==========================================================================
   LES ECRANS VIDES
   Une petite scene vaut mieux qu'une icone agrandie : elle dit ce qui manque.
   ========================================================================== */
const BOX = '0 0 120 82';

/** Un pilulier ouvert, et rien dedans. */
function sceneMeds() {
  const d = dice(1101);
  let s = '';
  /* Le bac, en perspective cavaliere. */
  s += sketch([[14, 30], [60, 16], [106, 30], [60, 46]], d, { w: 2, close: true, amp: .8 });
  s += sketch([[14, 30], [14, 56], [60, 72], [106, 56], [106, 30]], d, { w: 2, amp: .8 });
  s += sketch([[60, 46], [60, 72]], d, { w: 1.6, amp: .7, op: .8 });
  /* Quatre cases vides, dessinees en creux. */
  for (let i = 0; i < 4; i++) {
    const x = 30 + (i % 2) * 30, y = 27 + Math.floor(i / 2) * 11;
    s += sketch([[x, y], [x + 14, y - 4], [x + 28, y], [x + 14, y + 4]], d,
      { w: 1.2, close: true, amp: .6, op: .5 });
  }
  /* Un comprime tombe a cote : il en restait un. */
  s += g(circle(100, 68, 7, { w: 2 }) + line(93.5, 68, 106.5, 68, { w: 1.2 }), '');
  return svgWrap(s, { box: BOX, cls: 'illus' });
}

/** Deux plaques d'identite, dont une encore vierge. */
function sceneProfiles() {
  const d = dice(2202);
  let s = '';
  const plate = (x, blank) => {
    let p = sketch([[x, 16], [x + 40, 16], [x + 40, 66], [x, 66]], d,
      { w: 2, close: true, amp: .7, op: blank ? .55 : 1 });
    if (blank) {
      p += P(`M${x + 6} 26h28M${x + 6} 34h28M${x + 6} 42h18`,
        { w: 1.2, op: .45, dash: '3 4' });
      p += sketch([[x + 8, 54], [x + 32, 54]], d, { w: 1.2, amp: .5, op: .4 });
    } else {
      p += sketchArc(x + 20, 34, 9, 0, Math.PI * 2, d, { w: 1.8, steps: 16 });
      p += sketchArc(x + 20, 60, 15, Math.PI, Math.PI * 2, d, { w: 1.8, ry: 12 });
    }
    return p;
  };
  s += plate(14, false) + plate(66, true);
  return svgWrap(s, { box: BOX, cls: 'illus' });
}

/** Un cadre de mesure, et une ligne plate. */
function sceneMeasures() {
  const d = dice(3303);
  let s = sketch([[16, 12], [16, 66], [106, 66]], d, { w: 2, amp: .8 });
  for (let i = 0; i < 5; i++) s += sketch([[28 + i * 18, 66], [28 + i * 18, 70]], d,
    { w: 1.2, amp: .4, passes: 1, op: .6 });
  s += P('M20 44h82', { w: 1.4, op: .45, dash: '4 5' });
  s += circle(62, 44, 3.4, { w: 2 });
  return svgWrap(s, { box: BOX, cls: 'illus' });
}

/** Une page de calendrier sans rien dessus. */
function sceneDay() {
  const d = dice(4404);
  let s = sketch([[22, 14], [98, 14], [98, 70], [22, 70]], d, { w: 2, close: true, amp: .8 });
  s += sketch([[22, 28], [98, 28]], d, { w: 1.6, amp: .6 });
  s += sketch([[36, 8], [36, 20]], d, { w: 2, amp: .6 });
  s += sketch([[84, 8], [84, 20]], d, { w: 2, amp: .6 });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
    s += dot(33 + c * 14.5, 38 + r * 11, 1.1, { op: .3 });
  }
  s += sketch([[50, 49], [70, 49]], d, { w: 2.4, amp: .7 });
  return svgWrap(s, { box: BOX, cls: 'illus' });
}

/** Une boite de medicament vide, couchee. */
function sceneStock() {
  const d = dice(5505);
  let s = sketch([[26, 34], [60, 22], [94, 34], [60, 46]], d, { w: 2, close: true, amp: .8 });
  s += sketch([[26, 34], [26, 58], [60, 70], [94, 58], [94, 34]], d, { w: 2, amp: .8 });
  s += hatch(30, 40, 26, 22, d, { step: 5, w: 1, op: .3, slant: .4 });
  return svgWrap(s, { box: BOX, cls: 'illus' });
}

const SCENES = { meds: sceneMeds, profiles: sceneProfiles, measures: sceneMeasures,
                 day: sceneDay, stock: sceneStock };

/** Passerelle : les anciens noms d'icones amenent a la bonne scene. */
const ALIAS = { pill: 'meds', capsule: 'meds', box: 'stock', users: 'profiles',
                user: 'profiles', chart: 'measures', today: 'day', calendar: 'day' };

/** Illustration d'ecran vide. Renvoie null si aucune scene ne correspond. */
export function emptyIllus(kind) {
  const key = SCENES[kind] ? kind : ALIAS[kind];
  return key && SCENES[key] ? SCENES[key]() : null;
}
export const SCENE_NAMES = Object.keys(SCENES);

/* ==========================================================================
   LE SCHEMA ISOMETRIQUE — « sous le capot », en volumes
   --------------------------------------------------------------------------
   Un plan d'architecture ne se lit pas comme une liste de fichiers. Chaque
   module devient un bloc pose sur une grille isometrique : sa hauteur dit son
   poids en lignes de code, sa hachure dit sa nature (donnee, dessin, sortie,
   reseau), et les traits qui les relient disent qui appelle qui.

   Tout est calcule ici : aucune coordonnee n'est ecrite a la main, donc
   deplacer un bloc dans PLAN suffit a redessiner le schema. La projection est
   la classique 2:1 — deux de large pour un de haut — celle des vieux plans
   d'atelier, qui se lit sans perspective et se mesure a la regle.
   ========================================================================== */

const ISO_W = 27;                   /* demi-largeur d'une case au sol */
const ISO_H = 13.5;                 /* demi-hauteur : projection 2:1  */

/** Repere de la grille -> repere de l'ecran. */
const iso = (gx, gy, gz = 0) => [
  (gx - gy) * ISO_W,
  (gx + gy) * ISO_H - gz,
];

/**
 * Hachure diagonale d'un parallelogramme A-B-C-D.
 * On parametre la face par A + u·(B−A) + v·(D−A) ; une diagonale est alors la
 * droite u − v = c. Ses deux bouts se calculent exactement, donc la hachure
 * s'arrete pile au bord de la face — pas de masque, pas de debordement.
 */
function hachureFace(d, A, B, D, o = {}) {
  const { step = 0.16, w = 0.8, op = 0.5 } = o;
  const P2 = (u, v) => [A[0] + u * (B[0] - A[0]) + v * (D[0] - A[0]),
                        A[1] + u * (B[1] - A[1]) + v * (D[1] - A[1])];
  let out = '';
  for (let c = -1 + step; c < 1; c += step) {
    const p1 = c >= 0 ? P2(c, 0) : P2(0, -c);
    const p2 = c >= 0 ? P2(1, 1 - c) : P2(1 + c, 1);
    out += sketch([p1, p2], d, { w, amp: 0.3, passes: 1, op });
  }
  return out;
}

/**
 * Un bloc : une boite posee sur la grille, dessinee a la main.
 * On ne trace que les trois faces visibles — dessus, gauche, droite — et on
 * hachure les deux flancs, jamais le dessus : c'est ce qui donne la lumiere.
 * Le flanc droit est plus dense que le gauche, comme sur un plan d'atelier.
 */
function isoBlock(d, o = {}) {
  const { gx = 0, gy = 0, w = 1, h = 1, z = 18, tone = 'plein' } = o;
  const T = [iso(gx, gy, z), iso(gx + w, gy, z), iso(gx + w, gy + h, z), iso(gx, gy + h, z)];
  const bl = iso(gx, gy + h, 0), br = iso(gx + w, gy + h, 0), bb = iso(gx + w, gy, 0);
  let out = '';

  /* Le fond du bloc : un aplat de papier, pour qu'il masque ce qui est
     derriere lui. Sans lui, les traits du fond traversent les volumes. */
  const silhouette = [T[0], T[1], bb, br, bl, T[3]]
    .map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');
  out += `<polygon points="${silhouette}" fill="var(--paper-hi)"/>`;

  const dens = tone === 'vide' ? null : tone === 'dense' ? 0.12 : 0.2;
  if (dens) {
    out += hachureFace(d, T[3], T[2], bl, { step: dens, op: 0.42 });      /* gauche */
    out += hachureFace(d, T[1], T[2], bb, { step: dens * 0.8, op: 0.6 }); /* droit  */
  }
  out += penLoop([T[3], T[2], br, bl], d, { w: 1.5, amp: 0.4, over: 0.8 });
  out += penLoop([T[1], T[2], br, bb], d, { w: 1.5, amp: 0.4, over: 0.8 });
  out += penLoop(T, d, { w: 1.9, amp: 0.42, over: 1.1 });
  return out;
}

/** L'etiquette d'un bloc, posee au centre de sa face du dessus. */
function isoLabel(o) {
  const { gx, gy, w = 1, h = 1, z = 18, label = '' } = o;
  if (!label) return '';
  const c = iso(gx + w / 2, gy + h / 2, z);
  const x = c[0].toFixed(1), y = (c[1] + 3.6).toFixed(1);
  /* Un liserE de papier sous le texte : l'etiquette reste lisible meme
     posee sur une hachure. */
  return `<text x="${x}" y="${y}" text-anchor="middle" font-size="10.5"
    font-family="var(--font)" font-weight="700" stroke="var(--paper-hi)"
    stroke-width="3.5" stroke-linejoin="round" paint-order="stroke"
    fill="currentColor">${label}</text>`;
}

/** Un trait de liaison : il court au sol, avec un losange a la jonction. */
function isoLink(d, a, b, o = {}) {
  const p1 = iso(a[0], a[1], a[2] ?? 0), p2 = iso(b[0], b[1], b[2] ?? 0);
  const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  let s = sketch([p1, p2], d, { w: o.w ?? 1.1, amp: 0.35, passes: 1, op: o.op ?? 0.85 });
  if (o.node !== false) {
    s += penLoop([[mid[0], mid[1] - 3], [mid[0] + 3, mid[1]],
                  [mid[0], mid[1] + 3], [mid[0] - 3, mid[1]]], d,
      { w: 1.1, amp: 0.2, over: 0.3, passes: 1 });
  }
  return s;
}

/*
 * Le plan. Chaque entree : position sur la grille, emprise, hauteur (elle
 * suit le poids du module en lignes de code), densite de hachure, etiquette.
 * Deplacer un bloc ici suffit : le dessin se recalcule entierement.
 */
const PLAN = [
  /* la couche des donnees, au fond a gauche */
  { gx: 0,    gy: 0,   w: 2.4, h: 1.7, z: 52, label: 'DB',       tone: 'dense' },
  { gx: 0,    gy: 2.2, w: 2.4, h: 1.7, z: 38, label: 'STORE',    tone: 'dense' },
  { gx: 0,    gy: 4.4, w: 2.4, h: 1.7, z: 22, label: 'SCHÉMA',   tone: 'plein' },
  /* le coeur */
  { gx: 3.4,  gy: 1.1, w: 2.6, h: 2.6, z: 64, label: 'APP',      tone: 'dense' },
  { gx: 3.4,  gy: 4.4, w: 2.6, h: 1.7, z: 42, label: 'VUES',     tone: 'plein' },
  /* ce qui rappelle */
  { gx: 6.9,  gy: 0,   w: 2,   h: 1.5, z: 30, label: 'ALARME',   tone: 'plein' },
  { gx: 6.9,  gy: 2,   w: 2,   h: 1.5, z: 20, label: 'VOIX',     tone: 'vide'  },
  { gx: 6.9,  gy: 4,   w: 2,   h: 1.5, z: 16, label: 'SON',      tone: 'vide'  },
  /* ce qui dessine */
  { gx: 0,    gy: 6.8, w: 2.4, h: 1.6, z: 46, label: 'DESSIN',   tone: 'dense' },
  /* ce qui sort */
  { gx: 3.4,  gy: 6.8, w: 1.7, h: 1.6, z: 24, label: 'ICS',      tone: 'plein' },
  { gx: 5.5,  gy: 6.8, w: 1.7, h: 1.6, z: 32, label: 'BULLETIN', tone: 'plein' },
  { gx: 7.6,  gy: 6.8, w: 1.7, h: 1.6, z: 40, label: 'QR',       tone: 'dense' },
  /* la boite et le reseau, a droite */
  { gx: 9.8,  gy: 1.2, w: 2,   h: 1.5, z: 28, label: 'BOÎTE',    tone: 'plein' },
  { gx: 9.8,  gy: 3.4, w: 2,   h: 1.5, z: 22, label: 'SYNC',     tone: 'vide'  },
];

const LIENS = [
  [[2.4, 0.9], [3.4, 1.8]], [[2.4, 3.1], [3.4, 2.6]], [[2.4, 5.3], [3.4, 3.4]],
  [[6, 2.1], [6.9, 0.8]], [[6, 2.5], [6.9, 2.8]], [[6, 2.9], [6.9, 4.8]],
  [[4.4, 6.1], [4.2, 6.8]], [[4.8, 6.1], [6.3, 6.8]], [[5.2, 6.1], [8.4, 6.8]],
  [[3.4, 5.6], [2.4, 7.4]],
  [[6, 1.6], [9.8, 1.9]], [[6, 3.5], [9.8, 4.1]],
];

/**
 * Le schema complet. `size` fixe la largeur ; la hauteur suit.
 * Il est trace avec une graine fixe : deux ouvertures de la documentation
 * donnent exactement le meme dessin.
 */
export function archDiagram(o = {}) {
  const { size = 720, cls = '' } = o;
  const d = dice(hashSeed('schema:architecture'));

  /* La grille au sol, d'abord : elle situe les blocs sans les enfermer. */
  let sol = '';
  for (let i = -1; i <= 13; i++) {
    sol += sketch([iso(i, -1), iso(i, 9)], d, { w: 0.5, amp: 0.25, passes: 1, op: 0.3 });
  }
  for (let j = -1; j <= 9; j++) {
    sol += sketch([iso(-1, j), iso(13, j)], d, { w: 0.5, amp: 0.25, passes: 1, op: 0.3 });
  }

  let liens = '';
  for (const [a, b] of LIENS) liens += isoLink(d, a, b);

  /* Du fond vers l'avant : un bloc proche doit couvrir un bloc lointain. */
  const ordre = [...PLAN].sort((x, y) => (x.gx + x.gy) - (y.gx + y.gy));
  let blocs = '';
  for (const b of ordre) blocs += isoBlock(d, b);
  /* Les etiquettes passent en dernier, toutes ensemble : sinon un bloc du
     premier plan vient couper le nom d'un bloc du fond. */
  let noms = '';
  for (const b of ordre) noms += isoLabel(b);

  /* La boite englobante est calculee sur la grille, pas devinee. */
  const coins = [[-1, -1], [13, -1], [-1, 9], [13, 9]].map(([a, b]) => iso(a, b));
  const x0 = Math.min(...coins.map((c) => c[0])) - 14;
  const x1 = Math.max(...coins.map((c) => c[0])) + 14;
  const zMax = Math.max(...PLAN.map((b) => b.z));
  const y0 = Math.min(...coins.map((c) => c[1])) - zMax - 20;
  const y1 = Math.max(...coins.map((c) => c[1])) + 20;
  const box = `${x0.toFixed(1)} ${y0.toFixed(1)} ${(x1 - x0).toFixed(1)} ${(y1 - y0).toFixed(1)}`;
  /* `g()` ne pose qu'un transform : pour l'opacite, on ecrit le groupe. */
  const grp = (inner, op) => `<g opacity="${op}">${inner}</g>`;
  return svgWrap(grp(sol, 0.5) + grp(liens, 0.75) + blocs + noms, { size, cls, box });
}

/** Un bloc temoin, pour la legende du plan : le meme generateur, en petit. */
export function archKey(tone = 'plein', size = 34) {
  const d = dice(hashSeed('cle:' + tone));
  const inner = isoBlock(d, { gx: 0, gy: 0, w: 1.2, h: 1.2, z: 16, tone });
  return svgWrap(inner, { size, box: '-40 -34 80 62' });
}
