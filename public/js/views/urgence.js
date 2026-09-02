/* ============================================================================
   urgence.js — la fiche que l'on garde dans le portefeuille.

   Format carte : pathologies, traitement complet, allergies, contacts. Un QR
   code encode le meme texte, lisible par n'importe quel telephone, sans
   application et sans reseau. Pour un patient cardiaque, c'est la seule page
   de l'application qui compte quand il ne peut plus parler.
   ========================================================================== */
import { el, ico, fmtDose, fmtDate } from '../util.js';
import { activeProfile, medsOf, schedulesOf, parseTimes } from '../store.js';
import { formOf } from '../schema.js';
import { emergencyText, share } from '../bulletin.js';
import { svg as qrSVG } from '../qr.js';
import { lancerImpression } from '../ics.js';
import { openSheet, toast, haptic } from '../ui.js';

const ageOf = (b) => b ? Math.floor((Date.now() - new Date(b)) / 31557600000) : null;

/** Contenu de la carte, reutilise a l'ecran et a l'impression. */
function cardNodes(p, forPrint = false) {
  const meds = medsOf(p.id);
  const yrs = ageOf(p.birthdate);
  const box = el('div', { class: 'urgence-card' + (forPrint ? ' print' : '') });

  box.append(el('div', { class: 'urgence-head' },
    el('b', { text: "FICHE D'URGENCE" }),
    el('span', { class: 't-xs', text: fmtDate(new Date(), 'num') })));

  box.append(el('div', { class: 'urgence-name' }, p.name));
  const idl = [yrs ? `${yrs} ans` : null, p.sex === 'M' ? 'Homme' : p.sex === 'F' ? 'Femme' : null,
               p.blood_type ? `Groupe ${p.blood_type}` : null,
               p.weight_kg ? `${p.weight_kg} kg` : null].filter(Boolean).join(' · ');
  if (idl) box.append(el('div', { class: 't-xs t-mute', text: idl }));

  /* `Element.append(null)` n'ignore pas son argument : il insere le texte
     « null ». Une ligne vide doit donc etre ecartee avant l'ajout, pas
     rendue puis filtree. */
  const add = (node) => { if (node) box.append(node); };
  const row = (label, value, strong = false) => {
    if (!value) return null;
    return el('div', { class: 'urgence-row' + (strong ? ' strong' : '') },
      el('span', { class: 't-upper', text: label }),
      el('span', { class: 'grow', text: value }));
  };
  add(row('Pathologies', p.conditions));
  add(row('Allergies', p.allergies || 'Aucune connue', !!p.allergies));

  const list = el('div', { class: 'urgence-meds' });
  list.append(el('div', { class: 't-upper', text: 'Traitement en cours' }));
  if (!meds.length) list.append(el('div', { class: 't-sm t-mute', text: 'Aucun.' }));
  for (const m of meds) {
    const times = schedulesOf(m.id).flatMap(parseTimes).sort((a, b) => a.t.localeCompare(b.t));
    const f = formOf(m.form);
    list.append(el('div', { class: 'urgence-med' },
      el('b', { text: `${m.name} ${m.strength || ''}`.trim() }),
      el('span', { class: 't-xs',
        text: times.map((t) => `${t.t} ${fmtDose(t.dose)} ${f.unit}`).join(' · ') || 'si besoin' })));
  }
  box.append(list);

  add(row('Médecin', [p.doctor_name, p.doctor_phone].filter(Boolean).join(' · ')));
  add(row('Pharmacie', [p.pharmacy_name, p.pharmacy_phone].filter(Boolean).join(' · ')));
  add(row('Prévenir', [p.emergency_name, p.emergency_phone].filter(Boolean).join(' · '), true));

  return box;
}

function qrNode(p, px) {
  const text = emergencyText(p);
  const wrap = el('div', { class: 'urgence-qr' });
  try {
    /* Correction M : le carre reste lisible meme un peu froisse ou sali. */
    wrap.innerHTML = qrSVG(text, { ecl: 'M', quiet: 3 });
  } catch (e) {
    wrap.append(el('p', { class: 't-xs t-mute', text: 'Fiche trop longue pour un QR code.' }));
  }
  wrap.append(el('div', { class: 't-xs t-mute t-center',
    text: 'Scanner avec l’appareil photo' }));
  return wrap;
}

/* ---------------------------------------------------------- L'ECRAN */
export function openEmergencyCard(ctx) {
  const p = activeProfile();
  if (!p) return;
  const deux = el('input', { type: 'checkbox' });
  openSheet({
    title: "Fiche d'urgence",
    body: () => {
      const box = el('div', { class: 'col gap-4' });
      box.append(el('p', { class: 't-sm t-soft',
        text: "À imprimer et à glisser dans le portefeuille. Le QR contient le même texte : " +
              "un secouriste le lit avec l’appareil photo de n’importe quel téléphone, sans réseau." }));
      box.append(cardNodes(p));
      box.append(qrNode(p));
      const missing = [];
      if (!p.blood_type) missing.push('groupe sanguin');
      if (!p.allergies) missing.push('allergies');
      if (!p.emergency_phone) missing.push('personne à prévenir');
      if (missing.length) {
        box.append(el('div', { class: 'banner' },
          ic('warn'), el('div', { class: 'grow' },
            el('b', { text: 'Champs manquants' }),
            el('span', { class: 't-sm', text: `À compléter dans le profil : ${missing.join(', ')}.` }))));
      }
      /* Le second exemplaire est une option, pas une fatalite. */
      box.append(el('label', { class: 'urgence-copies' },
        deux,
        el('span', {}, el('b', { text: 'Imprimer en double' }),
          el('span', { class: 't-xs t-mute',
            text: 'Un exemplaire pour le portefeuille, un pour le frigo.' }))));
      return box;
    },
    footer: (c) => [
      el('button', { class: 'btn btn-ghost', html: ico('share') + '<span>Envoyer</span>',
        onclick: async () => {
          const r = await share(emergencyText(p), "Fiche d'urgence");
          if (r === 'copied') toast('Fiche copiée dans le presse-papiers.', { type: 'ok' });
        } }),
      el('button', { class: 'btn btn-primary', html: ico('printer') + '<span>Imprimer</span>',
        onclick: () => { haptic('tap'); printCard(p, deux.checked ? 2 : 1); } }),
    ],
  });
}
const ic = (n) => { const s = el('span'); s.innerHTML = ico(n); return s.firstElementChild; };

/* ------------------------------------------------------- IMPRESSION */
/** La feuille elle-meme, separee de l'ordre d'imprimer : on peut la regarder
    et la mesurer sans lancer l'imprimante. */
export function buildCardSheet(p, copies = 1) {
  const area = el('div', { id: 'print-area' });
  const sheet = el('div', { class: 'urgence-print' });

  /* Un exemplaire par defaut. Le second — celui du frigo — se demande : une
     feuille imprimee en double sans qu'on l'ait voulu, c'est du papier perdu
     et une seconde fiche qui traine avec des donnees medicales dessus. */
  for (let i = 0; i < Math.max(1, copies); i++) {
    const one = el('div', { class: 'urgence-cut' });
    one.append(cardNodes(p, true));
    one.append(qrNode(p));
    sheet.append(one);
  }
  area.append(el('div', { class: 'urgence-print-head' },
    el('b', { text: "Fiche d'urgence" }),
    el('span', { class: 't-xs',
      text: copies > 1 ? 'Découper et plier · un exemplaire pour le portefeuille, un pour le frigo'
                       : 'Découper et plier · à glisser dans le portefeuille' })));
  area.append(sheet);
  return area;
}

export function printCard(p, copies = 1) {
  document.getElementById('print-area')?.remove();
  const area = buildCardSheet(p, copies);
  document.body.append(area);

  const style = el('style', { id: 'print-style', text:
    '#print-area{display:none}' +
    '@media print{ #app{display:none!important} #print-area{display:block!important} ' +
    '@page{ margin:12mm } }' });
  document.head.append(style);
  setTimeout(() => {
    lancerImpression("Pilulier — fiche d'urgence");
    setTimeout(() => { area.remove(); style.remove(); }, 2500);
  }, 150);
}
