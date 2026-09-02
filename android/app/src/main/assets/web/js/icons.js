/* ============================================================================
   icons.js — toutes les icones du projet, DESSINEES par le code.

   Ce ne sont pas des pictogrammes geometriques : ce sont des croquis. Chaque
   forme est tracee d'un geste qui tremble un peu, repasse son trait, et
   depasse legerement aux angles — la petite queue que laisse un stylo qui
   revient sur son point de depart. Les formes galeniques sont ombrees par une
   hachure en eventail, comme on ombre un dessin a la plume.

   Chaque icone a une graine fixe, tiree de son nom : elle est donc toujours
   identique a elle-meme, d'un ecran a l'autre et d'un jour a l'autre.

   Ajouter une icone = ajouter une fonction dans ICONS. Rien d'autre.
   ========================================================================== */
import { pen, penLoop, fan, arcPoints, capsuleOutline, sketch, hatch,
         dice, hashSeed, g, svgWrap, P } from './draw.js';

const W = 2;            /* trait principal   */
const Wt = 1.25;        /* details et hachures */
const C = 12;           /* centre de la grille */

/* --------------------------------------------------------------- gestes */
/** Cercle trace a la main, avec la queue du trait. */
const ring = (cx, cy, r, d, o = {}) =>
  penLoop(arcPoints(cx, cy, r, -95, 250, 15), d, { w: o.w ?? W, amp: o.amp ?? 0.4, ...o });

/** Quadrilatere trace a la main. */
const box4 = (x, y, w, h, d, o = {}) =>
  penLoop([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], d, { w: o.w ?? W, amp: 0.4, ...o });

/** Segment libre. */
const seg = (x1, y1, x2, y2, d, o = {}) => pen([[x1, y1], [x2, y2]], d, { w: o.w ?? W, ...o });

/** Point epais (un appui de stylo). */
const blot = (x, y, d, r = 1.1) =>
  penLoop(arcPoints(x, y, r, 0, 300, 6), d, { w: r * 1.5, amp: 0.18, over: 0.2, passes: 1 });

/* ==========================================================================
   LE CATALOGUE
   ========================================================================== */
const ICONS = {

  /* ---------- formes galeniques : ombrees a l'eventail ---------- */
  pill: (d) =>                                  /* comprime, moitie hachuree */
    ring(C, C, 7.2, d) +
    seg(C - 7.2, C, C + 7.2, C, d, { w: Wt, over: 0.4 }) +
    fan(C - 6.6, C + 0.4, arcPoints(C, C, 6.4, 12, 165, 7), d, { w: Wt, op: 0.95 }),

  capsule: (d) =>                               /* gelule : le dessin de reference */
    g(penLoop(capsuleOutline(C, C, 17.4, 8.8, 6), d, { w: W + 0.2, amp: 0.38 }) +
      seg(C, C - 4.4, C, C + 4.4, d, { w: W, over: 0.3 }) +
      fan(C - 0.4, C - 3.9, arcPoints(C + 4.3, C, 4.3, -78, 78, 8), d, { w: Wt, op: 0.95 }),
      `rotate(-45 ${C} ${C})`),

  drop: (d) =>                                  /* goutte + reflet */
    penLoop([[12, 3.6], [16.2, 8.6], [18.2, 13.4], [16.6, 17.6], [12, 19.6],
             [7.4, 17.6], [5.8, 13.4], [7.8, 8.6]], d, { w: W, amp: 0.45 }) +
    fan(9.2, 15.6, arcPoints(12, 14, 4.6, 95, 175, 4), d, { w: Wt, op: 0.7 }),

  syringe: (d) =>                               /* corps gradue, piston, aiguille */
    g(box4(5, 9.6, 10, 4.8, d) +
      seg(15, 12, 21.4, 12, d, { w: Wt }) +
      seg(4.4, 10.2, 4.4, 13.8, d, { w: W }) + seg(2.4, 12, 4.4, 12, d, { w: Wt }) +
      [0, 1, 2, 3].map((i) => seg(7.4 + i * 1.9, 9.9, 7.4 + i * 1.9, 11.4, d,
        { w: Wt, op: 0.8, over: 0.2 })).join(''),
      `rotate(-35 ${C} ${C})`),

  spray: (d) =>                                 /* inhalateur + jet (des arcs, pas une ombre) */
    box4(7.2, 9.4, 6.4, 10.8, d) +
    pen([[9.2, 9.4], [9.2, 5.6], [13.4, 5.6], [13.4, 9.4]], d, { w: Wt }) +
    pen(arcPoints(13.8, 8, 3.4, -58, 40, 5), d, { w: Wt, op: 0.9, over: 0.3 }) +
    pen(arcPoints(13.8, 8, 5.8, -52, 34, 5), d, { w: Wt, op: 0.6, over: 0.3 }),

  patch: (d) => {                               /* patch : cadre + perforations */
    let s = box4(4.6, 4.6, 14.8, 14.8, d);
    for (let i = 0; i < 3; i++) {
      s += blot(8.4 + i * 3.4, 7.6, d, 0.48) + blot(8.4 + i * 3.4, 16.4, d, 0.48);
    }
    return s + seg(8.4, 12, 15.6, 12, d, { w: Wt, op: 0.8 });
  },

  box: (d) =>                                   /* boite : deux faces, une ombree */
    penLoop([[3.8, 8], [12, 4.2], [20.2, 8], [12, 11.8]], d, { w: W, amp: 0.4 }) +
    pen([[3.8, 8], [3.8, 16], [12, 19.8], [20.2, 16], [20.2, 8]], d, { w: W }) +
    seg(12, 11.8, 12, 19.8, d, { w: Wt }) +
    fan(4.8, 9.4, arcPoints(9.4, 17.4, 3.6, 30, 120, 3), d, { w: Wt - 0.2, op: 0.32 }),

  /* ---------- temps ---------- */
  today: (d) =>
    box4(3.6, 5.4, 16.8, 14.8, d) + seg(3.6, 9.8, 20.4, 9.8, d, { w: Wt }) +
    seg(7.8, 3.2, 7.8, 6.6, d, { w: W }) + seg(16.2, 3.2, 16.2, 6.6, d, { w: W }) +
    penLoop([[10.2, 12.4], [13.8, 12.4], [13.8, 16], [10.2, 16]], d, { w: Wt, over: 0.6 }) +
    hatch(10.5, 12.7, 3, 3, d, { step: 1.9, w: Wt - 0.25, op: 0.7, slant: 0.5, jitter: 0.15 }),

  calendar: (d) => {
    let s = box4(3.6, 5.4, 16.8, 14.8, d) + seg(3.6, 9.8, 20.4, 9.8, d, { w: Wt }) +
      seg(7.8, 3.2, 7.8, 6.6, d, { w: W }) + seg(16.2, 3.2, 16.2, 6.6, d, { w: W });
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      s += blot(8 + c * 4, 13 + r * 3.6, d, 0.8);
    }
    return s;
  },

  clock: (d) => ring(C, C, 8.2, d) +
    pen([[C, 7.2], [C, C], [15.4, 13.8]], d, { w: W, over: 0.5 }) +
    [0, 90, 180, 270].map((a) => {
      const r = (a * Math.PI) / 180;
      return seg(C + Math.cos(r) * 6.4, C + Math.sin(r) * 6.4,
                 C + Math.cos(r) * 7.8, C + Math.sin(r) * 7.8, d, { w: Wt, op: 0.8, over: 0.2 });
    }).join(''),

  history: (d) =>
    penLoop(arcPoints(C, C, 8.2, -150, 150, 12), d, { w: W, tail: 0, over: 0 }) +
    pen([[3.4, 5.8], [3.4, 10.6], [8.2, 10.6]], d, { w: W }) +
    pen([[C, 7.6], [C, C], [15.2, 13.4]], d, { w: Wt, over: 0.4 }),

  snooze: (d) => ring(C, 13.2, 7.2, d) +
    seg(5.2, 4.2, 8.4, 6.8, d, { w: Wt }) + seg(18.8, 4.2, 15.6, 6.8, d, { w: Wt }) +
    pen([[9.2, 10.8], [14.8, 10.8], [9.2, 16], [14.8, 16]], d, { w: Wt }),

  /* ---------- alerte ---------- */
  bell: (d) =>
    pen([[4.2, 17.8], [6.4, 14.4], [6.4, 10.6], [8.6, 6.2], [12, 4.8], [15.4, 6.2],
         [17.6, 10.6], [17.6, 14.4], [19.8, 17.8]], d, { w: W, amp: 0.42 }) +
    seg(4.2, 17.8, 19.8, 17.8, d, { w: W }) +
    pen([[10, 19], [12, 20.8], [14, 19]], d, { w: Wt }),

  bellOff: (d) =>                               /* la meme cloche, barree */
    pen([[4.2, 17.8], [6.4, 14.4], [6.4, 10.6], [8.6, 6.2], [12, 4.8], [15.4, 6.2],
         [17.6, 10.6], [17.6, 14.4], [19.8, 17.8]], d, { w: W, amp: 0.42 }) +
    seg(4.2, 17.8, 19.8, 17.8, d, { w: W }) +
    pen([[10, 19], [12, 20.8], [14, 19]], d, { w: Wt }) +
    seg(3.6, 3.4, 20.4, 20.6, d, { w: W + 0.2 }),

  warn: (d) =>
    penLoop([[12, 3.8], [21.2, 20], [2.8, 20]], d, { w: W, amp: 0.45 }) +
    seg(12, 10, 12, 15, d, { w: W, over: 0.3 }) + blot(12, 17.8, d, 1),

  info: (d) => ring(C, C, 8.4, d) + seg(12, 11.4, 12, 16.6, d, { w: W, over: 0.3 }) +
    blot(12, 7.9, d, 1),

  shield: (d) =>
    penLoop([[12, 2.6], [20, 5.6], [19.4, 12.6], [16, 17.6], [12, 20.8],
             [8, 17.6], [4.6, 12.6], [4, 5.6]], d, { w: W, amp: 0.42 }) +
    pen([[8.6, 11.8], [11.2, 14.4], [15.6, 9.4]], d, { w: W }),

  skip: (d) => ring(C, C, 8.2, d) + seg(6.4, 17.6, 17.6, 6.4, d, { w: W }),

  /* ---------- personnes ---------- */
  user: (d) => ring(C, 8.4, 4, d, { w: W }) +
    pen([[5, 20.4], [5.6, 16.6], [8.6, 14.4], [12, 13.8], [15.4, 14.4], [18.4, 16.6],
         [19, 20.4]], d, { w: W, amp: 0.42 }),

  users: (d) => ring(9.2, 8.6, 3.6, d) +
    pen([[3.4, 19.8], [4.2, 16.2], [9.2, 14], [14.2, 16.2], [15, 19.8]], d, { w: W }) +
    penLoop(arcPoints(16.8, 8.6, 3.4, -80, 90, 7), d, { w: Wt, tail: 0, over: 0.4, op: 0.9 }) +
    pen([[16.2, 14.4], [19.6, 16.2], [20.4, 19.4]], d, { w: Wt, op: 0.9 }),

  heart: (d) =>
    penLoop([[12, 20.4], [5.4, 14.4], [3.4, 10.2], [4.6, 6.6], [8.2, 5.4], [12, 7.8],
             [15.8, 5.4], [19.4, 6.6], [20.6, 10.2], [18.6, 14.4]], d, { w: W, amp: 0.4 }),

  /* ---------- outils ---------- */
  settings: (d) => {                            /* engrenage : dents calculees */
    const teeth = 7, rIn = 6, rOut = 8.6, half = 15;
    let s = '';
    const R = (a) => (a * Math.PI) / 180;
    const p = (a, r) => [C + Math.cos(R(a)) * r, C + Math.sin(R(a)) * r];
    for (let i = 0; i < teeth; i++) {
      const a = (i * 360) / teeth;
      s += pen([p(a - half, rIn), p(a - half * 0.6, rOut), p(a + half * 0.6, rOut),
                p(a + half, rIn)], d, { w: Wt + 0.3, over: 0.3 });
      s += pen(arcPoints(C, C, rIn, a + half, a + 360 / teeth - half, 3), d,
        { w: Wt + 0.3, over: 0.3 });
    }
    return s + ring(C, C, 2.9, d, { w: W, amp: 0.25 });
  },

  chart: (d) =>
    pen([[4, 3.4], [4, 20], [20.6, 20]], d, { w: W }) +
    pen([[6.6, 15.8], [10.4, 10.6], [13.6, 13.6], [18.6, 6.4]], d, { w: W, amp: 0.45 }) +
    [0, 1, 2, 3].map((i) => seg(7.6 + i * 3.6, 20, 7.6 + i * 3.6, 21.4, d,
      { w: Wt, op: 0.6, over: 0.2 })).join(''),

  search: (d) => ring(10.4, 10.4, 6.2, d) + seg(15, 15, 20.6, 20.6, d, { w: W }),

  edit: (d) =>                                  /* crayon : mine, fut, trace */
    penLoop([[4, 20], [8.4, 20], [20, 8.4], [15.6, 4]], d, { w: W, amp: 0.42 }) +
    seg(15.6, 4, 20, 8.4, d, { w: Wt, over: 0.2 }) +
    seg(14.4, 6, 18, 9.6, d, { w: Wt, op: 0.8 }) +
    fan(5.2, 19, arcPoints(7.4, 17.2, 3.2, -140, -40, 3), d, { w: Wt, op: 0.55 }),

  trash: (d) => {
    let s = seg(3.4, 6.4, 20.6, 6.4, d, { w: W }) +
      pen([[9, 6.4], [9, 3.4], [15, 3.4], [15, 6.4]], d, { w: Wt + 0.2 }) +
      pen([[5.8, 6.6], [7.2, 21], [16.8, 21], [18.2, 6.6]], d, { w: W, amp: 0.42 });
    for (let i = 0; i < 3; i++) s += seg(9.4 + i * 2.6, 9.8, 9.6 + i * 2.6, 17.6, d,
      { w: Wt, op: 0.7, over: 0.3 });
    return s;
  },

  camera: (d) =>
    box4(2.8, 7.2, 18.4, 12.8, d) +
    pen([[8.6, 7.2], [10, 4.4], [14, 4.4], [15.4, 7.2]], d, { w: Wt + 0.2 }) +
    ring(12, 13.6, 3.8, d) + blot(18.2, 10, d, 0.8),

  /* Le carre d'appairage : trois reperes d'angle et quelques modules. On ne
     dessine pas un vrai QR — une icone de 20 px n'est pas lisible, et un faux
     code qui ressemble a un vrai serait pire qu'un symbole. */
  qr: (d) => {
    const repere = (x, y) => box4(x, y, 6, 6, d, { w: W }) + blot(x + 3, y + 3, d, 1.1);
    let s = repere(2.6, 2.6) + repere(15.4, 2.6) + repere(2.6, 15.4);
    for (const [x, y] of [[13, 13], [16.4, 13], [19.8, 16.4], [13, 16.4], [16.4, 19.8],
                          [11.2, 8.4], [11.2, 4.6]]) {
      s += blot(x, y, d, 1);
    }
    return s;
  },

  printer: (d) =>
    pen([[7, 8.2], [7, 3.4], [17, 3.4], [17, 8.2]], d, { w: W }) +
    penLoop([[3.2, 8.4], [20.8, 8.4], [20.8, 17.4], [3.2, 17.4]], d, { w: W }) +
    box4(7, 14, 10, 6.6, d, { w: Wt + 0.2 }) +
    [0, 1, 2].map((i) => seg(5.6 + i * 1.7, 11, 5.6 + i * 1.7, 11.1, d,
      { w: Wt + 0.4, over: 0.4 })).join(''),

  doc: (d) =>
    penLoop([[4.8, 3.2], [13.6, 3.2], [19.2, 8.6], [19.2, 20.8], [4.8, 20.8]], d, { w: W }) +
    pen([[13.6, 3.2], [13.6, 8.6], [19.2, 8.6]], d, { w: Wt }) +
    seg(8, 13, 16, 13, d, { w: Wt, op: 0.85 }) + seg(8, 16.4, 13.6, 16.4, d, { w: Wt, op: 0.85 }),

  phone: (d) =>
    pen([[4.6, 3.4], [7.6, 3.4], [9.2, 8], [7.2, 10], [8.8, 13.4], [11.8, 16],
         [14.6, 16.8], [16.4, 14.8], [21, 16.4], [21, 19.6], [18.6, 21],
         [13.4, 19.6], [7.8, 15.4], [4.4, 9.6], [3.4, 5.4]], d, { w: W, amp: 0.4, tail: 0 }),

  sound: (d) =>                                 /* haut-parleur + deux ondes */
    penLoop([[3.4, 9.2], [6.8, 9.2], [11, 5.4], [11, 18.6], [6.8, 14.8], [3.4, 14.8]], d,
      { w: W, amp: 0.4 }) +
    pen(arcPoints(11.6, 12, 3.8, -54, 54, 5), d, { w: Wt, op: 0.95, over: 0.3 }) +
    pen(arcPoints(11.6, 12, 6.8, -50, 50, 5), d, { w: Wt, op: 0.65, over: 0.3 }),

  play: (d) => penLoop([[8.4, 5], [18.6, 12], [8.4, 19]], d, { w: W, amp: 0.4 }),

  moon: (d) =>
    penLoop([[19.8, 13.6], [17.4, 18.4], [12.4, 20.6], [7, 19], [3.8, 14.4], [4.2, 8.8],
             [7.6, 4.6], [10.6, 3.6], [9.8, 8], [11, 12.6], [15, 14.6]], d,
      { w: W, amp: 0.42 }),

  sun: (d) => {
    let s = ring(C, C, 4.2, d);
    for (let i = 0; i < 8; i++) {
      const a = (i * 45 * Math.PI) / 180;
      s += seg(C + Math.cos(a) * 6.4, C + Math.sin(a) * 6.4,
               C + Math.cos(a) * 8.8, C + Math.sin(a) * 8.8, d, { w: Wt + 0.2, over: 0.3 });
    }
    return s;
  },

  refresh: (d) => {
    const A = (ang, r = 7.4) => [C + Math.cos((ang * Math.PI) / 180) * r,
                                 C + Math.sin((ang * Math.PI) / 180) * r];
    const head = (ang) => {
      const [x, y] = A(ang);
      const back = ang + 90 + 180;
      const R = (a) => (a * Math.PI) / 180;
      return pen([[x + Math.cos(R(back + 34)) * 3.2, y + Math.sin(R(back + 34)) * 3.2],
                  [x, y], [x + Math.cos(R(back - 34)) * 3.2, y + Math.sin(R(back - 34)) * 3.2]],
        d, { w: W, over: 0.3 });
    };
    return pen(arcPoints(C, C, 7.4, 205, 352, 8), d, { w: W }) + head(6) +
           pen(arcPoints(C, C, 7.4, 25, 172, 8), d, { w: W }) + head(186);
  },

  /* ---------- fleches et signes ---------- */
  plus: (d) => seg(12, 4.4, 12, 19.6, d) + seg(4.4, 12, 19.6, 12, d),
  /* ------------------------------------------------------------------
     LES QUATRE MARQUES DE STATUT
     Elles remplacent les [x] et compagnie partout ou l'on peut dessiner :
     l'apercu du bulletin, le rapport du medecin, la fiche imprimee. Ce sont
     des cases cochees a la main sur une feuille de relevé — la case est
     toujours la meme, c'est ce qu'on met dedans qui change. Le texte simple
     envoye par messagerie garde des caracteres, lui : ■ ▲ ▨ □.
     ------------------------------------------------------------------ */

  /* Pris : la case est cochee, et la coche deborde du cadre — on appuie. */
  markTaken: (d) =>
    box4(4.2, 4.2, 15.6, 15.6, d, { w: W }) +
    pen([[6.6, 12.6], [10.4, 16.8], [18.2, 5.8]], d, { w: 2.2, amp: 0.5, over: 1.4 }),

  /* Oublié : la croix, et un cadre repassé plus fort. C'est ce qui doit
     accrocher l'oeil quand on parcourt la liste. */
  markMissed: (d) =>
    box4(4.2, 4.2, 15.6, 15.6, d, { w: W + 0.5, amp: 0.5, passes: 2 }) +
    seg(7.4, 7.4, 16.6, 16.6, d, { w: 2.15, over: 1.2 }) +
    seg(16.6, 7.4, 7.4, 16.6, d, { w: 2.15, over: 1.2 }),

  /* Sauté volontairement : la case est barrée d'une hachure — la matière de
     la planche. Ce n'est ni un oubli ni une prise : c'est une décision. */
  markSkipped: (d) =>
    box4(4.2, 4.2, 15.6, 15.6, d, { w: W }) +
    hatch(5.6, 5.6, 12.8, 12.8, d, { step: 3.1, w: Wt, op: 0.85, slant: 0.55 }),

  /* À venir : la case est vide, et le trait est plus léger. Rien ne s'est
     encore passé — le dessin ne doit pas peser plus que ce qu'il dit. */
  markDue: (d) =>
    box4(4.2, 4.2, 15.6, 15.6, d, { w: Wt + 0.35, amp: 0.45, op: 0.75 }),

  check: (d) => pen([[4.8, 12.4], [10, 17.6], [19.2, 6.6]], d, { w: 2.3, amp: 0.42 }),
  x: (d) => seg(5.2, 5.2, 18.8, 18.8, d) + seg(18.8, 5.2, 5.2, 18.8, d),
  chevL: (d) => pen([[15.2, 4.8], [8, 12], [15.2, 19.2]], d, { w: W }),
  chevR: (d) => pen([[8.8, 4.8], [16, 12], [8.8, 19.2]], d, { w: W }),
  chevD: (d) => pen([[4.8, 8.8], [12, 16], [19.2, 8.8]], d, { w: W }),
  more: (d) => blot(12, 5.4, d, 1.5) + blot(12, 12, d, 1.5) + blot(12, 18.6, d, 1.5),

  share: (d) => tray(d) + seg(12, 3.4, 12, 14.6, d) + head(d, 12, 3.4, 'up'),
  download: (d) => tray(d) + seg(12, 3.6, 12, 14.8, d) + head(d, 12, 14.8, 'down'),
  upload: (d) => tray(d) + seg(12, 3.6, 12, 14.8, d) + head(d, 12, 3.6, 'up'),

  /* ---------- la marque ---------- */
  logo: (d) =>
    pen([[6.4, 2.6], [2.6, 2.6], [2.6, 6.4]], d, { w: Wt, op: 0.7 }) +
    pen([[17.6, 21.4], [21.4, 21.4], [21.4, 17.6]], d, { w: Wt, op: 0.7 }) +
    g(penLoop(capsuleOutline(C, C, 15.6, 8, 6), d, { w: W, amp: 0.35 }) +
      seg(C, C - 4, C, C + 4, d, { w: Wt + 0.3, over: 0.2 }) +
      fan(C - 0.3, C - 3.5, arcPoints(C + 3.8, C, 3.8, -78, 78, 7), d, { w: Wt - 0.1, op: 0.95 }),
      `rotate(-45 ${C} ${C})`),
};

/* Petits assemblages partages par les fleches. */
function tray(d) {
  return pen([[4, 15.4], [4, 20.4], [20, 20.4], [20, 15.4]], d, { w: W, amp: 0.4 });
}
function head(d, x, y, dir) {
  const s = 3.4;
  const pts = { up: [[-s, s], [0, 0], [s, s]], down: [[-s, -s], [0, 0], [s, -s]] }[dir];
  return pen(pts.map(([dx, dy]) => [x + dx, y + dy]), d, { w: W, over: 0.4 });
}

/* ==========================================================================
   API — inchangee : le reste de l'application ne voit pas la difference.
   ========================================================================== */
const CACHE = new Map();

export function ico(name, cls = '') {
  const key = name + '|' + cls;
  if (CACHE.has(key)) return CACHE.get(key);
  const draw = ICONS[name] || ICONS.info;
  /* La graine vient du nom : le meme dessin, partout et toujours. */
  const out = svgWrap(draw(dice(hashSeed('ico:' + name))), { size: 24, cls });
  CACHE.set(key, out);
  return out;
}
export function icoEl(name, cls = '') {
  const w = document.createElement('span');
  w.innerHTML = ico(name, cls);
  return w.firstElementChild;
}
export const ICON_NAMES = Object.keys(ICONS);
export { ICONS };
