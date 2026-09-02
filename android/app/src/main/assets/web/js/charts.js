/* ============================================================================
   charts.js — les graphiques, dessines dans le registre de la planche.

   Une reference m'a ete donnee : des graphiques monochromes, minimalistes,
   aux formes arrondies — lignes a bouts ronds, barres en gelules, aires
   courbes ombrees, anneaux fendus. Le principe est excellent. Le fond noir et
   les degrades, eux, appartiennent a une autre grammaire que la notre.

   La traduction tient en une phrase : on garde les FORMES, on remplace les
   degrades par la HACHURE — la seule matiere que la planche autorise. Et on
   pousse l'idee un cran plus loin : dans un pilulier, une barre est une
   gelule. Elle se remplit a mesure que les prises sont validees.

   Rien n'est importe : tout est trace par draw.js, avec la meme graine que le
   reste du projet — le meme jour donne toujours le meme dessin.
   ========================================================================== */
import { dice, hashSeed, pen, penLoop, sketch, splinePoints, hatchInside,
         capsuleOutlineV, arcPoints, svgWrap } from './draw.js';

const W = 1.9;          /* le trait principal d'un graphique */
const Wt = 1;           /* les repères et les hachures       */

/* ==========================================================================
   1. LES GELULES — un jour, une gelule ; elle se remplit
   ==========================================================================
   Chaque colonne est une gelule verticale : son contour dit ce qui etait
   prevu, son remplissage ce qui a ete pris. Une journee vide reste un contour
   ; une journee complete est pleine. On lit l'observance sans chercher l'axe.
*/
export function pilulierBars(series, o = {}) {
  const { w = 320, h = 128, cls = '' } = o;
  const d = dice(hashSeed('graph:gelules'));
  const nb = Math.max(1, series.length);
  const pas = w / nb;
  const dia = Math.min(11, Math.max(5, pas * 0.46));
  const bas = h - 16, haut = 8;

  let out = '';
  /* La ligne de sol : un seul filet, comme sur un relevé. */
  out += sketch([[0, bas + 3], [w, bas + 3]], d, { w: Wt, amp: 0.3, passes: 1, op: 0.8 });

  series.forEach((s, i) => {
    const cx = pas * (i + 0.5);
    const plein = s.rate === null ? 0 : Math.max(0, Math.min(100, s.rate)) / 100;
    const len = bas - haut;
    const cy = haut + len / 2;
    const contour = capsuleOutlineV(cx, cy, len, dia, 7);

    if (s.rate === null) {
      /* Rien n'etait prevu : un contour tres leger, et rien dedans. */
      out += penLoop(contour, d, { w: Wt, amp: 0.35, op: 0.4 });
      return;
    }
    /* La part prise, hachuree serré et bornee par la gelule elle-meme :
       on coupe le contour a la hauteur atteinte et on referme. */
    if (plein > 0) {
      const yRempli = bas - len * plein;
      const dedans = decouper(contour, yRempli);
      if (dedans.length > 2) {
        out += hatchInside(dedans, d,
          { step: plein > 0.9 ? 1.8 : 2.5, w: Wt, op: 0.9, slant: 0.55 });
      }
    }
    out += penLoop(contour, d, { w: W, amp: 0.35 });
    /* Le trait de partage de la gelule, a mi-hauteur : c'est ce qui la rend
       reconnaissable comme gelule et pas comme baton arrondi. En dessous de
       huit pixels de diametre il ne ferait plus qu'epaissir le dessin. */
    if (dia >= 8) {
      out += sketch([[cx - dia / 2 + 1, cy], [cx + dia / 2 - 1, cy]], d,
        { w: Wt, amp: 0.25, passes: 1, op: 0.5 });
    }
  });
  return svgWrap(out, { size: null, cls, box: `0 0 ${w} ${h}` });
}

/**
 * Coupe une silhouette fermee par une horizontale et garde le bas.
 * On suit le contour dans l'ordre et on ajoute le point d'intersection a
 * chaque franchissement : la forme reste un polygone valide, ce qui est la
 * condition pour que la hachure ne deborde pas.
 */
function decouper(contour, y) {
  const out = [];
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i], b = contour[(i + 1) % contour.length];
    if (a[1] >= y) out.push(a);
    if ((a[1] < y) !== (b[1] < y)) {
      const t = (y - a[1]) / (b[1] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * t, y]);
    }
  }
  return out;
}

/* ==========================================================================
   2. LA COURBE — une mesure dans le temps, tracee a main levee
   ==========================================================================
   Deux series au plus : la valeur haute et la valeur basse d'une tension.
   Chaque point mesure est marque : sur une courbe medicale, savoir OU l'on a
   releve compte autant que la tendance.
*/
export function splineChart(series, o = {}) {
  const { w = 320, h = 128, cls = '', bande = true, min = null, max = null } = o;
  const d = dice(hashSeed('graph:courbe'));
  const toutes = series.flatMap((s) => s.points.map((p) => p[1]));
  if (!toutes.length) return svgWrap('', { size: null, cls, box: `0 0 ${w} ${h}` });

  const y0 = min ?? Math.min(...toutes), y1 = max ?? Math.max(...toutes);
  const ecart = (y1 - y0) || 1;
  const marge = 14;
  const X = (i, nb) => marge + (w - marge * 2) * (nb <= 1 ? 0.5 : i / (nb - 1));
  const Y = (v) => h - 20 - (h - 34) * ((v - y0) / ecart);

  let out = '';
  /* Trois graduations, pas plus : la planche mesure, elle ne quadrille pas. */
  for (const t of [0, 0.5, 1]) {
    const y = Y(y0 + ecart * t);
    out += sketch([[marge - 6, y], [w - marge + 6, y]], d,
      { w: 0.6, amp: 0.25, passes: 1, op: t === 0 ? 0.7 : 0.28 });
  }

  series.forEach((s, k) => {
    const pts = s.points.map((p, i) => [X(i, s.points.length), Y(p[1])]);
    const lisse = splinePoints(pts, 10);

    /* L'ombre : de la hachure, jamais un degrade.
       Avec deux series — une tension haute et une basse — la bande utile est
       celle qui les separe : c'est la difference qui parle au medecin, pas la
       hauteur au-dessus de zero. On hachure donc entre les deux courbes.
       Avec une seule serie, on retombe sur l'ombre classique jusqu'au sol. */
    if (bande && k === 0 && pts.length > 1) {
      const autre = series[1];
      const bas = autre
        ? splinePoints(autre.points.map((p, i) => [X(i, autre.points.length), Y(p[1])]), 10)
        : [[lisse[lisse.length - 1][0], h - 20], [lisse[0][0], h - 20]];
      const silhouette = lisse.concat([...bas].reverse());
      out += hatchInside(silhouette, d,
        { step: 6.5, w: 0.7, op: autre ? 0.22 : 0.28, slant: 0.8 });
    }
    /* Le trait : plein pour la premiere serie, plus fin pour la seconde. */
    out += sketch(lisse, d, { w: k ? Wt + 0.15 : W, amp: 0.35,
      passes: k ? 1 : 2, op: k ? 0.75 : 1 });
    /* Les points mesures. */
    for (const p of pts) {
      out += penLoop(arcPoints(p[0], p[1], k ? 1.7 : 2.4, 0, 300, 7), d,
        { w: k ? 1.4 : 1.9, amp: 0.18, over: 0.25, passes: 1 });
    }
  });
  return svgWrap(out, { size: null, cls, box: `0 0 ${w} ${h}` });
}

/* ==========================================================================
   3. L'ANNEAU FENDU — la repartition d'un mois
   ==========================================================================
   Les arcs ne se touchent pas : la fente separe mieux que la couleur, et la
   planche n'a qu'une encre. Chaque part porte sa densite de hachure — pleine,
   moyenne, vide — de sorte qu'on la lit aussi en noir et blanc, et meme
   imprimee sur une photocopieuse fatiguee.
*/
export function arcRing(parts, o = {}) {
  const { size = 128, cls = '', epaisseur = 15, trou = 0.62 } = o;
  const d = dice(hashSeed('graph:anneau'));
  const c = size / 2;
  const R = size / 2 - epaisseur / 2 - 3;
  const total = parts.reduce((s, p) => s + p.valeur, 0) || 1;
  const fente = 5;                       /* degres perdus entre deux parts */

  let out = '';
  let angle = -90;
  for (const part of parts) {
    const arc = (part.valeur / total) * 360;
    if (arc <= 0.5) { angle += arc; continue; }
    const a0 = angle + fente / 2, a1 = angle + arc - fente / 2;
    if (a1 > a0) {
      const ext = arcPoints(c, c, R + epaisseur / 2, a0, a1, Math.max(4, Math.round(arc / 9)));
      const int = arcPoints(c, c, R - epaisseur / 2, a1, a0, Math.max(4, Math.round(arc / 9)));
      const forme = ext.concat(int);
      const densite = { plein: 1.9, moyen: 3.4, vide: 0 }[part.densite || 'moyen'];
      if (densite) out += hatchInside(forme, d, { step: densite, w: Wt, op: 0.9, slant: 0.5 });
      out += penLoop(forme, d, { w: W, amp: 0.3, over: 0.6 });
    }
    angle += arc;
  }
  return svgWrap(out, { size: null, cls, box: `0 0 ${size} ${size}` });
}

/* ==========================================================================
   4. LE NUAGE — deux valeurs liees, un point par releve
   ==========================================================================
   Pour la tension : la haute en abscisse, la basse en ordonnee. Un nuage qui
   derive vers le haut a droite se voit d'un coup d'oeil, la ou une liste de
   chiffres ne dit rien. Le rectangle hachure est la zone habituellement
   consideree comme normale — c'est un repere, pas un diagnostic.
*/
export function scatterNodes(points, o = {}) {
  const { w = 260, h = 200, cls = '', zone = null, bornes = null } = o;
  const d = dice(hashSeed('graph:nuage'));
  if (!points.length) return svgWrap('', { size: null, cls, box: `0 0 ${w} ${h}` });

  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const bx = bornes?.x || [Math.min(...xs) - 10, Math.max(...xs) + 10];
  const by = bornes?.y || [Math.min(...ys) - 8, Math.max(...ys) + 8];
  const m = 20;
  const X = (v) => m + (w - m * 2) * ((v - bx[0]) / ((bx[1] - bx[0]) || 1));
  const Y = (v) => h - m - (h - m * 2) * ((v - by[0]) / ((by[1] - by[0]) || 1));

  let out = '';
  /* Les deux axes, et rien d'autre. */
  out += sketch([[m - 6, h - m], [w - m + 6, h - m]], d, { w: Wt, amp: 0.3, passes: 1, op: 0.7 });
  out += sketch([[m, m - 6], [m, h - m + 6]], d, { w: Wt, amp: 0.3, passes: 1, op: 0.7 });

  if (zone) {
    /* La zone de reference deborde souvent des valeurs relevees : on la
       ramene dans le cadre, sinon la hachure sort du graphique et le lecteur
       croit lire une donnee la ou il n'y a que du repere. */
    const cx = (v) => Math.max(bx[0], Math.min(bx[1], v));
    const cy = (v) => Math.max(by[0], Math.min(by[1], v));
    const zx = [cx(zone.x[0]), cx(zone.x[1])], zy = [cy(zone.y[0]), cy(zone.y[1])];
    if (zx[0] >= zx[1] || zy[0] >= zy[1]) return finir(out, w, h, cls, points, X, Y, d);
    const r = [[X(zx[0]), Y(zy[0])], [X(zx[1]), Y(zy[0])],
               [X(zx[1]), Y(zy[1])], [X(zx[0]), Y(zy[1])]];
    out += hatchInside(r, d, { step: 9, w: 0.65, op: 0.18, slant: 0.6 });
    out += penLoop(r, d, { w: 0.9, amp: 0.3, op: 0.45, passes: 1 });
  }
  return finir(out, w, h, cls, points, X, Y, d);
}

/** Les points du nuage, traces par-dessus la zone. */
function finir(out, w, h, cls, points, X, Y, d) {
  for (const [a, b, recent] of points) {
    const x = X(a), y = Y(b);
    out += penLoop(arcPoints(x, y, recent ? 3.4 : 2.6, 0, 300, 8), d,
      { w: recent ? 2.1 : 1.5, amp: 0.2, over: 0.3, passes: recent ? 2 : 1 });
    if (recent) {
      /* Le dernier releve est plein : c'est celui qu'on cherche. */
      out += hatchInside(arcPoints(x, y, 3, 0, 359, 12), d, { step: 1.5, w: 0.9, op: 0.95 });
    }
  }
  return svgWrap(out, { size: null, cls, box: `0 0 ${w} ${h}` });
}

/* ==========================================================================
   5. LE FIL — une valeur unique, en tout petit
   ==========================================================================
   Pose a cote d'un chiffre, il dit la tendance sans prendre de place.
*/
export function sparkline(valeurs, o = {}) {
  const { w = 74, h = 24, cls = '' } = o;
  if (valeurs.length < 2) return svgWrap('', { size: null, cls, box: `0 0 ${w} ${h}` });
  const d = dice(hashSeed('graph:fil'));
  const lo = Math.min(...valeurs), hi = Math.max(...valeurs), ec = (hi - lo) || 1;
  const pts = valeurs.map((v, i) => [
    2 + (w - 4) * (i / (valeurs.length - 1)),
    h - 3 - (h - 6) * ((v - lo) / ec),
  ]);
  let out = sketch(splinePoints(pts, 6), d, { w: 1.5, amp: 0.3, passes: 1 });
  const fin = pts[pts.length - 1];
  out += penLoop(arcPoints(fin[0], fin[1], 2, 0, 300, 6), d,
    { w: 1.6, amp: 0.15, over: 0.2, passes: 1 });
  return svgWrap(out, { size: null, cls, box: `0 0 ${w} ${h}` });
}
