/* util.js — helpers partages : DOM, dates, formats, icones. */
import { t, langue } from './i18n.js';
export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Cree un element avec attributs + enfants. */
/*
 * La traduction passe par ici, et par ici seulement.
 *
 * Toute phrase affichee traverse `el({ text })`, `el({ placeholder })` ou un
 * `aria-label`. Les faire passer par `t()` traduit donc l'application entiere
 * sans qu'on ait a envelopper six cents chaines a la main — et sans risque,
 * puisque `t()` rend le francais quand il ne connait pas la phrase.
 *
 * Ce que ce crochet ne peut pas traduire : les phrases fabriquees par
 * interpolation (`${n} prises validées`). Celles-la doivent appeler `t()`
 * explicitement, avec des variables. `check.mjs` mesure la couverture.
 */
export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'text') n.textContent = typeof v === 'string' ? t(v) : v;
    else if ((k === 'placeholder' || k === 'title' || k === 'aria-label')
             && typeof v === 'string') n.setAttribute(k, t(v));
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) {
    if (k === null || k === undefined || k === false) continue;
    n.append(k.nodeType ? k : document.createTextNode(
      typeof k === 'string' ? t(k) : String(k)));
  }
  return n;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () => (crypto.randomUUID
  ? crypto.randomUUID()
  : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));

export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function debounce(fn, ms = 300) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ---------------------------------------------------------------- DATES */
export const DAY_MS = 86400000;
export const pad2 = (n) => String(n).padStart(2, '0');

/** Cle locale AAAA-MM-JJ (jamais d'UTC : evite les decalages de jour). */
export const dkey = (d = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };
export const startOfDay = (d) => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; };
export const sameDay = (a, b) => dkey(a) === dkey(b);
export const isToday = (d) => sameDay(d, new Date());

/** "08:30" + date -> objet Date local */
export function atTime(date, hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const c = new Date(date); c.setHours(h || 0, m || 0, 0, 0); return c;
}

export const MOIS = ['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'];
export const MOIS_C = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
export const JOURS  = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
export const JOURS_S= ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
/** Semaine commencant le lundi (index 0 = lundi) */
export const JOURS_L = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

/*
 * Les dates suivent la langue de l'application.
 *
 * En francais, on garde les tableaux ci-dessus : ils sont sans accents la ou
 * il faut, et l'ordre « Mardi 25 aout » est celui qu'on veut. Dans une autre
 * langue, on laisse `Intl` faire — il connait l'ordre, les abreviations et
 * les majuscules de chaque langue mieux qu'une table ecrite a la main.
 */
export function fmtDate(d, style = 'long') {
  const dt = typeof d === 'string' ? fromKey(d) : d;
  const l = langue();
  if (l !== 'fr') {
    const opts = style === 'long' ? { weekday: 'long', day: 'numeric', month: 'long' }
      : style === 'short' ? { day: 'numeric', month: 'short' }
      : style === 'full' ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : { day: '2-digit', month: '2-digit', year: 'numeric' };
    try { return new Intl.DateTimeFormat(l, opts).format(dt); } catch { /* repli */ }
  }
  if (style === 'long')  return `${JOURS[dt.getDay()]} ${dt.getDate()} ${MOIS[dt.getMonth()]}`;
  if (style === 'short') return `${dt.getDate()} ${MOIS[dt.getMonth()].slice(0, 4)}.`;
  if (style === 'full')  return `${JOURS[dt.getDay()]} ${dt.getDate()} ${MOIS[dt.getMonth()]} ${dt.getFullYear()}`;
  return `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

/** Les jours de la semaine, dans la langue courante. */
export function joursCourts(depuisLundi = true) {
  const l = langue();
  if (l === 'fr') return depuisLundi ? JOURS_L : JOURS_S;
  const base = new Date(2024, 0, 1);        /* un lundi */
  const f = new Intl.DateTimeFormat(l, { weekday: 'short' });
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base); d.setDate(base.getDate() + i);
    out.push(f.format(d));
  }
  return depuisLundi ? out : [out[6], ...out.slice(0, 6)];
}

export function relDay(d) {
  const dt = typeof d === 'string' ? fromKey(d) : d;
  const diff = Math.round((startOfDay(dt) - startOfDay(new Date())) / DAY_MS);
  if (diff === 0)  return t("Aujourd'hui");
  if (diff === 1)  return t('Demain');
  if (diff === -1) return t('Hier');
  return fmtDate(dt, 'long');
}

export const fmtTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

/** "dans 12 min" / "il y a 3 h" */
export function relTime(target, now = new Date()) {
  const m = Math.round((target - now) / 60000);
  const a = Math.abs(m);
  let txt;
  if (a < 1) return t("à l'instant");
  if (a < 60) txt = `${a} ${t('min')}`;
  else if (a < 1440) txt = `${Math.floor(a / 60)} ${t('h')}${a % 60 ? ' ' + (a % 60) : ''}`;
  else txt = `${Math.round(a / 1440)} ${t('j')}`;
  return m > 0 ? t('dans {d}', { d: txt }) : t('il y a {d}', { d: txt });
}

/** 0.5 -> "1/2", 1.5 -> "1 1/2", 2 -> "2" */
export function fmtDose(n) {
  const v = Number(n) || 0;
  const whole = Math.floor(v), frac = +(v - whole).toFixed(2);
  const map = { 0.25: '1/4', 0.5: '1/2', 0.75: '3/4', 0.33: '1/3', 0.67: '2/3' };
  const f = map[frac];
  if (!f) return String(+v.toFixed(2));
  return whole ? `${whole} ${f}` : f;
}

/* L'ecriture d'un montant depend de sa devise : le franc CFA n'a pas de
   centimes, l'euro si. Le detail vit dans money.js — ici on ne fait que le
   reexporter, pour que les vues n'aient pas a changer d'import. */
export { fmt as fmtMoney, normaliser as codeDevise, devise } from './money.js';

/* ---------------------------------------------------------------- ICONES */
/* Les icones ne vivent plus ici : elles sont dessinees par le code dans
   icons.js, a partir des primitives de draw.js. On les re-exporte pour que
   tout le reste de l'application continue a ecrire `import { ico } from
   '../util.js'`. */
export { ico, icoEl, ICON_NAMES } from './icons.js';
