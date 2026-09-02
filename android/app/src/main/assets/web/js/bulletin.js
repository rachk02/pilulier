/* ============================================================================
   bulletin.js — les textes que l'on envoie a quelqu'un.

   Le fils n'habite pas forcement avec son pere. Un bouton, un message clair,
   parti par WhatsApp ou n'importe quelle messagerie : c'est le lien le plus
   robuste qui existe, et rien ne quitte le telephone sans un geste explicite.
   ========================================================================== */
import { dosesForDate, adherence, medsOf, schedulesOf, parseTimes, supplyStatus,
         refillList, symptomTally, measuresOf, getS, streak } from './store.js';
import { formOf, foodLabel } from './schema.js';
import { symptomLabel } from './safety.js';
import { fmtDate, fmtDose, fmtMoney, fmtTime, addDays, dkey, relDay } from './util.js';

const line = '—'.repeat(22);

/* Les marques de statut, en deux registres.

   `MARK` est pour le texte simple — celui qui part dans WhatsApp, ou l'on ne
   peut poser qu'un caractere. Pas d'emoji : ils ne se rendent pas pareil d'un
   telephone a l'autre et un lecteur d'ecran ne les lit pas. Ce sont donc des
   carres : plein = pris, hachure = saute (la matiere de la planche), vide =
   a venir, et le triangle pour ce qui doit accrocher l'oeil.

   `MARK_ICON` est pour tout ce qui est dessine — l'apercu du bulletin, le
   rapport du medecin, la fiche imprimee : la, on trace une vraie case cochee
   a la main plutot qu'un caractere. Voir icons.js. */
const MARK = { taken: '■', missed: '▲', skipped: '▨', due: '□', upcoming: '□' };
export const MARK_TEXT = MARK;
export const MARK_ICON = {
  taken: 'markTaken', missed: 'markMissed', skipped: 'markSkipped',
  due: 'markDue', upcoming: 'markDue',
};
export const MARK_LABEL = {
  taken: 'pris', missed: 'oublié', skipped: 'sauté', due: 'à venir', upcoming: 'à venir',
};
/* Retrouver le statut d'une ligne de bulletin a partir de son premier
   caractere : c'est ce qui permet d'illustrer l'apercu sans refabriquer le
   texte une seconde fois, donc sans risque de divergence entre les deux. */
export const statusOfLine = (l) => {
  const m = String(l).trimStart()[0];
  for (const [k, v] of Object.entries(MARK)) if (v === m) return k === 'upcoming' ? 'due' : k;
  return null;
};

/* ------------------------------------------------------------ LE JOUR */
export function dayText(profile, date = new Date()) {
  const doses = dosesForDate(date, profile.id);
  const taken = doses.filter((d) => d.status === 'taken');
  const missed = doses.filter((d) => d.status === 'missed');
  const skipped = doses.filter((d) => d.status === 'skipped');
  const pending = doses.filter((d) => d.status === 'due' || d.status === 'upcoming');

  const L = [];
  L.push(`PILULIER · ${profile.name}`);
  L.push(fmtDate(date, 'full'));
  L.push(line);
  if (!doses.length) { L.push('Aucune prise prévue ce jour.'); return L.join('\n'); }

  L.push(`Prises validées : ${taken.length} / ${doses.length}`);
  if (missed.length) L.push(`Oubliées : ${missed.length}   (!)`);
  if (skipped.length) L.push(`Sautées volontairement : ${skipped.length}`);
  if (pending.length) L.push(`Encore à prendre : ${pending.length}`);
  L.push('');

  for (const d of doses) {
    const mark = MARK[d.status] || MARK.due;
    const f = formOf(d.med.form);
    const at = d.status === 'taken' && d.intake?.taken_at
      ? ` (pris à ${fmtTime(new Date(d.intake.taken_at))})` : '';
    L.push(`${mark} ${d.time}  ${d.med.name} ${d.med.strength || ''} — ${fmtDose(d.dose)} ${f.unit}${at}`);
  }

  const sy = symptomTally(profile.id, 1);
  if (sy.length) {
    L.push(''); L.push('Ressenti signalé aujourd’hui :');
    for (const s of sy) L.push(`- ${symptomLabel(s.key)}${s.count > 1 ? ` (${s.count}x)` : ''}`);
  }

  const low = supplyStatus(profile.id).filter((x) => x.urgent);
  if (low.length) {
    L.push(''); L.push('Stock à surveiller :');
    for (const x of low) L.push(`- ${x.med.name} — ${x.left} jour${x.left > 1 ? 's' : ''} restants`);
  }
  L.push(''); L.push(line);
  L.push(`${MARK.taken} pris   ${MARK.missed} oublié   ` +
         `${MARK.skipped} sauté   ${MARK.due} à venir`);
  L.push('Envoyé depuis Pilulier.');
  return L.join('\n');
}

/* --------------------------------------------------------- LA SEMAINE */
export function weekText(profile) {
  const a = adherence(profile.id, 7);
  const L = [];
  L.push(`PILULIER · ${profile.name}`);
  L.push('Bilan de la semaine');
  L.push(line);
  L.push(`Observance : ${a.rate === null ? '—' : a.rate + '%'} (${a.taken}/${a.total} prises)`);
  if (a.missed) L.push(`Oubliées : ${a.missed}`);
  const st = streak(profile.id);
  if (st) L.push(`Série sans oubli : ${st} jour${st > 1 ? 's' : ''}`);
  L.push('');

  for (let i = 6; i >= 0; i--) {
    const d = addDays(new Date(), -i);
    const list = dosesForDate(d, profile.id);
    if (!list.length) continue;
    const judged = list.filter((x) => x.status !== 'upcoming' && x.status !== 'due');
    const t = judged.filter((x) => x.status === 'taken').length;
    const bar = '▮'.repeat(t) + '▯'.repeat(Math.max(0, judged.length - t));
    L.push(`${fmtDate(d, 'short').padEnd(9)} ${bar} ${t}/${judged.length || list.length}`);
  }

  /* Ce qui est oublie le plus souvent : l'information la plus actionnable. */
  const per = new Map();
  for (let i = 6; i >= 0; i--) {
    for (const x of dosesForDate(addDays(new Date(), -i), profile.id)) {
      if (x.status !== 'missed') continue;
      const k = `${x.med.name} de ${x.time}`;
      per.set(k, (per.get(k) || 0) + 1);
    }
  }
  const worst = [...per.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (worst.length) {
    L.push(''); L.push('Le plus souvent oublié :');
    for (const [k, n] of worst) L.push(`- ${k} — ${n} fois`);
  }

  const sy = symptomTally(profile.id, 7);
  if (sy.length) {
    L.push(''); L.push('Ressenti de la semaine :');
    for (const s of sy.slice(0, 5)) L.push(`- ${symptomLabel(s.key)} — ${s.count} fois`);
  }

  const mes = measuresOf(profile.id, null, 7).slice(0, 5);
  if (mes.length) {
    L.push(''); L.push('Dernières constantes :');
    for (const r of mes) {
      const v = r.kind === 'bp' ? `${r.v1}/${r.v2}${r.v3 ? ` · ${r.v3} bpm` : ''}` : String(r.v1);
      L.push(`- ${fmtDate(new Date(r.at), 'short')} ${r.kind === 'bp' ? 'tension' : r.kind} : ${v}`);
    }
  }
  L.push(''); L.push(line); L.push('Envoyé depuis Pilulier.');
  return L.join('\n');
}

/* ------------------------------------------------------- LA PHARMACIE */
export function refillText(profile, days = 30) {
  const { items, total } = refillList(profile.id, days);
  const cur = getS('currency');
  const L = [];
  L.push(`PILULIER · ${profile.name}`);
  L.push('Liste pour la pharmacie');
  L.push(`Pour ${days} jours de traitement`);
  L.push(line);
  if (!items.length) { L.push('Rien à racheter pour le moment.'); return L.join('\n'); }
  for (const it of items) {
    const f = formOf(it.med.form);
    L.push(`- ${it.med.name} ${it.med.strength || ''}`.trim());
    L.push(`  ${it.boxes} boîte${it.boxes > 1 ? 's' : ''} (${it.need} ${f.unit})` +
           (it.cost ? ` — ${fmtMoney(it.cost, cur)}` : ''));
  }
  if (total) { L.push(''); L.push(`Total estimé : ${fmtMoney(total, cur)}`); }
  if (profile.doctor_name) { L.push(''); L.push(`Ordonnance : ${profile.doctor_name}`); }
  L.push(line);
  return L.join('\n');
}

/* --------------------------------------------------------- L'URGENCE */
/** Texte compact encode dans le QR de la fiche d'urgence. */
export function emergencyText(profile) {
  const L = [];
  L.push('FICHE URGENCE / EMERGENCY');
  const yrs = profile.birthdate
    ? Math.floor((Date.now() - new Date(profile.birthdate)) / 31557600000) : null;
  L.push(`${profile.name}${yrs ? `, ${yrs} ans` : ''}${profile.sex ? `, ${profile.sex}` : ''}`);
  if (profile.blood_type) L.push(`Groupe sanguin: ${profile.blood_type}`);
  if (profile.conditions) L.push(`Pathologies: ${profile.conditions}`);
  L.push(`Allergies: ${profile.allergies || 'aucune connue'}`);
  L.push('TRAITEMENT EN COURS:');
  for (const m of medsOf(profile.id)) {
    const times = schedulesOf(m.id).flatMap(parseTimes)
      .map((t) => `${t.t} ${fmtDose(t.dose)}`).join(' ');
    L.push(`- ${m.name} ${m.strength || ''} ${times}`.replace(/\s+/g, ' ').trim());
  }
  if (profile.doctor_name) L.push(`Medecin: ${profile.doctor_name} ${profile.doctor_phone || ''}`.trim());
  if (profile.emergency_name) L.push(`Prevenir: ${profile.emergency_name} ${profile.emergency_phone || ''}`.trim());
  return L.join('\n');
}

/* ------------------------------------------------------------- ENVOI */
const digits = (p) => String(p || '').replace(/[^\d]/g, '');

/** Ouvre WhatsApp avec le message pret. Sans numero, ouvre le choix du contact. */
export function whatsapp(text, phone = '') {
  const n = digits(phone);
  const url = `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener');
  return url;
}

/** Partage natif si disponible (WhatsApp, SMS, mail…), sinon copie. */
export async function share(text, title = 'Pilulier') {
  /* Dans l'APK, le selecteur d'Android connait toutes les messageries
     installees ; `navigator.share` d'une WebView n'en connait aucune. */
  const pont = typeof window !== 'undefined' && window.Pilulier;
  if (pont && typeof pont.partager === 'function') {
    try { pont.partager(text, title); return 'shared'; } catch { /* on continue */ }
  }
  if (navigator.share) {
    try { await navigator.share({ title, text }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  try { await navigator.clipboard.writeText(text); return 'copied'; }
  catch { return 'failed'; }
}
