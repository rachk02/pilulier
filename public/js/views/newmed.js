/* ============================================================================
   newmed.js — ajouter un medicament en photographiant sa boite.

   Le parcours tient en un seul ecran qui se remplit tout seul :
     1. on photographie les deux faces (le dos porte la peremption) ;
     2. l'application lit le code-barres et en tire la date, le lot, le code
        produit ;
     3. elle reconnait le nom dans le carnet local et propose forme, dosage et
        schema de prise ;
     4. il ne reste qu'a confirmer avec l'ordonnance.

   Rien n'est jamais enregistre sans que l'utilisateur ait vu et valide.
   ========================================================================== */
import { el, ico, fmtDose } from '../util.js';
import { activeProfile, saveMed, getS, findByGtin, planOf } from '../store.js';
import { FORMS, FOOD_RULES, MED_COLORS, formOf } from '../schema.js';
import { lookup, plansOf } from '../drugbook.js';
import { detectorSupported, scanImage, readText, mergeReadings, ocrAvailable,
         textDetectorSupported, parseExpiryText, expiryStatus, fmtExpiry,
         shrinkImage } from '../boxscan.js';
import { adviceFor } from '../safety.js';
import { openSheet, toast, field, input, select, haptic, confirmDialog } from '../ui.js';
import { openMedForm } from './meds.js';

/** Le choix d'entree : photographier la boite, ou tout saisir a la main. */
/**
 * @param {object} o `{ direct: 'scan' | 'form' }` saute le choix et ouvre
 *   directement la bonne porte — c'est ce que fait le premier lancement quand
 *   la personne a deja dit par quoi elle voulait commencer. Lui reposer la
 *   question serait lui faire repeter ce qu'elle vient de dire.
 */
export function openAddMed(ctx, o = {}) {
  if (o.direct === 'scan') return openBoxScan(ctx);
  if (o.direct === 'form') return openMedForm(ctx, null);
  openSheet({
    title: 'Ajouter un médicament',
    body: (c) => {
      const box = el('div', { class: 'col gap-3' });
      const choice = (icon, title, sub, fn) => {
        const b = el('button', { class: 'card row pressable', type: 'button',
          style: { width: '100%', textAlign: 'left' } },
          el('span', { class: 'dose-pill', html: ico(icon) }),
          el('div', { class: 'grow' }, el('b', { text: title }),
            el('div', { class: 't-xs t-mute', text: sub })),
          el('span', { class: 'icon-btn', html: ico('chevR') }));
        b.addEventListener('click', () => { c.close(); setTimeout(fn, 250); });
        return b;
      };
      box.append(choice('camera', 'Photographier la boîte',
        detectorSupported()
          ? 'Le code-barres donne la péremption et le lot'
          : 'Les deux faces, puis la saisie assistée',
        () => openBoxScan(ctx)));
      box.append(choice('edit', 'Saisir à la main',
        'Le formulaire complet, champ par champ', () => openMedForm(ctx, null)));
      return box;
    },
  });
}

export function openBoxScan(ctx) {
  const p = activeProfile();
  if (!p) return;

  /* Etat de la saisie en cours. */
  const st = {
    photo: null, photo_back: null,
    gtin: null, lot: null, expiry: null, expirySource: null,
    name: '', entry: null, strength: '', form: 'comprime',
    food: 'any', color: MED_COLORS[0], plan: null,
    packQty: null, reprise: null,
  };

  /* ---------------------------------------------------------- 1. photos */
  const shots = el('div', { class: 'shot-pair' });
  const statusLine = el('div', { class: 't-xs t-mute', style: { marginTop: 'var(--s-2)' } });

  function shotTile(key, label, hint) {
    const tile = el('button', { class: 'shot', type: 'button' });
    const file = el('input', { type: 'file', accept: 'image/*', capture: 'environment',
      class: 'hidden' });
    const paint = () => {
      tile.innerHTML = '';
      if (st[key]) {
        tile.append(el('img', { src: st[key], alt: '' }));
        tile.append(el('span', { class: 'shot-tag', text: label }));
      } else {
        tile.insertAdjacentHTML('beforeend', ico('camera'));
        tile.append(el('b', { text: label }), el('small', { text: hint }));
      }
    };
    file.addEventListener('change', async () => {
      const f = file.files?.[0]; if (!f) return;
      statusLine.textContent = 'Lecture de la boîte…';
      try {
        /* Le code-barres ET le texte se lisent sur l'original, en pleine
           resolution, avant toute reduction. Les deux en parallele : ils ne
           se genent pas. */
        const [codes, texte] = await Promise.all([scanImage(f), readText(f)]);
        st[key] = await shrinkImage(f, key === 'photo_back' ? 1100 : 720);
        paint(); haptic('ok');
        appliquer(mergeReadings({ codes, lines: texte.lines }), texte.source);
      } catch (e) { toast(e.message, { type: 'bad' }); statusLine.textContent = ''; }
      file.value = '';
    });
    tile.addEventListener('click', () => file.click());
    paint();
    return el('div', {}, tile, file);
  }

  /** Verse dans le formulaire tout ce qui a pu etre lu. */
  function appliquer(lu, sourceTexte) {
    const dit = [];

    if (lu.gtin && !st.gtin) {
      st.gtin = lu.gtin;
      const connue = findByGtin(lu.gtin, p.id);
      if (connue) { proposerBoiteConnue(connue); return; }
      dit.push('code produit');
    }
    if (lu.expiry && !st.expiry) {
      st.expiry = lu.expiry; st.expirySource = lu.expirySource;
      fExpiry.value = lu.expiry; drawExpiry();
      dit.push(`péremption ${fmtExpiry(lu.expiry)}`);
    }
    if (lu.lot && !st.lot) { st.lot = lu.lot; dit.push(`lot ${lu.lot}`); }
    if (lu.name && !fName.value.trim()) {
      fName.value = lu.name; st.name = lu.name;
      drawSuggestions();
      dit.push(`nom « ${lu.name} »`);
    }
    if (lu.strength && !fStrength.value.trim()) {
      fStrength.value = lu.strength; st.strength = lu.strength;
      dit.push(lu.strength);
    }
    if (lu.form) st.form = lu.form;
    if (lu.packQty) st.packQty = lu.packQty;

    if (!dit.length) {
      statusLine.textContent = raisonEchec(lu, sourceTexte);
      return;
    }
    const via = lu.sources.length ? ` (${lu.sources.join(' + ')})` : '';
    statusLine.textContent = 'Lu sur la boîte : ' + dit.join(' · ') + via;
    haptic('ok');
  }

  function raisonEchec(lu, sourceTexte) {
    if (!detectorSupported() && !ocrAvailable()) {
      return "Ce navigateur ne sait ni lire les codes-barres ni lire le texte. " +
             "Sur Chrome/Android, le code-barres fonctionne.";
    }
    if (!ocrAvailable()) {
      return "Pas de code-barres sur cette photo, et ce navigateur ne lit pas le " +
             "texte imprimé. Agrandis la photo pour recopier ce qu'il faut.";
    }
    return "Rien n'a pu être lu sur cette photo. Essaie de cadrer plus près, " +
           "bien à plat et sans reflet.";
  }

  /** Une boite deja enregistree : on propose de tout reprendre. */
  function proposerBoiteConnue(m) {
    statusLine.textContent = '';
    const plan = planOf(m.id);
    openSheet({
      title: 'Boîte déjà connue',
      body: () => el('div', { class: 'col gap-3' },
        el('div', { class: 'banner banner-info' }, icoEl('info'),
          el('div', { class: 'grow' },
            el('b', { text: `${m.name} ${m.strength || ''}`.trim() }),
            el('span', { class: 't-sm',
              text: 'Ce code produit a déjà été enregistré. Tout peut être repris : ' +
                    'substance, forme, dosage, consignes et horaires.' }))),
        plan?.times?.length
          ? el('p', { class: 't-sm t-soft', text: 'Horaires : ' +
              plan.times.map((t) => `${t.t} · ${fmtDose(t.dose)}`).join('   ') })
          : null,
        el('p', { class: 't-xs t-mute',
          text: 'La date de péremption et le lot, eux, sont ceux de la nouvelle boîte.' })),
      footer: (c) => [
        el('button', { class: 'btn btn-ghost', text: 'Nouveau', onclick: () => {
          c.close();
          statusLine.textContent = 'Code produit relevé. Saisie repartie de zéro.';
        } }),
        el('button', { class: 'btn btn-primary', html: ico('check') + '<span>Tout reprendre</span>',
          onclick: () => {
            fName.value = m.name; st.name = m.name;
            fStrength.value = m.strength || ''; st.strength = m.strength || '';
            st.form = m.form || 'comprime'; st.food = m.food_rule || 'any';
            st.color = m.color || st.color; st.packQty = m.pack_qty || null;
            st.reprise = { dci: m.dci, notes: m.notes, prescriber: m.prescriber,
                           instructions: m.instructions };
            if (plan) { st.plan = { kind: plan.kind, times: plan.times, label: 'Repris de la boîte précédente' }; }
            drawSuggestions(); drawPlans(); drawStrengths();
            c.close(); haptic('ok');
            statusLine.textContent = `Repris de la boîte précédente : ${m.name}. ` +
              'Vérifie la péremption de la nouvelle.';
            toast('Fiche reprise.', { type: 'ok' });
          } })],
    });
  }

  shots.append(shotTile('photo', 'Face avant', 'le nom'),
               shotTile('photo_back', 'Face arrière', 'la péremption'));

  /* ------------------------------------------------------ 2. medicament */
  const fName = input({ placeholder: 'Ce qui est écrit sur la boîte', autocomplete: 'off' });
  const suggestions = el('div', { class: 'chip-select' });
  const strengthRow = el('div', { class: 'chip-select' });
  const known = el('div');

  function drawSuggestions() {
    suggestions.innerHTML = ''; known.innerHTML = '';
    const hits = lookup(fName.value);
    if (!hits.length) return;
    for (const { entry, score } of hits) {
      const b = el('button', { class: 'chip', type: 'button',
        'aria-pressed': String(st.entry === entry) },
        el('span', { text: entry.dci }));
      if (score < 70) b.append(el('small', { class: 't-mute', text: ' ?' }));
      b.addEventListener('click', () => { pickEntry(entry); haptic('tap'); });
      suggestions.append(b);
    }
    if (!st.entry && hits[0].score >= 74) pickEntry(hits[0]?.entry, false);
  }

  function pickEntry(entry, mark = true) {
    st.entry = entry;
    st.form = entry.form || 'comprime';
    st.food = entry.food || 'any';
    [...suggestions.children].forEach((c, i) => {
      c.setAttribute('aria-pressed', String(lookup(fName.value)[i]?.entry === entry));
    });
    drawStrengths(); drawPlans(); drawKnown();
  }

  function drawKnown() {
    known.innerHTML = '';
    if (!st.entry) return;
    const adv = adviceFor({ dci: st.entry.dci, name: fName.value });
    known.append(el('div', { class: 'banner banner-info' },
      icoEl('info'),
      el('div', { class: 'grow' },
        el('b', { text: st.entry.dci }),
        el('span', { class: 't-sm',
          text: `${formOf(st.form).label}${adv ? ' · ' + adv.family : ''}` }),
        st.entry.note ? el('div', { class: 't-sm', text: st.entry.note }) : null,
        el('div', { class: 't-xs', style: { marginTop: '6px' },
          text: 'Reconnu par le carnet embarqué. À confirmer avec l’ordonnance.' }))));
  }

  function drawStrengths() {
    strengthRow.innerHTML = '';
    const list = st.entry?.strengths || [];
    for (const sgt of list) {
      const b = el('button', { class: 'chip', type: 'button', text: sgt,
        'aria-pressed': String(st.strength === sgt) });
      b.addEventListener('click', () => {
        st.strength = sgt; fStrength.value = sgt;
        [...strengthRow.children].forEach((c) => c.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true'); haptic('tap');
      });
      strengthRow.append(b);
    }
  }
  const fStrength = input({ placeholder: '500 mg' });
  fStrength.addEventListener('input', () => { st.strength = fStrength.value.trim(); });
  fName.addEventListener('input', () => { st.name = fName.value; st.entry = null; drawSuggestions(); });

  /* --------------------------------------------------------- peremption */
  const fExpiry = input({ type: 'date' });
  const fExpiryText = input({ placeholder: 'ou recopie ce qui est imprimé : 12/2027' });
  const expiryInfo = el('div', { class: 't-xs' });
  function drawExpiry() {
    st.expiry = fExpiry.value || null;
    const s = expiryStatus(st.expiry, getS('expiry_lead_days') || 60);
    expiryInfo.className = 't-xs ' + (s.level === 'expired' ? 'chip chip-bad'
      : s.level === 'soon' ? 'chip chip-warn' : 't-mute');
    expiryInfo.textContent = st.expiry
      ? s.label + (st.expirySource === 'code' ? ' · lu sur le code-barres' : '')
      : '';
  }
  fExpiry.addEventListener('change', () => { st.expirySource = 'saisie'; drawExpiry(); });
  fExpiryText.addEventListener('input', () => {
    const iso = parseExpiryText(fExpiryText.value);
    if (iso) { fExpiry.value = iso; st.expirySource = 'saisie'; drawExpiry(); }
  });

  const zoomBtn = el('button', { class: 'btn btn-sm btn-ghost', type: 'button',
    html: ico('search') + '<span>Agrandir la photo</span>',
    onclick: () => {
      if (!st.photo_back && !st.photo) return toast('Photographie d’abord la boîte.');
      zoomSheet(st.photo_back || st.photo);
    } });

  /* ------------------------------------------------------------ 3. plan */
  const planRow = el('div', { class: 'col gap-2' });
  function drawPlans() {
    planRow.innerHTML = '';
    const list = st.entry ? plansOf(st.entry) : [];
    /* Le plan repris d'une boite precedente passe devant les suggestions. */
    if (st.plan && st.plan.label === 'Repris de la boîte précédente') list.unshift(st.plan);
    if (!list.length) {
      planRow.append(el('p', { class: 't-xs t-mute',
        text: 'Choisis les heures à l’étape suivante.' }));
      return;
    }
    for (const pl of list) {
      const b = el('button', { class: 'plan-choice', type: 'button',
        'aria-pressed': String(st.plan === pl) },
        el('div', { class: 'grow' },
          el('b', { text: pl.label }),
          el('div', { class: 't-xs t-mute',
            text: pl.times.length
              ? pl.times.map((t) => `${t.t} · ${fmtDose(t.dose)} ${formOf(st.form).unit}`).join('   ')
              : 'aucun rappel programmé' })));
      b.addEventListener('click', () => {
        st.plan = pl;
        [...planRow.children].forEach((c) => c.setAttribute?.('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true'); haptic('tap');
      });
      planRow.append(b);
    }
    planRow.append(el('p', { class: 't-xs t-mute',
      text: "Schémas courants, pas une prescription : c’est l’ordonnance qui décide." }));
  }
  drawPlans();

  /* ------------------------------------------------------------ montage */
  const step = (n, titre, ...kids) => el('div', { class: 'step' },
    el('div', { class: 'step-head' }, el('span', { class: 'step-n', text: String(n) }),
      el('span', { class: 't-upper', text: titre })), ...kids);

  openSheet({
    title: 'Nouvelle boîte',
    body: () => {
      const box = el('div');
      box.append(step(1, 'La boîte', shots, statusLine,
        el('small', { class: 'hint', text: aideLecture() })));

      box.append(step(2, 'Le médicament',
        field('Nom', fName),
        suggestions, known,
        field('Dosage', fStrength),
        strengthRow,
        el('div', { class: 'row gap-2', style: { alignItems: 'flex-end' } },
          el('div', { class: 'grow' }, field('Péremption', fExpiry)),
          zoomBtn),
        fExpiryText, expiryInfo));

      box.append(step(3, 'Quand le prendre', planRow));
      return box;
    },
    footer: (c) => [
      el('button', { class: 'btn btn-ghost', html: ico('edit') + '<span>Formulaire</span>',
        onclick: () => { c.close(); setTimeout(() => handOff(ctx), 250); } }),
      el('button', { class: 'btn btn-primary', html: ico('check') + '<span>Enregistrer</span>',
        onclick: () => save(c) }),
    ],
  });

  /* Passer au formulaire complet, deja rempli. */
  function handOff(ctx2) {
    openMedForm(ctx2, draft(), st.plan ? [st.plan] : null);
  }

  function draft() {
    const r = st.reprise || {};
    return {
      profile_id: p.id,
      name: fName.value.trim() || st.entry?.dci || '',
      dci: r.dci || st.entry?.dci || '',
      form: st.form, strength: fStrength.value.trim(),
      food_rule: st.food, color: st.color,
      instructions: r.instructions || '',
      notes: r.notes || st.entry?.note || '',
      prescriber: r.prescriber || '',
      photo: st.photo, photo_back: st.photo_back,
      expiry: fExpiry.value || null, gtin: st.gtin, lot: st.lot,
      start_date: new Date().toISOString().slice(0, 10),
      stock_alert: 7, pack_qty: st.packQty || 30, archived: 0,
    };
  }

  async function save(ctl) {
    const d = draft();
    if (!d.name) return toast('Il manque le nom du médicament.', { type: 'bad' });
    if (!st.plan) {
      const ok = await confirmDialog({ title: 'Aucun horaire choisi',
        message: 'Le médicament sera enregistré sans rappel. Tu pourras ajouter les heures ensuite.',
        ok: 'Enregistrer quand même' });
      if (!ok) return;
    }
    saveMed(d, st.plan ? [st.plan] : [{ kind: 'prn', times: [] }]);
    ctl.close(); ctx.refresh(); haptic('ok');
    toast(`${d.name} ajouté.`, { type: 'ok' });
  }
}

/** Ce que ce téléphone sait faire, dit franchement. */
function aideLecture() {
  const codes = detectorSupported(), texte = ocrAvailable();
  if (codes && texte) {
    return 'Le carré de points contient la date de péremption et le lot ; ' +
           'le reste est lu dans le texte imprimé. Cadre bien, sans reflet.';
  }
  if (codes) {
    return 'Le carré de points sur la boîte contient la date de péremption et le ' +
           'lot : vise-le bien. Le nom reste à saisir.';
  }
  if (texte) return 'Le texte imprimé est lu. Cadre bien, à plat et sans reflet.';
  return 'Ce navigateur ne lit ni les codes-barres ni le texte : la photo sert ' +
         'de mémoire, la saisie reste manuelle. Sur Chrome/Android, le ' +
         'code-barres fonctionne.';
}

/* ---------------------------------------------------------------- loupe */
function zoomSheet(src) {
  let zoom = 2.4;
  const img = el('img', { src, alt: '', style: { width: `${zoom * 100}%`, maxWidth: 'none' } });
  const pane = el('div', { class: 'zoom-pane' }, img);
  const set = (z) => { zoom = Math.min(6, Math.max(1, z)); img.style.width = `${zoom * 100}%`; };
  openSheet({
    title: 'Lire la boîte',
    body: () => el('div', {},
      el('p', { class: 't-xs t-mute', style: { marginBottom: 'var(--s-2)' } },
        'Fais glisser la photo pour trouver la date, puis recopie-la.'),
      pane,
      el('div', { class: 'row gap-2', style: { marginTop: 'var(--s-3)' } },
        el('button', { class: 'btn btn-sm btn-ghost grow', type: 'button', text: '−',
          onclick: () => set(zoom - 0.6) }),
        el('button', { class: 'btn btn-sm btn-ghost grow', type: 'button', text: '+',
          onclick: () => set(zoom + 0.6) }))),
    footer: (c) => [el('button', { class: 'btn btn-primary btn-block', text: 'Fermé',
      onclick: () => c.close() })],
  });
}

const icoEl = (n) => { const s = el('span'); s.innerHTML = ico(n); return s.firstElementChild; };
