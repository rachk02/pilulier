/* ============================================================================
   safety.js — garde-fous par famille de medicament.

   AVERTISSEMENT, ET IL COMPTE : rien ici ne remplace l'ordonnance ni le
   pharmacien. Ce sont des rappels d'usage courant, destines a faire poser une
   question a un professionnel — jamais a modifier un traitement tout seul.
   L'application ne dit jamais « arrete », elle dit « demande ».
   ========================================================================== */

/* Chaque regle est reconnue sur la substance active (DCI) ou le nom commercial. */
export const FAMILIES = [
  {
    id: 'antiagregant_aspirine',
    label: 'Antiagrégant plaquettaire (aspirine à faible dose)',
    match: ['acide acetylsalicylique', 'acetylsalicylique', 'aspirine', 'aspegic', 'kardegic'],
    neverStop: true,
    food: 'during',
    tips: [
      "Toujours pendant le repas : à jeun, l'aspirine agresse l'estomac.",
      "Ne jamais arrêter de soi-même — l'arrêt expose à un risque de caillot.",
    ],
    watch: ['saignement', 'bleu', 'douleur_estomac', 'selles_noires'],
    watchNote: "Saignement de nez qui ne s'arrête pas, bleus inhabituels, selles noires : appeler le médecin.",
  },
  {
    id: 'antiagregant_clopidogrel',
    label: 'Antiagrégant plaquettaire (clopidogrel)',
    match: ['clopidogrel', 'plavix', 'clopi'],
    neverStop: true,
    tips: [
      "Ne jamais arrêter sans avis, surtout après une pose de stent.",
      "Prévenir tout dentiste ou chirurgien avant un geste, même bénin.",
    ],
    watch: ['saignement', 'bleu', 'selles_noires'],
  },
  {
    id: 'diuretique_anse',
    label: "Diurétique de l'anse",
    match: ['furosemide', 'lasilix', 'bumetanide', 'burinex'],
    neverStop: false,
    avoidAfter: '16:00',
    tips: [
      "Le matin. Après 16 h, la nuit est hachée par les allers-retours aux toilettes.",
      "Se peser régulièrement : une prise de poids rapide signale une rétention d'eau.",
      "Boire selon la consigne du médecin, ni plus ni moins.",
    ],
    watch: ['crampes', 'fatigue', 'vertiges', 'jambes_gonflees', 'soif'],
    watchNote: "Crampes et grande fatigue peuvent venir d'un manque de potassium : à signaler.",
  },
  {
    id: 'iec',
    label: "IEC (inhibiteur de l'enzyme de conversion)",
    match: ['captopril', 'enalapril', 'ramipril', 'lisinopril', 'perindopril', 'quinapril',
            'benazepril', 'fosinopril', 'trandolapril', 'zestril', 'triatec', 'coversyl'],
    neverStop: true,
    food: 'empty',
    tips: [
      "Se lever doucement, surtout la nuit : la tension chute vite au lever.",
      "Une toux sèche persistante est un effet connu — en parler, elle se corrige.",
      "Éviter les substituts de sel riches en potassium.",
    ],
    watch: ['toux_seche', 'vertiges', 'gonflement_visage'],
    watchNote: "Gonflement des lèvres, de la langue ou du visage : urgence, appeler immédiatement.",
    urgent: ['gonflement_visage'],
  },
  {
    id: 'ara2',
    label: 'Sartan (ARA II)',
    match: ['losartan', 'valsartan', 'irbesartan', 'candesartan', 'telmisartan', 'olmesartan'],
    neverStop: true,
    tips: ["Se lever doucement.", "Éviter les substituts de sel riches en potassium."],
    watch: ['vertiges', 'gonflement_visage'],
  },
  {
    id: 'betabloquant',
    label: 'Bêta-bloquant',
    match: ['nebivolol', 'nebimac', 'bisoprolol', 'atenolol', 'metoprolol', 'carvedilol',
            'propranolol', 'sotalol', 'temerit', 'detensiel', 'cardensiel'],
    neverStop: true,
    tips: [
      "À ne JAMAIS arrêter brutalement : l'arrêt sec peut déclencher une crise cardiaque.",
      "Surveiller le pouls : en dessous de 50 battements par minute, en parler.",
      "Fatigue et extrémités froides sont fréquentes au début.",
    ],
    watch: ['fatigue', 'essoufflement', 'palpitations', 'vertiges'],
    missAlertAfter: 2,
    missMessage: "Un bêta-bloquant ne doit jamais être interrompu brutalement. Deux oublis d'affilée : appelle le médecin ou le pharmacien aujourd'hui.",
  },
  {
    id: 'sglt2',
    label: 'Gliflozine (SGLT2)',
    match: ['dapagliflozine', 'dapaglin', 'empagliflozine', 'canagliflozine', 'forxiga', 'jardiance'],
    neverStop: false,
    tips: [
      "Boire suffisamment d'eau dans la journée.",
      "Soigner l'hygiène intime : le sucre dans les urines favorise les infections.",
      "En cas de vomissements ou de diarrhée importante, appeler le médecin.",
    ],
    watch: ['brulures_urinaires', 'soif', 'urines_frequentes', 'fatigue'],
    watchNote: "Brûlures en urinant ou démangeaisons : à traiter tôt, ne pas laisser traîner.",
  },
  {
    id: 'metformine',
    label: 'Metformine',
    match: ['metformine', 'glucophage', 'stagid'],
    food: 'during',
    tips: ["Pendant ou juste après le repas, sinon nausées et diarrhée.",
           "Arrêt temporaire avant un examen avec produit de contraste : demander au médecin."],
    watch: ['nausee', 'diarrhee'],
  },
  {
    id: 'sulfamide',
    label: 'Sulfamide hypoglycémiant',
    match: ['glibenclamide', 'gliclazide', 'glimepiride', 'diamicron', 'amarel', 'daonil'],
    tips: ["Ne jamais sauter le repas qui suit la prise : risque d'hypoglycémie.",
           "Garder du sucre à portée de main."],
    watch: ['hypoglycemie', 'sueurs', 'tremblements'],
    urgent: ['hypoglycemie'],
  },
  {
    id: 'anticoagulant',
    label: 'Anticoagulant',
    match: ['warfarine', 'coumadine', 'previscan', 'fluindione', 'acenocoumarol', 'sintrom',
            'rivaroxaban', 'xarelto', 'apixaban', 'eliquis', 'dabigatran', 'pradaxa', 'heparine'],
    neverStop: true,
    tips: [
      "Prendre à heure très régulière : l'écart entre deux prises compte.",
      "Signaler le traitement à tout soignant, dentiste compris.",
      "Sous AVK : garder une alimentation stable en légumes verts.",
    ],
    watch: ['saignement', 'bleu', 'selles_noires'],
    urgent: ['selles_noires'],
    missAlertAfter: 1,
    missMessage: "Un anticoagulant oublié n'est pas anodin. Appelle le pharmacien pour savoir quoi faire — ne double jamais la dose.",
  },
  {
    id: 'statine',
    label: 'Statine',
    match: ['atorvastatine', 'simvastatine', 'rosuvastatine', 'pravastatine', 'tahor', 'crestor'],
    tips: ["Plutôt le soir pour la plupart d'entre elles.",
           "Douleurs musculaires inexpliquées : à signaler, ne pas endurer."],
    watch: ['douleurs_musculaires', 'fatigue'],
  },
  {
    id: 'levothyroxine',
    label: 'Hormone thyroïdienne',
    match: ['levothyroxine', 'levothyrox', 'l-thyroxine', 'euthyrox'],
    food: 'empty',
    neverStop: true,
    tips: ["À jeun, 30 minutes avant le petit-déjeuner, toujours à la même heure.",
           "Éloigner de 2 h le fer, le calcium et les pansements gastriques."],
    watch: ['palpitations', 'fatigue'],
  },
  {
    id: 'corticoide',
    label: 'Corticoïde',
    match: ['prednisone', 'prednisolone', 'cortancyl', 'solupred', 'methylprednisolone', 'betamethasone'],
    neverStop: true,
    food: 'during',
    tips: ["Le matin, pendant le repas.", "Jamais d'arrêt brutal après un traitement prolongé.",
           "Peut faire monter la tension et la glycémie."],
    watch: ['insomnie', 'soif', 'jambes_gonflees'],
  },
  {
    id: 'antibiotique',
    label: 'Antibiotique',
    match: ['amoxicilline', 'augmentin', 'azithromycine', 'ciprofloxacine', 'ceftriaxone',
            'doxycycline', 'metronidazole', 'flagyl', 'clamoxyl', 'cotrimoxazole'],
    tips: ["Aller au bout de la boîte même si ça va mieux : sinon l'infection revient plus résistante.",
           "Respecter l'écart entre les prises."],
    watch: ['diarrhee', 'nausee'],
  },
  {
    id: 'benzodiazepine',
    label: 'Somnifère ou anxiolytique',
    match: ['zolpidem', 'zopiclone', 'bromazepam', 'lexomil', 'alprazolam', 'xanax', 'diazepam',
            'lorazepam', 'temesta', 'oxazepam'],
    neverStop: true,
    tips: ["Risque de chute la nuit chez la personne âgée : se lever doucement, allumer la lumière.",
           "L'arrêt se fait progressivement, avec le médecin."],
    watch: ['vertiges', 'fatigue', 'confusion'],
  },
  {
    id: 'ipp',
    label: "Protecteur d'estomac (IPP)",
    match: ['omeprazole', 'esomeprazole', 'pantoprazole', 'lansoprazole', 'inexium', 'mopral'],
    food: 'before',
    tips: ["30 minutes avant le repas, l'estomac vide."],
    watch: ['diarrhee'],
  },
  {
    id: 'amlodipine',
    label: 'Inhibiteur calcique',
    match: ['amlodipine', 'nifedipine', 'lercanidipine', 'diltiazem', 'verapamil', 'amlor'],
    tips: ["Le gonflement des chevilles en fin de journée est fréquent : à signaler s'il gêne."],
    watch: ['jambes_gonflees', 'vertiges'],
  },
  {
    id: 'spironolactone',
    label: 'Diurétique épargneur de potassium',
    match: ['spironolactone', 'aldactone', 'eplerenone'],
    avoidAfter: '16:00',
    tips: ["Éviter les substituts de sel et les compléments de potassium.",
           "Contrôles sanguins réguliers du potassium."],
    watch: ['crampes', 'fatigue'],
  },
  {
    id: 'insuline',
    label: 'Insuline',
    match: ['insuline', 'lantus', 'humalog', 'novorapid', 'levemir', 'tresiba'],
    neverStop: true,
    tips: ["Ne jamais sauter un repas après une injection rapide.",
           "Changer de point d'injection à chaque fois.", "Garder du sucre à portée de main."],
    watch: ['hypoglycemie', 'sueurs', 'tremblements'],
    urgent: ['hypoglycemie'],
    missAlertAfter: 1,
  },
];

const strip = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Trouve la famille d'un medicament d'apres sa DCI ou son nom. */
export function familyOf(med) {
  const hay = strip(med.dci) + ' ' + strip(med.name);
  return FAMILIES.find((f) => f.match.some((m) => hay.includes(strip(m)))) || null;
}

/* ======================================================== SYMPTOMES */
export const SYMPTOMS = [
  { key: 'vertiges',          label: 'Vertiges, tête qui tourne', icon: 'info' },
  { key: 'toux_seche',        label: 'Toux sèche',                icon: 'sound' },
  { key: 'fatigue',           label: 'Grande fatigue',            icon: 'moon' },
  { key: 'jambes_gonflees',   label: 'Jambes ou chevilles gonflées', icon: 'drop' },
  { key: 'essoufflement',     label: 'Essoufflement',             icon: 'heart' },
  { key: 'palpitations',      label: 'Palpitations',              icon: 'heart' },
  { key: 'saignement',        label: 'Saignement, bleus',         icon: 'drop' },
  { key: 'selles_noires',     label: 'Selles noires',             icon: 'warn' },
  { key: 'crampes',           label: 'Crampes',                   icon: 'info' },
  { key: 'soif',              label: 'Soif intense',              icon: 'drop' },
  { key: 'urines_frequentes', label: 'Urines fréquentes',         icon: 'drop' },
  { key: 'brulures_urinaires',label: 'Brûlures en urinant',       icon: 'warn' },
  { key: 'nausee',            label: 'Nausées',                   icon: 'info' },
  { key: 'diarrhee',          label: 'Diarrhée',                  icon: 'info' },
  { key: 'douleurs_musculaires', label: 'Douleurs musculaires',   icon: 'info' },
  { key: 'gonflement_visage', label: 'Gonflement du visage',      icon: 'warn' },
  { key: 'hypoglycemie',      label: 'Malaise, sueurs, tremblements', icon: 'warn' },
  { key: 'douleur_estomac',   label: "Douleur d'estomac",         icon: 'info' },
  { key: 'insomnie',          label: 'Insomnie',                  icon: 'moon' },
  { key: 'confusion',         label: 'Confusion',                 icon: 'info' },
  { key: 'autre',             label: 'Autre',                     icon: 'edit' },
];
export const symptomLabel = (k) => (SYMPTOMS.find((s) => s.key === k) || {}).label || k;

/** Signes qui justifient d'appeler tout de suite, quel que soit le traitement. */
export const RED_FLAGS = ['gonflement_visage', 'selles_noires', 'hypoglycemie'];

/**
 * Quels medicaments du patient peuvent expliquer ce symptome ?
 * @returns [{ med, family }]
 */
export function culprits(symptomKey, meds) {
  const out = [];
  for (const m of meds) {
    const f = familyOf(m);
    if (f && (f.watch || []).includes(symptomKey)) out.push({ med: m, family: f });
  }
  return out;
}

/** Toutes les consignes qui s'appliquent a un medicament. */
export function adviceFor(med) {
  const f = familyOf(med);
  if (!f) return null;
  return { family: f.label, tips: f.tips || [], neverStop: !!f.neverStop,
           avoidAfter: f.avoidAfter || null, food: f.food || null, watchNote: f.watchNote || null, id: f.id };
}

/**
 * Incoherences d'horaire detectees sur le plan de prise.
 * @returns [{ med, level:'warn', text }]
 */
export function timingIssues(med, times) {
  const f = familyOf(med);
  const out = [];
  if (!f) return out;
  if (f.avoidAfter) {
    const limit = f.avoidAfter;
    for (const t of times) {
      if (t.t > limit) {
        out.push({ level: 'warn', text:
          `${med.name} est prévu à ${t.t}. Un diurétique après ${limit} coupe la nuit — ` +
          `le matin est préférable. À valider avec le médecin.` });
      }
    }
  }
  if (f.food && med.food_rule && med.food_rule !== f.food && med.food_rule !== 'any') {
    const lib = { during: 'pendant le repas', empty: 'à jeun', before: 'avant le repas',
                  after: 'après le repas' };
    out.push({ level: 'info', text:
      `Pour cette famille, la consigne habituelle est « ${lib[f.food]} ». ` +
      `Le réglage actuel dit « ${lib[med.food_rule]} ». À vérifier.` });
  }
  return out;
}

/**
 * Alertes d'observance : une molecule critique oubliee plusieurs fois de suite.
 * @param {Function} dosesForDate  injecte par store.js (evite une dependance croisee)
 */
export function missStreaks(profileId, meds, dosesForDate, days = 7) {
  const alerts = [];
  for (const m of meds) {
    const f = familyOf(m);
    const threshold = f?.missAlertAfter || (f?.neverStop ? 3 : 0);
    if (!threshold) continue;
    let streak = 0;
    for (let i = 1; i <= days; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const list = dosesForDate(d, profileId).filter((x) => x.med.id === m.id);
      if (!list.length) continue;
      const allMissed = list.every((x) => x.status === 'missed' || x.status === 'skipped');
      if (allMissed) streak++; else break;
    }
    if (streak >= threshold) {
      alerts.push({
        med: m, family: f, streak,
        level: f.missAlertAfter ? 'bad' : 'warn',
        text: f.missMessage ||
          `${m.name} n'a pas été pris depuis ${streak} jour${streak > 1 ? 's' : ''}. ` +
          `Cette molécule ne s'interrompt pas sans avis. Appelle le médecin ou le pharmacien.`,
      });
    }
  }
  return alerts;
}

/** Rappels valables pour tout le monde, affiches une fois dans la fiche securite. */
export const GENERAL_RULES = [
  "Une dose oubliée ne se rattrape jamais en doublant la suivante.",
  "Ne pas partager ses médicaments, même avec quelqu'un qui a « la même chose ».",
  "Vérifier la date de péremption à chaque nouvelle boîte.",
  "Garder les boîtes à l'abri de la chaleur et de l'humidité — pas dans la salle de bain.",
  "Emporter la liste des traitements à chaque consultation, y compris aux urgences.",
];
