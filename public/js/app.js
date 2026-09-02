/* ============================================================================
   app.js — assemblage : coque, navigation, theme, alarmes, installation.
   ========================================================================== */
import { el, $, esc, ico, dkey, fmtDate, fmtDose, relDay, addDays } from './util.js';
import { initStore, db, getS, setS, activeProfile, profiles, medsOf, schedulesOf,
         dosesForDate, adherence, adherenceSeries, streak, measuresOf, parseTimes } from './store.js';
import { formOf, foodLabel } from './schema.js';
import { attachRipple, toast, hasOpenLayer, closeTopLayer } from './ui.js';
import { startAlarms, isAlarmOpen, dismissAlarm } from './alarm.js';
import { avatarEl, openProfiles, openProfileForm } from './views/profiles.js';
import { openMedForm } from './views/meds.js';
import { openAddMed } from './views/newmed.js';

import * as Today from './views/today.js';
import * as Calendar from './views/calendar.js';
import * as Meds from './views/meds.js';
import * as Suivi from './views/suivi.js';
import * as Settings from './views/settings.js';
import * as Simple from './views/simple.js';
import { startSync, mirror, receive } from './sync.js';
import { avatarMarkup } from './avatars.js';
import { symptomLabel } from './safety.js';
import { logoMark } from './illus.js';
import { brancherRappels, planifierRepublication, estNatif } from './native.js';
import { lancerImpression } from './ics.js';
import { setLangue, langueProposee, t } from './i18n.js';
import { openOnboarding, dejaAccueilli } from './views/onboarding.js';
import { estVierge } from './store.js';
import { MARK_ICON, MARK_LABEL } from './bulletin.js';

export { VERSION } from './app-version.js';
import { VERSION as V } from './app-version.js';

/* `label` titre l'ecran, `short` tient dans une case de la barre d'onglets. */
const VIEWS = {
  today:    { mod: Today,    label: "Aujourd'hui", short: 'Jour',   icon: 'today' },
  calendar: { mod: Calendar, label: 'Calendrier',  short: 'Mois',   icon: 'calendar' },
  meds:     { mod: Meds,     label: 'Traitement',  short: 'Médic.', icon: 'pill' },
  suivi:    { mod: Suivi,    label: 'Suivi',       short: 'Suivi',  icon: 'chart' },
  settings: { mod: Settings, label: 'Réglages',    short: 'Régl.',  icon: 'settings' },
};
const ORDER = Object.keys(VIEWS);

/* -------------------------------------------------------------- Contexte */
const ctx = {
  version: V,
  route: 'today',
  state: { day: null, month: null, range: 14 },
  installPrompt: null,

  go(route, dir = 'fwd') {
    if (!VIEWS[route]) route = 'today';
    if (route === ctx.route) { draw(null); return; }
    const from = ORDER.indexOf(ctx.route), to = ORDER.indexOf(route);
    ctx.route = route;
    if (location.hash !== '#/' + route) location.hash = '#/' + route;
    draw(to < from ? 'back' : dir);
  },
  refresh() { draw(null); },
  setDay(d, stay = false) {
    ctx.state.day = d ? new Date(d).getTime() : null;
    if (d) ctx.state.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!stay && ctx.route !== 'today' && ctx.route !== 'calendar') ctx.go('today');
    else draw(null);
  },
  setMonth(d) {
    ctx.state.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    draw(null);
  },
  openProfiles: () => openProfiles(ctx),
  applyTheme,
  install: async () => {
    if (!ctx.installPrompt) return toast("Utilise le menu du navigateur : « Ajouter à l'écran d'accueil ».");
    ctx.installPrompt.prompt();
    const r = await ctx.installPrompt.userChoice;
    if (r.outcome === 'accepted') toast('Application installée.', { type: 'ok' });
    ctx.installPrompt = null; draw(null);
  },
  printReport: () => printReport(),
};

/* ----------------------------------------------------------------- Theme */
function applyTheme() {
  const r = document.documentElement;
  const theme = getS('theme');
  if (theme === 'auto') r.removeAttribute('data-theme'); else r.dataset.theme = theme;
  r.dataset.scale = getS('scale') || 'normal';
  r.dataset.contrast = getS('contrast') || 'normal';
  r.dataset.motion = getS('motion') === 'off' ? 'off' : 'on';
  const dark = theme === 'dark' ||
    (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name="theme-color"]')?.setAttribute('content', dark ? '#16150e' : '#cdc499');
}

/* ------------------------------------------------------------- La coque */
let mainEl, tabbarEl, topbarEl;

let shellWired = false;
function buildShell() {
  const app = $('#app');
  app.innerHTML = '';

  topbarEl = el('header', { class: 'topbar' });
  mainEl = el('main', { class: 'main', id: 'main' });
  tabbarEl = el('nav', { class: 'tabbar', role: 'tablist', 'aria-label': 'Navigation principale' });

  for (const key of ORDER) {
    const v = VIEWS[key];
    const b = el('button', { class: 'tab', type: 'button', role: 'tab', id: 'tab-' + key,
      'aria-selected': String(ctx.route === key), 'aria-label': v.label,
      /* Le libelle passe par `t()` a la main : il est pose en innerHTML, donc
         il n'emprunte pas le crochet de `el({ text })`. */
      html: ico(v.icon) + `<span>${esc(t(v.short || v.label))}</span>`,
      onclick: () => ctx.go(key) });
    tabbarEl.append(b);
  }
  app.append(topbarEl, mainEl, tabbarEl);

  /* La coque peut etre rebatie (changement de peau) : les ecouteurs poses
     sur la fenetre et sur le corps, eux, ne doivent l'etre qu'une fois. */
  if (!shellWired) {
    shellWired = true;
    addEventListener('scroll', () => {
      topbarEl.classList.toggle('is-scrolled', scrollY > 8);
    }, { passive: true });
    attachRipple(document.body);
  }
}

function drawTopbar() {
  const p = activeProfile();
  topbarEl.innerHTML = '';
  const inner = el('div', { class: 'topbar-inner' });
  const v = VIEWS[ctx.route];

  if (p) {
    /* Le portrait EST le profil : il doit y mener. Un seul carnet ouvre sa
       fiche, plusieurs ouvrent la liste — et chacun y mene a la sienne. */
    const plusieurs = profiles().length > 1;
    const btn = el('button', { class: 'icon-btn', type: 'button', style: { width: 'auto', padding: '0 4px' },
      'aria-label': plusieurs ? `${p.name}. Changer de carnet.` : `Le profil de ${p.name}`,
      onclick: () => openProfiles(ctx) });
    btn.append(avatarEl(p, 'avatar-sm'));
    inner.append(btn);
  }
  inner.append(el('h1', { class: 'grow truncate', text: v.label }));

  if (ctx.route === 'today' || ctx.route === 'meds') {
    inner.append(el('button', { class: 'icon-btn solid', type: 'button', 'aria-label': 'Ajouter un médicament',
      html: ico('plus'), onclick: () => openAddMed(ctx) }));
  }
  if (ctx.route === 'calendar') {
    /* Une icone seule ne dit pas ce qu'elle fait : celle-ci ressemblait a un
       reglage du calendrier alors qu'elle ramene simplement a aujourd'hui. */
    inner.append(el('button', { class: 'btn btn-sm btn-ghost', type: 'button',
      html: ico('today') + `<span>${t('Aujourd’hui')}</span>`,
      'aria-label': t('Revenir à aujourd’hui'),
      onclick: () => { ctx.setDay(new Date(), true); ctx.setMonth(new Date()); } }));
  }
  topbarEl.append(inner);
}

let drawing = false;
function draw(dir) {
  if (drawing) return;
  drawing = true;
  /* Toute modification de l'etat passe par un redessin : c'est donc ici, et
     nulle part ailleurs, qu'on redit au systeme quelles alarmes poser. */
  planifierRepublication();
  try {
    /* Mode simple : plus de barres, plus d'onglets, un seul ecran. */
    if (getS('simple_mode')) {
      document.body.classList.add('is-simple');
      topbarEl.classList.add('hidden');
      tabbarEl.classList.add('hidden');
      mainEl.innerHTML = '';
      mainEl.append(Simple.render(ctx));
      drawing = false;
      return;
    }
    document.body.classList.remove('is-simple');
    topbarEl.classList.remove('hidden');
    tabbarEl.classList.remove('hidden');
    drawTopbar();
    for (const key of ORDER) {
      $('#tab-' + key)?.setAttribute('aria-selected', String(ctx.route === key));
    }
    const node = VIEWS[ctx.route].mod.render(ctx);
    if (dir) node.dataset.dir = dir;
    mainEl.innerHTML = '';
    if (ctx.route === 'today' && getS('sync_role') === 'aidant') {
      const card = mirrorCard();
      if (card) mainEl.append(card);
    }
    mainEl.append(node);
    updateBadges();
  } catch (err) {
    // Un ecran cassé ne doit jamais bloquer toute l'application.
    console.error('[vue ' + ctx.route + ']', err);
    mainEl.innerHTML = '';
    mainEl.append(el('div', { class: 'banner banner-bad' },
      el('div', { class: 'grow' },
        el('b', { text: "Cet écran n'a pas pu s'afficher" }),
        el('span', { class: 't-sm', text: String(err && err.message || err) }))));
  } finally {
    drawing = false;
  }
}

/** Pastille rouge sur l'onglet quand une prise est en retard. */
function updateBadges() {
  const p = activeProfile();
  const tab = $('#tab-today'); if (!tab) return;
  tab.querySelector('.badge-dot')?.remove();
  if (!p) return;
  const late = dosesForDate(new Date(), p.id).filter((d) => d.status === 'missed' || d.status === 'due').length;
  if (late) tab.append(el('span', { class: 'badge-dot', 'aria-label': `${late} prise(s) en attente` }));
}

/* --------------------------------------- Le patient, vu de loin
   Quand ce telephone est celui du proche, l'accueil s'ouvre sur les nouvelles
   de l'autre : ce qui a ete pris aujourd'hui, et ce qui cloche. */
function mirrorCard() {
  const r = mirror();
  if (!r) return null;
  const age = Date.now() - (r.at || 0);
  const mins = Math.round(age / 60000);
  const fresh = mins < 90;
  const card = el('div', { class: 'card card-hero', style: { marginBottom: 'var(--s-5)' } });

  const av = el('div', { class: 'avatar avatar-lg' });
  av.innerHTML = avatarMarkup(r.profile || {});
  card.append(el('div', { class: 'row', style: { marginBottom: 'var(--s-3)' } }, av,
    el('div', { class: 'grow' },
      el('span', { class: 't-upper', text: 'Suivi à distance' }),
      el('div', { class: 't-h3', text: r.profile?.name || 'Patient' }),
      el('div', { class: 't-xs t-mute',
        text: mins < 2 ? "à l'instant" : mins < 90 ? `il y a ${mins} min`
          : `mis à jour ${fmtDate(new Date(r.at), 'long')} à ${new Date(r.at).getHours()}h` })),
    el('button', { class: 'icon-btn solid', type: 'button', 'aria-label': 'Actualiser',
      html: ico('refresh'), onclick: async () => {
        try { await receive(); draw(null); toast('Actualisé.', { type: 'ok' }); }
        catch (e) { toast(e.message, { type: 'bad' }); } } })));

  const t = r.today || { taken: 0, total: 0, doses: [] };
  const gauge = el('div', { class: 'gauge' });
  for (const d of t.doses) {
    gauge.append(el('i', { class: d.status === 'taken' ? 'on'
      : d.status === 'missed' ? 'late' : d.status === 'skipped' ? 'skip' : '',
      title: `${d.time} ${d.name}` }));
  }
  if (!t.doses.length) gauge.append(el('i', {}));
  card.append(gauge);
  card.append(el('div', { class: 'gauge-read' },
    el('b', { class: 't-num', text: t.total ? Math.round((t.taken / t.total) * 100) + '%' : '—' }),
    el('span', { class: 't-upper', text: `${t.taken} / ${t.total} prises aujourd'hui` })));

  const late = t.doses.filter((d) => d.status === 'missed');
  if (late.length) {
    card.append(el('hr', { class: 'divider' }));
    card.append(el('span', { class: 't-upper', text: 'En retard' }));
    for (const d of late) {
      card.append(el('div', { class: 'row-between t-sm' },
        el('span', { text: `${d.time} · ${d.name}` }),
        el('span', { class: 't-mute', text: `${d.dose} ${d.unit}` })));
    }
  }
  for (const a of (r.alerts || [])) {
    card.append(el('div', { class: `banner ${a.level === 'bad' ? 'banner-bad' : ''}`,
      style: { marginTop: 'var(--s-3)' } },
      el('span', { class: 'grow t-sm', text: a.text })));
  }
  const urgent = (r.supply || []).filter((s) => s.urgent);
  if (urgent.length) {
    card.append(el('div', { class: 'banner', style: { marginTop: 'var(--s-3)' } },
      el('div', { class: 'grow' }, el('b', { text: 'Stock' }),
        el('span', { class: 't-sm', text: urgent.map((s) =>
          `${s.name} : ${s.left} j`).join(' · ') }))));
  }
  if ((r.symptoms || []).length) {
    card.append(el('div', { class: 't-xs t-mute', style: { marginTop: 'var(--s-3)' },
      text: 'Ressenti : ' + r.symptoms.slice(0, 4)
        .map((s) => `${s.label || symptomLabel(s.key)} (${s.count})`).join(', ') }));
  }
  if (!fresh) {
    card.append(el('div', { class: 't-xs t-mute', style: { marginTop: 'var(--s-2)' },
      text: 'Ces informations datent. Le téléphone du patient n’a rien publié depuis un moment.' }));
  }
  return card;
}

/* ==========================================================================
   RAPPORT IMPRIMABLE — la page que le medecin recoit
   --------------------------------------------------------------------------
   Elle est batie avec les memes classes que l'application : panneau a reperes
   de coupe, filets, capitales espacees, marques de statut dessinees. Rien
   n'est ecrit en dur ici — les valeurs viennent de theme.css, et la regle
   d'impression d'app.css garde le papier kaki au tirage.
   ========================================================================== */
/** Le document lui-meme, separe de l'ordre d'imprimer : c'est ce qui permet
    de le regarder, de le mesurer et de le tester sans lancer l'imprimante. */
export function buildReport(p = activeProfile()) {
  if (!p) return null;
  const a = adherence(p.id, 30);
  const box = el('div', { id: 'print-area', class: 'report' });

  /* --- l'en-tete : une plaque signaletique, comme celle de la doc --- */
  const head = el('div', { class: 'report-head' });
  head.append(el('div', { class: 'report-mark' },
    el('span', { class: 'report-logo', html: logoMark({ size: 100 }) }),
    el('div', {},
      el('b', { text: 'PILULIER' }),
      el('span', { class: 't-xs t-mute', text: 'Suivi des prises de médicaments' }))));
  const cell = (l, v) => el('div', { class: 'report-cell' },
    el('small', { text: l }), el('b', { text: v || '—' }));
  head.append(cell('Patient', p.name));
  head.append(cell('Né(e) le', p.birthdate ? fmtDate(p.birthdate, 'num') : '—'));
  head.append(cell('Édité le', fmtDate(new Date(), 'num')));
  head.append(cell('Période', '30 jours'));
  box.append(head);

  box.append(el('h1', { class: 'report-title', text: 'Suivi du traitement' }));
  const sous = [p.doctor_name ? `Médecin : ${p.doctor_name}${p.doctor_phone ? ' · ' + p.doctor_phone : ''}` : null,
                p.conditions || null].filter(Boolean);
  for (const t of sous) box.append(el('p', { class: 't-sm t-soft', text: t }));

  const section = (t) => {
    const s = el('div', { class: 'section' });
    s.append(el('div', { class: 'section-head' }, el('h2', { text: t })));
    return s;
  };

  /* --- l'observance, en gros : c'est le chiffre qu'on regarde --- */
  const obs = section('Observance sur 30 jours');
  const hero = el('div', { class: 'card card-hero' });
  hero.append(el('div', { class: 'gauge-read' },
    el('b', { class: 't-num', text: a.rate === null ? '—' : a.rate + '%' }),
    el('span', { class: 't-upper', text: `${a.taken} / ${a.total} prises validées` })));
  const g4 = el('div', { class: 'stat-grid', style: { marginTop: 'var(--s-4)' } });
  for (const [v, l] of [[a.taken, 'validées'], [a.missed, 'oubliées'],
                        [a.skipped, 'sautées'], [streak(p.id), "jours d'affilée"]]) {
    g4.append(el('div', { class: 'stat' }, el('b', { text: String(v) }), el('small', { text: l })));
  }
  hero.append(g4);
  obs.append(hero);
  box.append(obs);

  /* --- le traitement, en tableau de relevé --- */
  const tr8 = section('Traitement en cours');
  const tbl = el('table', { class: 'report-table' });
  tbl.innerHTML = '<thead><tr>' +
    ['Médicament', 'Dosage', 'Horaires', 'Consigne', 'Depuis'].map((x) => `<th>${x}</th>`).join('') +
    '</tr></thead>';
  const tb = el('tbody');
  for (const m of medsOf(p.id)) {
    const times = schedulesOf(m.id).flatMap(parseTimes)
      .sort((x, y) => x.t.localeCompare(y.t))
      .map((t) => `${t.t} (${fmtDose(t.dose)})`).join('  ');
    tb.append(el('tr', {},
      el('td', {}, el('b', { text: m.name })),
      el('td', { text: m.strength || '' }),
      el('td', { class: 't-num', text: times }),
      el('td', { text: [foodLabel(m.food_rule), m.instructions].filter(Boolean).join(' · ') }),
      el('td', { class: 't-num', text: m.start_date ? fmtDate(m.start_date, 'num') : '' })));
  }
  tbl.append(tb); tr8.append(tbl); box.append(tr8);

  /* --- les sept derniers jours, prise par prise, avec les cases cochees --- */
  const sem = section('Les sept derniers jours');
  const grid = el('div', { class: 'report-days' });
  for (let i = 6; i >= 0; i--) {
    const d = addDays(new Date(), -i);
    const list = dosesForDate(d, p.id);
    if (!list.length) continue;
    const col = el('div', { class: 'report-day' });
    col.append(el('div', { class: 't-upper', text: fmtDate(d, 'short') }));
    const marks = el('div', { class: 'report-marks' });
    for (const x of list) {
      marks.append(el('span', { class: 'report-mark-i', html: ico(MARK_ICON[x.status] || 'markDue'),
        title: `${x.time} ${x.med.name} — ${MARK_LABEL[x.status] || ''}` }));
    }
    col.append(marks);
    grid.append(col);
  }
  sem.append(grid);
  const leg = el('div', { class: 'report-legend' });
  for (const k of ['taken', 'missed', 'skipped', 'due']) {
    leg.append(el('span', { class: 'report-leg' },
      el('i', { html: ico(MARK_ICON[k]) }), el('span', { text: MARK_LABEL[k] })));
  }
  sem.append(leg);
  box.append(sem);

  /* --- les constantes, si l'aidant en a relevé --- */
  const mes = measuresOf(p.id, null, 60);
  if (mes.length) {
    const cst = section('Constantes relevées (60 jours)');
    const t2 = el('table', { class: 'report-table' });
    t2.innerHTML = '<thead><tr><th>Date</th><th>Mesure</th><th>Valeur</th><th>Note</th></tr></thead>';
    const b2 = el('tbody');
    for (const r of mes.slice(0, 30)) {
      const v = r.kind === 'bp' ? `${r.v1}/${r.v2}${r.v3 ? ` · ${r.v3} bpm` : ''}` : String(r.v1);
      b2.append(el('tr', {},
        el('td', { class: 't-num', text: fmtDate(new Date(r.at), 'num') }),
        el('td', { text: r.kind === 'bp' ? 'Tension' : r.kind }),
        el('td', { class: 't-num', html: `<b>${v}</b>` }),
        el('td', { class: 't-xs', text: r.note || '' })));
    }
    t2.append(b2); cst.append(t2); box.append(cst);
  }

  box.append(el('p', { class: 'report-foot',
    text: 'Document établi par Pilulier à partir des saisies de l’aidant. ' +
          'Il ne remplace pas l’ordonnance : à vérifier avec le médecin ou le pharmacien.' }));
  return box;
}

function printReport() {
  const p = activeProfile();
  if (!p) return;
  document.getElementById('print-area')?.remove();
  const box = buildReport(p);
  if (!box) return;
  document.body.append(box);
  const style = el('style', { id: 'print-style', text:
    '#print-area{display:none}' +
    '@media print{ #app{display:none!important} #print-area{display:block!important} }' });
  document.head.append(style);
  setTimeout(() => {
    lancerImpression('Pilulier — rapport');
    setTimeout(() => { box.remove(); style.remove(); }, 1500);
  }, 120);
}

/* ------------------------------------------------------------ Demarrage */
async function boot() {
  await initStore();
  /* La langue avant tout le reste : sinon le premier ecran s'affiche en
     francais puis change sous les yeux de l'utilisateur. */
  await setLangue(getS('lang') || langueProposee());
  applyTheme();
  buildShell();

  /* Dans l'APK, les rappels partent au systeme des le demarrage : ils doivent
     etre poses avant que l'utilisateur ferme l'application, pas apres. */
  brancherRappels();
  if (estNatif()) document.documentElement.dataset.natif = 'oui';

  const hash = (location.hash || '').replace('#/', '');
  ctx.route = VIEWS[hash] ? hash : 'today';
  draw(null);

  /* Le hash pilote la route : le bouton « retour » d'Android revient donc
     naturellement a l'ecran precedent. */
  let lastHash = location.hash;
  addEventListener('hashchange', () => {
    lastHash = location.hash;
    const r = (location.hash || '').replace('#/', '');
    if (VIEWS[r] && r !== ctx.route) { ctx.route = r; draw('back'); }
  });

  /* Attention : Chrome declenche aussi `popstate` lors d'une navigation par
     fragment. On ne traite donc comme « retour » que les cas ou le hash n'a
     pas bouge — sinon toute navigation par onglet serait annulee. */
  history.replaceState({ layer: 0 }, '');
  addEventListener('popstate', () => {
    if (location.hash !== lastHash) { lastHash = location.hash; return; }
    if (isAlarmOpen()) { dismissAlarm(); history.pushState({ layer: 0 }, ''); return; }
    if (hasOpenLayer()) { closeTopLayer(); history.pushState({ layer: 0 }, ''); }
  });

  db.onChange(() => updateBadges());
  startAlarms(() => draw(null));
  startSync((what) => { if (what === 'received') draw(null); });

  /* Changement de jour a minuit -> on rafraichit */
  let lastDay = dkey();
  setInterval(() => {
    const k = dkey();
    if (k !== lastDay) { lastDay = k; ctx.state.day = null; draw(null); }
  }, 30000);

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); ctx.installPrompt = e;
    if (ctx.route === 'settings') draw(null);
  });

  /* Le service worker ne sert qu'a rendre l'application disponible hors
     ligne dans un navigateur. Dans l'APK, les fichiers sont deja dans le
     telephone : l'enregistrer n'apporterait qu'un cache de plus a purger. */
  if (!estNatif() && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  /* Ecran de demarrage */
  const splash = $('#splash');
  if (splash) { splash.classList.add('gone'); setTimeout(() => splash.remove(), 500); }

  /*
   * Le premier lancement. Il ne se declenche que si l'application est
   * REELLEMENT vierge : quelqu'un qui restaure une sauvegarde ne doit pas
   * repasser par la visite, et quelqu'un qui a tout efface volontairement
   * doit pouvoir la revoir.
   */
  if (estVierge() && !dejaAccueilli()) {
    openOnboarding(ctx, () => {
      draw(null);
      const suite = getS('ob_action');
      setS('ob_action', '');
      if (suite === 'scan') openAddMed(ctx, { direct: 'scan' });
      else if (suite === 'saisir') openAddMed(ctx, { direct: 'form' });
      else setTimeout(welcome, 600);
    });
    return;                 /* la visite parle deja : pas de mot de bienvenue en plus */
  }

  if (!getS('onboarded')) setS('onboarded', true);
}

/* Le mot d'apres-visite. Il ne promet rien qui ne soit pas la : on ne parle
   d'un traitement charge que s'il y en a reellement un. */
function welcome() {
  const p = activeProfile();
  const n = p ? medsOf(p.id).length : 0;
  if (!n) {
    toast(`Bienvenue${p ? ', ' + p.name : ''}. Le carnet est vide : ajoutez un premier médicament quand vous voudrez.`,
      { type: 'ok', duration: 6000, action: 'Ajouter', onAction: () => ctx.go('meds') });
    return;
  }
  toast(`Bienvenue. ${n} traitement${n > 1 ? 's' : ''} dans le carnet de ${p.name}.`,
    { type: 'ok', duration: 6000, action: 'Vérifier', onAction: () => ctx.go('meds') });
}

boot().catch((e) => {
  console.error(e);
  document.body.innerHTML = `<div style="padding:40px;font-family:system-ui">
    <h1>Erreur au démarrage</h1><pre style="white-space:pre-wrap">${e.message}\n${e.stack || ''}</pre></div>`;
});

export { ctx };
