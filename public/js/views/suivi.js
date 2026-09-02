/* suivi.js — observance dans le temps + constantes (tension, glycemie, poids). */
import { el, ico, dkey, fmtDate, fmtTime, fmtDose, fmtMoney, JOURS_S, pad2 } from '../util.js';
import { activeProfile, adherence, adherenceSeries, streak, medsOf, dosesForDate,
         addMeasure, measuresOf, db, getS } from '../store.js';
import { formOf } from '../schema.js';
import { openSheet, field, input, textarea, select, toast, emptyState, haptic,
         confirmDialog, settingRow } from '../ui.js';
import { exportBackup } from '../ics.js';
import { SYMPTOMS, symptomLabel, culprits, RED_FLAGS, GENERAL_RULES, missStreaks } from '../safety.js';
import { addSymptom, symptomsOf, deleteSymptom, symptomTally,
         supplyStatus, refillList, medsOf as medsOfProfile } from '../store.js';
import { dayText, weekText, refillText, share, whatsapp,
         statusOfLine, MARK_ICON, MARK_LABEL, MARK_TEXT } from '../bulletin.js';
import { openEmergencyCard } from './urgence.js';
import { pilulierBars, splineChart, arcRing, scatterNodes, sparkline } from '../charts.js';
import { t } from '../i18n.js';

export const title = 'Suivi';

const KINDS = {
  bp:      { label: 'Tension artérielle', unit: 'mmHg', icon: 'heart', fields: ['Systolique', 'Diastolique', 'Pouls'] },
  glucose: { label: 'Glycémie',           unit: 'g/L',  icon: 'drop',  fields: ['Valeur'] },
  weight:  { label: 'Poids',              unit: 'kg',   icon: 'chart', fields: ['Valeur'] },
  temp:    { label: 'Température',        unit: '°C',   icon: 'info',  fields: ['Valeur'] },
};

export function render(ctx) {
  const p = activeProfile();
  const root = el('div', { class: 'view' });
  if (!p) return root;

  const range = ctx.state.range || 14;

  /* --------------------------------------------------- observance
     Une gélule par jour : son contour dit ce qui était prévu, son
     remplissage ce qui a été pris. On lit la semaine sans chercher l'axe. */
  const a = adherence(p.id, range);
  const serie = adherenceSeries(p.id, range);
  /* Tant que rien n'a ete juge, un « — » en gros caracteres ressemble a une
     barre noire et ne dit rien. On compte alors ce qui est PREVU : c'est le
     seul chiffre vrai a ce moment-la. */
  const prevues = prisesPrevues(p.id, range);
  root.append(chartCard({
    label: 'Observance', apres: `${range} jours`,
    valeur: a.rate === null ? String(prevues) : a.rate + '%',
    unite: a.rate === null ? 'prises prévues' : 'des prises',
    graphique: pilulierBars(serie, { w: 340, h: 148 }),
    gauche: 'Une gélule par jour',
    droite: a.total
      ? (a.missed ? `${a.missed} oubliée${a.missed > 1 ? 's' : ''}` : 'rien d’oublié')
      : 'rien encore jugé',
  }));

  /* La répartition du mois, en anneau fendu : la fente sépare mieux que la
     couleur, et la planche n'a qu'une encre. */
  /* L'anneau reste, meme vide. Un tableau de bord dont les cadrans
     apparaissent et disparaissent selon les donnees ne se lit pas : on ne sait
     jamais si un graphique manque ou si la mesure manque. */
  root.append(chartCard({
    label: 'Répartition', apres: `${range} jours`,
    cote: el('div', { class: 'ring-legend' },
      el('div', {}, el('b', { class: 't-num', text: String(a.taken) }),
        el('span', { text: ' validées' })),
      el('div', {}, el('b', { class: 't-num', text: String(a.missed) }),
        el('span', { text: ' oubliées' })),
      el('div', {}, el('b', { class: 't-num', text: String(a.skipped) }),
        el('span', { text: ' sautées' }))),
    graphique: a.total
      ? arcRing([
        { valeur: a.taken, densite: 'plein' },
        { valeur: a.missed, densite: 'moyen' },
        { valeur: a.skipped, densite: 'vide' },
      ], { size: 132 })
      : arcRing([{ valeur: 1, densite: 'vide' }], { size: 132 }),
    gauche: 'Plein · hachuré · vide',
    droite: a.total ? `${a.total} prises jugées` : 'rien encore jugé',
  }));

  /* --------------------------------------------------- ponctualite
     Deux carnets peuvent afficher 100 % et ne pas se ressembler du tout :
     l'un prend a l'heure, l'autre trois heures plus tard. Un point par prise
     validee, l'heure prevue en abscisse, l'ecart en minutes en ordonnee. La
     bande hachuree est le quart d'heure autour de l'heure prevue. */
  const ponctu = ecartsDePrise(p.id, range);
  if (ponctu.length >= 3) {
    const med = [...ponctu].map((x) => x[1]).sort((u, v) => u - v)[Math.floor(ponctu.length / 2)];
    root.append(chartCard({
      label: 'Ponctualité', apres: t('{n} prises validées', { n: ponctu.length }),
      valeur: (med > 0 ? '+' : '') + Math.round(med), unite: 'min d’écart médian',
      graphique: scatterNodes(ponctu, { w: 320, h: 190,
        bornes: { x: [5, 24], y: [Math.min(-30, ...ponctu.map((q) => q[1])) - 5,
                               Math.max(30, ...ponctu.map((q) => q[1])) + 5] },
        zone: { x: [5, 24], y: [-15, 15] } }),
      gauche: 'Heure prévue en abscisse',
      droite: 'bande hachurée : à l’heure',
    }));
  }

  const ranges = el('div', { class: 'chip-select', style: { marginTop: 'var(--s-3)' } });
  [7, 14, 30, 90].forEach((n) => ranges.append(el('button', { class: 'chip', type: 'button',
    'aria-pressed': String(range === n), text: `${n} jours`,
    onclick: () => { ctx.state.range = n; ctx.refresh(); } })));
  root.append(ranges);

  /* --------------------------------------- fiabilite par medicament */
  const meds = medsOf(p.id);
  if (meds.length) {
    const per = meds.map((m) => {
      let t = 0, tot = 0;
      for (let i = range - 1; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        for (const x of dosesForDate(d, p.id)) {
          if (x.med.id !== m.id) continue;
          if (x.status === 'upcoming' || x.status === 'due') continue;
          tot++; if (x.status === 'taken') t++;
        }
      }
      return { m, rate: tot ? Math.round((t / tot) * 100) : null, taken: t, total: tot };
    }).filter((x) => x.total).sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101));

    if (per.length) {
      const card = el('div', { class: 'card card-flush' });
      per.forEach(({ m, rate, taken, total }) => {
        const bar = el('div', { class: 'stockbar', style: { width: '80px' } },
          el('i', { style: { width: rate + '%', background: rate >= 90 ? 'var(--ok)'
            : rate >= 70 ? 'var(--warn)' : 'var(--bad)' } }));
        card.append(settingRow({ icon: formOf(m.form).icon, title: m.name,
          sub: `${taken}/${total} prises`, right: el('div', { class: 'row gap-2' },
            bar, el('b', { class: 't-num t-sm', text: rate + '%' })) }));
      });
      root.append(el('div', { class: 'section' },
        el('div', { class: 'section-head' }, el('h2', { text: 'Par médicament' })), card));
    }
  }

  /* ------------------------------------------------------ constantes */
  const mes = el('div', { class: 'section' });
  mes.append(el('div', { class: 'section-head' },
    el('h2', { text: 'Constantes' }),
    el('button', { class: 'btn btn-sm btn-primary', html: ico('plus') + '<span>Relever</span>',
      onclick: () => measureSheet(ctx) })));

  const recent = measuresOf(p.id, null, 120).slice(0, 12);
  if (!recent.length) {
    mes.append(el('div', { class: 'card' }, el('p', { class: 't-sm t-mute t-center',
      text: 'Aucun relevé. Tension, glycémie, poids : utile à montrer au médecin.' })));
  } else {
    const last = {};
    for (const r of recent) if (!last[r.kind]) last[r.kind] = r;
    const tiles = el('div', { class: 'stat-grid', style: { marginBottom: 'var(--s-3)' } });
    for (const [k, r] of Object.entries(last)) {
      /* Le fil : la meme mesure sur ses derniers releves. Un chiffre seul ne
         dit pas s'il monte ou s'il descend — c'est pourtant tout ce qu'on
         regarde en tendant le carnet au medecin. */
      const suite = measuresOf(p.id, k, 60).slice(0, 12).reverse()
        .map((x) => x.v1).filter((v) => v != null);
      const tuile = el('div', { class: 'stat' },
        el('b', { class: 't-num', text: fmtMeasure(r) }),
        el('small', { text: `${KINDS[k]?.label || k} · ${fmtDate(new Date(r.at), 'short')}` }));
      if (suite.length >= 2) {
        tuile.append(el('div', { class: 'stat-fil', html: sparkline(suite, { w: 92, h: 26 }) }));
      }
      tiles.append(tuile);
    }
    mes.append(tiles);

    /* La tension mérite mieux qu'une liste de nombres : la courbe montre la
       tendance, et le nuage montre si les deux valeurs bougent ensemble. Les
       deux ne s'affichent qu'à partir de trois relevés — en dessous, une
       courbe donnerait l'illusion d'une tendance qui n'existe pas. */
    const bp = measuresOf(p.id, 'bp', 120).slice(0, 14).reverse();
    if (bp.length >= 3) {
      const haute = bp.map((r, i) => [i, r.v1]);
      const basse = bp.map((r, i) => [i, r.v2]).filter((x) => x[1] != null);
      const der = bp[bp.length - 1];
      mes.append(chartCard({
        label: 'Tension', apres: `${bp.length} relevés`,
        valeur: `${der.v1}/${der.v2}`, unite: 'mmHg',
        graphique: splineChart(basse.length ? [{ points: haute }, { points: basse }]
                                            : [{ points: haute }], { w: 340, h: 148 }),
        gauche: basse.length ? 'Haute et basse' : 'Systolique',
        droite: `depuis le ${fmtDate(new Date(bp[0].at), 'short')}`,
      }));
      if (basse.length >= 3) {
        mes.append(chartCard({
          label: 'Haute et basse', apres: 'un point par relevé',
          graphique: scatterNodes(
            bp.filter((r) => r.v2 != null)
              .map((r, i, arr) => [r.v1, r.v2, i === arr.length - 1]),
            { w: 300, h: 200, zone: { x: [100, 140], y: [60, 90] } }),
          gauche: 'Zone habituelle hachurée',
          droite: 'dernier relevé plein',
        }));
      }
    }

    const card = el('div', { class: 'card card-flush' });
    recent.forEach((r) => card.append(settingRow({
      icon: KINDS[r.kind]?.icon || 'info',
      title: fmtMeasure(r),
      sub: `${KINDS[r.kind]?.label || r.kind} · ${fmtDate(new Date(r.at), 'long')} à ${fmtTime(new Date(r.at))}${r.note ? ' · ' + r.note : ''}`,
      right: el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Supprimer',
        html: ico('trash'), onclick: async () => {
          if (await confirmDialog({ title: 'Supprimer ce relevé ?', ok: 'Supprimer', danger: true })) {
            db.remove('measures', r.id); ctx.refresh(); } } }) })));
    mes.append(card);
  }
  root.append(mes);

  /* ------------------------------------------------------ symptomes */
  const sy = el('div', { class: 'section' });
  sy.append(el('div', { class: 'section-head' },
    el('h2', { text: 'Ce qu’il ressent' }),
    el('button', { class: 'btn btn-sm btn-ghost', text: 'Historique',
      onclick: () => symptomHistory(ctx) })));

  const grid = el('div', { class: 'symptom-grid' });
  const watched = watchedSymptoms(p.id);
  for (const sdef of watched) {
    const b = el('button', { class: 'symptom-btn', type: 'button' });
    b.innerHTML = ico(sdef.icon);
    b.append(el('span', { text: sdef.label }));
    b.addEventListener('click', () => logSymptom(sdef, ctx));
    grid.append(b);
  }
  grid.append(el('button', { class: 'symptom-btn', type: 'button',
    html: ico('more') + '<span>Autre chose</span>', onclick: () => allSymptoms(ctx) }));
  sy.append(grid);
  sy.append(el('small', { class: 'hint',
    text: 'Une tape suffit. Ces boutons sont ceux qui correspondent à ses médicaments.' }));

  const tally = symptomTally(p.id, 30);
  if (tally.length) {
    const card = el('div', { class: 'card card-flush', style: { marginTop: 'var(--s-3)' } });
    for (const t of tally.slice(0, 6)) {
      const who = culprits(t.key, medsOfProfile(p.id));
      card.append(settingRow({
        icon: RED_FLAGS.includes(t.key) ? 'warn' : 'info',
        title: symptomLabel(t.key),
        sub: `${t.count} fois en 30 jours · dernier ${fmtDate(new Date(t.last), 'short')}` +
             (who.length ? ` · peut venir de ${who.map((c) => c.med.name).join(', ')}` : ''),
        right: el('b', { class: 't-num', text: String(t.count) }),
      }));
    }
    sy.append(card);
  }
  root.append(sy);

  /* --------------------------------------------------- renouvellement */
  const supply = supplyStatus(p.id);
  if (supply.length) {
    const sec = el('div', { class: 'section' });
    sec.append(el('div', { class: 'section-head' },
      el('h2', { text: 'Stock et renouvellement' }),
      el('button', { class: 'btn btn-sm btn-primary', html: ico('share') + '<span>Liste</span>',
        onclick: () => pharmacySheet(ctx, p) })));
    const card = el('div', { class: 'card card-flush' });
    for (const x of supply) {
      const f = formOf(x.med.form);
      card.append(settingRow({
        icon: x.urgent ? 'warn' : 'box',
        title: x.med.name,
        sub: `${fmtDose(x.med.stock_qty || 0)} ${f.unit} · ${fmtDose(x.perDay)} ${f.unit}/jour`,
        right: el('span', { class: x.urgent ? 'chip chip-bad' : 'chip',
          text: x.left === null ? '—' : `${x.left} j` }),
      }));
    }
    sec.append(card);
    root.append(sec);
  }

  /* --------------------------------------------------------- bulletin */
  const cg = getS('caregiver_name') || 'un proche';
  root.append(el('div', { class: 'section' },
    el('div', { class: 'section-head' }, el('h2', { text: 'Donner des nouvelles' })),
    el('div', { class: 'card col gap-3' },
      el('div', {}, el('b', { text: `Envoyer un bulletin à ${cg}` }),
        el('div', { class: 't-xs t-mute',
          text: 'Un message clair, prêt à partir. Rien ne quitte le téléphone sans ce geste.' })),
      el('div', { class: 'row gap-2' },
        el('button', { class: 'btn btn-ghost grow', text: 'Aujourd’hui',
          onclick: () => sendBulletin(dayText(p), p) }),
        el('button', { class: 'btn btn-ghost grow', text: 'La semaine',
          onclick: () => sendBulletin(weekText(p), p) })))));

  /* --------------------------------------------------------- rapport */
  root.append(el('div', { class: 'section' },
    el('div', { class: 'card col gap-3' },
      el('div', {}, el('b', { text: 'Rapport pour le médecin' }),
        el('div', { class: 't-xs t-mute',
          text: 'Une page imprimable avec le traitement, l’observance et les constantes.' })),
      el('div', { class: 'row gap-2' },
        el('button', { class: 'btn btn-ghost grow', html: ico('printer') + '<span>Imprimer</span>',
          onclick: () => ctx.printReport() }),
        el('button', { class: 'btn btn-ghost grow', html: ico('shield') + '<span>Fiche urgence</span>',
          onclick: () => openEmergencyCard(ctx) })),
      el('button', { class: 'btn btn-quiet btn-block', html: ico('download') + '<span>Sauvegarde du dossier</span>',
        onclick: async () => {
          /* Le bouton ne repondait pas sur telephone : une WebView ignore
             `<a download>`. Il ecrit maintenant vraiment, et le dit. */
          const r = await exportBackup();
          if (!r || r.result === 'cancelled') return;
          if (r.result === 'failed') {
            return toast('Écriture impossible. Vérifie l’espace libre du téléphone.', { type: 'bad' });
          }
          toast(r.chemin ? `Enregistré dans ${r.chemin}.` : 'Sauvegarde enregistrée.',
            { type: 'ok', duration: 5000 });
        } }))));
  return root;
}

/* ==========================================================================
   LES PETITS CALCULS DE LA PAGE
   ========================================================================== */

/** Combien de prises sont prevues sur la periode, jugees ou non. */
function prisesPrevues(profileId, jours) {
  let n = 0;
  const today = new Date();
  for (let i = jours - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    n += dosesForDate(d, profileId).length;
  }
  return n;
}

/**
 * L'ecart entre l'heure prevue et l'heure reelle, pour chaque prise validee.
 * Rend [heure decimale prevue, ecart en minutes, dernier ?] — la forme
 * qu'attend scatterNodes.
 */
function ecartsDePrise(profileId, jours) {
  const out = [];
  const today = new Date();
  for (let i = jours - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    for (const x of dosesForDate(d, profileId)) {
      if (x.status !== 'taken' || !x.intake?.taken_at) continue;
      const ecart = (x.intake.taken_at - x.planned.getTime()) / 60000;
      /* Au-dela d'une demi-journee, ce n'est plus un retard mais une saisie
         retrospective : la garder ecraserait toute l'echelle. */
      if (Math.abs(ecart) > 720) continue;
      const [hh, mm] = x.time.split(':').map(Number);
      out.push([hh + mm / 60, Math.round(ecart), false]);
    }
  }
  if (out.length) out[out.length - 1][2] = true;
  return out;
}

/* ==========================================================================
   LA CARTE DE GRAPHIQUE
   Toujours la meme anatomie : un micro-libelle et une periode, un chiffre en
   grand avec son unite, le dessin, et deux faits en pied. C'est ce qui fait
   qu'une page de graphiques se lit comme un tableau de bord et non comme une
   collection d'images.
   ========================================================================== */
function chartCard({ label, apres, valeur, unite, graphique, gauche, droite, cote }) {
  const card = el('div', { class: 'chart-card' });
  card.append(el('div', { class: 'chart-head' },
    el('b', { text: label }), el('span', { text: apres || '' })));
  if (valeur) {
    card.append(el('div', { class: 'chart-value' },
      el('b', { class: 't-num', text: valeur }),
      unite ? el('small', { text: unite }) : null));
  }
  const zone = el('div', { class: 'chart-plot' + (cote ? ' with-side' : '') });
  const dessin = el('div', { class: 'chart-svg' });
  dessin.innerHTML = graphique;
  zone.append(dessin);
  if (cote) zone.append(cote);
  card.append(zone);
  if (gauche || droite) {
    card.append(el('div', { class: 'chart-foot' },
      el('span', { text: gauche || '' }), el('span', { text: droite || '' })));
  }
  return card;
}

/* ------------------------------------------------- ancien graphique DOM */
function barChart(series) {
  const wrap = el('div', { class: 'bars' });
  series.forEach((s) => {
    const h = s.rate === null ? 0 : Math.max(4, s.rate);
    const col = el('div', { class: 'bar-col' });
    const track = el('div', { class: 'bar-track' });
    const fill = el('div', { class: 'bar-fill', style: { height: '0%',
      background: s.rate === null ? 'var(--surface-3)' : s.rate >= 90 ? 'var(--ok)'
        : s.rate >= 60 ? 'var(--warn)' : 'var(--bad)' } });
    track.append(fill); col.append(track);
    col.append(el('small', { text: series.length > 20 ? (s.date.getDate() % 5 === 0 ? String(s.date.getDate()) : '')
      : JOURS_S[s.date.getDay()][0] }));
    col.title = `${fmtDate(s.date, 'long')} — ${s.rate === null ? 'rien de prévu' : s.rate + '%'}`;
    wrap.append(col);
    requestAnimationFrame(() => { fill.style.height = h + '%'; });
  });
  return wrap;
}

/*
 * Un relevé s'écrit comme on le lit sur l'appareil, pas comme le nombre est
 * stocké : une balance dit 74,3 kg, jamais 74,28599973136235. Chaque grandeur
 * a sa précision, et c'est celle-la qu'on montre.
 */
const DECIMALES = { bp: 0, glucose: 2, weight: 1, temp: 1 };
const nombre = (v, dec) => {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  let out = n.toFixed(dec);
  if (dec) out = out.replace(/0+$/, '').replace(/\.$/, '');
  return out.replace('.', ',');
};
const fmtMeasure = (r) => {
  const dec = DECIMALES[r.kind] ?? 1;
  if (r.kind === 'bp') {
    return `${nombre(r.v1, 0)}/${nombre(r.v2, 0)}` +
      (r.v3 ? ` · ${nombre(r.v3, 0)} bpm` : '');
  }
  return `${nombre(r.v1, dec)} ${KINDS[r.kind]?.unit || ''}`.trim();
};

/* ------------------------------------------------------ saisie constante */
function measureSheet(ctx) {
  const p = activeProfile();
  let kind = 'bp';
  const host = el('div');
  const note = input({ placeholder: 'Contexte : au repos, après le repas…' });

  const picker = el('div', { class: 'chip-select' });
  Object.entries(KINDS).forEach(([id, k]) => {
    const b = el('button', { class: 'chip', type: 'button', 'aria-pressed': String(id === kind),
      html: ico(k.icon) + `<span>${k.label}</span>` });
    b.addEventListener('click', () => {
      kind = id;
      [...picker.children].forEach((c) => c.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true'); draw(); haptic('tap');
    });
    picker.append(b);
  });

  let inputs = [];
  function draw() {
    host.innerHTML = ''; inputs = [];
    const k = KINDS[kind];
    const row = el('div', { class: 'row gap-2' });
    k.fields.forEach((label) => {
      const i = input({ type: 'number', step: kind === 'glucose' || kind === 'temp' ? '0.01' : '1',
        inputmode: 'decimal', placeholder: label });
      inputs.push(i);
      row.append(el('div', { class: 'grow' }, field(label, i)));
    });
    host.append(row);
    host.append(el('p', { class: 't-xs t-mute', text: `Unité : ${k.unit}` }));
  }
  draw();

  openSheet({
    title: 'Nouveau relevé',
    body: () => el('div', {}, field('Type', picker), host, field('Note', note)),
    footer: (c) => [
      el('button', { class: 'btn btn-ghost', text: 'Annuler', onclick: () => c.close() }),
      el('button', { class: 'btn btn-primary', text: 'Enregistrer', onclick: () => {
        const [v1, v2, v3] = inputs.map((i) => i.value === '' ? null : Number(i.value));
        if (v1 === null) return toast('Renseigne au moins la première valeur.', { type: 'bad' });
        addMeasure({ profile_id: p.id, kind, v1, v2, v3, note: note.value.trim() });
        c.close(); ctx.refresh(); haptic('ok'); toast('Relevé enregistré.', { type: 'ok' });
      } })],
  });
}


/* ==========================================================================
   SYMPTOMES — saisie, historique, envoi
   ========================================================================== */

/** Les boutons proposes en premier : ceux lies aux medicaments du patient. */
function watchedSymptoms(profileId) {
  const meds = medsOfProfile(profileId);
  const keys = new Set();
  for (const s of SYMPTOMS) {
    if (culprits(s.key, meds).length) keys.add(s.key);
  }
  const list = SYMPTOMS.filter((s) => keys.has(s.key));
  /* Toujours proposer au moins quelques entrees courantes. */
  const fallback = ['vertiges', 'fatigue', 'nausee', 'insomnie'];
  for (const k of fallback) {
    if (list.length >= 8) break;
    const d = SYMPTOMS.find((x) => x.key === k);
    if (d && !keys.has(k)) { list.push(d); keys.add(k); }
  }
  return list.slice(0, 8);
}

function logSymptom(sdef, ctx) {
  const p = activeProfile();
  let severity = 2;
  const note = input({ placeholder: 'Précision (facultatif)' });
  const scale = el('div', { class: 'chip-select' });
  [[1, 'Léger'], [2, 'Gênant'], [3, 'Fort']].forEach(([v, label]) => {
    const b = el('button', { class: 'chip', type: 'button', text: label,
      'aria-pressed': String(v === severity) });
    b.addEventListener('click', () => {
      severity = v;
      [...scale.children].forEach((c) => c.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true'); haptic('tap');
    });
    scale.append(b);
  });

  const who = culprits(sdef.key, medsOfProfile(p.id));
  const red = RED_FLAGS.includes(sdef.key);

  openSheet({
    title: sdef.label,
    body: () => {
      const box = el('div');
      if (red) {
        box.append(el('div', { class: 'banner banner-bad' },
          ic('warn'), el('div', { class: 'grow' },
            el('b', { text: 'Signe à ne pas laisser passer' }),
            el('span', { class: 't-sm',
              text: "Ne pas attendre demain : appeler le médecin ou se rendre aux urgences." }))));
        if (p.doctor_phone) {
          box.append(el('a', { class: 'btn btn-danger btn-block', href: 'tel:' + p.doctor_phone,
            html: ico('phone') + `<span>Appeler ${p.doctor_name || 'le médecin'}</span>`,
            style: { marginBottom: 'var(--s-4)' } }));
        }
      }
      if (who.length) {
        box.append(el('div', { class: 'banner banner-info' }, ic('info'),
          el('div', { class: 'grow' },
            el('b', { text: 'Peut venir du traitement' }),
            ...who.map((c) => el('div', { class: 't-sm',
              text: `· ${c.med.name} — ${c.family.label}` })),
            el('div', { class: 't-sm', style: { marginTop: '6px' },
              text: "À signaler au médecin. Ne jamais arrêter un médicament de soi-même." }))));
      }
      box.append(field('Intensité', scale));
      box.append(field('Note', note));
      return box;
    },
    footer: (c) => [
      el('button', { class: 'btn btn-ghost', text: 'Annuler', onclick: () => c.close() }),
      el('button', { class: 'btn btn-primary', text: 'Enregistrer', onclick: () => {
        addSymptom({ profile_id: p.id, key: sdef.key, severity, note: note.value.trim() });
        c.close(); ctx.refresh(); haptic('ok');
        toast('Noté. Ça remontera dans le rapport du médecin.', { type: 'ok' });
      } })],
  });
}

function allSymptoms(ctx) {
  openSheet({
    title: 'Que ressent-il ?',
    body: (c) => {
      const grid = el('div', { class: 'symptom-grid' });
      for (const s of SYMPTOMS) {
        const b = el('button', { class: 'symptom-btn', type: 'button' });
        b.innerHTML = ico(s.icon);
        b.append(el('span', { text: s.label }));
        b.addEventListener('click', () => { c.close(); setTimeout(() => logSymptom(s, ctx), 250); });
        grid.append(b);
      }
      return grid;
    },
  });
}

function symptomHistory(ctx) {
  const p = activeProfile();
  const list = symptomsOf(p.id, 180);
  openSheet({
    title: 'Historique du ressenti',
    body: () => {
      if (!list.length) return el('p', { class: 't-sm t-mute', text: 'Rien de noté pour l’instant.' });
      const card = el('div', { class: 'card card-flush' });
      for (const r of list) {
        card.append(settingRow({
          icon: RED_FLAGS.includes(r.key) ? 'warn' : 'info',
          title: symptomLabel(r.key),
          sub: `${fmtDate(new Date(r.at), 'long')} à ${fmtTime(new Date(r.at))}` +
               ` · ${['', 'léger', 'gênant', 'fort'][r.severity || 1]}` +
               (r.note ? ` · ${r.note}` : ''),
          right: el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Supprimer',
            html: ico('trash'), onclick: async () => {
              if (await confirmDialog({ title: 'Supprimer cette note ?', ok: 'Supprimer', danger: true })) {
                deleteSymptom(r.id); ctx.refresh();
                document.querySelector('.sheet .sheet-head .icon-btn')?.click();
              } } }),
        }));
      }
      return card;
    },
  });
}

/* ==========================================================================
   PHARMACIE
   ========================================================================== */
function pharmacySheet(ctx, p) {
  let days = 30;
  const host = el('div');
  const draw = () => {
    host.innerHTML = '';
    const { items, total } = refillList(p.id, days);
    if (!items.length) {
      host.append(el('p', { class: 't-sm t-mute', text: 'Rien à racheter pour cette durée.' }));
      return;
    }
    const card = el('div', { class: 'card card-flush' });
    for (const it of items) {
      const f = formOf(it.med.form);
      card.append(settingRow({
        icon: formOf(it.med.form).icon,
        title: `${it.med.name} ${it.med.strength || ''}`.trim(),
        sub: `${it.boxes} boîte${it.boxes > 1 ? 's' : ''} · ${it.need} ${f.unit}`,
        right: el('span', { class: 't-num t-sm',
          text: it.cost ? fmtMoney(it.cost, getS('currency')) : '—' }),
      }));
    }
    host.append(card);
    if (total) {
      host.append(el('div', { class: 'row-between', style: { marginTop: 'var(--s-3)' } },
        el('span', { class: 't-upper', text: 'Total estimé' }),
        el('b', { class: 't-h3 t-num', text: fmtMoney(total, getS('currency')) })));
    }
  };
  draw();

  openSheet({
    title: 'Liste pour la pharmacie',
    body: () => {
      const box = el('div');
      const picker = el('div', { class: 'chip-select' });
      [15, 30, 60, 90].forEach((n) => {
        const b = el('button', { class: 'chip', type: 'button', text: `${n} jours`,
          'aria-pressed': String(n === days) });
        b.addEventListener('click', () => {
          days = n;
          [...picker.children].forEach((c) => c.setAttribute('aria-pressed', 'false'));
          b.setAttribute('aria-pressed', 'true'); draw(); haptic('tap');
        });
        picker.append(b);
      });
      box.append(field('Couvrir combien de temps', picker));
      box.append(host);
      if (p.pharmacy_phone) {
        box.append(el('a', { class: 'btn btn-ghost btn-block', href: 'tel:' + p.pharmacy_phone,
          html: ico('phone') + `<span>Appeler ${p.pharmacy_name || 'la pharmacie'}</span>`,
          style: { marginTop: 'var(--s-4)' } }));
      }
      return box;
    },
    footer: (c) => [
      el('button', { class: 'btn btn-ghost', text: 'Fermer', onclick: () => c.close() }),
      el('button', { class: 'btn btn-primary', html: ico('share') + '<span>Envoyer</span>',
        onclick: async () => {
          const txt = refillText(p, days);
          const r = await share(txt, 'Liste pharmacie');
          if (r === 'copied') toast('Liste copiée.', { type: 'ok' });
        } })],
  });
}

/* ==========================================================================
   BULLETIN
   ========================================================================== */
/*
 * L'apercu du bulletin.
 *
 * Le texte envoye reste du texte — c'est ce qui le rend robuste dans une
 * messagerie. Mais a l'ecran, on peut faire mieux qu'un caractere : chaque
 * ligne de prise recoit sa case cochee, tracee a la main. Les deux registres
 * viennent de la meme source (`statusOfLine` relit le texte deja fabrique),
 * donc l'apercu ne peut pas dire autre chose que ce qui partira.
 */
function bulletinPreview(text) {
  const wrap = el('div', { class: 'bulletin-preview' });
  const ORDRE = ['taken', 'missed', 'skipped', 'due'];
  /* La legende du texte enumere les quatre caracteres sur une seule ligne :
     a l'ecran elle devient une vraie legende, avec les quatre cases. */
  const estLegende = (l) => ORDRE.filter((k) => l.includes(MARK_TEXT[k])).length >= 3;

  for (const raw of text.split('\n')) {
    if (estLegende(raw)) {
      const leg = el('div', { class: 'bl-legend' });
      for (const k of ORDRE) {
        leg.append(el('span', { class: 'bl-leg' },
          el('i', { html: ico(MARK_ICON[k]) }), el('span', { text: MARK_LABEL[k] })));
      }
      wrap.append(leg);
      continue;
    }
    const st = statusOfLine(raw);
    if (!st) { wrap.append(el('div', { class: 'bl-plain', text: raw || ' ' })); continue; }
    wrap.append(el('div', { class: 'bl-dose' },
      el('span', { class: 'bl-mark', html: ico(MARK_ICON[st]),
        title: MARK_LABEL[st], 'aria-label': MARK_LABEL[st] }),
      el('span', { class: 'bl-text', text: raw.trimStart().slice(1).trimStart() })));
  }
  return wrap;
}

async function sendBulletin(text, p) {
  const phone = getS('caregiver_phone');
  openSheet({
    title: 'Bulletin',
    body: () => bulletinPreview(text),
    footer: (c) => [
      el('button', { class: 'btn btn-ghost', html: ico('share') + '<span>Partager</span>',
        onclick: async () => {
          const r = await share(text, 'Pilulier');
          if (r === 'copied') toast('Bulletin copié.', { type: 'ok' });
          c.close();
        } }),
      el('button', { class: 'btn btn-primary', html: ico('phone') + '<span>WhatsApp</span>',
        onclick: () => { whatsapp(text, phone); c.close(); } })],
  });
}

const ic = (n) => { const s = el('span'); s.innerHTML = ico(n); return s.firstElementChild; };
