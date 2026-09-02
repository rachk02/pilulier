/* ============================================================================
   ics.js — export vers l'agenda du telephone (.ics).
   Les rappels crees ici sont geres par Android lui-meme : ils sonnent meme si
   l'application est fermee, meme sans reseau. C'est le filet de securite le
   plus fiable, en complement de l'alarme interne.
   ========================================================================== */
import { db, medsOf, schedulesOf, parseTimes, parseWd } from './store.js';
import { formOf } from './schema.js';
import { pad2, fmtDose } from './util.js';
import { estNatif, imprimerNatif, enregistrerFichierNatif } from './native.js';

const fold = (line) => {            // RFC 5545 : 75 octets max par ligne
  const out = [];
  let s = line;
  while (s.length > 73) { out.push(s.slice(0, 73)); s = ' ' + s.slice(73); }
  out.push(s); return out.join('\r\n');
};
const escICS = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;')
  .replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const stampUTC = (d = new Date()) =>
  `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T` +
  `${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;

/** Date-heure "flottante" : interpretee dans le fuseau du telephone. */
const localDT = (dateStr, hhmm) => {
  const [y, m, d] = dateStr.split('-');
  const [H, M] = hhmm.split(':');
  return `${y}${m}${d}T${pad2(H)}${pad2(M)}00`;
};

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function rrule(sched, med) {
  const until = med.end_date
    ? `;UNTIL=${med.end_date.replace(/-/g, '')}T235900` : '';
  switch (sched.kind) {
    case 'daily':    return `RRULE:FREQ=DAILY${until}`;
    case 'weekdays': {
      const days = parseWd(sched).map((d) => BYDAY[d]).join(',');
      return days ? `RRULE:FREQ=WEEKLY;BYDAY=${days}${until}` : `RRULE:FREQ=DAILY${until}`;
    }
    case 'interval': return `RRULE:FREQ=DAILY;INTERVAL=${Math.max(1, sched.interval_days || 1)}${until}`;
    case 'cycle':    return `RRULE:FREQ=DAILY${until}`;   // approximation : a ajuster a la main
    default:         return null;                        // « si besoin » : pas de recurrence
  }
}

/**
 * Genere le calendrier d'un profil.
 * @param {object} profile
 * @param {object} opt { alarmMinutesBefore:0, includeArchived:false }
 */
export function buildICS(profile, opt = {}) {
  const before = opt.alarmMinutesBefore ?? 0;
  const L = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//Pilulier//Suivi des prises//FR',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escICS('Traitement — ' + profile.name)}`,
    /* Le fuseau du telephone, pas un fuseau ecrit en dur : l'application
       n'a pas a savoir ou vit son utilisateur pour poser une alarme. */
    `X-WR-TIMEZONE:${escICS(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')}`,
  ];
  const now = stampUTC();
  let n = 0;

  for (const med of medsOf(profile.id, opt.includeArchived)) {
    const unit = formOf(med.form).unit;
    for (const sched of schedulesOf(med.id)) {
      const rr = rrule(sched, med);
      if (!rr) continue;
      for (const slot of parseTimes(sched)) {
        const start = med.start_date || new Date().toISOString().slice(0, 10);
        const dt = localDT(start, slot.t);
        const title = `${med.name}${med.strength ? ' ' + med.strength : ''} — ${fmtDose(slot.dose)} ${unit}`;
        const desc = [
          `Pour : ${profile.name}`,
          med.instructions ? `Posologie : ${med.instructions}` : null,
          med.dci ? `Substance : ${med.dci}` : null,
          med.notes || null,
          '', 'Rappel généré par Pilulier.',
        ].filter(Boolean).join('\n');

        L.push('BEGIN:VEVENT');
        L.push(`UID:pilulier-${profile.id}-${med.id}-${sched.id}-${slot.t.replace(':', '')}@pilulier`);
        L.push(`DTSTAMP:${now}`);
        L.push(`DTSTART:${dt}`);
        L.push('DURATION:PT15M');
        L.push(rr);
        L.push(fold(`SUMMARY:${escICS(title)}`));
        L.push(fold(`DESCRIPTION:${escICS(desc)}`));
        L.push('CATEGORIES:SANTE,MEDICAMENT');
        L.push('BEGIN:VALARM', 'ACTION:DISPLAY',
               `TRIGGER:-PT${Math.max(0, before)}M`,
               fold(`DESCRIPTION:${escICS(title)}`), 'END:VALARM');
        L.push('END:VEVENT');
        n++;
      }
    }
  }
  L.push('END:VCALENDAR');
  return { text: L.join('\r\n'), count: n };
}

const slug = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

/**
 * Ecrire un fichier la ou l'utilisateur le retrouvera.
 *
 * Dans un navigateur : le vieux truc du lien invisible. Dans l'APK : rien du
 * tout — une WebView ignore `<a download>` et les URL `blob:`, sans erreur.
 * « Sauvegarder », « Exporter en SQL » et l'export agenda ne faisaient donc
 * strictement rien sur telephone. On passe par le pont, qui ecrit dans le
 * dossier Telechargements.
 *
 * @returns le chemin ecrit (natif), 'navigateur' (web), ou '' si echec.
 */
export function downloadFile(filename, text, mime = 'text/plain;charset=utf-8') {
  if (estNatif()) {
    const chemin = enregistrerFichierNatif(filename, text, mime.split(';')[0]);
    return chemin || '';
  }
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.append(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
  return 'navigateur';
}

/**
 * Lancer l'imprimante. `window.print()` ne fait RIEN dans une WebView : la
 * methode existe, ne leve pas, et il ne se passe rien. Le service
 * d'impression d'Android imprime la WebView elle-meme — donc avec le bloc
 * `@media print` de l'application, papier kaki compris.
 */
export function lancerImpression(nom = 'Pilulier') {
  if (imprimerNatif(nom)) return 'natif';
  try { window.print(); return 'navigateur'; } catch { return ''; }
}

/** Partage natif si dispo (Android : ouvre « Ajouter a l'agenda »), sinon telechargement. */
export async function shareOrDownload(filename, text, mime) {
  /* Dans l'APK on ecrit d'abord le fichier : `navigator.share` d'une WebView
     ne connait aucune application, et echouait en silence. */
  if (estNatif()) {
    const chemin = downloadFile(filename, text, mime);
    return chemin ? { result: 'saved', chemin } : { result: 'failed' };
  }
  const file = new File([text], filename, { type: mime });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return { result: 'shared' }; }
    catch (e) { if (e.name === 'AbortError') return { result: 'cancelled' }; }
  }
  downloadFile(filename, text, mime);
  return { result: 'downloaded' };
}

export async function exportCalendar(profile, opt) {
  const { text, count } = buildICS(profile, opt);
  const r = await shareOrDownload(`traitement-${slug(profile.name)}.ics`, text,
    'text/calendar;charset=utf-8');
  return { count, ...r };
}

/* ------------------------------------------------- Sauvegarde complete */
export async function exportBackup() {
  const text = JSON.stringify(db.toJSON(), null, 2);
  return shareOrDownload(`pilulier-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`,
    text, 'application/json');
}
export async function exportSQL() {
  return shareOrDownload(`pilulier-${new Date().toISOString().slice(0, 10)}.sql`,
    db.toSQL(), 'application/sql');
}
export function importBackup(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => { try { db.loadJSON(JSON.parse(fr.result)); resolve(true); }
                        catch (e) { reject(e); } };
    fr.onerror = () => reject(new Error('Lecture impossible.'));
    fr.readAsText(file);
  });
}

/* --------------------------------------- Rapport imprimable (medecin) */
export function printReport() { return lancerImpression('Pilulier — rapport'); }
