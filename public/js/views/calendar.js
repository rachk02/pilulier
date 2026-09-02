/* calendar.js — vue mensuelle : d'un coup d'oeil, les jours tenus et les oublis. */
import { el, ico, dkey, fromKey, addDays, fmtDate, relDay, MOIS_C, JOURS_L, pad2 } from '../util.js';
import { activeProfile, dosesForDate, dayStatus, adherence, streak } from '../store.js';
import { emptyState, haptic } from '../ui.js';
import { doseRow } from './today.js';

export const title = 'Calendrier';

export function render(ctx) {
  const p = activeProfile();
  const root = el('div', { class: 'view' });
  if (!p) return root;

  const sel = ctx.state.day ? new Date(ctx.state.day) : new Date();
  const cursor = ctx.state.month ? fromKey(ctx.state.month + '-01') : new Date(sel.getFullYear(), sel.getMonth(), 1);

  /* ------------------------------------------------------- resume */
  const a30 = adherence(p.id, 30);
  root.append(el('div', { class: 'stat-grid', style: { marginBottom: 'var(--s-4)' } },
    stat(a30.rate === null ? '—' : a30.rate + '%', 'Observance 30 j'),
    stat(String(streak(p.id)), "Jours d'affilée"),
    stat(String(a30.taken), 'Prises validées'),
    stat(String(a30.missed), 'Oubliées')));

  /* ------------------------------------------------------- grille */
  const cal = el('div', { class: 'cal' });
  cal.append(el('div', { class: 'cal-head' },
    el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mois précédent', html: ico('chevL'),
      onclick: () => ctx.setMonth(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)) }),
    el('b', { class: 't-h3', text: `${MOIS_C[cursor.getMonth()]} ${cursor.getFullYear()}` }),
    el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mois suivant', html: ico('chevR'),
      onclick: () => ctx.setMonth(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) })));

  const grid = el('div', { class: 'cal-grid' });
  JOURS_L.forEach((d) => grid.append(el('div', { class: 'cal-dow', text: d })));

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;             // semaine commencant lundi
  const start = addDays(first, -offset);
  const todayKey = dkey();

  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    const inMonth = d.getMonth() === cursor.getMonth();
    const st = dayStatus(d, p.id);
    const cell = el('button', { type: 'button',
      class: ['cal-day', inMonth ? '' : 'other', dkey(d) === todayKey ? 'today' : '',
              dkey(d) === dkey(sel) ? 'sel' : ''].filter(Boolean).join(' '),
      'aria-label': `${fmtDate(d, 'full')} — ${statusText(st)}` });
    cell.append(el('span', { text: String(d.getDate()) }));
    cell.append(dots(st));
    cell.addEventListener('click', () => { haptic('tap'); ctx.setDay(d, true); });
    grid.append(cell);
  }
  cal.append(grid);
  cal.append(el('div', { class: 'legend', style: { marginTop: 'var(--s-4)' } },
    leg('dot-ok', 'Tout pris'), leg('dot-warn', 'Partiel'),
    leg('dot-bad', 'Oublié'), leg('dot-idle', 'À venir / rien')));

  /* La legende nomme les couleurs, elle ne dit pas QUAND elles changent.
     Sans cette phrase, on regarde un calendrier dont on ne connait pas la
     regle — et on ne peut donc rien en conclure. */
  cal.append(el('p', { class: 't-xs t-mute', style: { marginTop: 'var(--s-2)' },
    text: 'Un jour passe au vert quand toutes ses prises sont validées, à l’ambre dès qu’il en manque une, '
        + 'au rouge si aucune ne l’a été. Tant que l’heure n’est pas passée, il reste gris. '
        + 'Un point par prise : plein si elle est validée.' }));
  root.append(cal);

  /* --------------------------------------------------- jour choisi */
  const doses = dosesForDate(sel, p.id);
  const day = el('div', { class: 'section' });
  day.append(el('div', { class: 'section-head' },
    el('h2', { text: relDay(sel) }),
    el('button', { class: 'btn btn-sm btn-ghost', text: 'Voir en détail',
      onclick: () => { ctx.setDay(sel); ctx.go('today'); } })));
  if (!doses.length) {
    day.append(el('div', { class: 'card' },
      el('p', { class: 't-sm t-mute t-center', text: 'Aucune prise ce jour-là.' })));
  } else {
    const list = el('div', { class: 'stagger' });
    doses.forEach((d, i) => list.append(doseRow(d, ctx, i)));
    day.append(list);
  }
  root.append(day);
  return root;
}

/*
 * Les points comptaient `ceil(total / 2)`, plafonne a trois : un nombre qui ne
 * voulait rien dire, et qu'on ne pouvait donc pas lire. Un point vaut
 * desormais une prise — plein si elle est validee, creux sinon. Au-dela de
 * quatre prises on s'arrete : la case fait 40 px.
 */
function dots(st) {
  const wrap = el('div', { class: 'dots' });
  if (st.state === 'idle') return wrap;
  const cls = { ok: 'dot-ok', partial: 'dot-warn', bad: 'dot-bad', future: 'dot-idle' }[st.state];
  const n = Math.min(4, st.total);
  const pleins = Math.min(n, Math.round((st.taken / (st.total || 1)) * n));
  for (let i = 0; i < n; i++) {
    wrap.append(el('i', { class: cls + (i < pleins ? '' : ' creux') }));
  }
  return wrap;
}
const statusText = (st) => {
  const base = { ok: 'toutes les prises validées', partial: 'partiellement pris',
    bad: 'aucune prise validée', future: 'à venir', idle: 'rien de prévu' }[st.state];
  return st.total ? `${base} (${st.taken} sur ${st.total})` : base;
};
const leg = (cls, label) => el('span', {}, el('i', { class: cls }), label);
const stat = (v, l) => el('div', { class: 'stat' }, el('b', { class: 't-num', text: v }),
  el('small', { text: l }));
