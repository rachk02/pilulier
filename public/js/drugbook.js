/* ============================================================================
   drugbook.js — le carnet de correspondances, embarque dans l'application.

   POURQUOI PAS UNE API EN LIGNE ?
   Il n'existe pas d'annuaire mondial, gratuit et ouvert, qui reponde a un
   code-barres par une fiche de medicament. Les bases publiques utilisables
   depuis un navigateur sont nationales : openFDA et RxNorm couvrent les
   Etats-Unis, la base publique francaise n'expose pas d'API. Aucune ne connait
   « Clopi Denk » ni « Dapaglin ». Une recherche en ligne echouerait donc
   precisement sur les boites de ton pere.

   Ce carnet fait l'inverse : il tient dans quelques kilo-octets, fonctionne
   hors-ligne, et couvre ce qu'on trouve reellement en pharmacie ici. Il
   reconnait un nom commercial ou une substance et propose une forme, un
   dosage courant et un schema de prise habituel.

   AVERTISSEMENT : les schemas proposes sont des usages courants, jamais une
   prescription. Ils servent a pre-remplir un formulaire, que l'ordonnance
   corrige. L'application affiche toujours « a confirmer avec l'ordonnance ».
   ========================================================================== */

/* Chaque entree : substance, noms commerciaux rencontres, forme, dosages
   frequents, et un ou plusieurs schemas de prise a proposer. */
export const BOOK = [
  /* ---------------------------------------------------- cardiologie */
  { dci: 'Acide acétylsalicylique', brands: ['aspirine cardio', 'aspegic', 'kardegic', 'cardioaspirine', 'aspirin'],
    form: 'comprime', strengths: ['75 mg', '100 mg', '160 mg'], food: 'during',
    plans: [['1 cp par jour, à midi', [['12:00', 1]]], ['1 cp par jour, le matin', [['08:00', 1]]]] },
  { dci: 'Clopidogrel', brands: ['plavix', 'clopi denk', 'clopidogrel', 'clopilet'],
    form: 'comprime', strengths: ['75 mg'], food: 'any',
    plans: [['1 cp par jour', [['08:00', 1]]]] },
  { dci: 'Furosémide', brands: ['lasilix', 'lasix', 'furosemide'],
    form: 'comprime', strengths: ['20 mg', '40 mg'], food: 'any',
    plans: [['1 cp le matin', [['08:00', 1]]], ['1 cp matin et midi', [['08:00', 1], ['12:00', 1]]]] },
  { dci: 'Captopril', brands: ['captopril', 'lopril'],
    form: 'comprime', strengths: ['25 mg', '50 mg'], food: 'empty',
    plans: [['½ cp matin et soir', [['08:00', .5], ['20:00', .5]]], ['1 cp × 2 par jour', [['08:00', 1], ['20:00', 1]]]] },
  { dci: 'Énalapril', brands: ['renitec', 'enalapril'], form: 'comprime',
    strengths: ['5 mg', '20 mg'], plans: [['1 cp le matin', [['08:00', 1]]]] },
  { dci: 'Ramipril', brands: ['triatec', 'ramipril'], form: 'comprime',
    strengths: ['2,5 mg', '5 mg', '10 mg'], plans: [['1 cp le matin', [['08:00', 1]]]] },
  { dci: 'Nébivolol', brands: ['nebimac', 'temerit', 'nebilet', 'nebivolol'],
    form: 'comprime', strengths: ['5 mg'], food: 'any',
    plans: [['½ cp par jour', [['08:00', .5]]], ['1 cp par jour', [['08:00', 1]]]] },
  { dci: 'Bisoprolol', brands: ['cardensiel', 'detensiel', 'concor', 'bisoprolol'],
    form: 'comprime', strengths: ['2,5 mg', '5 mg', '10 mg'],
    plans: [['1 cp le matin', [['08:00', 1]]]] },
  { dci: 'Aténolol', brands: ['tenormine', 'atenolol'], form: 'comprime',
    strengths: ['50 mg', '100 mg'], plans: [['1 cp le matin', [['08:00', 1]]]] },
  { dci: 'Amlodipine', brands: ['amlor', 'amlodipine', 'norvasc'], form: 'comprime',
    strengths: ['5 mg', '10 mg'], plans: [['1 cp le matin', [['08:00', 1]]]] },
  { dci: 'Losartan', brands: ['cozaar', 'losartan'], form: 'comprime',
    strengths: ['50 mg', '100 mg'], plans: [['1 cp le matin', [['08:00', 1]]]] },
  { dci: 'Spironolactone', brands: ['aldactone', 'spironolactone'], form: 'comprime',
    strengths: ['25 mg', '50 mg'], plans: [['1 cp le matin', [['08:00', 1]]]] },
  { dci: 'Atorvastatine', brands: ['tahor', 'atorvastatine', 'lipitor'], form: 'comprime',
    strengths: ['10 mg', '20 mg', '40 mg'], plans: [['1 cp le soir', [['20:00', 1]]]] },
  { dci: 'Simvastatine', brands: ['zocor', 'simvastatine'], form: 'comprime',
    strengths: ['20 mg', '40 mg'], plans: [['1 cp le soir', [['20:00', 1]]]] },
  { dci: 'Digoxine', brands: ['digoxine', 'hemigoxine'], form: 'comprime',
    strengths: ['0,125 mg', '0,25 mg'], plans: [['1 cp le matin', [['08:00', 1]]]] },
  { dci: 'Warfarine', brands: ['coumadine', 'warfarine'], form: 'comprime',
    strengths: ['2 mg', '5 mg'], plans: [['1 cp le soir', [['18:00', 1]]]] },

  /* ------------------------------------------------------- diabete */
  { dci: 'Dapagliflozine', brands: ['forxiga', 'dapaglin', 'dapagliflozine'],
    form: 'comprime', strengths: ['5 mg', '10 mg'], food: 'any',
    plans: [['1 cp le matin', [['08:00', 1]]]] },
  { dci: 'Metformine', brands: ['glucophage', 'stagid', 'metformine'], form: 'comprime',
    strengths: ['500 mg', '850 mg', '1000 mg'], food: 'during',
    plans: [['1 cp × 2 aux repas', [['08:00', 1], ['20:00', 1]]],
            ['1 cp × 3 aux repas', [['08:00', 1], ['13:00', 1], ['20:00', 1]]]] },
  { dci: 'Gliclazide', brands: ['diamicron', 'gliclazide'], form: 'comprime',
    strengths: ['30 mg', '60 mg', '80 mg'], food: 'before',
    plans: [['1 cp au petit-déjeuner', [['07:30', 1]]]] },
  { dci: 'Glibenclamide', brands: ['daonil', 'glibenclamide'], form: 'comprime',
    strengths: ['2,5 mg', '5 mg'], food: 'before',
    plans: [['1 cp avant le repas', [['07:30', 1]]]] },
  { dci: 'Insuline', brands: ['lantus', 'humalog', 'novorapid', 'levemir', 'insuline'],
    form: 'injection', strengths: ['100 UI/ml'],
    plans: [['1 injection le soir', [['21:00', 1]]],
            ['1 injection avant chaque repas', [['07:30', 1], ['12:30', 1], ['19:30', 1]]]] },

  /* ------------------------------------------------ paludisme (ACT) */
  { dci: 'Artéméther + Luméfantrine', brands: ['coartem', 'artemether lumefantrine', 'lumartem', 'riamet'],
    form: 'comprime', strengths: ['20/120 mg'], food: 'during',
    plans: [['4 cp × 2 par jour, 3 jours', [['08:00', 4], ['20:00', 4]]]],
    note: "Cure de 3 jours a mener jusqu'au bout. A prendre avec un aliment gras." },
  { dci: 'Artésunate + Amodiaquine', brands: ['asaq', 'artesunate amodiaquine', 'coarsucam'],
    form: 'comprime', strengths: ['100/270 mg'],
    plans: [['1 prise par jour, 3 jours', [['20:00', 1]]]] },
  { dci: 'Quinine', brands: ['quinimax', 'quinine'], form: 'comprime', strengths: ['500 mg'],
    plans: [['1 cp × 3 par jour', [['08:00', 1], ['16:00', 1], ['00:00', 1]]]] },

  /* -------------------------------------------------- antibiotiques */
  { dci: 'Amoxicilline', brands: ['clamoxyl', 'amoxil', 'amoxicilline'], form: 'gelule',
    strengths: ['500 mg', '1 g'], plans: [['1 × 3 par jour', [['08:00', 1], ['14:00', 1], ['20:00', 1]]],
      ['1 × 2 par jour', [['08:00', 1], ['20:00', 1]]]],
    note: "Aller au bout de la boite meme si les symptomes disparaissent." },
  { dci: 'Amoxicilline + Acide clavulanique', brands: ['augmentin'], form: 'comprime',
    strengths: ['500/62,5 mg', '1 g/125 mg'], food: 'during',
    plans: [['1 × 3 aux repas', [['08:00', 1], ['14:00', 1], ['20:00', 1]]]] },
  { dci: 'Ciprofloxacine', brands: ['ciflox', 'ciprofloxacine'], form: 'comprime',
    strengths: ['500 mg'], plans: [['1 cp × 2 par jour', [['08:00', 1], ['20:00', 1]]]] },
  { dci: 'Métronidazole', brands: ['flagyl', 'metronidazole'], form: 'comprime',
    strengths: ['250 mg', '500 mg'], food: 'during',
    plans: [['1 cp × 3 par jour', [['08:00', 1], ['14:00', 1], ['20:00', 1]]]] },
  { dci: 'Azithromycine', brands: ['zithromax', 'azithromycine'], form: 'comprime',
    strengths: ['250 mg', '500 mg'], plans: [['1 cp par jour, 3 jours', [['08:00', 1]]]] },
  { dci: 'Cotrimoxazole', brands: ['bactrim', 'cotrimoxazole'], form: 'comprime',
    strengths: ['400/80 mg', '800/160 mg'], food: 'during',
    plans: [['1 cp × 2 par jour', [['08:00', 1], ['20:00', 1]]]] },
  { dci: 'Doxycycline', brands: ['vibramycine', 'doxycycline'], form: 'gelule',
    strengths: ['100 mg'], food: 'during',
    plans: [['1 gélule par jour', [['20:00', 1]]]],
    note: "Ne pas s'allonger dans l'heure qui suit. Eviter le soleil." },

  /* ------------------------------------------------------- douleur */
  { dci: 'Paracétamol', brands: ['doliprane', 'efferalgan', 'dafalgan', 'panadol', 'paracetamol'],
    form: 'comprime', strengths: ['500 mg', '1 g'],
    plans: [['1 cp × 3 par jour', [['08:00', 1], ['14:00', 1], ['20:00', 1]]],
            ['si besoin', []]],
    note: 'Jamais plus de 3 g par jour chez l’adulte, ni deux prises à moins de 6 h.' },
  { dci: 'Ibuprofène', brands: ['advil', 'nurofen', 'ibuprofene'], form: 'comprime',
    strengths: ['200 mg', '400 mg'], food: 'during',
    plans: [['1 cp × 3 aux repas', [['08:00', 1], ['14:00', 1], ['20:00', 1]]], ['si besoin', []]],
    note: "Deconseille en cas de traitement anticoagulant ou de probleme renal." },
  { dci: 'Tramadol', brands: ['topalgic', 'contramal', 'tramadol'], form: 'gelule',
    strengths: ['50 mg', '100 mg'], plans: [['1 × 2 par jour', [['08:00', 1], ['20:00', 1]]]] },

  /* ---------------------------------------------------- estomac etc. */
  { dci: 'Oméprazole', brands: ['mopral', 'omeprazole'], form: 'gelule',
    strengths: ['20 mg'], food: 'before',
    plans: [['1 gélule avant le petit-déjeuner', [['07:30', 1]]]] },
  { dci: 'Ésoméprazole', brands: ['inexium', 'esomeprazole'], form: 'gelule',
    strengths: ['20 mg', '40 mg'], food: 'before',
    plans: [['1 gélule avant le petit-déjeuner', [['07:30', 1]]]] },
  { dci: 'Lévothyroxine', brands: ['levothyrox', 'euthyrox', 'levothyroxine'], form: 'comprime',
    strengths: ['25 µg', '50 µg', '75 µg', '100 µg'], food: 'empty',
    plans: [['1 cp à jeun', [['06:30', 1]]]] },
  { dci: 'Prednisolone', brands: ['solupred', 'prednisolone', 'cortancyl'], form: 'comprime',
    strengths: ['5 mg', '20 mg'], food: 'during',
    plans: [['1 prise le matin au repas', [['08:00', 1]]]] },
  { dci: 'Salbutamol', brands: ['ventoline', 'salbutamol'], form: 'inhalateur',
    strengths: ['100 µg'], plans: [['si besoin', []], ['2 bouffées × 3 par jour',
      [['08:00', 2], ['14:00', 2], ['20:00', 2]]]] },
  { dci: 'Fer + Acide folique', brands: ['tardyferon', 'fefol', 'fer folique'], form: 'comprime',
    strengths: ['80 mg'], food: 'before',
    plans: [['1 cp par jour', [['08:00', 1]]]],
    note: "A distance du the et du calcium, qui empechent l'absorption." },
];

/* ------------------------------------------------------------ RECHERCHE */
const norm = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();

/** Distance de Levenshtein bornee : sert a rattraper une faute de frappe. */
function near(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return false;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length] <= max;
}

/**
 * Cherche un medicament d'apres ce qui est ecrit sur la boite.
 * @returns [{ entry, score, matched }] du plus sur au moins sur
 */
export function lookup(text, limit = 4) {
  const q = norm(text);
  if (q.length < 3) return [];
  const words = q.split(' ').filter((w) => w.length >= 3);
  const out = [];

  for (const entry of BOOK) {
    const names = [entry.dci, ...entry.brands];
    let best = 0, matched = null;
    for (const raw of names) {
      const nm = norm(raw);
      let score = 0;
      if (nm === q) score = 100;
      else if (q.startsWith(nm) || nm.startsWith(q)) score = 88;
      else if (q.includes(nm) || nm.includes(q)) score = 74;
      else if (words.some((w) => nm.split(' ').some((p) => p === w))) score = 66;
      else if (words.some((w) => nm.split(' ').some((p) => near(p, w, w.length > 6 ? 2 : 1)))) score = 52;
      if (score > best) { best = score; matched = raw; }
    }
    if (best) out.push({ entry, score: best, matched });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Schemas de prise proposes pour une entree du carnet. */
export function plansOf(entry) {
  return (entry.plans || []).map(([label, times]) => ({
    label,
    kind: times.length ? 'daily' : 'prn',
    times: times.map(([t, dose]) => ({ t, dose })),
  }));
}

export const BOOK_SIZE = BOOK.length;
