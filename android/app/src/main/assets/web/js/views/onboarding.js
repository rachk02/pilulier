/* ============================================================================
   onboarding.js — le premier lancement.

   L'application arrive vide. Ce fichier est donc la premiere chose que
   quelqu'un voit, et la seule occasion de repondre a trois questions sans
   qu'on ait a les poser : qu'est-ce que c'est, pour qui, et par ou commencer.

   Six ecrans, jamais plus. Chacun tient sur un telephone sans defiler, chacun
   se saute. Le seul obligatoire est le nom du profil — parce qu'un carnet de
   prises sans savoir de qui, ce n'est plus un carnet.

   On ne demande RIEN dont on n'a pas besoin tout de suite : pas d'age, pas de
   groupe sanguin, pas de medecin. Tout cela se remplit plus tard, dans le
   profil, quand la personne aura une raison de le faire.
   ========================================================================== */
import { el, ico } from '../util.js';
import { setS, getS, db, chargerExemple, estVierge } from '../store.js';
import { EXEMPLE, formOf } from '../schema.js';
import { toast, haptic } from '../ui.js';
import { t, LANGUES, setLangue, langueProposee } from '../i18n.js';
import { logoMark, emptyIllus } from '../illus.js';
import { seedMarkup } from '../avatars.js';
import { estNatif, etatDesRappels, ouvrirReglageAlarmes, ouvrirReglageBatterie,
         publierRappels } from '../native.js';

/** Le premier lancement a-t-il deja eu lieu ? */
export const dejaAccueilli = () => !!getS('onboarded');

/**
 * Lance la visite. `fini` est appele quand on en sort, quelle que soit la
 * porte : le bouton « passer » compte autant que le dernier ecran.
 */
export function openOnboarding(ctx, fini) {
  const hote = el('div', { class: 'ob' });
  document.body.append(hote);
  document.body.classList.add('is-onboarding');

  const etat = {
    langue: getS('lang') || langueProposee(),
    pour: null,                 /* 'moi' | 'proche' */
    nom: '',
    graine: String(Math.floor(Math.random() * 90000) + 10000),
    grand: true,
    profil: null,               /* le profil, une fois cree — jamais deux fois */
    vueExemples: false,         /* l'ecran 5 montre-t-il la liste d'exemples ? */
    choix: EXEMPLE.meds.map((m) => m.name),   /* tout coche par defaut */
  };

  let index = 0;
  const ecrans = [accueil, choixLangue, pourQui, leProfil, parOuCommencer, lesRappels];

  const sortir = () => {
    /* On note que la visite a eu lieu, meme abregee : la reproposer serait
       une punition pour avoir voulu aller vite. */
    setS('onboarded', true);
    setS('lang', etat.langue);
    document.body.classList.remove('is-onboarding');
    hote.remove();
    fini?.();
  };

  const aller = (n) => {
    index = Math.max(0, Math.min(ecrans.length - 1, n));
    dessiner();
  };

  function dessiner() {
    hote.innerHTML = '';
    const page = el('div', { class: 'ob-page' });

    /* La progression : des tirets, pas une barre. On sait combien il reste. */
    const pas = el('div', { class: 'ob-steps' });
    ecrans.forEach((_, i) => pas.append(el('i', { class: i <= index ? 'on' : '' })));
    page.append(pas);

    const corps = el('div', { class: 'ob-body' });
    const pied = el('div', { class: 'ob-foot' });
    ecrans[index]({ corps, pied, aller, index, sortir, etat, ctx });
    page.append(corps, pied);
    hote.append(page);
  }

  dessiner();
  return { aller, sortir };
}

/* ---------------------------------------------------------------- 1/6 */
function accueil({ corps, pied, aller, sortir }) {
  corps.append(el('div', { class: 'ob-mark', html: logoMark({ size: 100 }) }));
  corps.append(el('h1', { class: 'ob-title', text: t('Pilulier') }));
  corps.append(el('p', { class: 'ob-lead', text:
    t('Un carnet de prises de médicaments. Il sonne à l’heure, il note ce qui a été pris, et il le dit à un proche si on le lui demande.') }));

  const points = el('div', { class: 'ob-points' });
  for (const [icone, titre, detail] of [
    ['bell', t('Il sonne'), t('Même téléphone verrouillé, même écran éteint.')],
    ['shield', t('Rien ne sort d’ici'), t('Aucun compte, aucun serveur, aucune publicité. Tout reste sur ce téléphone.')],
    ['users', t('Pour plusieurs personnes'), t('Un profil chacun, avec son traitement et ses horaires.')],
  ]) {
    points.append(el('div', { class: 'ob-point' },
      el('span', { class: 'ob-ico', html: ico(icone) }),
      el('div', {}, el('b', { text: titre }), el('span', { text: detail }))));
  }
  corps.append(points);

  pied.append(el('button', { class: 'btn btn-quiet', text: t('Passer'),
    onclick: () => sortir() }));
  pied.append(el('button', { class: 'btn btn-primary btn-lg grow', text: t('Commencer'),
    onclick: () => { haptic('tap'); aller(1); } }));
}

/* ---------------------------------------------------------------- 2/6 */
function choixLangue({ corps, pied, aller, etat }) {
  corps.append(el('h2', { class: 'ob-h', text: t('La langue') }));
  corps.append(el('p', { class: 'ob-lead', text:
    t('Elle se change à tout moment dans les réglages.') }));

  const liste = el('div', { class: 'ob-choix' });
  for (const l of Object.values(LANGUES)) {
    const b = el('button', { class: 'ob-opt', type: 'button',
      'aria-pressed': String(l.code === etat.langue),
      onclick: async () => {
        etat.langue = l.code;
        await setLangue(l.code);
        haptic('tap');
        aller(1);                          /* on redessine dans la langue */
      } },
      el('b', { text: l.natif }),
      el('span', { text: l.source ? t('langue d’origine') : l.nom }));
    liste.append(b);
  }
  corps.append(liste);

  pied.append(el('button', { class: 'btn btn-ghost', text: t('Retour'),
    onclick: () => aller(0) }));
  pied.append(el('button', { class: 'btn btn-primary btn-lg grow', text: t('Continuer'),
    onclick: () => aller(2) }));
}

/* ---------------------------------------------------------------- 3/6 */
function pourQui({ corps, pied, aller, etat }) {
  corps.append(el('h2', { class: 'ob-h', text: t('Pour qui est ce carnet ?') }));
  corps.append(el('p', { class: 'ob-lead', text:
    t('Cela change seulement la façon dont l’application vous parle. On pourra ajouter d’autres personnes ensuite.') }));

  const liste = el('div', { class: 'ob-choix' });
  for (const [cle, titre, detail] of [
    ['moi', t('Pour moi'), t('Je prends moi-même mes médicaments.')],
    ['proche', t('Pour un proche'), t('Je m’occupe du traitement de quelqu’un — un parent, un conjoint.')],
  ]) {
    liste.append(el('button', { class: 'ob-opt', type: 'button',
      'aria-pressed': String(etat.pour === cle),
      onclick: () => { etat.pour = cle; haptic('tap'); aller(3); } },
      el('b', { text: titre }), el('span', { text: detail })));
  }
  corps.append(liste);

  pied.append(el('button', { class: 'btn btn-ghost', text: t('Retour'),
    onclick: () => aller(1) }));
}

/* ---------------------------------------------------------------- 4/6 */
function leProfil({ corps, pied, aller, etat }) {
  const proche = etat.pour === 'proche';
  corps.append(el('h2', { class: 'ob-h',
    text: proche ? t('De qui s’agit-il ?') : t('Comment vous appelez-vous ?') }));
  corps.append(el('p', { class: 'ob-lead', text:
    t('Le prénom suffit. Il n’est écrit nulle part ailleurs que sur ce téléphone.') }));

  /* Le visage : une planche de six, tires au hasard, on en choisit un. */
  const portraits = el('div', { class: 'ob-faces' });
  const tirer = () => {
    portraits.innerHTML = '';
    const graines = [etat.graine].concat(
      Array.from({ length: 5 }, () => String(Math.floor(Math.random() * 90000) + 10000)));
    for (const g of graines) {
      const b = el('button', { class: 'ob-face', type: 'button',
        'aria-pressed': String(g === etat.graine), 'aria-label': t('Choisir ce portrait'),
        onclick: () => { etat.graine = g; haptic('tap'); tirer(); } });
      /* seedMarkup, et surtout pas faceSVG : faceSVG ne rend que des traces,
         sans le <svg> qui les porte. Les coller tels quels dans un bouton ne
         dessine rien du tout — c'est exactement ce qui se passait ici. */
      b.innerHTML = seedMarkup(Number(g));
      portraits.append(b);
    }
  };
  tirer();
  corps.append(portraits);
  corps.append(el('button', { class: 'btn btn-quiet', html: ico('refresh') +
    `<span>${t('D’autres portraits')}</span>`, onclick: () => { etat.graine =
      String(Math.floor(Math.random() * 90000) + 10000); tirer(); } }));

  const champ = el('input', { class: 'input ob-input', type: 'text',
    value: etat.nom, autocomplete: 'off', spellcheck: 'false',
    placeholder: proche ? t('Jean Dupont') : t('Votre prénom'),
    'aria-label': t('Prénom') });
  champ.addEventListener('input', () => { etat.nom = champ.value; valider(); });
  corps.append(champ);

  const suite = el('button', { class: 'btn btn-primary btn-lg grow', text: t('Continuer'),
    onclick: () => { if (etat.nom.trim()) aller(4); } });
  const valider = () => { suite.disabled = !etat.nom.trim(); };
  valider();

  pied.append(el('button', { class: 'btn btn-ghost', text: t('Retour'),
    onclick: () => aller(2) }));
  pied.append(suite);
  setTimeout(() => champ.focus(), 120);
}

/* ---------------------------------------------------------------- 5/6 */
/*
 * Trois portes. Les deux premieres ouvrent un formulaire une fois la visite
 * terminee ; la troisieme ne fabrique PLUS un second profil « Exemple » —
 * elle propose de deposer quelques traitements fictifs dans le carnet qu'on
 * vient de creer, et on choisit lesquels. Un carnet, un nom, une personne.
 */
function parOuCommencer(args) {
  if (args.etat.vueExemples) return lesExemples(args);
  const { corps, pied, aller, etat } = args;

  corps.append(el('h2', { class: 'ob-h', text: t('Par où commencer ?') }));
  corps.append(el('p', { class: 'ob-lead', text:
    t('Trois façons, et aucune n’est définitive.') }));

  const liste = el('div', { class: 'ob-choix' });
  for (const [icone, titre, detail, action] of [
    ['camera', t('Photographier une boîte'),
     t('L’application lit le nom, le dosage et la péremption. C’est le plus rapide.'),
     () => { creerProfil(etat); setS('ob_action', 'scan'); aller(5); }],
    ['plus', t('Saisir un médicament'),
     t('Nom, dosage, horaires. Trois écrans, guidés.'),
     () => { creerProfil(etat); setS('ob_action', 'saisir'); aller(5); }],
    ['search', t('Partir d’exemples'),
     t('Quelques traitements fictifs déposés dans votre carnet, pour voir comment il vit. Effaçables un par un.'),
     () => { creerProfil(etat); etat.vueExemples = true; aller(4); }],
  ]) {
    liste.append(el('button', { class: 'ob-opt', type: 'button', onclick: () => {
      haptic('tap'); action();
    } },
      el('span', { class: 'ob-ico', html: ico(icone) }),
      el('div', {}, el('b', { text: titre }), el('span', { text: detail }))));
  }
  corps.append(liste);

  pied.append(el('button', { class: 'btn btn-ghost', text: t('Retour'),
    onclick: () => aller(3) }));
}

/* ------------------------------------------------------------- 5 bis / 6 */
/*
 * Le choix des exemples. Ils vont dans LE profil de la personne — pas dans un
 * profil fantome a cote. Chacun montre un cas de figure different (deux prises
 * par jour, une cure qui se termine, des gouttes, un demi-comprime) : on peut
 * n'en garder qu'un, ou aucun.
 */
function lesExemples({ corps, pied, aller, etat }) {
  corps.append(el('h2', { class: 'ob-h', text: t('Quels exemples ?') }));
  corps.append(el('p', { class: 'ob-lead', text:
    t('Ils seront ajoutés au carnet de {nom}, avec leurs horaires. Décochez ce que vous ne voulez pas.',
      { nom: etat.nom.trim() }) }));

  const liste = el('div', { class: 'ob-choix' });
  const boutons = [];
  const majPied = () => { valider.disabled = etat.choix.length === 0; };

  for (const m of EXEMPLE.meds) {
    const f = formOf(m.form);
    const heures = m.times.map((x) => x.t).join(' · ');
    const b = el('button', { class: 'ob-opt ob-exemple', type: 'button',
      'data-med': m.name,
      'aria-pressed': String(etat.choix.includes(m.name)),
      onclick: () => {
        const i = etat.choix.indexOf(m.name);
        if (i < 0) etat.choix.push(m.name); else etat.choix.splice(i, 1);
        b.setAttribute('aria-pressed', String(i < 0));
        haptic('tap'); majPied();
      } },
      el('span', { class: 'ob-ico', html: ico(f.icon) }),
      el('div', { class: 'grow' },
        el('b', { text: `${m.name} ${m.strength}` }),
        el('span', { text: `${heures} — ${t(m.notes.replace(/^Exemple : /, ''))}` })),
      el('span', { class: 'ob-check', html: ico('check') }));
    boutons.push(b);
    liste.append(b);
  }
  corps.append(liste);

  const retour = el('button', { class: 'btn btn-ghost', text: t('Retour'),
    onclick: () => { etat.vueExemples = false; aller(4); } });
  const valider = el('button', { class: 'btn btn-primary btn-lg grow',
    text: t('Ajouter au carnet'),
    onclick: () => {
      chargerExemple({ profil: etat.profil, choix: etat.choix.slice() });
      toast(t('{n} traitements ajoutés.', { n: etat.choix.length }), { type: 'ok' });
      haptic('ok');
      setS('ob_action', '');
      etat.vueExemples = false;
      aller(5);
    } });
  majPied();
  pied.append(retour, valider);
}

/*
 * Le profil de la personne. Cree une seule fois : revenir en arriere puis
 * repartir ne doit pas laisser deux carnets derriere soi.
 */
function creerProfil(etat) {
  if (etat.profil) {
    db.update('profiles', etat.profil, {
      name: etat.nom.trim(),
      relation: etat.pour === 'proche' ? t('Proche') : t('Moi'),
      avatar_value: etat.graine,
    });
    return etat.profil;
  }
  const p = db.insert('profiles', {
    name: etat.nom.trim(),
    relation: etat.pour === 'proche' ? t('Proche') : t('Moi'),
    avatar_kind: 'doodle', avatar_value: etat.graine,
    color: '#1e1c14', archived: 0,
  });
  setS('active_profile', p.id);
  etat.profil = p.id;
  return p.id;
}

/* ---------------------------------------------------------------- 6/6 */
function lesRappels({ corps, pied, sortir }) {
  corps.append(el('div', { class: 'ob-scene', html: emptyIllus('day') }));
  corps.append(el('h2', { class: 'ob-h', text: t('Pour que ça sonne vraiment') }));

  const natif = estNatif();
  const etatR = etatDesRappels();

  corps.append(el('p', { class: 'ob-lead', text: natif
    ? t('L’application pose de vraies alarmes, comme le réveil du téléphone. Deux réglages d’Android peuvent malgré tout les faire taire.')
    : t('Un navigateur ne peut pas réveiller un téléphone endormi de façon sûre. L’application superpose donc trois filets — et le plus fiable est l’agenda.') }));

  const points = el('div', { class: 'ob-points' });
  if (natif && etatR) {
    if (!etatR.alarmesExactes) {
      points.append(rangeeReglage(t('Autoriser l’alarme exacte'),
        t('Sans elle, un rappel peut arriver avec plusieurs minutes de retard.'),
        t('Autoriser'), ouvrirReglageAlarmes));
    }
    if (!etatR.batterieLibre) {
      points.append(rangeeReglage(t('Batterie sans restriction'),
        t('Sinon Android endort l’application et retarde les rappels.'),
        t('Régler'), ouvrirReglageBatterie));
    }
    if (etatR.alarmesExactes && etatR.batterieLibre) {
      points.append(el('div', { class: 'ob-point' },
        el('span', { class: 'ob-ico', html: ico('check') }),
        el('div', {}, el('b', { text: t('Tout est en ordre') }),
          el('span', { text: t('Les prises sonneront à l’heure.') }))));
    }
  } else {
    points.append(el('div', { class: 'ob-point' },
      el('span', { class: 'ob-ico', html: ico('calendar') }),
      el('div', {}, el('b', { text: t('Exporter vers l’agenda') }),
        el('span', { text: t('Depuis les réglages, une fois les horaires saisis. C’est le rappel le plus sûr.') }))));
  }
  corps.append(points);

  corps.append(el('p', { class: 't-xs t-mute', text:
    t('Cette application aide à ne rien oublier. Elle ne remplace ni l’ordonnance, ni l’avis du médecin ou du pharmacien.') }));

  pied.append(el('button', { class: 'btn btn-primary btn-lg btn-block', text: t('C’est parti'),
    onclick: () => { haptic('ok'); publierRappels(); sortir(); } }));
}

function rangeeReglage(titre, detail, bouton, action) {
  return el('div', { class: 'ob-point' },
    el('span', { class: 'ob-ico', html: ico('warn') }),
    el('div', { class: 'grow' }, el('b', { text: titre }), el('span', { text: detail })),
    el('button', { class: 'btn btn-sm', text: bouton, onclick: () => action() }));
}

export { estVierge };
