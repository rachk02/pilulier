/* ============================================================================
   draw.js — la boite a outils de dessin du projet.

   Aucune icone, aucune illustration n'est empruntee a une bibliotheque : tout
   ce que l'application affiche est construit ici, trait par trait, a partir de
   quelques primitives.

   Deux registres :
     - le trait JUSTE   : geometrie exacte, pour les icones d'interface. Elles
       doivent rester lisibles a 18 px et se comporter comme des reperes.
     - le trait TREMBLE : polylignes bruitees, repassees deux fois, pour les
       illustrations et les visages. C'est le registre « crayon » de la planche.

   Tout est en `currentColor` : le theme decide de l'encre, jamais le dessin.
   ========================================================================== */

const n = (v) => Math.round(v * 100) / 100;

/* ==========================================================================
   1. LE TRAIT JUSTE
   ========================================================================== */

/** Chemin trace (contour). */
export function P(d, o = {}) {
  const { w = 1.9, cap = 'round', join = 'round', op = 1, dash = null, fill = 'none' } = o;
  return `<path d="${d}" fill="${fill}" stroke="currentColor" stroke-width="${w}"` +
    ` stroke-linecap="${cap}" stroke-linejoin="${join}"` +
    (op !== 1 ? ` opacity="${op}"` : '') +
    (dash ? ` stroke-dasharray="${dash}"` : '') + '/>';
}
/** Chemin plein (sans contour). */
export function F(d, o = {}) {
  const { op = 1 } = o;
  return `<path d="${d}" fill="currentColor"${op !== 1 ? ` opacity="${op}"` : ''}/>`;
}

export const line = (x1, y1, x2, y2, o) => P(`M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`, o);

export function poly(pts, o = {}) {
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join('') +
    (o.close ? 'Z' : '');
  return P(d, o);
}

export function circle(cx, cy, r, o = {}) {
  const d = `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0`;
  return o.fill === 'currentColor' ? F(d, o) : P(d, o);
}
export const dot = (cx, cy, r = 1.1, o = {}) => F(
  `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0`, o);

export function ellipse(cx, cy, rx, ry, o = {}) {
  const d = `M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 0 ${n(rx * 2)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-rx * 2)} 0`;
  return o.fill === 'currentColor' ? F(d, o) : P(d, o);
}

/** Arc precis, angles en degres, 0 a droite, sens horaire. */
export function arc(cx, cy, r, a0, a1, o = {}) {
  const ry = o.ry ?? r;
  const rad = (a) => (a * Math.PI) / 180;
  const x0 = cx + Math.cos(rad(a0)) * r, y0 = cy + Math.sin(rad(a0)) * ry;
  const x1 = cx + Math.cos(rad(a1)) * r, y1 = cy + Math.sin(rad(a1)) * ry;
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return P(`M${n(x0)} ${n(y0)}A${n(r)} ${n(ry)} 0 ${large} ${sweep} ${n(x1)} ${n(y1)}`, o);
}

/** Rectangle, arrondi si `r` est donne. */
export function rect(x, y, w, h, o = {}) {
  const r = Math.min(o.r || 0, w / 2, h / 2);
  const d = r
    ? `M${n(x + r)} ${n(y)}h${n(w - 2 * r)}a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(r)}` +
      `v${n(h - 2 * r)}a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(r)}h${n(-(w - 2 * r))}` +
      `a${n(r)} ${n(r)} 0 0 1 ${n(-r)} ${n(-r)}v${n(-(h - 2 * r))}a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(-r)}Z`
    : `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`;
  return o.fill === 'currentColor' ? F(d, o) : P(d, o);
}

/** Gelule : deux demi-cylindres accoles, orientables. */
export function capsuleShape(cx, cy, len, dia, angle = -45, o = {}) {
  const r = dia / 2;
  const d = `M${n(cx - len / 2 + r)} ${n(cy - r)}h${n(len - 2 * r)}` +
    `a${n(r)} ${n(r)} 0 0 1 0 ${n(dia)}h${n(-(len - 2 * r))}a${n(r)} ${n(r)} 0 0 1 0 ${n(-dia)}Z`;
  const inner = P(d, o) + (o.split === false ? '' : line(cx, cy - r, cx, cy + r, { w: o.w }));
  return angle ? g(inner, `rotate(${angle} ${n(cx)} ${n(cy)})`) : inner;
}

/** Groupe transforme. */
export const g = (inner, transform) => `<g transform="${transform}">${inner}</g>`;

/** Serie de petits traits reguliers : graduations d'instrument. */
export function ticks(x, y, count, gap, len, o = {}) {
  let s = '';
  for (let i = 0; i < count; i++) s += line(x + i * gap, y, x + i * gap, y + len, o);
  return s;
}

/** Repere de coupe : l'angle d'une planche technique. */
export function corner(x, y, size, dx, dy, o = {}) {
  return line(x, y, x + dx * size, y, o) + line(x, y, x, y + dy * size, o);
}

/* ==========================================================================
   2. LE TRAIT TREMBLE
   ========================================================================== */

/** Generateur deterministe : meme graine, meme dessin. */
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashSeed(str) {
  let h = 2166136261;
  for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** Petit lanceur de des : tirages nommes, lisibles dans le code appelant. */
export function dice(seed) {
  const r = mulberry(seed);
  return {
    f: (a = 0, b = 1) => a + r() * (b - a),
    i: (a, b) => Math.floor(a + r() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    weigh(pairs) {
      const total = pairs.reduce((s, p) => s + p[1], 0);
      let x = r() * total;
      for (const [v, w] of pairs) { if ((x -= w) <= 0) return v; }
      return pairs[pairs.length - 1][0];
    },
    chance: (p) => r() < p,
  };
}

/** Polyligne dont chaque point s'ecarte un peu de sa position ideale. */
export function shaky(pts, d, amp = 0.7) {
  return pts.map(([x, y], i) =>
    `${i ? 'L' : 'M'}${n(x + d.f(-amp, amp))} ${n(y + d.f(-amp, amp))}`).join('');
}

/** Trait crayonne : deux passes legerement decalees, comme un repassage. */
export function sketch(pts, d, o = {}) {
  const { w = 2, close = false, amp = 0.7, passes = 2, op = 1 } = o;
  let out = '';
  for (let p = 0; p < passes; p++) {
    out += P(shaky(pts, d, amp) + (close ? 'Z' : ''),
      { w: n(w - p * 0.35), op: p ? op * 0.5 : op });
  }
  return out;
}

/** Ovale irregulier : la base de toutes les tetes. */
export function blob(cx, cy, rx, ry, d, o = {}) {
  const { steps = 26, warp = 0.09, w = 2.2, amp = 0.6 } = o;
  const a1 = d.f(0, 6.28), a2 = d.f(0, 6.28);
  const k1 = d.f(-warp, warp), k2 = d.f(-warp, warp);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const rr = 1 + k1 * Math.sin(t * 2 + a1) + k2 * Math.sin(t * 3 + a2);
    pts.push([cx + Math.cos(t) * rx * rr, cy + Math.sin(t) * ry * rr]);
  }
  return sketch(pts, d, { w, amp });
}

/** Arc crayonne (radians, contrairement a `arc` qui travaille en degres). */
export function sketchArc(cx, cy, r, from, to, d, o = {}) {
  const steps = o.steps || 12;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = from + (to - from) * (i / steps);
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * (o.ry || r)]);
  }
  return sketch(pts, d, { w: o.w || 1.8, amp: o.amp ?? 0.45, passes: o.passes || 2 });
}

/** Hachures : la seule « matiere » autorisee sur une planche. */
export function hatch(x, y, w, h, d, o = {}) {
  const { step = 3.2, w: lw = 1, op = 0.7, slant = 0.55, jitter = 1 } = o;
  let out = '';
  for (let i = -h; i < w; i += step) {
    out += sketch([[x + i + d.f(-jitter, jitter), y],
                   [x + i + h * slant + d.f(-jitter, jitter), y + h]], d,
      { w: lw, amp: 0.35, passes: 1, op });
  }
  return out;
}

/* --------------------------------------------------------------------------
   Le geste de la main : ce qui distingue un dessin d'une icone telechargee.
   -------------------------------------------------------------------------- */

/** Prolonge une polyligne au-dela de ses deux bouts : le trait qui depasse. */
export function overshoot(pts, len = 1.2) {
  if (pts.length < 2 || len <= 0) return pts;
  const ext = (a, b, l) => {
    const dx = a[0] - b[0], dy = a[1] - b[1];
    const m = Math.hypot(dx, dy) || 1;
    return [a[0] + (dx / m) * l, a[1] + (dy / m) * l];
  };
  const out = pts.slice();
  out[0] = ext(pts[0], pts[1], len);
  out[out.length - 1] = ext(pts[out.length - 1], pts[out.length - 2], len);
  return out;
}

/** Trait libre : tremble, repasse, et qui deborde aux extremites. */
export function pen(pts, d, o = {}) {
  return sketch(overshoot(pts, o.over ?? 1.1), d,
    { w: o.w ?? 2, amp: o.amp ?? 0.4, passes: o.passes ?? 2, op: o.op ?? 1 });
}

/**
 * Contour ferme trace d'un seul geste : la main revient sur son point de
 * depart et le croise legerement. C'est cette petite queue qui donne le
 * sentiment que quelqu'un a dessine la forme.
 */
export function penLoop(pts, d, o = {}) {
  const tail = o.tail ?? 2;
  const seq = pts.concat(pts.slice(0, Math.min(tail, pts.length)));
  return pen(seq, d, { ...o, over: o.over ?? 1.4 });
}

/** Le contour d'une gelule VERTICALE : caps en haut et en bas. */
export function capsuleOutlineV(cx, cy, len, dia, steps = 7) {
  const r = dia / 2, half = Math.max(0, len / 2 - r);
  const pts = [];
  for (let i = 0; i <= steps; i++) {                 /* cap du haut */
    const a = Math.PI + (i / steps) * Math.PI;
    pts.push([cx + Math.cos(a) * r, cy - half + Math.sin(a) * r]);
  }
  for (let i = 0; i <= steps; i++) {                 /* cap du bas  */
    const a = (i / steps) * Math.PI;
    pts.push([cx + Math.cos(a) * r, cy + half + Math.sin(a) * r]);
  }
  return pts;
}

/** Le contour d'une gelule, en points : de quoi le tracer a la main. */
export function capsuleOutline(cx, cy, len, dia, steps = 7) {
  const r = dia / 2, half = len / 2 - r;
  const pts = [];
  for (let i = 0; i <= steps; i++) {                 /* cap droit */
    const a = -Math.PI / 2 + (i / steps) * Math.PI;
    pts.push([cx + half + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  for (let i = 0; i <= steps; i++) {                 /* cap gauche */
    const a = Math.PI / 2 + (i / steps) * Math.PI;
    pts.push([cx - half + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/**
 * Hachure en eventail : des traits partent tous d'un meme point et balaient
 * une zone. C'est la maniere dont on ombre une moitie de comprime.
 */
export function fan(ox, oy, targets, d, o = {}) {
  let out = '';
  for (const [x, y] of targets) {
    out += sketch([[ox, oy], [x, y]], d,
      { w: o.w ?? 1, amp: o.amp ?? 0.3, passes: 1, op: o.op ?? 0.95 });
  }
  return out;
}

/**
 * Courbe lisse passant PAR les points, en Catmull-Rom convertie en cubiques.
 * Une interpolation qui passe a cote des points serait un mensonge : sur une
 * courbe de tension, chaque point est une mesure reelle.
 * @param {number} tension 0 = anguleux, 1 = tres arrondi. 0.5 est le classique.
 */
export function splinePath(pts, tension = 0.5) {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M${n(pts[0][0])} ${n(pts[0][1])}L${n(pts[1][0])} ${n(pts[1][1])}`;
  const k = tension / 6;
  let d = `M${n(pts[0][0])} ${n(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1],
          p3 = pts[i + 2] || pts[i + 1];
    d += `C${n(p1[0] + (p2[0] - p0[0]) * k)} ${n(p1[1] + (p2[1] - p0[1]) * k)}` +
         ` ${n(p2[0] - (p3[0] - p1[0]) * k)} ${n(p2[1] - (p3[1] - p1[1]) * k)}` +
         ` ${n(p2[0])} ${n(p2[1])}`;
  }
  return d;
}

/** Echantillonne une courbe lisse en points : de quoi la tracer a la main. */
export function splinePoints(pts, parSegment = 8, tension = 0.5) {
  if (pts.length < 2) return pts.slice();
  const k = tension / 6, out = [pts[0]];
  const cube = (a, b, c, e, t) => {
    const u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * e;
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1],
          p3 = pts[i + 2] || pts[i + 1];
    const c1 = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2 = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    for (let j = 1; j <= parSegment; j++) {
      const t = j / parSegment;
      out.push([cube(p1[0], c1[0], c2[0], p2[0], t), cube(p1[1], c1[1], c2[1], p2[1], t)]);
    }
  }
  return out;
}

/**
 * Hachure bornee par une silhouette fermee, sans masque SVG.
 * On balaie des diagonales et on ne garde que le segment qui tombe DANS le
 * polygone : c'est ce qui permet d'ombrer le dessous d'une courbe sans
 * qu'un seul trait ne deborde.
 */
export function hatchInside(poly2, d, o = {}) {
  const { step = 5, w = 0.8, op = 0.45, slant = 1 } = o;
  const xs = poly2.map((p) => p[0]), ys = poly2.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  let out = '';
  for (let c = x0 - (y1 - y0) * slant; c < x1 + (y1 - y0) * slant; c += step) {
    /* La diagonale : x = c + (y - y0) * slant. On cherche ses entrees et
       sorties du polygone, deux a deux. */
    const croisements = [];
    for (let i = 0; i < poly2.length; i++) {
      const a = poly2[i], b = poly2[(i + 1) % poly2.length];
      /* On n'ecarte que les aretes PARALLELES a la hachure. Ecarter les
         aretes horizontales, comme je l'avais fait d'abord, laisse un nombre
         impair de croisements sur une gelule ou une aire : les segments se
         reapparient alors de travers et la hachure part dans le decor. */
      const den = (b[1] - a[1]) * slant - (b[0] - a[0]);
      if (Math.abs(den) < 1e-9) continue;
      const t = (a[0] - c - (a[1] - y0) * slant) / den;
      if (t < 0 || t > 1) continue;
      croisements.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    /* La droite est monotone en y : trier par y suffit a apparier
       entree/sortie. Les doublons exacts (un sommet touche pile) fausseraient
       l'appariement, on les fusionne. */
    croisements.sort((p, q) => p[1] - q[1]);
    for (let i = croisements.length - 1; i > 0; i--) {
      if (Math.abs(croisements[i][1] - croisements[i - 1][1]) < 1e-6 &&
          Math.abs(croisements[i][0] - croisements[i - 1][0]) < 1e-6) {
        croisements.splice(i, 1);
      }
    }
    for (let i = 0; i + 1 < croisements.length; i += 2) {
      out += sketch([croisements[i], croisements[i + 1]], d,
        { w, amp: 0.25, passes: 1, op });
    }
  }
  return out;
}

/** Points regulierement repartis sur un arc : les cibles d'un eventail. */
export function arcPoints(cx, cy, r, a0, a1, count, ry = null) {
  const R = (a) => (a * Math.PI) / 180;
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = R(a0 + ((a1 - a0) * i) / Math.max(1, count - 1));
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * (ry ?? r)]);
  }
  return out;
}

/* ==========================================================================
   3. ENVELOPPE SVG
   ========================================================================== */
export function svgWrap(inner, o = {}) {
  const { size = 24, cls = '', label = null, box = `0 0 ${size} ${size}` } = o;
  return `<svg viewBox="${box}" class="${cls}" fill="none"` +
    (label ? ` role="img" aria-label="${String(label).replace(/"/g, '')}"` : ' aria-hidden="true"') +
    `>${inner}</svg>`;
}
