/* meds.js — le traitement : liste des medicaments, formulaire complet, stock. */
import { el, ico, fmtDose, fmtMoney, devise, dkey, pad2, fmtDate } from '../util.js';
import { activeProfile, medsOf, schedulesOf, saveMed, deleteMed, archiveMed, unarchiveMed,
         addStock, daysLeft, dailyConsumption, parseTimes, parseWd, getS, db } from '../store.js';
import { FORMS, FOOD_RULES, MED_COLORS, formOf, foodLabel } from '../schema.js';
import { openSheet, confirmDialog, toast, field, input, textarea, select, emptyState,
         haptic, settingRow } from '../ui.js';
import { photoToDataURL } from '../avatars.js';
import { adviceFor, timingIssues } from '../safety.js';
import { supplyStatus, expiryWatch, isExpired } from '../store.js';
import { expiryStatus, fmtExpiry, shrinkImage } from '../boxscan.js';
import { refillText, share } from '../bulletin.js';

export const title = 'Traitement';

export function render(ctx) {
  const p = activeProfile();
  const root = el('div', { class: 'view' });
  if (!p) return root;

  const meds = medsOf(p.id);
  const archived = medsOf(p.id, true).filter((m) => m.archived);

  if (!meds.length && !archived.length) {
    root.append(emptyState('pill', 'Aucun médicament',
      `Ajoute le premier traitement de ${p.name}.`,
      el('div', { class: 'col gap-2', style: { width: '100%', maxWidth: '320px' } },
        el('button', { class: 'btn btn-primary btn-block',
          html: ico('camera') + '<span>Photographier une boîte</span>',
          onclick: () => import('./newmed.js').then((M) => M.openBoxScan(ctx)) }),
        el('button', { class: 'btn btn-ghost btn-block',
          html: ico('edit') + '<span>Saisir à la main</span>',
          onclick: () => openMedForm(ctx, null) }))));
    return root;
  }

  /* Peremption : ce qui ne doit plus etre avale. */
  const exp = expiryWatch(p.id);
  if (exp.length) {
    const dead = exp.filter((x) => x.level === 'expired');
    root.append(el('div', { class: `banner ${dead.length ? 'banner-bad' : ''}`,
      style: { marginBottom: 'var(--s-4)' } },
      icEl('warn'),
      el('div', { class: 'grow' },
        el('b', { text: dead.length ? 'Boîte périmée' : 'Péremption proche' }),
        el('span', { class: 't-sm', text: exp.map((x) =>
          `${x.med.name} : ${fmtExpiry(x.iso)}`).join(' · ') }),
        dead.length ? el('span', { class: 't-sm',
          text: 'Ne plus utiliser. Rapporter la boîte à la pharmacie.' }) : null)));
  }

  /* Renouvellement : ce qui va manquer en premier. */
  const urgent = supplyStatus(p.id).filter((x) => x.urgent);
  if (urgent.length) {
    root.append(el('div', { class: 'banner', style: { marginBottom: 'var(--s-4)' } },
      icEl('box'),
      el('div', { class: 'grow' },
        el('b', { text: 'Renouvellement à prévoir' }),
        el('span', { class: 't-sm', text: urgent.map((x) =>
          `${x.med.name} : ${x.left} j`).join(' · ') })),
      /* « Liste » renvoyait vers l'onglet Suivi, ou il fallait ensuite
         retrouver la bonne carte. Un bouton pose dans une alerte doit mener a
         ce qui resout l'alerte : ici, refaire les stocks. */
      el('button', { class: 'btn btn-sm btn-primary', text: 'Renouveler',
        onclick: () => openRenouvellement(ctx) })));
  }

  /* Recherche + entree rapide par la photo */
  const search = input({ type: 'search', placeholder: 'Rechercher un médicament…',
    'aria-label': 'Rechercher' });
  root.append(el('div', { class: 'row gap-2', style: { marginBottom: 'var(--s-4)' } },
    el('div', { class: 'grow' }, search),
    el('button', { class: 'icon-btn solid', type: 'button', 'aria-label': 'Photographier une boîte',
      html: ico('camera'),
      onclick: () => import('./newmed.js').then((M) => M.openBoxScan(ctx)) })));

  const list = el('div', { class: 'col gap-2 stagger' });
  const draw = (q = '') => {
    list.innerHTML = '';
    const f = meds.filter((m) => !q ||
      (m.name + ' ' + (m.dci || '')).toLowerCase().includes(q.toLowerCase()));
    if (!f.length) { list.append(el('p', { class: 't-sm t-mute t-center', text: 'Aucun résultat.' })); return; }
    f.forEach((m, i) => list.append(medCard(m, ctx, i)));
  };
  draw();
  search.addEventListener('input', () => draw(search.value));
  root.append(list);

  /* Recapitulatif du cout mensuel */
  const cost = meds.reduce((a, m) => {
    if (!m.pack_price || !m.pack_qty) return a;
    return a + (dailyConsumption(m.id) * 30 / m.pack_qty) * m.pack_price;
  }, 0);
  if (cost > 0) {
    root.append(el('div', { class: 'card', style: { marginTop: 'var(--s-5)' } },
      el('div', { class: 'row-between' },
        el('div', {}, el('b', { text: 'Coût estimé du traitement' }),
          el('div', { class: 't-xs t-mute', text: 'Sur 30 jours, d’après les prix saisis.' })),
        el('div', { class: 't-h3 t-num', style: { whiteSpace: 'nowrap', flex: 'none' },
          text: fmtMoney(cost, getS('currency')) }))));
  }

  if (archived.length) {
    root.append(el('div', { class: 'section' },
      el('div', { class: 'section-head' }, el('h2', { text: `Archivés (${archived.length})` })),
      el('div', { class: 'card card-flush' },
        ...archived.map((m) => settingRow({
          icon: formOf(m.form).icon, title: m.name, sub: m.strength || '',
          right: el('button', { class: 'btn btn-sm btn-ghost', text: 'Réactiver',
            onclick: () => { unarchiveMed(m.id); toast('Médicament réactivé.'); ctx.refresh(); } }),
        })))));
  }
  return root;
}

/* ------------------------------------------------------------ Une carte */
function medCard(m, ctx, i) {
  const f = formOf(m.form);
  const scheds = schedulesOf(m.id);
  const times = scheds.flatMap(parseTimes);
  const perDay = dailyConsumption(m.id);
  const left = daysLeft(m);
  const low = (m.stock_alert != null && m.stock_qty <= m.stock_alert) || (left !== null && left <= 5);
  const out = (m.stock_qty || 0) <= 0;

  const card = el('div', { class: 'card card-keyed pressable', style: { '--pillcolor': m.color,
    cursor: 'pointer' }, role: 'button', tabindex: '0' });

  const head = el('div', { class: 'row', style: { marginBottom: times.length ? 'var(--s-3)' : 0 } });
  const badge = el('div', { class: 'dose-pill', style: { '--pillcolor': m.color } });
  badge.innerHTML = ico(f.icon);
  head.append(badge, el('div', { class: 'grow', style: { minWidth: 0 } },
    el('div', { class: 'row gap-2' },
      el('b', { class: 'truncate', style: { flex: '1 1 auto' }, text: m.name }),
      m.strength ? el('span', { class: 't-sm t-mute', style: { flex: 'none' }, text: m.strength }) : null),
    el('div', { class: 't-xs t-mute truncate',
      text: [m.dci, f.label, m.food_rule && m.food_rule !== 'any' ? foodLabel(m.food_rule) : null]
        .filter(Boolean).join(' · ') })));
  head.insertAdjacentHTML('beforeend', ico('chevR', 'chev'));
  card.append(head);

  if (times.length) {
    const row = el('div', { class: 'row wrap gap-2', style: { marginBottom: 'var(--s-3)' } });
    for (const t of times.sort((a, b) => a.t.localeCompare(b.t))) {
      row.append(el('span', { class: 'chip chip-brand',
        html: ico('clock') + `<span>${t.t} · ${fmtDose(t.dose)} ${f.unit}</span>` }));
    }
    if (scheds.some((s) => s.kind !== 'daily')) {
      row.append(el('span', { class: 'chip', text: planLabel(scheds[0]) }));
    }
    card.append(row);
  }

  if (m.stock_qty !== null && m.stock_qty !== undefined) {
    const cap = Math.max(m.pack_qty || 30, m.stock_qty);
    const pctv = Math.min(100, ((m.stock_qty || 0) / cap) * 100);
    const bar = el('div', { class: `stockbar ${out ? 'out' : low ? 'low' : ''}` },
      el('i', { style: { width: '0%' } }));
    requestAnimationFrame(() => { bar.firstElementChild.style.width = pctv + '%'; });
    card.append(el('div', { class: 'col gap-1' }, bar,
      el('div', { class: 'row-between t-xs' },
        el('span', { class: out ? 't-mute' : 't-mute',
          text: `${fmtDose(m.stock_qty)} ${f.unit} en stock` }),
        el('span', { class: out ? 'chip chip-bad' : low ? 'chip chip-warn' : 't-mute',
          text: out ? 'épuisé' : left !== null ? `≈ ${left} jour${left > 1 ? 's' : ''}` :
            perDay ? `${fmtDose(perDay)} ${f.unit}/j` : '' }))));
  }

  const open = () => openMedSheet(m, ctx);
  card.addEventListener('click', open);
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  return card;
}

const planLabel = (s) => {
  if (!s) return '';
  const JS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  switch (s.kind) {
    case 'daily': return 'tous les jours';
    case 'weekdays': return parseWd(s).map((d) => JS[d]).join(', ') || 'jours choisis';
    case 'interval': return `tous les ${s.interval_days} jours`;
    case 'cycle': return `${s.cycle_on} j pris / ${s.cycle_off} j pause`;
    case 'prn': return 'si besoin';
    default: return '';
  }
};

/* ------------------------------------------------------- Fiche detaillee */
export function openMedSheet(m, ctx) {
  const f = formOf(m.form);
  openSheet({
    title: m.name,
    body: (ctl) => {
      const box = el('div', { class: 'col gap-4' });
      box.append(el('div', { class: 'row wrap gap-2' },
        m.strength ? el('span', { class: 'chip chip-brand', text: m.strength }) : null,
        el('span', { class: 'chip', text: f.label }),
        m.food_rule && m.food_rule !== 'any'
          ? el('span', { class: 'chip chip-warn', text: foodLabel(m.food_rule) }) : null,
        ...schedulesOf(m.id).map((s) => el('span', { class: 'chip chip-info', text: planLabel(s) }))));

      if (m.expiry) {
        const st = expiryStatus(m.expiry, getS('expiry_lead_days') || 60);
        box.append(el('div', { class: `banner ${st.level === 'expired' ? 'banner-bad'
          : st.level === 'soon' ? '' : 'banner-info'}` },
          ic(st.level === 'expired' ? 'warn' : 'clock'),
          el('div', { class: 'grow' },
            el('b', { text: `Péremption ${fmtExpiry(m.expiry)}` }),
            el('span', { class: 't-sm', text: st.level === 'expired'
              ? 'Périmé — ne plus utiliser, rapporter à la pharmacie.' : st.label }))));
      }
      if (m.photo) box.append(el('img', { class: 'med-photo', src: m.photo,
        alt: `Boîte de ${m.name}` }));
      if (m.photo_back) box.append(el('img', { class: 'med-photo', src: m.photo_back,
        alt: `Dos de la boîte de ${m.name}` }));
      if (m.instructions) box.append(el('p', { class: 't-body', text: m.instructions }));

      /* Consignes de la famille de molecules, puis notes personnelles. */
      const adv = adviceFor(m);
      if (adv) {
        box.append(el('div', { class: `banner ${adv.neverStop ? 'banner-bad' : 'banner-info'}` },
          ic(adv.neverStop ? 'warn' : 'info'),
          el('div', { class: 'grow' },
            el('b', { text: adv.family }),
            ...adv.tips.map((t) => el('div', { class: 't-sm', text: '· ' + t })),
            adv.watchNote ? el('div', { class: 't-sm', style: { marginTop: '6px' },
              text: adv.watchNote }) : null)));
      }
      for (const issue of timingIssues(m, schedulesOf(m.id).flatMap(parseTimes))) {
        box.append(el('div', { class: 'banner' }, ic('clock'),
          el('span', { class: 'grow t-sm', text: issue.text })));
      }
      if (m.notes) box.append(el('div', { class: 'banner banner-info' },
        ic('info'), el('span', { class: 'grow', text: m.notes })));

      const info = el('div', { class: 'card card-flush' });
      const add = (t, v) => v ? info.append(settingRow({ title: t, right: String(v) })) : null;
      add('Substance active', m.dci);
      add('Prescripteur', m.prescriber);
      add('Ordonnance', m.prescription_ref);
      add('Début', m.start_date ? fmtDate(m.start_date, 'num') : null);
      add('Fin', m.end_date ? fmtDate(m.end_date, 'num') : null);
      add('Consommation', dailyConsumption(m.id) ? `${fmtDose(dailyConsumption(m.id))} ${f.unit} / jour` : null);
      add('Stock', m.stock_qty != null ? `${fmtDose(m.stock_qty)} ${f.unit}` : null);
      add('Prix boîte', m.pack_price ? `${fmtMoney(m.pack_price, getS('currency'))} / ${fmtDose(m.pack_qty || 0)} ${f.unit}` : null);
      if (info.children.length) box.append(info);

      box.append(el('div', { class: 'row gap-2' },
        el('button', { class: 'btn btn-ghost grow', html: ico('box') + '<span>Réappro.</span>',
          onclick: () => { ctl.close(); setTimeout(() => refillSheet(m, ctx), 260); } }),
        el('button', { class: 'btn btn-primary grow', html: ico('edit') + '<span>Modifier</span>',
          onclick: () => { ctl.close(); setTimeout(() => openMedForm(ctx, m), 260); } })));

      box.append(el('div', { class: 'row gap-2' },
        el('button', { class: 'btn btn-quiet grow', text: 'Archiver', onclick: async () => {
          archiveMed(m.id); ctl.close(); ctx.refresh(); toast('Médicament archivé.'); } }),
        el('button', { class: 'btn btn-quiet grow', style: { color: 'var(--bad)' },
          text: 'Supprimer', onclick: async () => {
            if (await confirmDialog({ title: 'Supprimer ce médicament ?',
              message: "Son historique de prises sera également effacé. Cette action est définitive.",
              ok: 'Supprimer', danger: true })) {
              deleteMed(m.id); ctl.close(); ctx.refresh(); toast('Médicament supprimé.'); } } })));
      return box;
    },
  });
}
const ic = (n) => { const s = el('span'); s.innerHTML = ico(n); return s.firstElementChild; };
const icEl = ic;

/* ------------------------------------------------------ Reapprovisionner */
/**
 * Tout ce qui va manquer, et de quoi y remedier sans quitter l'ecran : une
 * ligne par medicament, le nombre de jours restants, et le bouton qui ajoute
 * une boite. En pied, le texte pret a envoyer au pharmacien.
 */
export function openRenouvellement(ctx) {
  const p = activeProfile();
  openSheet({
    title: 'Renouveler',
    body: (ctl) => {
      const box = el('div', { class: 'col gap-2' });
      const liste = supplyStatus(p.id);
      if (!liste.length) {
        box.append(el('p', { class: 't-sm t-mute t-center',
          text: 'Aucun stock suivi. Renseignez une quantité sur un médicament pour voir ici ce qui va manquer.' }));
        return box;
      }
      for (const x of liste) {
        const f = formOf(x.med.form);
        const jours = x.left === null ? '—' : `${x.left} j`;
        box.append(el('div', { class: 'card row' },
          icEl(f.icon),
          el('div', { class: 'grow' },
            el('b', { text: x.med.name }),
            el('div', { class: 't-xs t-mute',
              text: `${fmtDose(x.med.stock_qty || 0)} ${f.unit} · ${jours}` })),
          el('button', { class: 'btn btn-sm ' + (x.urgent ? 'btn-primary' : 'btn-ghost'),
            type: 'button', text: 'Ajouter',
            onclick: () => { ctl.close(); setTimeout(() => refillSheet(x.med, ctx), 260); } })));
      }
      return box;
    },
    footer: (c) => [
      el('button', { class: 'btn btn-ghost', text: 'Fermer', onclick: () => c.close() }),
      el('button', { class: 'btn grow', html: ico('share') + '<span>Liste pharmacie</span>',
        onclick: async () => {
          const r = await share(refillText(p, 30), 'Liste pour la pharmacie');
          if (r === 'copied') toast('Liste copiée.', { type: 'ok' });
        } })],
  });
}

export function refillSheet(m, ctx) {
  const f = formOf(m.form);
  const qty = input({ type: 'number', inputmode: 'decimal', step: '0.5', min: '0',
    value: String(m.pack_qty || 30) });
  openSheet({
    title: 'Réapprovisionner',
    body: () => el('div', {},
      el('p', { class: 't-sm t-soft', style: { marginBottom: 'var(--s-4)' },
        text: `${m.name} — stock actuel : ${fmtDose(m.stock_qty || 0)} ${f.unit}` }),
      field(`Quantité ajoutée (${f.unit})`, qty),
      el('div', { class: 'row wrap gap-2' },
        ...[10, 20, 30, 60, 90].map((n) => el('button', { class: 'chip', type: 'button',
          text: '+' + n, onclick: () => { qty.value = String(n); } })))),
    footer: (c) => [
      el('button', { class: 'btn btn-ghost', text: 'Annuler', onclick: () => c.close() }),
      el('button', { class: 'btn btn-primary', text: 'Ajouter', onclick: () => {
        const n = Number(qty.value) || 0;
        if (n <= 0) return toast('Quantité invalide.', { type: 'bad' });
        addStock(m.id, n, 'reappro');
        c.close(); ctx.refresh(); haptic('ok');
        toast(`Stock mis à jour : ${fmtDose((m.stock_qty || 0) + n)} ${f.unit}`, { type: 'ok' });
      } })],
  });
}

/* ============================================================================
   FORMULAIRE MEDICAMENT — creation et modification
   ========================================================================== */
/**
 * Formulaire complet.
 * @param {object} med         medicament existant, ou brouillon pre-rempli
 * @param {Array}  prefillPlan plan de prise propose (scan de boite)
 */
export function openMedForm(ctx, med, prefillPlan = null) {
  const p = activeProfile();
  const isNew = !med?.id;
  const m = { form: 'comprime', color: MED_COLORS[0], food_rule: 'any',
              stock_alert: 7, pack_qty: 30, start_date: dkey(), ...(med || {}) };
  const existing = med?.id ? schedulesOf(med.id)[0] : null;
  const pre = prefillPlan?.[0] || null;
  const plan = {
    kind: pre?.kind || existing?.kind || 'daily',
    times: pre?.times?.length ? pre.times.map((t) => ({ ...t }))
      : existing ? parseTimes(existing) : [{ t: '08:00', dose: 1 }],
    weekdays: existing ? parseWd(existing) : [1, 2, 3, 4, 5],
    interval_days: existing?.interval_days || 2,
    cycle_on: existing?.cycle_on || 21, cycle_off: existing?.cycle_off || 7,
  };

  const fName = input({ value: m.name || '', placeholder: 'Nom du médicament', required: true });
  const fDci = input({ value: m.dci || '', placeholder: 'Substance active' });
  const fStrength = input({ value: m.strength || '', placeholder: '500 mg' });
  const fInstr = input({ value: m.instructions || '', placeholder: '1 comprimé le matin' });
  const fNotes = textarea({ value: m.notes || '', placeholder: 'Précautions, effets à surveiller…' });
  const fPrescriber = input({ value: m.prescriber || '', placeholder: 'Dr Martin' });
  const fRef = input({ value: m.prescription_ref || '', placeholder: 'Ordonnance du 01/01/2026' });
  const fStart = input({ type: 'date', value: m.start_date || dkey() });
  const fEnd = input({ type: 'date', value: m.end_date || '' });
  const fStock = input({ type: 'number', step: '0.5', min: '0', inputmode: 'decimal',
    value: m.stock_qty ?? '' , placeholder: '30' });
  const fAlert = input({ type: 'number', step: '1', min: '0', inputmode: 'numeric',
    value: m.stock_alert ?? 7 });
  const fPackQty = input({ type: 'number', step: '1', min: '1', inputmode: 'numeric', value: m.pack_qty ?? 30 });
  const fPackPrice = input({ type: 'number', step: '1', min: '0', inputmode: 'numeric',
    value: m.pack_price ?? '', placeholder: 'Prix de la boîte' });

  /* --- forme galenique --- */
  const formPicker = el('div', { class: 'chip-select' });
  FORMS.forEach((f) => {
    const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(m.form === f.id),
      html: ico(f.icon) + `<span>${f.label}</span>` });
    b.addEventListener('click', () => {
      m.form = f.id;
      [...formPicker.children].forEach((c) => c.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true'); haptic('tap'); renderTimes();
    });
    formPicker.append(b);
  });

  /* --- peremption et tracabilite --- */
  const fExpiry = input({ type: 'date', value: m.expiry || '' });
  const expiryNote = el('div', { class: 't-xs' });
  const drawExpiry = () => {
    const st = expiryStatus(fExpiry.value, getS('expiry_lead_days') || 60);
    expiryNote.className = 't-xs ' + (st.level === 'expired' ? 'chip chip-bad'
      : st.level === 'soon' ? 'chip chip-warn' : 't-mute');
    expiryNote.textContent = fExpiry.value ? st.label : '';
  };
  fExpiry.addEventListener('change', drawExpiry);
  drawExpiry();

  /* --- photo de la boite --- */
  const photoBox = el('div', { class: 'photo-field' });
  const photoInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment',
    class: 'hidden' });
  function drawPhoto() {
    photoBox.innerHTML = '';
    if (m.photo) {
      photoBox.append(el('img', { class: 'med-photo', src: m.photo, alt: '' }));
      photoBox.append(el('div', { class: 'row gap-2' },
        el('button', { class: 'btn btn-sm btn-ghost', type: 'button',
          html: ico('camera') + '<span>Remplacer</span>', onclick: () => photoInput.click() }),
        el('button', { class: 'btn btn-sm btn-quiet', type: 'button', text: 'Retirer',
          onclick: () => { m.photo = null; drawPhoto(); haptic('tap'); } })));
    } else {
      photoBox.append(el('button', { class: 'btn btn-ghost btn-block', type: 'button',
        html: ico('camera') + '<span>Photographier la boîte</span>',
        onclick: () => photoInput.click() }));
      photoBox.append(el('small', { class: 'hint',
        text: 'La photo s’affiche à l’heure de la prise : plus besoin de lire les boîtes.' }));
    }
    photoBox.append(photoInput);
  }
  photoInput.addEventListener('change', async () => {
    const f = photoInput.files?.[0]; if (!f) return;
    try { m.photo = await photoToDataURL(f, 420); drawPhoto(); haptic('ok'); }
    catch (e) { toast(e.message, { type: 'bad' }); }
    photoInput.value = '';
  });
  drawPhoto();

  /* Le dos de la boite : c'est la que sont imprimees les dates. */
  const backBox = el('div', { class: 'photo-field' });
  const backInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment',
    class: 'hidden' });
  function drawBack() {
    backBox.innerHTML = '';
    if (m.photo_back) {
      backBox.append(el('img', { class: 'med-photo', src: m.photo_back, alt: '' }));
      backBox.append(el('div', { class: 'row gap-2' },
        el('button', { class: 'btn btn-sm btn-ghost', type: 'button',
          html: ico('camera') + '<span>Remplacer</span>', onclick: () => backInput.click() }),
        el('button', { class: 'btn btn-sm btn-quiet', type: 'button', text: 'Retirer',
          onclick: () => { m.photo_back = null; drawBack(); } })));
    } else {
      backBox.append(el('button', { class: 'btn btn-ghost btn-block', type: 'button',
        html: ico('camera') + '<span>Photographier le dos</span>',
        onclick: () => backInput.click() }));
    }
    backBox.append(backInput);
  }
  backInput.addEventListener('change', async () => {
    const f = backInput.files?.[0]; if (!f) return;
    try { m.photo_back = await shrinkImage(f, 1100); drawBack(); haptic('ok'); }
    catch (e) { toast(e.message, { type: 'bad' }); }
    backInput.value = '';
  });
  drawBack();

  /* --- couleur --- */
  const colorPicker = el('div', { class: 'row wrap gap-2' });
  MED_COLORS.forEach((c) => {
    const b = el('button', { type: 'button', 'aria-label': 'Couleur', style: {
      width: '36px', height: '36px', background: c, border: '1px solid var(--rule-hard)',
      outline: m.color === c ? '2px solid var(--ink)' : 'none', outlineOffset: '2px' } });
    b.addEventListener('click', () => {
      m.color = c;
      [...colorPicker.children].forEach((x) => { x.style.outline = 'none'; });
      b.style.outline = '2px solid var(--ink)'; b.style.outlineOffset = '2px'; haptic('tap');
    });
    colorPicker.append(b);
  });

  /* --- plan de prise --- */
  const kindSel = select([
    { value: 'daily', label: 'Tous les jours' },
    { value: 'weekdays', label: 'Certains jours de la semaine' },
    { value: 'interval', label: 'Tous les X jours' },
    { value: 'cycle', label: 'Par cycles (X jours pris / Y jours pause)' },
    { value: 'prn', label: 'Si besoin (aucun rappel)' },
  ].map((o) => ({ ...o, selected: o.value === plan.kind })));
  kindSel.addEventListener('change', () => { plan.kind = kindSel.value; renderPlan(); });

  const planExtra = el('div');
  const timesHost = el('div', { class: 'col gap-2' });

  function renderPlan() {
    planExtra.innerHTML = '';
    if (plan.kind === 'weekdays') {
      const names = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
      const wrap = el('div', { class: 'row wrap gap-2' });
      [1, 2, 3, 4, 5, 6, 0].forEach((d) => {
        const b = el('button', { type: 'button', class: 'chip', text: names[d],
          'aria-pressed': String(plan.weekdays.includes(d)) });
        b.addEventListener('click', () => {
          const i = plan.weekdays.indexOf(d);
          if (i >= 0) plan.weekdays.splice(i, 1); else plan.weekdays.push(d);
          b.setAttribute('aria-pressed', String(plan.weekdays.includes(d))); haptic('tap');
        });
        wrap.append(b);
      });
      planExtra.append(field('Jours de prise', wrap));
    } else if (plan.kind === 'interval') {
      const n = input({ type: 'number', min: '1', max: '90', value: plan.interval_days, inputmode: 'numeric' });
      n.addEventListener('input', () => { plan.interval_days = Number(n.value) || 1; });
      planExtra.append(field('Intervalle (en jours)', n, 'Ex. 2 = un jour sur deux.'));
    } else if (plan.kind === 'cycle') {
      const a = input({ type: 'number', min: '1', value: plan.cycle_on, inputmode: 'numeric' });
      const b = input({ type: 'number', min: '0', value: plan.cycle_off, inputmode: 'numeric' });
      a.addEventListener('input', () => { plan.cycle_on = Number(a.value) || 1; });
      b.addEventListener('input', () => { plan.cycle_off = Number(b.value) || 0; });
      planExtra.append(el('div', { class: 'row gap-2' },
        el('div', { class: 'grow' }, field('Jours de prise', a)),
        el('div', { class: 'grow' }, field('Jours de pause', b))));
    }
    timesHost.parentElement && (timesHost.parentElement.style.display = plan.kind === 'prn' ? 'none' : '');
  }

  function renderTimes() {
    timesHost.innerHTML = '';
    const unit = formOf(m.form).unit;
    plan.times.sort((a, b) => a.t.localeCompare(b.t)).forEach((slot, idx) => {
      const t = input({ type: 'time', value: slot.t, style: { maxWidth: '140px' } });
      const d = input({ type: 'number', step: '0.25', min: '0.25', inputmode: 'decimal',
        value: slot.dose, 'aria-label': 'Dose' });
      t.addEventListener('change', () => { slot.t = t.value || '08:00'; });
      d.addEventListener('input', () => { slot.dose = Number(d.value) || 1; });
      timesHost.append(el('div', { class: 'row gap-2' }, t,
        el('div', { class: 'grow input-inline' }, d,
          el('span', { class: 'chip', text: unit })),
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Retirer',
          html: ico('trash'), onclick: () => {
            plan.times.splice(idx, 1); if (!plan.times.length) plan.times.push({ t: '08:00', dose: 1 });
            renderTimes(); haptic('tap'); } })));
    });
    timesHost.append(el('button', { class: 'btn btn-ghost btn-sm', type: 'button',
      html: ico('plus') + '<span>Ajouter une heure</span>', onclick: () => {
        const last = plan.times[plan.times.length - 1];
        const nh = last ? Math.min(23, Number(last.t.slice(0, 2)) + 6) : 8;
        plan.times.push({ t: `${pad2(nh)}:00`, dose: last?.dose || 1 });
        renderTimes(); haptic('tap'); } }));
  }

  const presets = el('div', { class: 'row wrap gap-2' });
  [['1×/jour', [['08:00', 1]]], ['2×/jour', [['08:00', 1], ['20:00', 1]]],
   ['3×/jour', [['08:00', 1], ['13:00', 1], ['20:00', 1]]],
   ['Matin + midi', [['08:00', 1], ['12:00', 1]]],
   ['½ matin + ½ soir', [['08:00', .5], ['20:00', .5]]]].forEach(([label, times]) => {
    presets.append(el('button', { class: 'chip', type: 'button', text: label, onclick: () => {
      plan.times = times.map(([t, dose]) => ({ t, dose })); renderTimes(); haptic('tap'); } }));
  });

  /* --------------------------------------------------------- assemblage */
  openSheet({
    title: isNew ? 'Nouveau médicament' : 'Modifier',
    body: () => {
      const box = el('div');
      box.append(field('Nom du médicament *', fName));
      box.append(field('Substance active (DCI)', fDci, 'Utile pour repérer les doublons.'));
      box.append(el('div', { class: 'row gap-2' },
        el('div', { class: 'grow' }, field('Dosage', fStrength))));
      box.append(field('Forme', formPicker));
      box.append(field('Photo de la boîte', photoBox));
      box.append(field('Dos de la boîte', backBox, 'La face où sont imprimées les dates.'));
      box.append(field('Couleur de repère', colorPicker));

      box.append(el('hr', { class: 'divider' }));
      box.append(el('div', { class: 't-upper t-mute', style: { marginBottom: 'var(--s-2)' },
        text: 'Plan de prise' }));
      box.append(field('Fréquence', kindSel));
      box.append(planExtra);
      box.append(field('Raccourcis', presets));
      box.append(field('Heures et doses', timesHost));
      box.append(field('Par rapport aux repas',
        select(FOOD_RULES.map((r) => ({ value: r.id, label: r.label, selected: r.id === m.food_rule })),
          { onchange: (e) => { m.food_rule = e.target.value; } })));
      box.append(field('Consigne courte', fInstr, 'Affichée sur la fiche du médicament.'));

      box.append(el('hr', { class: 'divider' }));
      box.append(el('div', { class: 't-upper t-mute', style: { marginBottom: 'var(--s-2)' },
        text: 'Stock et coût' }));
      box.append(el('div', { class: 'row gap-2' },
        el('div', { class: 'grow' }, field('Quantité en stock', fStock)),
        el('div', { class: 'grow' }, field('Alerte en dessous de', fAlert))));
      box.append(el('div', { class: 'row gap-2' },
        el('div', { class: 'grow' }, field('Unités par boîte', fPackQty)),
        el('div', { class: 'grow' }, field(`Prix boîte (${devise(getS('currency')).label})`, fPackPrice))));

      box.append(el('hr', { class: 'divider' }));
      box.append(el('div', { class: 't-upper t-mute', style: { marginBottom: 'var(--s-2)' },
        text: 'Ordonnance' }));
      box.append(field('Prescripteur', fPrescriber));
      box.append(field('Référence', fRef));
      box.append(el('div', { class: 'row gap-2' },
        el('div', { class: 'grow' }, field('Début', fStart)),
        el('div', { class: 'grow' }, field('Fin (facultatif)', fEnd))));
      box.append(field('Date de péremption', fExpiry));
      box.append(expiryNote);
      if (m.gtin || m.lot) {
        box.append(el('p', { class: 't-xs t-mute', style: { marginTop: 'var(--s-2)' },
          text: `Lu sur la boîte — ${[m.gtin ? 'code ' + m.gtin : null,
            m.lot ? 'lot ' + m.lot : null].filter(Boolean).join(' · ')}` }));
      }
      box.append(field('Notes', fNotes));
      return box;
    },
    footer: (c) => [
      el('button', { class: 'btn btn-ghost', text: 'Annuler', onclick: () => c.close() }),
      el('button', { class: 'btn btn-primary', html: ico('check') + '<span>Enregistrer</span>',
        onclick: () => {
          if (!fName.value.trim()) { fName.setAttribute('aria-invalid', 'true'); fName.focus();
            return toast('Le nom est obligatoire.', { type: 'bad' }); }
          const payload = {
            id: med?.id, profile_id: p.id, name: fName.value.trim(), dci: fDci.value.trim(),
            form: m.form, strength: fStrength.value.trim(), color: m.color,
            instructions: fInstr.value.trim(), food_rule: m.food_rule, notes: fNotes.value.trim(),
            prescriber: fPrescriber.value.trim(), prescription_ref: fRef.value.trim(),
            start_date: fStart.value || dkey(), end_date: fEnd.value || null,
            photo: m.photo || null, photo_back: m.photo_back || null,
            expiry: fExpiry.value || null, gtin: m.gtin || null, lot: m.lot || null,
            stock_qty: fStock.value === '' ? null : Number(fStock.value),
            stock_alert: fAlert.value === '' ? null : Number(fAlert.value),
            pack_qty: Number(fPackQty.value) || null,
            pack_price: fPackPrice.value === '' ? null : Number(fPackPrice.value),
          };
          saveMed(payload, plan.kind === 'prn' ? [{ ...plan, times: [] }] : [plan]);
          c.close(); ctx.refresh(); haptic('ok');
          toast(isNew ? 'Médicament ajouté.' : 'Modifications enregistrées.', { type: 'ok' });
        } })],
  });
  renderPlan(); renderTimes();
}
