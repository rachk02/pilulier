/* ============================================================================
   simple.js — l'ecran du patient.

   Pas d'onglets, pas de menu, pas de reglages : une prise a la fois, en tres
   gros, et deux boutons. Tout ce qui n'aide pas a avaler le bon comprimé a
   ete retire. La sortie demande un appui long, pour qu'on n'en sorte pas par
   accident.
   ========================================================================== */
import { el, ico, fmtDose, fmtDate, fmtTime, relTime, pad2 } from '../util.js';
import { activeProfile, dosesForDate, groupByTime, markTaken, markSkipped, clearIntake,
         getS, setS } from '../store.js';
import { formOf, foodLabel } from '../schema.js';
import { say, shutUp, doseSentence, supported as voiceOK } from '../speech.js';
import { toast, haptic } from '../ui.js';
import { doneStamp } from '../illus.js';

export const title = 'Mode simple';

/** Prochaine chose a faire : le premier creneau non valide de la journee. */
function currentGroup(profileId) {
  const groups = groupByTime(dosesForDate(new Date(), profileId));
  const pending = groups.filter((g) => g.doses.some((d) => !d.intake));
  if (!pending.length) return null;
  const now = Date.now();
  /* Le creneau du moment : le dernier deja arrive, sinon le prochain. */
  const past = pending.filter((g) => g.doses[0].planned.getTime() <= now);
  return past.length ? past[past.length - 1] : pending[0];
}

export function render(ctx) {
  const p = activeProfile();
  const root = el('div', { class: 'simple' });
  if (!p) return root;

  const all = dosesForDate(new Date(), p.id);
  const done = all.filter((d) => d.status === 'taken').length;
  const group = currentGroup(p.id);

  /* ---------- bandeau ---------- */
  root.append(el('div', { class: 'simple-top' },
    el('span', { class: 't-upper', text: fmtDate(new Date(), 'long') }),
    el('span', { class: 'simple-count t-num', text: `${done} / ${all.length}` })));

  if (!group) {
    root.append(el('div', { class: 'simple-done' },
      el('div', { class: 'simple-check', html: doneStamp() }),
      el('div', { class: 'simple-big', text: all.length ? 'Tout est pris' : 'Rien à prendre' }),
      el('p', { class: 'simple-sub',
        text: all.length ? 'Bravo. Rien d’autre à faire aujourd’hui.'
                         : 'Aucun médicament prévu aujourd’hui.' })));
    root.append(exitBar(ctx));
    return root;
  }

  const pending = group.doses.filter((d) => !d.intake);
  const d = pending[0];
  const f = formOf(d.med.form);
  const late = d.status === 'missed';

  /* ---------- l'heure ---------- */
  root.append(el('div', { class: 'simple-hour' + (late ? ' late' : '') },
    el('div', { class: 'simple-time t-num', text: group.time }),
    el('div', { class: 't-upper',
      text: late ? 'en retard — à prendre maintenant' : relTime(d.planned) })));

  /* ---------- le medicament ---------- */
  const card = el('div', { class: 'simple-card', style: { '--pillcolor': d.med.color } });
  if (d.med.photo) {
    card.append(el('div', { class: 'simple-photo' }, el('img', { src: d.med.photo, alt: '' })));
  } else {
    const box = el('div', { class: 'simple-photo simple-photo-empty' });
    box.innerHTML = ico(f.icon);
    card.append(box);
  }
  card.append(el('div', { class: 'simple-name', text: d.med.name }));
  card.append(el('div', { class: 'simple-dose',
    text: `${fmtDose(d.dose)} ${f.unit}${d.med.strength ? ' · ' + d.med.strength : ''}` }));
  if (d.med.food_rule && d.med.food_rule !== 'any') {
    card.append(el('div', { class: 'simple-food', text: foodLabel(d.med.food_rule) }));
  }
  if (pending.length > 1) {
    card.append(el('div', { class: 'simple-more',
      text: `et ${pending.length - 1} autre${pending.length > 2 ? 's' : ''} à cette heure` }));
  }
  root.append(card);

  /* ---------- les deux boutons ---------- */
  const takeBtn = el('button', { class: 'simple-btn simple-yes', type: 'button',
    html: ico('check') + '<span>J’AI PRIS</span>' });
  takeBtn.addEventListener('click', () => {
    markTaken(d); haptic('ok'); shutUp();
    const rest = dosesForDate(new Date(), p.id).filter((x) => !x.intake).length;
    if (getS('voice')) say(rest ? 'C’est noté.' : 'C’est noté. Tout est pris pour aujourd’hui.',
      { voice: getS('voice_name'), rate: getS('voice_rate') });
    ctx.refresh();
  });

  const laterBtn = el('button', { class: 'simple-btn simple-no', type: 'button',
    html: ico('snooze') + '<span>PAS ENCORE</span>' });
  laterBtn.addEventListener('click', () => {
    haptic('tap'); shutUp();
    toast('D’accord. Le rappel reviendra.', { duration: 2200 });
    ctx.refresh();
  });

  root.append(el('div', { class: 'simple-actions' }, takeBtn, laterBtn));

  if (voiceOK() && getS('voice')) {
    root.append(el('button', { class: 'simple-listen', type: 'button',
      html: ico('sound') + '<span>Réécouter</span>',
      onclick: () => { shutUp(); say(doseSentence(d),
        { voice: getS('voice_name'), rate: getS('voice_rate') }); } }));
  }

  root.append(exitBar(ctx));
  return root;
}

/** Sortie protegee : trois secondes d'appui, pour ne pas en sortir par megarde. */
function exitBar(ctx) {
  const locked = getS('simple_lock');
  const bar = el('div', { class: 'simple-exit' });
  const btn = el('button', { class: 'simple-exit-btn', type: 'button',
    text: locked ? 'Appui long pour quitter' : 'Quitter le mode simple' });

  if (!locked) {
    btn.addEventListener('click', () => { setS('simple_mode', false); ctx.refresh(); });
  } else {
    let t = null, filled = null;
    const start = () => {
      btn.classList.add('holding');
      t = setTimeout(() => {
        btn.classList.remove('holding');
        haptic('ok'); setS('simple_mode', false); ctx.refresh();
      }, 3000);
    };
    const stop = () => { clearTimeout(t); btn.classList.remove('holding'); };
    btn.addEventListener('pointerdown', start);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((e) => btn.addEventListener(e, stop));
  }
  bar.append(btn);
  return bar;
}
