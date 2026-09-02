/* today.js — ecran d'accueil : la journee en cours, prise par prise. */
import { el, ico, fmtDose, fmtDate, relDay, relTime, fmtTime, dkey, addDays, pad2 } from '../util.js';
import { t } from '../i18n.js';
import { dosesForDate, groupByTime, activeProfile, toggleTaken, markSkipped, markTaken,
         takeAll, lowStockMeds, streak, getS, clearIntake } from '../store.js';
import { formOf, foodLabel } from '../schema.js';
import { toast, confirmDialog, celebrate, openSheet, emptyState, haptic } from '../ui.js';
import { nextDose } from '../alarm.js';
import { openMedForm } from './meds.js';
import { missStreaks, adviceFor } from '../safety.js';
import { say, shutUp, doseSentence, supported as voiceOK } from '../speech.js';
import { medsOf, supplyStatus, isExpired } from '../store.js';
import { fmtExpiry } from '../boxscan.js';

export const title = "Aujourd'hui";

export function render(ctx) {
  const p = activeProfile();
  const root = el('div', { class: 'view' });
  if (!p) {
    root.append(emptyState('users', 'Aucun profil', "Crée d'abord un profil pour commencer.",
      el('button', { class: 'btn btn-primary', text: 'Créer un profil',
        onclick: () => ctx.openProfiles() })));
    return root;
  }

  const date = ctx.state.day ? new Date(ctx.state.day) : new Date();
  const isToday = dkey(date) === dkey();
  const doses = dosesForDate(date, p.id);
  const taken = doses.filter((d) => d.status === 'taken').length;
  const pct = doses.length ? Math.round((taken / doses.length) * 100) : 0;

  /* ---------- Bandeau du jour ---------- */
  root.append(heroCard({ ctx, p, date, isToday, doses, taken, pct }));

  /* ---------- Alertes ---------- */
  const low = lowStockMeds(p.id);
  if (low.length) {
    root.append(el('div', { class: 'banner', style: { marginTop: 'var(--s-4)' } },
      wrapIco('warn'),
      el('div', { class: 'grow' },
        el('b', { text: low.length === 1 ? 'Stock bientôt épuisé' : `${low.length} stocks bientôt épuisés` }),
        el('span', { class: 't-sm', text: low.map((m) => m.name).join(', ') })),
      el('button', { class: 'btn btn-sm btn-ghost', text: 'Voir', onclick: () => ctx.go('meds') })));
  }
  /* Alertes de securite : une molecule critique oubliee plusieurs jours. */
  for (const a of missStreaks(p.id, medsOf(p.id), dosesForDate)) {
    root.append(el('div', { class: `banner ${a.level === 'bad' ? 'banner-bad' : ''}`,
      style: { marginTop: 'var(--s-3)' } },
      wrapIco('warn'),
      el('div', { class: 'grow' },
        el('b', { text: `${a.med.name} — ${a.streak} jour${a.streak > 1 ? 's' : ''} sans prise` }),
        el('span', { class: 't-sm', text: a.text })),
      p.doctor_phone ? el('a', { class: 'btn btn-sm btn-ghost', href: 'tel:' + p.doctor_phone,
        text: 'Appeler' }) : null));
  }

  const missed = doses.filter((d) => d.status === 'missed');
  if (missed.length && isToday) {
    root.append(el('div', { class: 'banner banner-bad', style: { marginTop: 'var(--s-3)' } },
      wrapIco('clock'),
      el('div', { class: 'grow' },
        el('b', { text: missed.length > 1
            ? t('{n} prises en retard', { n: missed.length })
            : t('1 prise en retard') }),
        el('span', { class: 't-sm', text: 'Tu peux encore la valider ou la marquer comme sautée.' }))));
  }

  /* ---------- Ligne du temps ---------- */
  if (!doses.length) {
    root.append(emptyState('pill', 'Rien de prévu',
      isToday ? "Aucune prise programmée aujourd'hui." : `Aucune prise le ${fmtDate(date, 'long')}.`,
      el('button', { class: 'btn btn-primary', html: ico('plus') + '<span>Ajouter un médicament</span>',
        onclick: () => openMedForm(ctx, null) })));
    return root;
  }

  const now = new Date();
  const groups = groupByTime(doses);
  /*
   * Le repere de la ligne du temps. Il designait « le dernier creneau dont
   * l'heure est passee » — ce qui laissait « maintenant » colle a 08:00 
   * jusqu'au soir, y compris quand les trois prises de 8 h etaient validees
   * depuis longtemps. Un repere doit dire quoi faire, pas rappeler ce qui est
   * fait. Trois etats, dans cet ordre de priorite :
   *   c'est l'heure  — une prise est dans sa fenetre de rappel ;
   *   en retard      — une prise est passee sans reponse ;
   *   a suivre       — rien a faire, voici la prochaine.
   * Et quand la journee est finie, aucun repere : c'est l'information.
   */
  const repere = isToday ? repereDuJour(groups) : null;

  for (const g of groups) {
    const marque = repere && repere.time === g.time ? repere : null;
    const block = el('div', { class: 'timeblock' + (marque ? ' is-' + marque.etat : '') });
    const allTaken = g.doses.every((d) => d.status === 'taken');
    block.append(el('div', { class: 'timeblock-head' },
      el('span', { class: 'timeblock-time', text: g.time }),
      el('span', { class: 'timeblock-line' }),
      marque ? el('span', { class: 'timeblock-tag', text: marque.mot }) : null,
      !allTaken && g.doses.length > 1
        ? el('button', { class: 'btn btn-sm btn-ghost', text: 'Tout valider',
            onclick: (e) => { const n = takeAll(g.doses); haptic('ok');
              toast(n > 1 ? t('{n} prises enregistrées', { n }) : t('1 prise enregistrée'),
                { type: 'ok' });
              celebrate(e.currentTarget); ctx.refresh(); } })
        : null));
    const list = el('div', { class: 'stagger' });
    g.doses.forEach((d, i) => list.append(doseRow(d, ctx, i)));
    block.append(list);
    root.append(block);
  }

  root.append(el('p', { class: 't-xs t-mute t-center', style: { marginTop: 'var(--s-6)' },
    text: 'Appuie sur la pastille pour valider. Appuie longuement sur une ligne pour plus d’options.' }));
  return root;
}

/**
 * Quel creneau porte le repere, et sous quel mot. Rend null quand il n'y a
 * plus rien a signaler — une journee terminee n'a pas besoin d'une fleche.
 */
function repereDuJour(groups) {
  const due = groups.find((g) => g.doses.some((d) => d.status === 'due'));
  if (due) return { time: due.time, etat: 'now', mot: t('c’est l’heure') };

  const retard = groups.filter((g) => g.doses.some((d) => d.status === 'missed')).pop();
  if (retard) return { time: retard.time, etat: 'late', mot: t('en retard') };

  const suivante = groups.find((g) => g.doses.some((d) => d.status === 'upcoming'));
  if (suivante) return { time: suivante.time, etat: 'next', mot: t('à suivre') };

  return null;
}

const wrapIco = (n) => { const s = el('span'); s.innerHTML = ico(n); return s.firstElementChild; };

/* --------------------------------------------------------------- Bandeau
   Panneau d'en-tete : une reglette d'instrument, un segment par prise.
   Rempli = pris, hachure = saute, encadre rouge = en retard. */
function heroCard({ ctx, p, date, isToday, doses, taken, pct }) {
  const card = el('div', { class: 'card card-hero' });

  card.append(el('div', { class: 'row-between', style: { marginBottom: 'var(--s-2)' } },
    el('span', { class: 't-upper', text: relDay(date) }),
    el('div', { class: 'row gap-1' },
      navBtn('chevL', 'Jour précédent', () => ctx.setDay(addDays(date, -1))),
      isToday ? null : el('button', { class: 'btn btn-sm btn-ghost', text: 'Auj.',
        onclick: () => ctx.setDay(new Date()) }),
      navBtn('chevR', 'Jour suivant', () => ctx.setDay(addDays(date, 1))))));

  /* La date du jour. Les capitales appartiennent a la peau, pas au code :
     c'est la classe qui decide, pour qu'une autre peau puisse dire non. */
  card.append(el('div', { class: 't-h2 t-date', text: fmtDate(date, 'long') }));

  /* La reglette */
  const gauge = el('div', { class: 'gauge', role: 'img',
    'aria-label': t('{n} prises validées sur {total}', { n: taken, total: doses.length }) });
  if (doses.length) {
    for (const d of doses) {
      const cls = d.status === 'taken' ? 'on' : d.status === 'skipped' ? 'skip'
        : d.status === 'missed' ? 'late' : '';
      gauge.append(el('i', { class: cls, title: `${d.time} ${d.med.name}` }));
    }
  } else {
    gauge.append(el('i', {}));
  }
  card.append(gauge);

  card.append(el('div', { class: 'gauge-read' },
    el('b', { class: 't-num', text: doses.length ? pct + '%' : '—' }),
    el('span', { class: 't-upper',
      text: t('{n} / {total} prises validées', { n: taken, total: doses.length }) })));

  /* Ce qui vient ensuite */
  const next = isToday ? nextDose(p.id) : null;
  card.append(el('hr', { class: 'divider' }));
  if (doses.length && pct === 100) {
    card.append(el('span', { class: 't-upper', text: 'Journée complète' }));
    card.append(el('div', { class: 't-h3', style: { marginTop: '4px' },
      text: `${streak(p.id)} jour(s) d'affilée sans oubli` }));
  } else if (next) {
    card.append(el('span', { class: 't-upper', text: 'Prochaine prise' }));
    card.append(el('div', { class: 'row-between', style: { marginTop: '4px', alignItems: 'baseline' } },
      el('b', { class: 't-h3 truncate', text: `${next.time} · ${next.med.name}` }),
      el('span', { class: 't-xs t-mute', style: { flex: 'none' }, text: next.in })));
    if (next.sameTime.length > 1) {
      card.append(el('div', { class: 't-xs t-mute',
        text: t('{n} médicaments à cette heure', { n: next.sameTime.length }) }));
    }
  } else {
    card.append(el('span', { class: 't-upper', text: 'Rien à venir' }));
    card.append(el('div', { class: 't-h3', style: { marginTop: '4px' },
      text: 'Aucune prise programmée d’ici la fin de journée' }));
  }
  return card;
}
function navBtn(icon, label, onclick) {
  return el('button', { class: 'icon-btn solid', type: 'button', 'aria-label': label,
    html: ico(icon), style: { width: '38px', height: '38px' }, onclick });
}

/* ------------------------------------------------------------ Une prise */
export function doseRow(d, ctx, i = 0) {
  const f = formOf(d.med.form);
  const row = el('div', { class: `dose ${statusClass(d.status)}`, style: {
    '--pillcolor': d.med.color || 'var(--brand-500)', '--i': i } });

  const pill = el('div', { class: 'dose-pill' });
  pill.innerHTML = ico(f.icon);
  row.append(pill);

  const meta = [`${fmtDose(d.dose)} ${t(f.unit)}`];
  if (d.med.strength) meta.unshift(d.med.strength);
  if (d.med.food_rule && d.med.food_rule !== 'any') meta.push(t(foodLabel(d.med.food_rule)).toLowerCase());
  if (d.status === 'taken' && d.intake?.taken_at) meta.push('pris à ' + fmtTime(new Date(d.intake.taken_at)));
  if (d.status === 'skipped') meta.push('sautée');
  if (d.status === 'missed') meta.push(t('en retard'));
  if (isExpired(d.med)) meta.push('BOÎTE PÉRIMÉE');

  row.append(el('div', { class: 'dose-body' },
    el('div', { class: 'dose-name truncate', text: d.med.name }),
    el('div', { class: 'dose-meta truncate', text: meta.join(' · ') })));

  const btn = el('button', { class: 'take-btn' + (d.status === 'taken' ? ' on' : ''),
    type: 'button', 'aria-label': d.status === 'taken' ? 'Annuler la prise' : 'Marquer comme pris',
    html: ico(d.status === 'taken' ? 'check' : d.status === 'skipped' ? 'skip' : 'check') });
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const on = toggleTaken(d);
    haptic(on ? 'ok' : 'tap');
    if (on) {
      const p = activeProfile();
      const rest = dosesForDate(new Date(), p.id).filter((x) => x.status !== 'taken').length;
      if (rest === 0) celebrate(e.currentTarget);
    }
    ctx.refresh();
  });
  row.append(el('div', { class: 'dose-actions' }, btn));

  /* Appui simple = fiche du medicament. Appui long / clic droit = idem, mais
     on evite alors le double declenchement au relachement du doigt. */
  let lp = null, longFired = false;
  const openMenu = () => doseMenu(d, ctx);
  row.addEventListener('contextmenu', (e) => { e.preventDefault(); longFired = true; openMenu(); });
  row.addEventListener('touchstart', () => {
    longFired = false;
    lp = setTimeout(() => { longFired = true; haptic('warn'); openMenu(); }, 520);
  }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach((ev) =>
    row.addEventListener(ev, () => clearTimeout(lp), { passive: true }));
  row.addEventListener('click', (e) => {
    if (longFired) { longFired = false; return; }
    if (!e.target.closest('.take-btn')) openMenu();
  });

  return row;
}

const statusClass = (s) => ({ taken: 'is-taken', skipped: 'is-skipped',
  missed: 'is-late', due: 'is-due' }[s] || '');

/* ------------------------------------------------------ Menu d'une prise */
function doseMenu(d, ctx) {
  const f = formOf(d.med.form);
  openSheet({
    title: d.med.name,
    body: (ctl) => {
      const box = el('div', { class: 'col gap-4' });
      box.append(el('div', { class: 'row wrap gap-2' },
        chip(`${d.med.strength || ''} ${f.label}`.trim(), 'info'),
        chip(t('{dose} {unite} à {heure}',
          { dose: fmtDose(d.dose), unite: t(f.unit), heure: d.time }), 'brand'),
        d.med.food_rule && d.med.food_rule !== 'any' ? chip(foodLabel(d.med.food_rule), 'warn') : null));
      if (isExpired(d.med)) {
        box.append(el('div', { class: 'banner banner-bad' }, wrapIco('warn'),
          el('div', { class: 'grow' },
            el('b', { text: `Boîte périmée le ${fmtExpiry(d.med.expiry)}` }),
            el('span', { class: 't-sm',
              text: 'Ne pas avaler. Rapporter la boîte à la pharmacie et en ouvrir une neuve.' }))));
      }
      if (d.med.photo) {
        box.append(el('img', { class: 'med-photo', src: d.med.photo, alt: `Boîte de ${d.med.name}` }));
      }
      if (d.med.instructions) box.append(el('p', { class: 't-sm t-soft', text: d.med.instructions }));
      const adv = adviceFor(d.med);
      if (adv) {
        box.append(el('div', { class: `banner ${adv.neverStop ? 'banner-bad' : 'banner-info'}` },
          wrapIco(adv.neverStop ? 'warn' : 'info'),
          el('div', { class: 'grow' },
            el('b', { text: adv.family }),
            ...adv.tips.map((t) => el('div', { class: 't-sm', text: '· ' + t })))));
      }
      if (voiceOK() && getS('voice')) {
        box.append(el('button', { class: 'btn btn-ghost btn-block', type: 'button',
          html: ico('sound') + '<span>Écouter la consigne</span>',
          onclick: () => { shutUp(); say(doseSentence(d),
            { voice: getS('voice_name'), rate: getS('voice_rate') }); } }));
      }
      if (d.med.notes) box.append(el('div', { class: 'banner banner-info' },
        wrapIco('info'), el('span', { class: 'grow', text: d.med.notes })));

      const actions = el('div', { class: 'col gap-2' });
      const act = (icon, label, cls, fn) => el('button', { class: `btn ${cls} btn-block`, type: 'button',
        html: ico(icon) + `<span>${label}</span>`, onclick: () => { fn(); ctl.close(); ctx.refresh(); } });

      if (d.status === 'taken') {
        actions.append(act('x', 'Annuler cette prise', 'btn-ghost', () => {
          clearIntake(d); toast('Prise annulée.'); }));
      } else {
        actions.append(act('check', 'Marquer comme pris', 'btn-primary', () => {
          markTaken(d); haptic('ok'); toast('Prise enregistrée.', { type: 'ok' }); }));
        actions.append(act('clock', "Pris à une autre heure", 'btn-ghost', () => askTime(d, ctx)));
        actions.append(act('skip', 'Sauter cette prise', 'btn-ghost', () => {
          markSkipped(d); toast('Prise marquée comme sautée.'); }));
      }
      actions.append(act('edit', 'Modifier le médicament', 'btn-ghost',
        () => setTimeout(() => openMedForm(ctx, d.med), 260)));
      box.append(actions);
      return box;
    },
  });
}

function askTime(d, ctx) {
  setTimeout(() => {
    const now = new Date();
    const inp = el('input', { class: 'input', type: 'time',
      value: `${pad2(now.getHours())}:${pad2(now.getMinutes())}` });
    const ctl = openSheet({
      title: 'Heure réelle de la prise',
      body: () => el('div', {}, el('p', { class: 't-sm t-soft',
        style: { marginBottom: 'var(--s-3)' }, text: `${d.med.name} — prévu à ${d.time}` }), inp),
      footer: (c) => [
        el('button', { class: 'btn btn-ghost', text: 'Annuler', onclick: () => c.close() }),
        el('button', { class: 'btn btn-primary', text: 'Enregistrer', onclick: () => {
          const [h, m] = inp.value.split(':').map(Number);
          const when = new Date(d.planned); when.setHours(h, m, 0, 0);
          markTaken(d, when.getTime()); c.close(); ctx.refresh();
          toast('Prise enregistrée à ' + inp.value, { type: 'ok' });
        } })],
    });
  }, 260);
}

function chip(text, kind = '') {
  return el('span', { class: `chip ${kind ? 'chip-' + kind : ''}`, text });
}
