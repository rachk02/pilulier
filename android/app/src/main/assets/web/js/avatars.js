/* ============================================================================
   avatars.js — les visages sont dessines par le code.

   Aucune image, aucun jeu d'illustrations fige : chaque profil recoit un
   portrait griffonne, genere trait par trait a partir d'une graine. La meme
   graine redonne toujours exactement le meme visage ; une graine voisine donne
   quelqu'un d'autre. C'est ce qui permet la planche de contact du formulaire :
   on tire une serie de tetes et on choisit celle qui ressemble le plus.

   Le trait est volontairement tremble — deux passes legerement decalees, des
   depassements aux angles — pour rester dans le registre « crayon sur papier »
   du reste de l'application.
   ========================================================================== */

import { dice, hashSeed, sketch, sketchArc, blob, hatch, P } from './draw.js';

/* Couleurs de classement (petite pastille d'angle, seule couleur du portrait) */
export const BG = ['#1e1c14', '#8f3122', '#3d6630', '#8a6218', '#2f5068',
                   '#5d4a7a', '#7a4a2e', '#4a6b6f', '#6d6750', '#7d3b52'];
export const SKINS = BG;
export const HAIRS = BG;

const INK = 'var(--ink)';
const PAPER = 'var(--paper-lo)';

/* Les primitives de trait sont communes a tout le projet : voir draw.js. */
const S = (d, w = 3) => P(d, { w });

/* Visage de base : ovale + yeux + bouche, tous crayonnes. */
const stroke = sketch;
const arc = sketchArc;

/* =========================================================================
   CATALOGUES — chaque entree dessine un morceau de visage
   ========================================================================= */

const HEADS = {
  ronde:   (d) => ({ rx: d.f(27, 30), ry: d.f(28, 31), warp: .05 }),
  ovale:   (d) => ({ rx: d.f(24, 27), ry: d.f(30, 34), warp: .05 }),
  poire:   (d) => ({ rx: d.f(25, 28), ry: d.f(29, 32), warp: .12 }),
  carree:  (d) => ({ rx: d.f(28, 31), ry: d.f(27, 30), warp: .13 }),
  longue:  (d) => ({ rx: d.f(22, 25), ry: d.f(32, 35), warp: .06 }),
};

const EYES = {
  points: (x, y, s, d) => stroke([[x, y - 1], [x, y + 1]], d, { w: 3.2, amp: .3, passes: 1 }),
  ronds:  (x, y, s, d) => blob(x, y, 2.6 * s, 2.6 * s, d, { steps: 12, w: 1.6, amp: .35, warp: .1 })
                        + stroke([[x, y], [x + .4, y]], d, { w: 2.4, amp: .2, passes: 1 }),
  grands: (x, y, s, d) => blob(x, y, 3.6 * s, 3.9 * s, d, { steps: 14, w: 1.7, amp: .35, warp: .08 })
                        + blob(x + d.f(-.8, .8), y + .6, 1.5, 1.5, d, { steps: 8, w: 2.6, amp: .2 }),
  fermes: (x, y, s, d) => arc(x, y, 3.2 * s, Math.PI, Math.PI * 2, d, { w: 1.7, ry: 2.2 * s }),
  plisses:(x, y, s, d) => stroke([[x - 3.2 * s, y + 1], [x, y - 1], [x + 3.2 * s, y + 1]], d, { w: 1.8 }),
  ovales: (x, y, s, d) => blob(x, y, 2.2 * s, 3.4 * s, d, { steps: 12, w: 1.6, amp: .3, warp: .06 })
                        + stroke([[x, y + .4], [x + .3, y + .4]], d, { w: 2.6, amp: .2, passes: 1 }),
};

const BROWS = {
  droits:  (x, y, s, dir, d) => stroke([[x - 4 * s, y], [x + 4 * s, y + d.f(-.6, .6)]], d, { w: 1.8 }),
  leves:   (x, y, s, dir, d) => arc(x, y + 2, 4.2 * s, Math.PI, Math.PI * 2, d, { w: 1.8, ry: 2.4 }),
  fronces: (x, y, s, dir, d) => stroke([[x - 4 * s, y - 1.4 * dir], [x + 4 * s, y + 1.4 * dir]], d, { w: 1.9 }),
  /* Un sourcil epais : un trait gras, plus quelques poils qui depassent. */
  broussailleux: (x, y, s, dir, d) => {
    let out = stroke([[x - 4.4 * s, y + .5], [x, y - .7], [x + 4.4 * s, y + .3]], d, { w: 3.4, amp: .4 });
    for (let i = 0; i < 4; i++) {
      const px = x + d.f(-4 * s, 4 * s);
      out += stroke([[px, y - .6], [px + d.f(-1.2, 1.2), y - d.f(2, 3.4)]], d,
        { w: 1.1, passes: 1, op: .8 });
    }
    return out;
  },
  aucun:   () => '',
};

const NOSES = {
  trait:    (x, y, d) => stroke([[x - .6, y - 4], [x - 1.4, y + 2], [x + 1.8, y + 2.4]], d, { w: 1.7 }),
  crochet:  (x, y, d) => stroke([[x, y - 5], [x + 2.4, y + 1], [x - 1.6, y + 2.6]], d, { w: 1.8 }),
  bouton:   (x, y, d) => blob(x, y + 1, 2.2, 1.8, d, { steps: 10, w: 1.6, amp: .3 }),
  large:    (x, y, d) => arc(x, y - 1, 3.4, 0.15, Math.PI - 0.15, d, { w: 1.8, ry: 3 })
                       + stroke([[x - 3.2, y + 1.4], [x + 3.2, y + 1.4]], d, { w: 1.4, passes: 1 }),
  triangle: (x, y, d) => stroke([[x, y - 4.5], [x - 2.6, y + 2.2], [x + 2.6, y + 2.2]], d, { w: 1.6, close: true }),
};

const MOUTHS = {
  sourire:   (x, y, d) => arc(x, y - 2, 6.5, .35, Math.PI - .35, d, { w: 1.9, ry: 5 }),
  grandSourire: (x, y, d) => arc(x, y - 3, 8, .3, Math.PI - .3, d, { w: 2, ry: 6.5 })
                            + stroke([[x - 7, y - .4], [x + 7, y - .4]], d, { w: 1.4, passes: 1 }),
  droite:    (x, y, d) => stroke([[x - 5.5, y], [x + 5.5, y + d.f(-.8, .8)]], d, { w: 1.9 }),
  ondulee:   (x, y, d) => stroke([[x - 6, y], [x - 2, y - 1.6], [x + 2, y + 1.4], [x + 6, y - .6]], d, { w: 1.8 }),
  ouverte:   (x, y, d) => blob(x, y + .5, 3.6, 3, d, { steps: 12, w: 1.8, amp: .4, warp: .1 }),
  moue:      (x, y, d) => arc(x, y + 5, 6, Math.PI + .35, Math.PI * 2 - .35, d, { w: 1.9, ry: 4.6 }),
  petite:    (x, y, d) => stroke([[x - 2.4, y], [x + 2.4, y + .4]], d, { w: 2.2 }),
};

const HAIRS_DRAW = {
  chauve: () => '',
  couronne: (hd, d) => {                       /* calvitie : cheveux sur les cotes */
    const { cx, cy, rx, ry } = hd;
    return arc(cx, cy - ry * .18, rx * 1.02, Math.PI + .25, Math.PI + 1.05, d, { w: 2.2, ry: ry * .95 })
         + arc(cx, cy - ry * .18, rx * 1.02, Math.PI * 2 - 1.05, Math.PI * 2 - .25, d, { w: 2.2, ry: ry * .95 });
  },
  /* Cheveux ras : une pluie de petits traits qui suivent la calotte. */
  ras: (hd, d) => {
    let out = '';
    const n = d.i(16, 22);
    for (let i = 0; i <= n; i++) {
      const t = Math.PI + (i / n) * Math.PI;
      const x = hd.cx + Math.cos(t) * hd.rx * .93;
      const y = hd.cy + Math.sin(t) * hd.ry * .93;
      out += stroke([[x, y], [x + Math.cos(t) * 2.2, y + Math.sin(t) * 2.8]], d,
        { w: 1.2, passes: 1, op: .85 });
      if (d.chance(.5)) {
        const rr = d.f(.55, .8);
        out += stroke([[hd.cx + Math.cos(t) * hd.rx * rr, hd.cy + Math.sin(t) * hd.ry * rr],
                       [hd.cx + Math.cos(t) * hd.rx * rr, hd.cy + Math.sin(t) * hd.ry * rr - 1.6]], d,
          { w: 1, passes: 1, op: .55 });
      }
    }
    return out;
  },
  brosse: (hd, d) => {
    let s = '';
    const n = d.i(9, 14);
    for (let i = 0; i <= n; i++) {
      const t = Math.PI + (i / n) * Math.PI;
      const x = hd.cx + Math.cos(t) * hd.rx * .92;
      const y = hd.cy + Math.sin(t) * hd.ry * .95;
      const L = d.f(4, 8);
      s += stroke([[x, y], [x + Math.cos(t) * L * .5, y + Math.sin(t) * L]], d, { w: 1.7, passes: 1 });
    }
    return s;
  },
  frange: (hd, d) => arc(hd.cx, hd.cy - hd.ry * .30, hd.rx * .98, Math.PI + .1, Math.PI * 2 - .1, d,
            { w: 2.3, ry: hd.ry * .78 })
          + stroke([[hd.cx - hd.rx * .9, hd.cy - hd.ry * .28],
                    [hd.cx - hd.rx * .2, hd.cy - hd.ry * .52],
                    [hd.cx + hd.rx * .5, hd.cy - hd.ry * .30]], d, { w: 2 }),
  raie: (hd, d) => arc(hd.cx, hd.cy - hd.ry * .32, hd.rx * .98, Math.PI, Math.PI * 2, d,
            { w: 2.3, ry: hd.ry * .8 })
          + stroke([[hd.cx - hd.rx * .55, hd.cy - hd.ry * .92],
                    [hd.cx + hd.rx * .1, hd.cy - hd.ry * .55],
                    [hd.cx + hd.rx * .85, hd.cy - hd.ry * .35]], d, { w: 1.9 }),
  boucles: (hd, d) => {
    let s = '';
    const n = d.i(7, 10);
    for (let i = 0; i <= n; i++) {
      const t = Math.PI + (i / n) * Math.PI;
      const r = d.f(4.5, 7);
      s += blob(hd.cx + Math.cos(t) * hd.rx * .92, hd.cy + Math.sin(t) * hd.ry * .92,
                r, r * .9, d, { steps: 9, w: 1.7, amp: .5, warp: .16 });
    }
    return s;
  },
  longs: (hd, d) => arc(hd.cx, hd.cy - hd.ry * .3, hd.rx, Math.PI, Math.PI * 2, d, { w: 2.3, ry: hd.ry * .8 })
        + stroke([[hd.cx - hd.rx * 1.02, hd.cy - hd.ry * .35], [hd.cx - hd.rx * 1.12, hd.cy + hd.ry * .75]], d, { w: 2 })
        + stroke([[hd.cx + hd.rx * 1.02, hd.cy - hd.ry * .35], [hd.cx + hd.rx * 1.12, hd.cy + hd.ry * .75]], d, { w: 2 }),
  chignon: (hd, d) => arc(hd.cx, hd.cy - hd.ry * .3, hd.rx, Math.PI, Math.PI * 2, d, { w: 2.3, ry: hd.ry * .8 })
        + blob(hd.cx + d.f(-3, 3), hd.cy - hd.ry - 6, d.f(6, 8), d.f(5.5, 7), d, { steps: 12, w: 2, warp: .12 }),
  epi: (hd, d) => arc(hd.cx, hd.cy - hd.ry * .28, hd.rx * .95, Math.PI + .15, Math.PI * 2 - .15, d,
            { w: 2.2, ry: hd.ry * .8 })
        + stroke([[hd.cx + hd.rx * .3, hd.cy - hd.ry * .95], [hd.cx + hd.rx * .75, hd.cy - hd.ry * 1.35],
                  [hd.cx + hd.rx * .95, hd.cy - hd.ry * .85]], d, { w: 1.9 }),
};

const BEARDS = {
  aucune: () => '',
  bouc: (hd, d) => blob(hd.cx, hd.cy + hd.ry * .62, 4.5, 5.5, d, { steps: 11, w: 1.7, amp: .5, warp: .15 }),
  moustache: (hd, d) => arc(hd.cx, hd.cy + hd.ry * .16, 7, Math.PI + .3, Math.PI * 2 - .3, d,
              { w: 2.4, ry: 3.4 }),
  pleine: (hd, d) => arc(hd.cx, hd.cy + hd.ry * .05, hd.rx * .95, .12, Math.PI - .12, d,
              { w: 2.2, ry: hd.ry * .92 })
          + hatch(hd.cx - hd.rx * .8, hd.cy + hd.ry * .30, hd.rx * 1.6, hd.ry * .55, d,
              { step: 2.8, w: 1, op: .6, slant: .2 }),
  barbe3j: (hd, d) => hatch(hd.cx - hd.rx * .62, hd.cy + hd.ry * .30, hd.rx * 1.25, hd.ry * .40, d,
              { step: 2.6, w: .85, op: .40, slant: .08, jitter: .6 }),
};

const GLASSES = {
  aucune: () => '',
  rondes: (lx, rx, y, d) => blob(lx, y, 6, 5.6, d, { steps: 14, w: 1.8, amp: .3, warp: .05 })
        + blob(rx, y, 6, 5.6, d, { steps: 14, w: 1.8, amp: .3, warp: .05 })
        + stroke([[lx + 6, y], [rx - 6, y]], d, { w: 1.5, passes: 1 }),
  carrees: (lx, rx, y, d) => stroke([[lx - 6, y - 4.6], [lx + 6, y - 4.6], [lx + 6, y + 4.6],
                                     [lx - 6, y + 4.6]], d, { w: 1.8, close: true })
        + stroke([[rx - 6, y - 4.6], [rx + 6, y - 4.6], [rx + 6, y + 4.6], [rx - 6, y + 4.6]], d,
                 { w: 1.8, close: true })
        + stroke([[lx + 6, y], [rx - 6, y]], d, { w: 1.5, passes: 1 }),
  demi: (lx, rx, y, d) => stroke([[lx - 6, y - 3], [lx + 6, y - 3]], d, { w: 1.8 })
        + stroke([[rx - 6, y - 3], [rx + 6, y - 3]], d, { w: 1.8 })
        + arc(lx, y - 3, 6, 0, Math.PI, d, { w: 1.5, ry: 4.2 })
        + arc(rx, y - 3, 6, 0, Math.PI, d, { w: 1.5, ry: 4.2 })
        + stroke([[lx + 6, y - 3], [rx - 6, y - 3]], d, { w: 1.4, passes: 1 }),
};

/* Petits accessoires : ce qui donne le sentiment que chaque tete est quelqu'un. */
const EXTRAS = {
  aucun: () => '',
  taches: (hd, d) => {
    let s = '';
    for (let i = 0; i < d.i(4, 8); i++) {
      const x = hd.cx + d.f(-hd.rx * .8, hd.rx * .8);
      const y = hd.cy + d.f(-2, hd.ry * .45);
      s += stroke([[x, y], [x + .5, y]], d, { w: 1.4, passes: 1, op: .7 });
    }
    return s;
  },
  rides: (hd, d) => arc(hd.cx, hd.cy - hd.ry * .48, hd.rx * .5, .25, Math.PI - .25, d,
            { w: 1.2, ry: 2, passes: 1 })
        + arc(hd.cx, hd.cy - hd.ry * .34, hd.rx * .42, .25, Math.PI - .25, d,
            { w: 1.2, ry: 2, passes: 1 }),
  boucleOreille: (hd, d) => blob(hd.cx - hd.rx - 1, hd.cy + 5, 1.8, 1.8, d, { steps: 8, w: 1.6 }),
  bonnet: (hd, d) => arc(hd.cx, hd.cy - hd.ry * .34, hd.rx * 1.06, Math.PI, Math.PI * 2, d,
            { w: 2.4, ry: hd.ry * .82 })
        + stroke([[hd.cx - hd.rx * 1.04, hd.cy - hd.ry * .30], [hd.cx + hd.rx * 1.04, hd.cy - hd.ry * .30]], d,
            { w: 2.6 })
        /* Cotes du bonnet : quelques verticales seulement, sinon la tete noircit. */
        + Array.from({ length: 5 }, (_, i) => {
            const x = hd.cx + (i - 2) * hd.rx * .38;
            const h = hd.ry * (.52 - Math.abs(i - 2) * .10);
            return stroke([[x, hd.cy - hd.ry * .34 - h], [x, hd.cy - hd.ry * .34]], d,
              { w: 1.1, passes: 1, op: .55 });
          }).join(''),
  foulard: (hd, d) => arc(hd.cx, hd.cy - hd.ry * .22, hd.rx * 1.05, Math.PI, Math.PI * 2, d,
            { w: 2.4, ry: hd.ry * .92 })
        + stroke([[hd.cx - hd.rx * 1.02, hd.cy - hd.ry * .18], [hd.cx - hd.rx * 1.25, hd.cy + hd.ry * .32],
                  [hd.cx - hd.rx * .78, hd.cy + hd.ry * .12]], d, { w: 2 }),
};

/* ========================================================================= */

/**
 * Dessine un visage complet.
 * @param {number} seed  graine
 * @param {object} bias  { sex:'M'|'F', age:number } — infléchit les tirages
 */
export function faceSVG(seed, bias = {}) {
  const d = dice(seed);
  const male = bias.sex === 'M', female = bias.sex === 'F';
  const old = (bias.age || 0) >= 58;
  const young = (bias.age || 99) <= 16;

  /* --- tete --- */
  const shape = d.pick(Object.keys(HEADS));
  const g = HEADS[shape](d);
  const hd = { cx: 50 + d.f(-1, 1), cy: 53 + d.f(-1.5, 1.5), rx: g.rx, ry: g.ry };
  let s = blob(hd.cx, hd.cy, hd.rx, hd.ry, d, { warp: g.warp, w: 2.4, amp: .55 });

  /* --- oreilles --- */
  const earY = hd.cy + d.f(-1, 3);
  s += arc(hd.cx - hd.rx, earY, 4, Math.PI * .55, Math.PI * 1.45, d, { w: 1.8, ry: 5 });
  s += arc(hd.cx + hd.rx, earY, 4, Math.PI * 1.55, Math.PI * 2.45, d, { w: 1.8, ry: 5 });

  /* --- implantation --- */
  const hairKey = d.weigh(old && male
    ? [['couronne', 4], ['chauve', 3], ['ras', 3], ['brosse', 2], ['raie', 2]]
    : male
      ? [['brosse', 3], ['ras', 3], ['raie', 3], ['epi', 2], ['frange', 2], ['boucles', 2], ['chauve', 1]]
      : female
        ? [['longs', 4], ['chignon', 3], ['boucles', 3], ['frange', 3], ['raie', 2]]
        : [['brosse', 2], ['ras', 2], ['raie', 2], ['frange', 2], ['boucles', 2], ['longs', 2],
           ['chignon', 1], ['epi', 1], ['couronne', 1], ['chauve', 1]]);
  s += HAIRS_DRAW[hairKey](hd, d);

  /* --- yeux --- */
  const eyeY = hd.cy - hd.ry * .12;
  const eyeDx = hd.rx * .42;
  const eyeKey = d.pick(Object.keys(EYES));
  const es = d.f(.85, 1.15);
  s += EYES[eyeKey](hd.cx - eyeDx, eyeY, es, d);
  /* une legere asymetrie : le second oeil n'est jamais la copie du premier */
  s += EYES[d.chance(.22) ? d.pick(Object.keys(EYES)) : eyeKey](hd.cx + eyeDx, eyeY + d.f(-.8, .8), es, d);

  /* --- sourcils --- */
  const browKey = d.weigh(old ? [['broussailleux', 4], ['droits', 2], ['fronces', 2], ['leves', 1]]
                              : [['droits', 3], ['leves', 3], ['fronces', 2], ['broussailleux', 1], ['aucun', 1]]);
  const browY = eyeY - hd.ry * .22;
  s += BROWS[browKey](hd.cx - eyeDx, browY, es, 1, d);
  s += BROWS[browKey](hd.cx + eyeDx, browY + d.f(-.7, .7), es, -1, d);

  /* --- nez et bouche --- */
  s += NOSES[d.pick(Object.keys(NOSES))](hd.cx + d.f(-1, 1), hd.cy + hd.ry * .12, d);
  const mouthKey = d.weigh(young ? [['grandSourire', 4], ['sourire', 4], ['ouverte', 2], ['petite', 1]]
                                 : [['sourire', 4], ['droite', 3], ['ondulee', 2], ['grandSourire', 2],
                                    ['petite', 2], ['moue', 1], ['ouverte', 1]]);
  s += MOUTHS[mouthKey](hd.cx + d.f(-1, 1), hd.cy + hd.ry * .48, d);

  /* --- pilosite --- */
  const beardKey = d.weigh(male
    ? (old ? [['aucune', 3], ['moustache', 3], ['pleine', 3], ['barbe3j', 2], ['bouc', 1]]
           : [['aucune', 5], ['barbe3j', 2], ['bouc', 2], ['moustache', 1], ['pleine', 1]])
    : female ? [['aucune', 1]]
             : [['aucune', 6], ['barbe3j', 1], ['moustache', 1], ['bouc', 1]]);
  s += BEARDS[beardKey](hd, d);

  /* --- lunettes --- */
  const glassKey = d.weigh(old ? [['rondes', 3], ['carrees', 3], ['demi', 2], ['aucune', 3]]
                               : [['aucune', 6], ['rondes', 2], ['carrees', 2]]);
  s += GLASSES[glassKey](hd.cx - eyeDx, hd.cx + eyeDx, eyeY, d);

  /* --- accessoire --- */
  const extraKey = d.weigh([['aucun', 8], ['taches', 3], ['rides', old ? 4 : 0],
                            ['boucleOreille', female ? 2 : 1], ['bonnet', 1], ['foulard', female ? 2 : 0]]);
  s += EXTRAS[extraKey](hd, d);

  /* --- cou et epaules : le portrait est pose, pas flottant --- */
  s += stroke([[hd.cx - 6, hd.cy + hd.ry * .95], [hd.cx - 7, 92]], d, { w: 2 });
  s += stroke([[hd.cx + 6, hd.cy + hd.ry * .95], [hd.cx + 7, 92]], d, { w: 2 });
  s += stroke([[10, 100], [16, 93], [hd.cx - 7, 91], [hd.cx + 7, 91], [84, 93], [90, 100]], d,
    { w: 2.2, amp: .8 });

  return s;
}

/* ============================================================ RENDU PUBLIC */
export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const tag = (color) => color ? `<rect x="82" y="0" width="18" height="7" fill="${color}"/>` : '';
const age = (birthdate) => {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  if (isNaN(b)) return null;
  return Math.floor((Date.now() - b.getTime()) / 31557600000);
};

/** Graine effective d'un profil (retro-compatible avec les anciens avatars). */
export function seedOf(p = {}) {
  if (p.avatar_kind === 'doodle' && p.avatar_value != null && p.avatar_value !== '') {
    return Number(p.avatar_value) >>> 0;
  }
  return hashSeed((p.avatar_value || '') + '|' + (p.name || 'x'));
}

/** Rend l'avatar d'un profil : photo, initiales, ou visage genere. */
export function avatarMarkup(p = {}) {
  const kind = p.avatar_kind || 'doodle';
  if (kind === 'photo' && p.avatar_value) {
    return `<img src="${p.avatar_value}" alt="" loading="lazy">`;
  }
  const label = String(p.name || '').replace(/"/g, '');
  const open = `<svg viewBox="0 0 100 100" role="img" aria-label="${label}">
    <rect width="100" height="100" fill="${PAPER}"/>`;

  if (kind === 'initials') {
    const ini = initials(p.name);
    return `${open}<text x="50" y="53" text-anchor="middle" dominant-baseline="central"
      font-family="ui-monospace, monospace" font-size="${ini.length > 2 ? 26 : 34}"
      font-weight="700" letter-spacing="1" fill="${INK}">${ini}</text>${tag(p.color)}</svg>`;
  }
  return `${open}${faceSVG(seedOf(p), { sex: p.sex, age: age(p.birthdate) })}${tag(p.color)}</svg>`;
}

/** Une vignette de la planche de contact. */
export function seedMarkup(seed, bias = {}, color = null) {
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <rect width="100" height="100" fill="${PAPER}"/>
    ${faceSVG(seed, bias)}${tag(color)}</svg>`;
}

/** Tire une serie de graines a proposer. */
export function seedBatch(n = 12, from = null) {
  const base = from == null ? (Math.random() * 4294967295) >>> 0 : from >>> 0;
  return Array.from({ length: n }, (_, i) => (base + i * 2654435761) >>> 0);
}

/* La graine est calculee par draw.js : on la re-expose pour les formulaires. */
export { hashSeed };

/* Conserve pour compatibilite avec l'ancienne API. */
export const PRESET_LIST = [];
export const presetMarkup = (id, color, seed = 'a') =>
  seedMarkup(hashSeed(String(id) + seed), {}, color);

/**
 * Compresse une photo choisie par l'utilisateur en data-URL carree (256 px).
 */
export function photoToDataURL(file, size = 256) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) return reject(new Error('Fichier image attendu.'));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible.')); };
    img.src = url;
  });
}
