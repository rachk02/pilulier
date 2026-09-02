/* settings.js — reglages, rappels, sauvegarde, installation. */
import { el, ico, fmtDate, fmtTime } from '../util.js';
import { getS, setS, activeProfile, profiles, db, chargerExemple, medsOf } from '../store.js';
import { RINGTONE_LIST } from '../sound.js';
import { playRingtone, stopRingtone, unlockAudio, vibrate } from '../sound.js';
import { askNotificationPermission, previewAlarm } from '../alarm.js';
import { exportCalendar, exportBackup, exportSQL, importBackup } from '../ics.js';
import { openSheet, confirmDialog, toast, field, input, choice, switchBtn,
         settingRow, haptic } from '../ui.js';
import { t, LANGUES, setLangue } from '../i18n.js';
import { DEVISES, normaliser, devise, taux, tauxExact, convertir, fmt, apercu,
         TAUX_DATE } from '../money.js';
import { montantsDuDossier, convertirLesPrix } from '../store.js';
import { estNatif, etatDesRappels, publierRappels,
         ouvrirReglageAlarmes, ouvrirReglageBatterie,
         etatDesNotifications, demanderNotificationsNatif,
         demanderAlarmePleinEcran, reglerSonSysteme,
         quandLaVoixEstFixee } from '../native.js';
import { openProfileForm } from './profiles.js';
import { openEmergencyCard } from './urgence.js';
import { frenchVoices, say, shutUp, supported as voiceSupported,
         moteur as moteurVoix, voixEnPreparation } from '../speech.js';
import { makeCode, prettyCode, normalizeCode, isValidCode, publish, receive,
         unlink, mirror, serveur, setServeur, testerRelais,
         lienDAppairage, lireLienDAppairage, origineDuRelais } from '../sync.js';
import { svg as qrSVG } from '../qr.js';
import { scanImage, detectorSupported } from '../boxscan.js';
import { share } from '../bulletin.js';
import { GENERAL_RULES } from '../safety.js';
import { input as inputField } from '../ui.js';

export const title = 'Réglages';

export function render(ctx) {
  const root = el('div', { class: 'view' });
  const p = activeProfile();

  const group = (label, ...rows) => {
    const sec = el('div', { class: 'section' });
    sec.append(el('div', { class: 'section-head' }, el('h2', { text: label })));
    sec.append(el('div', { class: 'card card-flush' }, ...rows.filter(Boolean)));
    return sec;
  };
  const toggle = (key, title, sub, icon, after) => settingRow({
    icon, title, sub, right: switchBtn(getS(key), (v) => { setS(key, v); after?.(v); }, title) });

  /* ---------------------------------------------------------- APPARENCE */
  root.append(group('Apparence',
    settingRow({ icon: 'doc', title: t('Langue'),
      sub: LANGUES[getS('lang') || 'fr']?.natif || 'Français',
      right: choice(Object.values(LANGUES).map((l) => ({ value: l.code, label: l.natif,
        sub: l.source ? t('langue d’origine') : l.nom })),
        { value: getS('lang') || 'fr', title: t('La langue'), label: t('Langue'),
          onchange: async (v) => {
            setS('lang', v);
            await setLangue(v);
            ctx.refresh();
            toast(t('Langue changée.'), { type: 'ok' });
          } }) }),
    settingRow({ icon: 'moon', title: 'Thème', sub: 'Clair, sombre ou automatique',
      right: choice([
        { value: 'auto', label: 'Automatique', sub: 'Suit le réglage du téléphone' },
        { value: 'light', label: 'Clair', sub: 'Papier kaki, encre sombre' },
        { value: 'dark', label: 'Sombre', sub: 'Encre claire sur fond sombre' }],
        { value: getS('theme'), title: 'Thème', label: 'Thème',
          onchange: (v) => { setS('theme', v); ctx.applyTheme(); ctx.refresh(); } }) }),
    settingRow({ icon: 'user', title: 'Taille du texte', sub: 'Confort de lecture',
      right: choice([
        { value: 'normal', label: 'Normale' },
        { value: 'large', label: 'Grande', sub: 'Le réglage par défaut' },
        { value: 'xlarge', label: 'Très grande' }],
        { value: getS('scale'), title: 'Taille du texte', label: 'Taille du texte',
          onchange: (v) => { setS('scale', v); ctx.applyTheme(); } }) }),
    settingRow({ icon: 'sun', title: 'Contraste renforcé', sub: 'Bordures et textes plus marqués',
      right: switchBtn(getS('contrast') === 'high',
        (v) => { setS('contrast', v ? 'high' : 'normal'); ctx.applyTheme(); }) }),
    settingRow({ icon: 'refresh', title: 'Animations',
      sub: "Désactive tout mouvement si l'affichage saccade",
      right: switchBtn(getS('motion') !== 'off', (v) => { setS('motion', v ? 'on' : 'off'); ctx.applyTheme(); }) })));

  /* ------------------------------------------------------------ RAPPELS */
  const ringName = RINGTONE_LIST.find((r) => r.id === getS('ringtone'))?.label || '—';
  root.append(group('Rappels',
    toggle('sound', 'Sonnerie', "Jouer une sonnerie à l'heure de la prise", 'sound'),
    settingRow({ icon: 'play', title: 'Sonnerie', sub: ringName, chevron: true,
      onclick: () => ringtoneSheet(ctx) }),
    settingRow({ icon: 'sound', title: 'Volume', right: volumeSlider() }),
    toggle('vibrate', 'Vibration', 'Vibrer en même temps que la sonnerie', 'phone'),
    settingRow({ icon: 'bell', title: 'Notifications système',
      sub: notifState(), chevron: true, onclick: async () => {
        /* Dans l'APK, l'API `Notification` du web n'existe pas — d'ou le
           « non supporté par ce navigateur » alors qu'on est justement dans
           l'application. Les rappels passent par de vraies notifications
           Android ; il ne manquait que la permission et le mot juste. */
        const natif = etatDesNotifications();
        if (natif) {
          if (natif.autorisees) {
            toast('Déjà autorisées. Les rappels s’affichent.', { type: 'ok' });
            demanderNotificationsNatif();      /* ouvre le réglage pour vérifier */
          } else {
            demanderNotificationsNatif();
          }
          setTimeout(() => ctx.refresh(), 800);
          return;
        }
        const r = await askNotificationPermission();
        toast(r === 'granted' ? 'Notifications activées.'
          : r === 'denied' ? "Refusé. Autorise les notifications dans les réglages d'Android."
          : 'Non disponible sur ce navigateur.', { type: r === 'granted' ? 'ok' : 'bad' });
        ctx.refresh();
      } }),
    settingRow({ icon: 'snooze', title: 'Report (snooze)',
      right: choice([5, 10, 15, 20, 30].map((n) => ({ value: n, label: n + ' min' })),
        { value: getS('snooze_min'), title: 'Report (snooze)', label: 'Report',
          onchange: (v) => setS('snooze_min', Number(v)) }) }),
    settingRow({ icon: 'clock', title: 'Fenêtre de rappel',
      sub: 'Au-delà, la prise est comptée comme oubliée',
      right: choice([30, 60, 90, 120, 180].map((n) => ({ value: n, label: n + ' min' })),
        { value: getS('alarm_window_min'), title: 'Fenêtre de rappel', label: 'Fenêtre de rappel',
          onchange: (v) => setS('alarm_window_min', Number(v)) }) }),
    settingRow({ icon: 'bell', title: "Tester l'alarme", sub: 'Voir et entendre ce que ça donne',
      chevron: true, onclick: () => previewAlarm() })));

  /* --------------------------------------------------------------- VOIX */
  if (voiceSupported()) {
    root.append(group('La voix',
      toggle('voice', 'Annoncer à voix haute',
        "À l'heure de la prise, le téléphone dit le nom et la dose", 'sound'),
      /* Dans l'APK, la liste des voix du web est vide : il n'y a rien a
         choisir, c'est le moteur d'Android qui parle. On le dit, au lieu
         d'afficher un choix qui ne mene nulle part. */
      moteurVoix() === 'android'
        ? settingRow({ icon: 'user', title: 'Voix',
            sub: voixEnPreparation()
              ? 'Le moteur de synthèse du téléphone se prépare…'
              : 'La voix française du téléphone (synthèse vocale d’Android)' })
        : settingRow({ icon: 'user', title: 'Voix', sub: currentVoiceName(),
            chevron: true, onclick: () => voiceSheet(ctx) }),
      settingRow({ icon: 'clock', title: 'Débit',
        right: rateSlider() }),
      settingRow({ icon: 'play', title: 'Écouter un exemple', chevron: true,
        onclick: () => { shutUp(); say(
          "Il est huit heures. Un demi comprimé de Captopril, vingt-cinq milligrammes.",
          { voice: getS('voice_name'), rate: getS('voice_rate') }); } })));
  } else {
    root.append(group('La voix',
      el('div', { class: 'setting-row', style: { display: 'block' } },
        el('small', { class: 't-mute', text: estNatif()
          ? "Aucun moteur de synthèse vocale française sur ce téléphone. Installer « Synthèse vocale Google » et sa voix française depuis le Play Store suffit."
          : "Ce navigateur ne sait pas lire à voix haute. Sur Android, installer « Synthèse vocale Google » et une voix française suffit." }))));
  }

  /* Le moteur de synthese repond en differe. Si l'ecran a ete peint pendant
     ce temps-la, il annonce une absence qui n'en est pas une : on le redessine
     des que la reponse arrive. Une seule fois, et seulement si on est encore
     sur cet ecran. */
  if (voixEnPreparation()) {
    quandLaVoixEstFixee(() => { if (ctx.route === 'settings') ctx.refresh(); });
  }

  /* -------------------------------------------------------- MODE SIMPLE */
  root.append(group('Mode simple',
    settingRow({ icon: 'user', title: 'Écran simplifié',
      sub: 'Une prise à la fois, très gros caractères, deux boutons',
      right: switchBtn(getS('simple_mode'), (v) => { setS('simple_mode', v); ctx.refresh(); }) }),
    toggle('simple_lock', 'Sortie protégée',
      'Il faut appuyer trois secondes pour quitter le mode simple', 'shield'),
    el('div', { class: 'setting-row', style: { display: 'block' } },
      el('small', { class: 't-mute',
        text: "À activer sur le téléphone de la personne qui prend les médicaments. Tout le reste de l’application disparaît." }))));

  /* ----------------------------------------------------------- URGENCE */
  root.append(group('Urgence',
    settingRow({ icon: 'shield', title: "Fiche d'urgence",
      sub: 'Carte de poche imprimable, avec QR code', chevron: true,
      onclick: () => openEmergencyCard(ctx) }),
    settingRow({ icon: 'warn', title: 'Consignes générales', chevron: true,
      onclick: () => openSheet({ title: 'À garder en tête', body: () =>
        el('div', { class: 'col gap-3' },
          ...GENERAL_RULES.map((r) => el('div', { class: 'banner banner-info' },
            icoEl('info'), el('span', { class: 'grow t-sm', text: r }))),
          el('p', { class: 't-xs t-mute',
            text: "Ces rappels ne remplacent ni l'ordonnance ni le pharmacien." })) }) })));

  /* ---------------------------------------------------------- L'AIDANT */
  const cgName = inputField({ value: getS('caregiver_name'), placeholder: 'Jean Dupont' });
  const cgPhone = inputField({ type: 'tel', value: getS('caregiver_phone'),
    placeholder: '0000000000' });
  cgName.addEventListener('change', () => setS('caregiver_name', cgName.value.trim()));
  cgPhone.addEventListener('change', () => setS('caregiver_phone', cgPhone.value.trim()));
  root.append(group('Le proche qui suit',
    el('div', { class: 'setting-row', style: { display: 'block' } },
      field('Nom', cgName),
      field('Numéro WhatsApp', cgPhone,
        'Indicatif du pays compris, sans + ni espaces.')),
    settingRow({ icon: 'share', title: 'Envoyer le bulletin du jour', chevron: true,
      onclick: () => ctx.go('suivi') })));

  /* --------------------------------------------------- SYNCHRONISATION */
  root.append(group('Suivi à distance', ...syncRows(ctx)));

  /* ------------------------------------------------------------- AGENDA */
  root.append(group('Agenda du téléphone',
    settingRow({ icon: 'calendar', title: "Exporter vers l'agenda",
      sub: p ? `Crée les rappels récurrents de ${p.name}` : '', chevron: true,
      onclick: async () => {
        if (!p) return;
        const { count, result } = await exportCalendar(p);
        if (result === 'cancelled') return;
        toast(`${count} rappel${count > 1 ? 's' : ''} exporté${count > 1 ? 's' : ''}. Ouvre le fichier pour l'ajouter à ton agenda.`,
          { type: 'ok', duration: 5000 });
      } }),
    el('div', { class: 'setting-row', style: { display: 'block' } },
      el('small', { class: 't-mute', text:
        "Les rappels de l'agenda sonnent même quand l'application est fermée. C'est le filet de sécurité le plus fiable sur Android : à refaire après chaque changement d'ordonnance." }))));

  /* -------------------------------------------------------------- STOCK */
  root.append(group('Traitement',
    toggle('auto_stock', 'Décompter le stock', 'Retirer automatiquement à chaque prise validée', 'box'),
    settingRow({ icon: 'chart', title: 'Devise',
      right: choice(Object.values(DEVISES).map((d) => ({ value: d.code,
        label: `${d.label} · ${d.nom}` })),
        { value: normaliser(getS('currency')), title: 'Devise', label: 'Devise',
          onchange: (v) => changerDevise(ctx, v) }) })));

  /* ------------------------------------------------------------ PROFILS */
  root.append(group('Profils',
    ...profiles().map((pr) => settingRow({ icon: 'user', title: pr.name,
      sub: `${pr.relation || ''} · ${medsOf(pr.id).length} médicament(s)`.trim(), chevron: true,
      onclick: () => openProfileForm(ctx, pr) })),
    settingRow({ icon: 'plus', title: 'Ajouter un profil', chevron: true,
      onclick: () => openProfileForm(ctx, null) })));

  /* ------------------------------------------------------------ DONNEES */
  const fileIn = el('input', { type: 'file', accept: '.json,application/json', class: 'hidden' });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files?.[0]; if (!f) return;
    if (!await confirmDialog({ title: 'Restaurer cette sauvegarde ?',
      message: 'Toutes les données actuelles seront remplacées.', ok: 'Restaurer', danger: true })) return;
    try { await importBackup(f); toast('Sauvegarde restaurée.', { type: 'ok' }); ctx.refresh(); }
    catch (e) { toast(e.message || 'Fichier invalide.', { type: 'bad' }); }
    fileIn.value = '';
  });

  root.append(group('Données',
    settingRow({ icon: 'download', title: 'Sauvegarder', sub: 'Fichier .json à conserver',
      chevron: true, onclick: () => direOuCaVa(exportBackup()) }),
    settingRow({ icon: 'upload', title: 'Restaurer', sub: 'Depuis un fichier de sauvegarde',
      chevron: true, onclick: () => fileIn.click() }),
    settingRow({ icon: 'doc', title: 'Exporter en SQL', sub: 'Base SQLite ouvrable sur ordinateur',
      chevron: true, onclick: () => direOuCaVa(exportSQL()) }),
    settingRow({ icon: 'printer', title: 'Rapport imprimable', chevron: true,
      onclick: () => ctx.printReport() }),
    settingRow({ icon: 'refresh', title: 'Charger des exemples',
      sub: 'Quatre traitements fictifs, pour explorer',
      chevron: true, onclick: async () => {
        /* Les exemples vont dans le carnet ouvert : pas de second profil
           fantome a cote de celui de la personne. S'il n'y a aucun carnet,
           et seulement dans ce cas, on en fabrique un de demonstration. */
        const cur = activeProfile();
        if (await confirmDialog({ title: 'Charger des exemples ?',
          message: cur
            ? `Quatre médicaments entièrement fictifs seront ajoutés au carnet de ${cur.name}, ` +
              'avec leurs horaires. Ils s’effacent un par un comme les autres.'
            : 'Aucun carnet n’est ouvert : un profil de démonstration sera créé avec ' +
              'quatre médicaments fictifs.',
          ok: 'Charger' })) {
          chargerExemple(cur ? { profil: cur.id } : {});
          ctx.refresh();
          toast('Exemples chargés.', { type: 'ok' });
        }
      } }),
    settingRow({ icon: 'trash', title: 'Tout effacer', sub: 'Remet l’application à zéro',
      chevron: true, onclick: async () => {
        if (await confirmDialog({ title: 'Tout effacer ?',
          message: 'Profils, médicaments et historique seront définitivement supprimés.',
          ok: 'Tout effacer', danger: true })) {
          db.wipe(); await db.flush(); location.reload(); }
      } }),
    fileIn));

  /* ------------------------------------------------ LES VRAIS RAPPELS
     Uniquement dans l'application installee : c'est la seule difference
     visible entre l'APK et la version ouverte dans Chrome, et elle merite
     d'etre dite franchement plutot que promise en silence. */
  const etat = etatDesRappels();
  if (etat) {
    /* Revenir d'un reglage d'Android ne redessinait rien : on restait devant
       « Régler » alors que c'etait accorde. On relit l'etat au retour. */
    const relireAuRetour = () => {
      const h = () => {
        if (document.hidden) return;
        document.removeEventListener('visibilitychange', h);
        setTimeout(() => ctx.refresh(), 400);
      };
      document.addEventListener('visibilitychange', h);
    };

    root.append(group('Rappels du système',
      settingRow({ icon: 'bell', title: 'Alarme exacte',
        sub: etat.alarmesExactes
          ? 'Autorisée. Les prises sonnent à l’heure, même téléphone verrouillé.'
          : 'Refusée. Sans elle, Android regroupe les réveils : un rappel de 8 h '
            + 'peut arriver à 8 h 20, et parfois plus tard si le téléphone dort.',
        right: etat.alarmesExactes ? el('span', { class: 'chip chip-ok', text: 'active' })
          : el('button', { class: 'btn btn-sm', text: 'Autoriser',
              onclick: () => { relireAuRetour(); ouvrirReglageAlarmes(); } }) }),
      settingRow({ icon: 'shield', title: 'Batterie sans restriction',
        /* Ce n'est PAS le réglage « Sans restriction » de la fiche de
           l'application : c'est l'exemption d'optimisation de batterie, que
           Android refuse par défaut à toute application. D'où un bouton qui
           reste sur « Régler » alors que la fiche dit « sans restriction ». */
        sub: etat.batterieLibre
          ? 'Accordée. Android ne mettra pas l’application en veille.'
          : 'À accorder une fois. Ce n’est pas le même réglage que « Sans restriction » '
            + 'dans la fiche de l’application : c’est l’exemption d’optimisation de '
            + 'batterie, refusée par défaut à toutes les applications.',
        right: etat.batterieLibre ? el('span', { class: 'chip chip-ok', text: 'ok' })
          : el('button', { class: 'btn btn-sm', text: 'Régler',
              onclick: () => { relireAuRetour(); ouvrirReglageBatterie(); } }) }),
      /* Le verrou qui manquait, et qui explique tout le reste : depuis
         Android 10, une application en arriere-plan ne peut pas ouvrir un
         ecran. Le systeme le fait a sa place — a condition d'y etre
         autorise. Sans ca, on recoit la notification et il faut ouvrir
         l'application a la main pour voir le rappel. */
      settingRow({ icon: 'bell', title: 'Écran de rappel plein format',
        sub: etat.pleinEcran
          ? 'Autorisé. Le rappel s’ouvre en grand, même téléphone verrouillé.'
          : 'Refusé. Seule une notification arrivera : il faudra ouvrir '
            + 'l’application pour voir le rappel.',
        right: etat.pleinEcran ? el('span', { class: 'chip chip-ok', text: 'actif' })
          : el('button', { class: 'btn btn-sm', text: 'Autoriser',
              onclick: () => { relireAuRetour(); demanderAlarmePleinEcran(); } }) }),
      settingRow({ icon: 'sound', title: 'Sonnerie du système en secours',
        sub: getS('son_systeme') === false
          ? 'Éteinte. C’est l’application qui sonne, avec sa sonnerie et sa voix. '
            + 'Si le système refuse d’ouvrir l’écran, le rappel sera muet.'
          : 'La sonnerie de réveil du téléphone accompagne la notification. '
            + 'Elle s’arrête dès que l’écran de l’application prend le relais.',
        right: switchBtn(getS('son_systeme') !== false, (v) => {
          setS('son_systeme', v);
          reglerSonSysteme(v);
          toast(v ? 'Le téléphone sonnera aussi.' : 'L’application sonnera seule.',
            { type: 'ok' });
        }, 'Sonnerie du système') }),
      settingRow({ icon: 'refresh', title: 'Reposer les rappels',
        sub: 'À faire après un changement d’ordonnance',
        right: el('button', { class: 'btn btn-sm', text: 'Reposer',
          onclick: () => {
            const n = publierRappels();
            toast(n > 0 ? `${n} rappel${n > 1 ? 's' : ''} posé${n > 1 ? 's' : ''}.`
                        : 'Aucune prise à venir.', { type: n > 0 ? 'ok' : 'info' });
          } }) })));
  }

  /* ----------------------------------------------------------- A PROPOS */
  root.append(group('À propos',
    (ctx.installPrompt && !estNatif()) ? settingRow({ icon: 'download',
      title: "Installer l'application", sub: "Ajouter à l'écran d'accueil",
      chevron: true, onclick: () => ctx.install() }) : null,
    settingRow({ icon: 'shield', title: 'Confidentialité',
      sub: 'Tout reste sur ce téléphone. Aucun compte, aucun serveur.' }),
    settingRow({ icon: 'doc', title: 'Documentation',
      sub: 'Comment c’est fait, et ce que ça ne promet pas', chevron: true,
      onclick: () => window.open('/doc.html', '_blank', 'noopener') }),
    settingRow({ icon: 'info', title: 'Version',
      right: ctx.version + (estNatif() ? ' · Android' : '') })));

  root.append(el('p', { class: 't-xs t-mute t-center', style: { margin: 'var(--s-6) 0' },
    text: "Cette application aide à ne rien oublier. Elle ne remplace ni l'ordonnance, ni l'avis du médecin ou du pharmacien." }));
  return root;
}

/* ------------------------------------------------------------ LA VOIX */
function currentVoiceName() {
  const n = getS('voice_name');
  if (n) return n;
  const v = frenchVoices()[0];
  return v ? `${v.name} (par défaut)` : 'Aucune voix française trouvée';
}
function rateSlider() {
  const s = el('input', { type: 'range', min: '.6', max: '1.2', step: '.05',
    value: String(getS('voice_rate') ?? .9), style: { width: '120px' },
    'aria-label': 'Débit de la voix' });
  s.addEventListener('change', () => {
    setS('voice_rate', Number(s.value)); shutUp();
    say('Voici le débit de la voix.', { voice: getS('voice_name'), rate: Number(s.value) });
  });
  return s;
}
function voiceSheet(ctx) {
  const list = frenchVoices();
  openSheet({
    title: 'Choisir la voix',
    onClose: () => { shutUp(); ctx.refresh(); },
    body: (ctl) => {
      const box = el('div', { class: 'col gap-2' });
      if (!list.length) {
        box.append(el('p', { class: 't-sm t-mute',
          text: "Aucune voix française installée sur ce téléphone. Réglages Android → Langues → Synthèse vocale." }));
        return box;
      }
      const mk = (name, label, sub) => {
        const row = el('button', { class: 'card row pressable', type: 'button',
          style: { width: '100%', textAlign: 'left' } },
          el('div', { class: 'grow' }, el('b', { text: label }),
            el('div', { class: 't-xs t-mute', text: sub })),
          el('span', { class: 'icon-btn', html: ico(getS('voice_name') === name ? 'check' : 'play') }));
        row.addEventListener('click', () => {
          setS('voice_name', name); shutUp();
          say('Bonjour. C’est l’heure de vos médicaments.', { voice: name, rate: getS('voice_rate') });
          [...box.children].forEach((c) => { const b = c.querySelector?.('.icon-btn');
            if (b) b.innerHTML = ico('play'); });
          row.querySelector('.icon-btn').innerHTML = ico('check');
        });
        return row;
      };
      box.append(mk('', 'Voix automatique', 'La meilleure voix française du téléphone'));
      for (const v of list) box.append(mk(v.name, v.name,
        `${v.lang}${v.localService ? ' · hors-ligne' : ' · nécessite le réseau'}`));
      return box;
    },
    footer: (c) => [el('button', { class: 'btn btn-primary btn-block', text: 'Terminé',
      onclick: () => c.close() })],
  });
}
const icoEl = (n) => { const s = el('span'); s.innerHTML = ico(n); return s.firstElementChild; };

/**
 * Un export ne doit jamais finir en silence.
 *
 * Sur telephone le fichier part dans Telechargements ; dans un navigateur il
 * tombe dans le dossier habituel. Dans les deux cas on le DIT — c'est ce qui
 * manquait : on appuyait, il ne se passait rien de visible, et on ne pouvait
 * pas savoir si le bouton etait casse ou si le fichier etait quelque part.
 */
async function direOuCaVa(promesse) {
  let r;
  try { r = await promesse; }
  catch (e) { return toast(e.message || 'Export impossible.', { type: 'bad' }); }
  if (!r || r.result === 'cancelled') return;
  if (r.result === 'failed') {
    return toast('Écriture impossible. Vérifie l’espace libre du téléphone.', { type: 'bad' });
  }
  toast(r.chemin ? `Enregistré dans ${r.chemin}.` : 'Fichier enregistré.',
    { type: 'ok', duration: 5000 });
}

/* ==========================================================================
   SUIVI A DISTANCE

   Ce que c'est, en une phrase : le telephone du patient depose regulierement
   un compte rendu CHIFFRE dans une boite aux lettres, et celui du proche va
   l'y chercher. La boite ne sait rien lire.

   Ce qu'il fallait pour que ca marche, et qui manquait :
     - une boite aux lettres joignable — `/api/sync` n'existe pas dans l'APK,
       ou les fichiers viennent d'une origine locale inventee ;
     - un moyen de transmettre le code SANS le faire passer par une
       messagerie : le QR, scanne d'un ecran a l'autre ;
     - de quoi dire, a chaque etape, ou on en est.
   ========================================================================== */
function syncRows(ctx) {
  const code = getS('sync_code');
  const role = getS('sync_role');
  const last = getS('sync_last');
  const rows = [];

  /* L'adresse du relais se regle toujours : c'est la premiere chose qui
     manque, et la seule que l'application ne peut pas deviner. */
  const adresse = serveur();
  rows.push(settingRow({ icon: 'info', title: 'Comment ça marche',
    sub: 'Trois étapes, en une minute', chevron: true,
    onclick: () => expliquerLeSuivi(ctx) }));
  /* D'ou vient l'adresse : saisie, posee a la compilation, ou simplement
     « a cote de l'application ». Sans ce mot, on ne sait pas si le champ vide
     veut dire « rien » ou « ca marche tout seul ». */
  const D_OU = { saisie: 'saisie ici', compilation: 'posée à la compilation',
                 locale: 'servie avec l’application', aucune: '' };
  rows.push(settingRow({ icon: 'settings', title: 'Adresse du relais',
    sub: adresse ? `${adresse} — ${D_OU[origineDuRelais()]}`
                 : 'Non configurée — le suivi ne peut pas fonctionner',
    right: el('span', { class: adresse ? 'pill-ok' : 'pill-bad',
      text: adresse ? 'réglée' : 'manquante' }),
    chevron: true, onclick: () => reglerRelais(ctx) }));

  if (!isValidCode(code)) {
    rows.push(settingRow({ icon: 'phone', title: 'Ce téléphone est celui du patient',
      sub: 'Créer un code et le montrer au proche', chevron: true,
      onclick: () => appairerPatient(ctx) }));
    rows.push(settingRow({ icon: 'users', title: 'Ce téléphone est celui du proche',
      sub: 'Scanner le QR, coller le lien, ou saisir le code', chevron: true,
      onclick: () => appairerProche(ctx) }));
    return rows;
  }

  rows.push(settingRow({ icon: 'shield', title: 'Liaison active',
    sub: role === 'patient' ? 'Ce téléphone publie le compte rendu'
                            : 'Ce téléphone reçoit le compte rendu',
    right: el('code', { class: 't-sm', text: prettyCode(code) }) }));
  rows.push(settingRow({ icon: 'clock', title: 'Dernier échange',
    right: last ? `${fmtDate(new Date(last), 'short')} ${fmtTime(new Date(last))}` : 'jamais' }));
  if (role === 'patient') {
    rows.push(settingRow({ icon: 'qr', title: 'Remontrer le QR',
      sub: 'Pour relier un autre proche', chevron: true,
      onclick: () => montrerLeQR(ctx, code) }));
  }
  rows.push(settingRow({ icon: 'refresh',
    title: role === 'patient' ? 'Publier maintenant' : 'Actualiser maintenant',
    chevron: true, onclick: async () => {
      try {
        if (role === 'patient') { await publish(); toast('Compte rendu publié.', { type: 'ok' }); }
        else {
          const r = await receive();
          toast(r ? 'Compte rendu reçu.' : 'Rien n’a encore été publié.', { type: r ? 'ok' : '' });
        }
        ctx.refresh();
      } catch (e) { toast(e.message, { type: 'bad' }); }
    } }));
  rows.push(settingRow({ icon: 'x', title: 'Couper la liaison', chevron: true,
    onclick: async () => {
      if (await confirmDialog({ title: 'Couper la liaison ?',
        message: "Le compte rendu déjà publié restera illisible et s'effacera tout seul après un mois.",
        ok: 'Couper', danger: true })) { unlink(); ctx.refresh(); toast('Liaison coupée.'); }
    } }));
  return rows;
}

/* ------------------------------------------------------- L'explication */
function expliquerLeSuivi() {
  openSheet({
    title: 'Le suivi à distance',
    body: () => {
      const box = el('div', { class: 'col gap-4' });
      box.append(el('p', { class: 't-sm t-soft', text:
        'Deux téléphones, une boîte aux lettres aveugle. Celui du patient y dépose un compte '
        + 'rendu chiffré ; celui du proche va le chercher et le déchiffre. Le serveur ne reçoit '
        + 'qu’un identifiant sans signification et un bloc illisible : ni nom, ni médicament, '
        + 'ni horaire.' }));
      const etapes = el('div', { class: 'ob-points' });
      for (const [n, titre, detail] of [
        ['1', 'Une adresse de relais',
         'Une petite fonction déposée sur Vercel, à partir de api/sync.js. Gratuite, sans '
         + 'dépendance. C’est la seule connexion réseau de toute l’application, et elle ne part '
         + 'que si ce suivi est activé.'],
        ['2', 'Le téléphone du patient crée un code',
         'Il affiche un QR. Le code ne part JAMAIS vers le serveur : c’est lui qui chiffre, et '
         + 'lui seul permet de déchiffrer. Perdu, les données publiées deviennent illisibles.'],
        ['3', 'Le téléphone du proche scanne ce QR',
         'Une photo de l’écran de l’autre téléphone suffit : elle transporte le code ET l’adresse '
         + 'du relais d’un coup. Rien à taper, rien à dicter, rien qui passe par une messagerie.'],
      ]) {
        etapes.append(el('div', { class: 'ob-point' },
          el('span', { class: 'ob-num', text: n }),
          el('div', {}, el('b', { text: titre }), el('span', { text: detail }))));
      }
      box.append(etapes);
      box.append(el('div', { class: 'banner' }, icoEl('info'),
        el('div', { class: 'grow' }, el('b', { text: 'Le proche voit, il ne modifie pas' }),
          el('span', { class: 't-sm', text:
            'Le compte rendu part dans un seul sens. Rien de ce que fait le proche ne revient '
            + 'sur le téléphone du patient.' }))));
      return box;
    },
    footer: (c) => [el('button', { class: 'btn btn-primary btn-block', text: 'Compris',
      onclick: () => c.close() })],
  });
}

/* --------------------------------------------------- L'adresse du relais */
function reglerRelais(ctx) {
  const champ = inputField({ value: serveur(), type: 'url', autocomplete: 'off',
    spellcheck: 'false', placeholder: 'https://mon-pilulier.vercel.app/api/sync' });
  const verdict = el('p', { class: 't-sm t-mute' });

  openSheet({
    title: 'Adresse du relais',
    body: () => {
      const box = el('div');
      box.append(el('p', { class: 't-sm t-soft', style: { marginBottom: 'var(--s-4)' }, text:
        'Déposer le dépôt sur Vercel — api/sync.js est un seul fichier, sans dépendance — puis '
        + 'coller ici l’adresse de la fonction, en entier : https://…/api/sync. Dans l’APK, '
        + 'l’application est servie depuis une origine locale, elle n’a donc personne à appeler '
        + 'sans cette adresse. « Tester » vérifie que c’est bien une fonction Pilulier au bout, '
        + 'et pas seulement qu’une page existe.' }));
      box.append(field('Adresse', champ));
      box.append(el('button', { class: 'btn btn-ghost btn-block', type: 'button',
        style: { marginTop: 'var(--s-3)' },
        html: ico('refresh') + '<span>Tester</span>',
        onclick: async () => {
          verdict.textContent = 'Essai en cours…';
          try {
            const r = await testerRelais(champ.value);
            champ.value = r.url;            /* on montre l'adresse vraiment appelée */
            verdict.textContent = r.stockage === 'memoire'
              ? 'C’est bien une fonction Pilulier — mais SANS base de données : '
                + 'les comptes rendus s’effacent quand elle s’endort. Suffisant pour '
                + 'essayer, pas pour tous les jours. Voir la documentation, § 6.'
              : r.stockage === 'durable'
                ? 'C’est bien une fonction Pilulier, avec sa base. Tout est en ordre.'
                : 'C’est bien une fonction Pilulier, et elle répond.';
          } catch (e) { verdict.textContent = e.message; }
        } }));
      box.append(verdict);
      return box;
    },
    footer: (c) => [
      el('button', { class: 'btn btn-ghost', text: 'Annuler', onclick: () => c.close() }),
      el('button', { class: 'btn btn-primary', text: 'Enregistrer', onclick: () => {
        setServeur(champ.value);
        c.close(); ctx.refresh();
        toast(serveur() ? 'Adresse enregistrée.' : 'Adresse effacée.', { type: 'ok' });
      } })],
  });
}

/* ---------------------------------------------------------- Cote patient */
function montrerLeQR(ctx, code) {
  const lien = lienDAppairage(code);
  openSheet({
    title: 'À scanner par le proche',
    body: () => {
      const box = el('div', { class: 'col gap-4' });
      box.append(el('p', { class: 't-sm t-soft', text:
        'Sur SON téléphone : Réglages → Suivi à distance → « Ce téléphone est celui du proche » '
        + '→ Scanner. Il photographie cet écran. Le code et l’adresse du relais passent d’un '
        + 'coup, sans transiter par une messagerie.' }));
      const q = el('div', { class: 'urgence-qr' });
      q.innerHTML = qrSVG(lien, { margin: 2 });
      box.append(q);
      box.append(el('div', { class: 'sync-code' }, el('code', { text: prettyCode(code) })));
      box.append(el('p', { class: 't-xs t-mute t-center', text:
        'Si le scan ne marche pas, ce code se saisit à la main.' }));
      box.append(el('div', { class: 'banner' }, icoEl('warn'),
        el('div', { class: 'grow' }, el('b', { text: 'À conserver' }),
          el('span', { class: 't-sm', text:
            'Ce code perdu, les données publiées deviennent définitivement illisibles. '
            + 'C’est le prix du chiffrement de bout en bout.' }))));
      return box;
    },
    footer: (c) => [
      el('button', { class: 'btn btn-ghost', html: ico('share') + '<span>Envoyer le lien</span>',
        onclick: async () => {
          const r = await share(lien, 'Lien Pilulier');
          toast(r === 'copied' ? 'Lien copié. À coller sur l’autre téléphone.'
                               : 'Le lien contient le code : ne le laisse pas traîner.',
            { type: 'ok', duration: 5000 });
        } }),
      el('button', { class: 'btn btn-primary', text: 'Terminé',
        onclick: () => { c.close(); ctx.refresh(); } })],
  });
}

async function appairerPatient(ctx) {
  if (!serveur()) {
    toast('Renseigne d’abord l’adresse du relais.', { type: 'bad' });
    return reglerRelais(ctx);
  }
  const code = normalizeCode(makeCode());
  setS('sync_code', code);
  setS('sync_role', 'patient');
  try {
    await publish(code);
    toast('Liaison activée, compte rendu publié.', { type: 'ok' });
  } catch (e) {
    setS('sync_code', ''); setS('sync_role', '');
    toast(e.message, { type: 'bad' });
    return;
  }
  ctx.refresh();
  montrerLeQR(ctx, code);
}

/* ----------------------------------------------------------- Cote proche
   Trois portes vers le meme resultat. La premiere est la seule ou le code ne
   passe par aucun intermediaire : il va d'un ecran a un appareil photo. */
function appairerProche(ctx) {
  const champ = inputField({ value: '', placeholder: 'XXXX-XXXX-XXXX',
    style: 'text-align:center; letter-spacing:var(--tracking-label); font-size:var(--fs-lg)' });
  const photo = el('input', { type: 'file', accept: 'image/*', capture: 'environment',
    style: { display: 'none' } });
  const etat = el('p', { class: 't-sm t-mute' });

  const appliquer = async (code, srv, ctl) => {
    if (srv) setServeur(srv);
    if (!serveur()) { etat.textContent = 'Il manque l’adresse du relais.'; return; }
    setS('sync_code', code); setS('sync_role', 'aidant');
    try {
      const r = await receive(code);
      ctl.close(); ctx.refresh();
      toast(r ? `Relié à ${r.profile?.name || 'ce patient'}.`
              : 'Relié. Rien n’a encore été publié.', { type: 'ok' });
    } catch (e) {
      setS('sync_code', ''); setS('sync_role', '');
      etat.textContent = e.message;
    }
  };

  openSheet({
    title: 'Relier ce téléphone',
    body: (ctl) => {
      const box = el('div', { class: 'col gap-3' });
      box.append(el('p', { class: 't-sm t-soft', text:
        'Trois façons, au choix. La première est la plus sûre : le code ne passe par aucune '
        + 'messagerie, il va d’un écran à un appareil photo.' }));

      photo.addEventListener('change', async () => {
        const f = photo.files?.[0];
        photo.value = '';
        if (!f) return;
        etat.textContent = 'Lecture du QR…';
        const codes = await scanImage(f);
        const lu = codes.map((x) => lireLienDAppairage(x.rawValue)).find(Boolean);
        if (!lu) { etat.textContent = 'Aucun QR Pilulier reconnu sur cette photo.'; return; }
        await appliquer(lu.code, lu.serveur, ctl);
      });

      box.append(el('button', { class: 'ob-opt', type: 'button', onclick: () => {
        if (!detectorSupported()) {
          etat.textContent = 'Ce téléphone ne sait pas lire les QR. Utilise le lien ou le code.';
          return;
        }
        photo.click();
      } },
        el('span', { class: 'ob-ico', html: ico('qr') }),
        el('div', {}, el('b', { text: 'Scanner le QR' }),
          el('span', { text: 'Photographier l’écran de l’autre téléphone.' }))));

      box.append(el('button', { class: 'ob-opt', type: 'button', onclick: async () => {
        let texte = '';
        try { texte = await navigator.clipboard.readText(); } catch { /* refuse */ }
        const lu = lireLienDAppairage(texte);
        if (!lu) { etat.textContent = 'Le presse-papiers ne contient pas de lien Pilulier.'; return; }
        await appliquer(lu.code, lu.serveur, ctl);
      } },
        el('span', { class: 'ob-ico', html: ico('share') }),
        el('div', {}, el('b', { text: 'Coller le lien reçu' }),
          el('span', { text: 'Le lien envoyé par messagerie contient le code : à effacer ensuite.' }))));

      box.append(el('div', { class: 'sync-manuel' },
        el('b', { class: 't-upper t-xs', text: 'Ou saisir le code' }),
        field('Code', champ)));

      box.append(etat, photo);
      return box;
    },
    footer: (c) => [
      el('button', { class: 'btn btn-ghost', text: 'Annuler', onclick: () => c.close() }),
      el('button', { class: 'btn btn-primary', text: 'Relier', onclick: async () => {
        const v = normalizeCode(champ.value);
        if (!isValidCode(v)) return toast('Code incomplet (12 caractères).', { type: 'bad' });
        await appliquer(v, '', c);
      } })],
  });
}

const notifState = () => {
  const natif = etatDesNotifications();
  if (natif) {
    return natif.autorisees
      ? 'Autorisées. Les rappels s’affichent même écran éteint.'
      : 'Refusées — les rappels seront muets. Appuie pour autoriser.';
  }
  if (!('Notification' in window)) return 'Non supporté par ce navigateur';
  return Notification.permission === 'granted' ? 'Autorisées'
    : Notification.permission === 'denied' ? 'Bloquées — à réactiver dans Android'
    : 'Appuie pour autoriser';
};

function volumeSlider() {
  const s = el('input', { type: 'range', min: '0', max: '1', step: '.05',
    value: String(getS('volume') ?? .8), style: { width: '120px' }, 'aria-label': 'Volume' });
  s.addEventListener('change', () => {
    setS('volume', Number(s.value)); unlockAudio();
    playRingtone(getS('ringtone'), { loops: 1, volume: Number(s.value) });
  });
  return s;
}

/* -------------------------------------------------------- Choix sonnerie */
function ringtoneSheet(ctx) {
  const cur = getS('ringtone');
  openSheet({
    title: 'Sonnerie',
    onClose: () => { stopRingtone(); ctx.refresh(); },
    body: (ctl) => {
      const box = el('div', { class: 'col gap-2' });
      RINGTONE_LIST.forEach((r) => {
        const row = el('button', { class: 'card row pressable', type: 'button',
          style: { width: '100%', textAlign: 'left' } },
          el('span', { class: 'dose-pill', html: ico('sound'),
            style: { '--pillcolor': r.id === cur ? 'var(--brand-500)' : 'var(--text-mute)' } }),
          el('div', { class: 'grow' }, el('b', { text: r.label }),
            el('div', { class: 't-xs t-mute', text: r.desc })),
          el('span', { class: 'icon-btn', html: ico(getS('ringtone') === r.id ? 'check' : 'play') }));
        row.addEventListener('click', () => {
          setS('ringtone', r.id); unlockAudio();
          playRingtone(r.id, { loops: 1, volume: getS('volume') ?? .8 });
          vibrate('tap', getS('vibrate'));
          [...box.children].forEach((c) => {
            c.querySelector('.icon-btn').innerHTML = ico('play');
            c.querySelector('.dose-pill').style.setProperty('--pillcolor', 'var(--text-mute)'); });
          row.querySelector('.icon-btn').innerHTML = ico('check');
          row.querySelector('.dose-pill').style.setProperty('--pillcolor', 'var(--brand-500)');
        });
        box.append(row);
      });
      box.append(el('p', { class: 't-xs t-mute',
        text: "Les sonneries sont générées par l'application : aucun fichier à télécharger, elles fonctionnent hors-ligne." }));
      return box;
    },
    footer: (c) => [el('button', { class: 'btn btn-primary btn-block', text: 'Terminé',
      onclick: () => c.close() })],
  });
}


/* ==========================================================================
   CHANGER DE DEVISE
   On ne touche jamais a l'argent de quelqu'un sans le lui montrer. Le
   dialogue affiche le taux, ce que deviennent trois vrais prix du dossier, et
   laisse corriger le taux a la main — parce qu'un taux embarque est date, et
   qu'au marche le taux du jour n'est pas celui du traite.
   ========================================================================== */
async function changerDevise(ctx, apres) {
  const avant = normaliser(getS('currency'));
  if (avant === apres) return;

  const montants = montantsDuDossier();
  const t0 = taux(avant, apres);

  /* Rien a convertir : on change l'etiquette et on n'ennuie personne. */
  if (!montants.length || !t0) {
    setS('currency', apres);
    ctx.refresh();
    return;
  }

  const champ = input({ type: 'number', step: 'any', inputmode: 'decimal',
    value: String(Number(t0.toPrecision(8))) });
  const table = el('div', { class: 'conv-list' });
  const total = el('div', { class: 'conv-total' });

  const relire = () => {
    const t = Number(champ.value) > 0 ? Number(champ.value) : t0;
    table.innerHTML = '';
    for (const l of apercu(montants, avant, apres, t)) {
      table.append(el('div', { class: 'conv-row' },
        el('span', { class: 't-num', text: l.avant }),
        el('span', { class: 'conv-arrow', text: '→' }),
        el('b', { class: 't-num', text: l.apres })));
    }
    const somme = montants.reduce((s, m) => s + m, 0);
    total.textContent = `${montants.length} prix enregistrés · total ` +
      `${fmt(somme, avant)} → ${fmt(convertir(somme, avant, apres, t), apres)}`;
  };
  champ.addEventListener('input', relire);
  relire();

  const exact = tauxExact(avant, apres);
  const choix = await new Promise((resolve) => {
    openSheet({
      title: 'Changer de devise',
      body: () => el('div', { class: 'col gap-4' },
        el('p', { class: 't-sm t-soft', text:
          `Les prix enregistrés sont en ${devise(avant).label}. Faut-il les ` +
          `convertir en ${devise(apres).label} ?` }),
        field(`1 ${devise(avant).label} vaut, en ${devise(apres).label}`, champ),
        el('p', { class: 't-xs t-mute', text: exact
          ? 'Parité fixe par traité : ce taux ne change pas.'
          : `Taux indicatif de ${TAUX_DATE}, embarqué dans l’application — ` +
            'elle ne consulte aucun serveur. Corrige-le si tu connais le taux du jour.' }),
        el('div', { class: 'conv-box' }, table, total)),
      footer: (c) => [
        el('button', { class: 'btn btn-ghost', text: 'Garder les nombres',
          onclick: () => { c.close(); resolve('garder'); } }),
        el('button', { class: 'btn btn-primary', text: 'Convertir',
          onclick: () => { c.close(); resolve(Number(champ.value) > 0 ? Number(champ.value) : t0); } }),
      ],
      onClose: () => resolve(null),
    });
  });

  if (choix === null) {                       /* feuille refermee : on annule */
    ctx.refresh();                            /* le bouton reprend l'ancienne devise */
    return;
  }
  setS('currency', apres);
  if (choix !== 'garder') {
    const n = convertirLesPrix(choix, devise(apres).dec);
    toast(`${n} prix converti${n > 1 ? 's' : ''} en ${devise(apres).label}.`, { type: 'ok' });
  } else {
    toast(`Devise changée. Les nombres n’ont pas bougé.`, { type: 'info' });
  }
  ctx.refresh();
}
