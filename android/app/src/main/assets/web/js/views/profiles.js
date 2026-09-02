/* profiles.js — gestion des profils (papa, maman, et qui tu veux). */
import { el, ico, dkey, fmtDate } from '../util.js';
import { profiles, activeProfile, setActiveProfile, saveProfile, deleteProfile,
         medsOf, adherence, db } from '../store.js';
import { avatarMarkup, seedMarkup, seedBatch, seedOf, hashSeed, BG,
         photoToDataURL, initials } from '../avatars.js';
import { RELATIONS } from '../schema.js';
import { openSheet, confirmDialog, toast, field, input, textarea, select, haptic } from '../ui.js';

/** Petite pastille d'avatar reutilisable. */
export function avatarEl(p, size = '') {
  const n = el('div', { class: `avatar ${size}` });
  n.innerHTML = avatarMarkup(p);
  return n;
}

/* --------------------------------------------------- Selecteur de profil */
/**
 * Le portrait de la barre du haut mene ici. Avec un seul carnet, une liste
 * d'un element ne sert a rien : on ouvre directement sa fiche. C'est la
 * question que le portrait pose — « qui est-ce ? » — et la fiche y repond.
 */
export function openProfiles(ctx) {
  const list = profiles();
  if (list.length === 1) { openProfileForm(ctx, list[0]); return; }
  if (!list.length) { openProfileForm(ctx, null); return; }

  openSheet({
    title: 'Profils',
    body: (ctl) => {
      const box = el('div', { class: 'col gap-2' });
      const cur = activeProfile();
      for (const p of list) {
        const meds = medsOf(p.id).length;
        const a = adherence(p.id, 7);
        const actif = p.id === cur?.id;

        /* Deux gestes, deux boutons visibles. Le crayon etait `aria-hidden`
           et ressemblait a une decoration : personne ne devinait qu'on
           pouvait ouvrir la fiche depuis ici. */
        const detail = el('button', { class: 'btn btn-sm btn-ghost', type: 'button',
          text: 'Détails', 'aria-label': `Détails de ${p.name}`,
          onclick: (e) => { e.stopPropagation(); ctl.close();
            setTimeout(() => openProfileForm(ctx, p), 260); } });

        const row = el('button', { class: 'card row pressable', type: 'button',
          'aria-pressed': String(actif),
          'aria-label': actif ? `${p.name}, carnet ouvert` : `Ouvrir le carnet de ${p.name}`,
          style: { textAlign: 'left', width: '100%' } },
          avatarEl(p, 'avatar-lg' + (actif ? ' avatar-ring' : '')),
          el('div', { class: 'grow' },
            el('b', { text: p.name }),
            el('div', { class: 't-xs t-mute',
              text: [p.relation, `${meds} médicament${meds > 1 ? 's' : ''}`,
                     a.rate !== null ? `${a.rate}% sur 7 j` : null,
                     actif ? 'carnet ouvert' : null].filter(Boolean).join(' · ') })),
          detail);

        row.addEventListener('click', () => {
          if (actif) { ctl.close(); setTimeout(() => openProfileForm(ctx, p), 260); return; }
          setActiveProfile(p.id); haptic('ok'); ctl.close(); ctx.refresh();
          toast(`Carnet de ${p.name}`);
        });
        box.append(row);
      }
      box.append(el('button', { class: 'btn btn-ghost btn-block', type: 'button',
        html: ico('plus') + '<span>Nouveau profil</span>',
        onclick: () => { ctl.close(); setTimeout(() => openProfileForm(ctx, null), 260); } }));
      return box;
    },
  });
}

/* ------------------------------------------------------------ Formulaire */
export function openProfileForm(ctx, prof) {
  const isNew = !prof;
  const p = { avatar_kind: 'preset', avatar_value: 'man', color: BG[0], sex: 'M',
              archived: 0, ...(prof || {}) };

  const fName = input({ value: p.name || '', placeholder: 'Jean Dupont', required: true });
  const fRel = select([{ value: '', label: '—' },
    ...RELATIONS.map((r) => ({ value: r, label: r, selected: r === p.relation }))]);
  const fBirth = input({ type: 'date', value: p.birthdate || '' });
  const fSex = select([{ value: 'M', label: 'Homme' }, { value: 'F', label: 'Femme' },
    { value: '', label: 'Non précisé' }].map((o) => ({ ...o, selected: o.value === (p.sex || '') })));
  const fWeight = input({ type: 'number', step: '0.1', inputmode: 'decimal', value: p.weight_kg ?? '' });
  const fHeight = input({ type: 'number', step: '1', inputmode: 'numeric', value: p.height_cm ?? '' });
  const fBlood = select(['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
    .map((b) => ({ value: b, label: b || '—', selected: b === (p.blood_type || '') })));
  const fAllerg = textarea({ value: p.allergies || '', placeholder: 'Allergies connues, intolérances…' });
  const fCond = textarea({ value: p.conditions || '', placeholder: 'Pathologies suivies, antécédents…' });
  const fDoc = input({ value: p.doctor_name || '', placeholder: 'Dr Martin' });
  const fDocT = input({ type: 'tel', value: p.doctor_phone || '', placeholder: '00 00 00 00 00' });
  const fPharm = input({ value: p.pharmacy_name || '', placeholder: 'Pharmacie du Centre' });
  const fPharmT = input({ type: 'tel', value: p.pharmacy_phone || '', placeholder: '00 00 00 00 00' });
  const fEm = input({ value: p.emergency_name || '', placeholder: 'Marie Dupont' });
  const fEmT = input({ type: 'tel', value: p.emergency_phone || '', placeholder: '00 00 00 00 00' });
  const fNotes = textarea({ value: p.notes || '' });

  /* ======================================================== L'AVATAR
     Les visages sont dessines par le code : on en tire une planche de
     contact, on choisit la tete qui ressemble le plus, et on peut relancer
     autant de series qu'on veut. La graine choisie est stockee telle quelle,
     donc le visage ne changera plus jamais. */
  const preview = el('div', { class: 'avatar avatar-2xl', style: { margin: '0 auto' } });
  const bias = () => ({
    sex: fSex.value || p.sex,
    age: fBirth.value ? Math.floor((Date.now() - new Date(fBirth.value)) / 31557600000) : null,
  });
  const paint = () => { preview.innerHTML = avatarMarkup({ ...p, name: fName.value || p.name }); };

  let seeds = (p.avatar_kind === 'doodle' && p.avatar_value)
    ? [Number(p.avatar_value) >>> 0, ...seedBatch(11)]
    : seedBatch(12, p.name ? hashSeed(p.name) : null);
  if (p.avatar_kind !== 'photo' && p.avatar_kind !== 'initials') {
    p.avatar_kind = 'doodle';
    if (!p.avatar_value) p.avatar_value = String(seeds[0]);
  }

  const sheet = el('div', { class: 'face-sheet' });
  function drawSheet() {
    sheet.innerHTML = '';
    const b = bias();
    for (const sd of seeds) {
      const cell = el('button', { type: 'button', class: 'face-cell',
        'aria-label': 'Choisir ce visage',
        'aria-pressed': String(p.avatar_kind === 'doodle' && Number(p.avatar_value) === sd) });
      cell.innerHTML = seedMarkup(sd, b);
      cell.addEventListener('click', () => {
        p.avatar_kind = 'doodle'; p.avatar_value = String(sd);
        [...sheet.children].forEach((c) => c.setAttribute('aria-pressed', 'false'));
        cell.setAttribute('aria-pressed', 'true');
        paint(); haptic('tap');
      });
      sheet.append(cell);
    }
  }
  /* Changer le sexe ou l'age reoriente les tirages : on redessine la planche. */
  fSex.addEventListener('change', () => { drawSheet(); paint(); });
  fBirth.addEventListener('change', () => { drawSheet(); paint(); });
  fName.addEventListener('input', () => { if (p.avatar_kind === 'initials') paint(); });

  const file = el('input', { type: 'file', accept: 'image/*', class: 'hidden' });
  file.addEventListener('change', async () => {
    const f = file.files?.[0]; if (!f) return;
    try {
      p.avatar_value = await photoToDataURL(f);
      p.avatar_kind = 'photo'; paint(); haptic('ok');
      [...sheet.children].forEach((c) => c.setAttribute('aria-pressed', 'false'));
    } catch (e) { toast(e.message, { type: 'bad' }); }
  });

  const colorRow = el('div', { class: 'row wrap gap-2' });
  BG.forEach((c) => {
    const b = el('button', { type: 'button', 'aria-label': 'Couleur', style: {
      width: '32px', height: '32px', background: c, border: '1px solid var(--rule-hard)',
      outline: p.color === c ? '2px solid var(--ink)' : 'none', outlineOffset: '2px' } });
    b.addEventListener('click', () => {
      p.color = c;
      [...colorRow.children].forEach((x) => { x.style.outline = 'none'; });
      b.style.outline = '2px solid var(--ink)'; b.style.outlineOffset = '2px';
      drawSheet(); paint(); haptic('tap');
    });
    colorRow.append(b);
  });

  drawSheet(); paint();

  openSheet({
    title: isNew ? 'Nouveau profil' : 'Modifier le profil',
    body: () => {
      const box = el('div');
      box.append(preview);
      box.append(el('div', { class: 'row gap-2', style: { justifyContent: 'center', margin: 'var(--s-3) 0' } },
        el('button', { class: 'btn btn-sm btn-ghost', type: 'button',
          html: ico('camera') + '<span>Photo</span>', onclick: () => file.click() }),
        el('button', { class: 'btn btn-sm btn-ghost', type: 'button',
          html: ico('user') + '<span>Initiales</span>', onclick: () => {
            p.avatar_kind = 'initials'; paint(); haptic('tap');
            [...sheet.children].forEach((c) => c.setAttribute('aria-pressed', 'false')); } }),
        file));
      box.append(el('div', { class: 'field' },
        el('div', { class: 'row-between', style: { marginBottom: '6px' } },
          el('label', { class: 't-upper', text: 'Choisir un visage' }),
          el('button', { class: 'btn btn-sm btn-ghost', type: 'button',
            html: ico('refresh') + '<span>Autre série</span>', onclick: () => {
              seeds = seedBatch(12); drawSheet(); haptic('tap'); } })),
        sheet,
        el('small', { class: 'hint',
          text: 'Chaque visage est dessiné par le code. Aucun ne se répète.' })));
      box.append(field('Couleur de classement', colorRow));
      box.append(el('hr', { class: 'divider' }));
      box.append(field('Nom *', fName));
      box.append(el('div', { class: 'row gap-2' },
        el('div', { class: 'grow' }, field('Lien de parenté', fRel)),
        el('div', { class: 'grow' }, field('Sexe', fSex))));
      box.append(field('Date de naissance', fBirth));
      box.append(el('div', { class: 'row gap-2' },
        el('div', { class: 'grow' }, field('Poids (kg)', fWeight)),
        el('div', { class: 'grow' }, field('Taille (cm)', fHeight)),
        el('div', { class: 'grow' }, field('Groupe sanguin', fBlood))));
      box.append(field('Allergies', fAllerg));
      box.append(field('Pathologies suivies', fCond));
      box.append(el('hr', { class: 'divider' }));
      box.append(el('div', { class: 't-upper t-mute', style: { marginBottom: 'var(--s-2)' },
        text: 'Contacts utiles' }));
      box.append(el('div', { class: 'row gap-2' },
        el('div', { class: 'grow' }, field('Médecin', fDoc)),
        el('div', { class: 'grow' }, field('Téléphone', fDocT))));
      box.append(el('div', { class: 'row gap-2' },
        el('div', { class: 'grow' }, field('Pharmacie', fPharm)),
        el('div', { class: 'grow' }, field('Téléphone', fPharmT))));
      box.append(el('div', { class: 'row gap-2' },
        el('div', { class: 'grow' }, field("En cas d'urgence", fEm)),
        el('div', { class: 'grow' }, field('Téléphone', fEmT))));
      box.append(field('Notes', fNotes));

      if (!isNew && profiles().length > 1) {
        box.append(el('button', { class: 'btn btn-quiet btn-block', type: 'button',
          style: { color: 'var(--bad)', marginTop: 'var(--s-4)' },
          html: ico('trash') + '<span>Supprimer ce profil</span>', onclick: async () => {
            if (await confirmDialog({ title: `Supprimer ${p.name} ?`,
              message: 'Tous ses médicaments et son historique seront effacés définitivement.',
              ok: 'Supprimer', danger: true })) {
              deleteProfile(p.id); ctx.refresh(); toast('Profil supprimé.');
              document.querySelector('.sheet .icon-btn')?.click();
            } } }));
      }
      return box;
    },
    footer: (c) => [
      el('button', { class: 'btn btn-ghost', text: 'Annuler', onclick: () => c.close() }),
      el('button', { class: 'btn btn-primary', html: ico('check') + '<span>Enregistrer</span>',
        onclick: () => {
          if (!fName.value.trim()) { fName.setAttribute('aria-invalid', 'true'); fName.focus();
            return toast('Le nom est obligatoire.', { type: 'bad' }); }
          const row = saveProfile({
            id: p.id, name: fName.value.trim(), relation: fRel.value, birthdate: fBirth.value || null,
            sex: fSex.value, avatar_kind: p.avatar_kind, avatar_value: p.avatar_value, color: p.color,
            weight_kg: fWeight.value === '' ? null : Number(fWeight.value),
            height_cm: fHeight.value === '' ? null : Number(fHeight.value),
            blood_type: fBlood.value, allergies: fAllerg.value.trim(), conditions: fCond.value.trim(),
            doctor_name: fDoc.value.trim(), doctor_phone: fDocT.value.trim(),
            pharmacy_name: fPharm.value.trim(), pharmacy_phone: fPharmT.value.trim(),
            emergency_name: fEm.value.trim(), emergency_phone: fEmT.value.trim(),
            notes: fNotes.value.trim(), archived: 0,
          });
          if (isNew) setActiveProfile(row.id);
          c.close(); ctx.refresh(); haptic('ok');
          toast(isNew ? 'Profil créé.' : 'Profil mis à jour.', { type: 'ok' });
        } })],
  });
}
