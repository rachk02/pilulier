/* ============================================================================
   schema.js — structure des tables, catalogues et valeurs par defaut.

   Aucune donnee de personne ici, et nulle part ailleurs dans le depot :
   l'application s'installe vide. Le seul jeu de donnees present est un
   exemple entierement fictif, charge a la demande (voir EXEMPLE, plus bas).
   ========================================================================== */

export const SCHEMA = {
  profiles: {
    cols: {
      id: 'INTEGER', name: 'TEXT', relation: 'TEXT', birthdate: 'TEXT', sex: 'TEXT',
      avatar_kind: 'TEXT', avatar_value: 'TEXT', color: 'TEXT',
      blood_type: 'TEXT', weight_kg: 'REAL', height_cm: 'REAL',
      allergies: 'TEXT', conditions: 'TEXT', notes: 'TEXT',
      doctor_name: 'TEXT', doctor_phone: 'TEXT',
      pharmacy_name: 'TEXT', pharmacy_phone: 'TEXT',
      emergency_name: 'TEXT', emergency_phone: 'TEXT',
      archived: 'INTEGER', created_at: 'INTEGER', updated_at: 'INTEGER',
    },
    refs: [],
  },
  meds: {
    cols: {
      id: 'INTEGER', profile_id: 'INTEGER', name: 'TEXT', dci: 'TEXT',
      form: 'TEXT', strength: 'TEXT', color: 'TEXT',
      instructions: 'TEXT', food_rule: 'TEXT', notes: 'TEXT',
      prescriber: 'TEXT', prescription_ref: 'TEXT',
      start_date: 'TEXT', end_date: 'TEXT',
      stock_qty: 'REAL', stock_alert: 'REAL', pack_qty: 'REAL', pack_price: 'REAL',
      photo: 'TEXT', photo_back: 'TEXT',
      expiry: 'TEXT', gtin: 'TEXT', lot: 'TEXT',
      archived: 'INTEGER', created_at: 'INTEGER', updated_at: 'INTEGER',
    },
    refs: [{ col: 'profile_id', table: 'profiles' }],
  },
  schedules: {
    cols: {
      id: 'INTEGER', med_id: 'INTEGER', profile_id: 'INTEGER',
      kind: 'TEXT',            // daily | weekdays | interval | cycle | prn
      times: 'TEXT',           // JSON: [{ t:"08:00", dose:1 }]
      weekdays: 'TEXT',        // JSON: [1,3,5]  (0 = dimanche)
      interval_days: 'INTEGER', cycle_on: 'INTEGER', cycle_off: 'INTEGER',
      anchor_date: 'TEXT', active: 'INTEGER', created_at: 'INTEGER', updated_at: 'INTEGER',
    },
    refs: [{ col: 'med_id', table: 'meds' }, { col: 'profile_id', table: 'profiles' }],
  },
  intakes: {
    cols: {
      id: 'INTEGER', profile_id: 'INTEGER', med_id: 'INTEGER', schedule_id: 'INTEGER',
      slot: 'TEXT',            // "2026-08-25T08:00"  (identifiant unique d'une prise)
      planned_at: 'INTEGER', status: 'TEXT', taken_at: 'INTEGER',
      dose: 'REAL', note: 'TEXT', created_at: 'INTEGER', updated_at: 'INTEGER',
    },
    refs: [{ col: 'med_id', table: 'meds' }, { col: 'profile_id', table: 'profiles' }],
  },
  stock_moves: {
    cols: { id: 'INTEGER', med_id: 'INTEGER', profile_id: 'INTEGER', delta: 'REAL',
            reason: 'TEXT', note: 'TEXT', created_at: 'INTEGER' },
    refs: [{ col: 'med_id', table: 'meds' }],
  },
  symptoms: {
    cols: { id: 'INTEGER', profile_id: 'INTEGER', key: 'TEXT', severity: 'INTEGER',
            note: 'TEXT', at: 'INTEGER', created_at: 'INTEGER' },
    refs: [{ col: 'profile_id', table: 'profiles' }],
  },
  measures: {
    cols: { id: 'INTEGER', profile_id: 'INTEGER', kind: 'TEXT',
            v1: 'REAL', v2: 'REAL', v3: 'REAL', at: 'INTEGER', note: 'TEXT', created_at: 'INTEGER' },
    refs: [{ col: 'profile_id', table: 'profiles' }],
  },
  settings: {
    cols: { id: 'TEXT', value: 'TEXT', updated_at: 'INTEGER' },
    refs: [],
  },
};

/* ------------------------------------------------------------- CATALOGUES */
export const FORMS = [
  { id: 'comprime',    label: 'Comprimé',      icon: 'pill',    unit: 'cp' },
  { id: 'gelule',      label: 'Gélule',        icon: 'capsule', unit: 'gél.' },
  { id: 'sirop',       label: 'Sirop',         icon: 'drop',    unit: 'ml' },
  { id: 'gouttes',     label: 'Gouttes',       icon: 'drop',    unit: 'gttes' },
  { id: 'injection',   label: 'Injection',     icon: 'syringe', unit: 'inj.' },
  { id: 'inhalateur',  label: 'Inhalateur',    icon: 'spray',   unit: 'bouff.' },
  { id: 'patch',       label: 'Patch',         icon: 'patch',   unit: 'patch' },
  { id: 'sachet',      label: 'Sachet',        icon: 'box',     unit: 'sach.' },
  { id: 'suppositoire',label: 'Suppositoire',  icon: 'capsule', unit: 'supp.' },
  { id: 'creme',       label: 'Crème/Pommade', icon: 'box',     unit: 'appl.' },
];
export const formOf = (id) => FORMS.find((f) => f.id === id) || FORMS[0];

export const FOOD_RULES = [
  { id: 'any',    label: 'Peu importe' },
  { id: 'before', label: 'Avant le repas' },
  { id: 'during', label: 'Pendant le repas' },
  { id: 'after',  label: 'Après le repas' },
  { id: 'empty',  label: 'À jeun' },
];
export const foodLabel = (id) => (FOOD_RULES.find((f) => f.id === id) || FOOD_RULES[0]).label;

/* Couleurs de reperage — sourdes, lisibles en filet de 4 px sur le papier kaki. */
export const MED_COLORS = [
  '#1e1c14', '#8f3122', '#3d6630', '#8a6218', '#2f5068',
  '#5d4a7a', '#7a4a2e', '#4a6b6f', '#6d6750', '#7d3b52',
];

export const RELATIONS = ['Père', 'Mère', 'Moi', 'Conjoint(e)', 'Enfant', 'Frère', 'Sœur',
                          'Grand-père', 'Grand-mère', 'Proche'];

/* -------------------------------------------------------------- REGLAGES */
export const DEFAULT_SETTINGS = {
  theme: 'auto',            // auto | light | dark
  scale: 'large',           // normal | large | xlarge  (66 ans -> grand par defaut)
  contrast: 'normal',
  motion: 'on',
  sound: true,
  ringtone: 'carillon',
  volume: 0.8,
  vibrate: true,
  notifications: false,     // active apres autorisation explicite
  snooze_min: 10,
  alarm_window_min: 90,     // au-dela, la prise est comptee « manquée »
  auto_stock: true,         // decrementer le stock a chaque prise
  currency: 'FCFA',

  /* --- la voix --- */
  voice: true,              // annoncer la prise a haute voix
  voice_name: '',           // vide = meilleure voix francaise disponible
  voice_rate: 0.9,

  /* --- mode simple (ecran du patient) --- */
  simple_mode: false,
  simple_lock: true,        // sortie protegee par un appui long

  /* --- renouvellement --- */
  refill_lead_days: 7,      // prevenir N jours avant la rupture
  expiry_lead_days: 60,     // prevenir N jours avant la peremption

  /* --- lien avec l'aidant --- */
  caregiver_name: '',
  caregiver_phone: '',      // format international, ex. 22670000000
  bulletin_auto: false,

  /* --- synchronisation chiffree --- */
  sync_code: '',            // code d'appairage (jamais envoye au serveur)
  sync_role: '',            // 'patient' (publie) | 'aidant' (recoit)
  /* La sonnerie de reveil du telephone accompagne-t-elle la notification ?
     Par defaut oui : c'est le filet de securite quand le systeme refuse
     d'ouvrir l'ecran de l'application. */
  son_systeme: true,
  sync_last: 0,
  sync_auto: true,
  /* Adresse de la boite aux lettres. Vide = « a cote de l'application », ce
     qui n'existe pas dans l'APK : elle s'y renseigne, ou se recoit par le QR. */
  sync_server: '',
  active_profile: 1,
  onboarded: false,
  last_seen_day: null,
};

/* ==========================================================================
   L'EXEMPLE
   --------------------------------------------------------------------------
   L'application s'installe VIDE. Aucun profil, aucun traitement, aucune
   donnee de personne : c'est la seule position tenable pour une application
   qui manipule des ordonnances.

   Ce qui suit est un exemple entierement FICTIF, propose au premier
   lancement a qui veut voir a quoi ressemble l'application remplie. Il ne
   decrit aucune personne et aucune pathologie : quatre medicaments courants,
   choisis pour montrer les cas de figure — deux prises par jour, un demi-
   comprime, une consigne « a jeun », et une cure qui se termine. On peut le
   supprimer d'un geste.
   ========================================================================== */
export const EXEMPLE = {
  profile: {
    /* Le profil d'exemple porte un nom qui ne peut pas etre celui de
       quelqu'un : deux « Jean Dupont » dans le selecteur, l'un reel et
       l'autre fictif, seraient impossibles a distinguer. */
    name: 'Exemple',
    relation: 'Profil de démonstration',
    birthdate: '1960-01-01',
    sex: 'M',
    avatar_kind: 'doodle',
    avatar_value: '24757',
    color: '#1e1c14',
    conditions: '',
    doctor_name: 'Dr Martin',
    doctor_phone: '00 00 00 00 00',
    pharmacy_name: 'Pharmacie du Centre',
    pharmacy_phone: '00 00 00 00 00',
    notes: 'Profil d’exemple, à supprimer quand tu n’en as plus besoin.',
    archived: 0,
  },

  /* `times` : heure -> dose, en unites de la forme (0.5 = un demi-comprime). */
  meds: [
    {
      name: 'Paracétamol', dci: 'Paracétamol', form: 'comprime',
      strength: '500 mg', color: '#2f5068',
      instructions: '1 comprimé matin et soir.',
      food_rule: 'any',
      notes: 'Exemple : un médicament pris deux fois par jour.',
      stock_qty: 20, stock_alert: 5, pack_qty: 20, pack_price: 500,
      times: [{ t: '08:00', dose: 1 }, { t: '20:00', dose: 1 }],
    },
    {
      name: 'Amoxicilline', dci: 'Amoxicilline', form: 'gelule',
      strength: '500 mg', color: '#8a6218',
      instructions: '1 gélule 3 fois par jour, pendant 7 jours.',
      food_rule: 'any',
      notes: 'Exemple : une cure qui se termine toute seule à la date de fin.',
      stock_qty: 21, stock_alert: 6, pack_qty: 21, pack_price: 1200,
      end_after_days: 7,
      times: [{ t: '08:00', dose: 1 }, { t: '13:00', dose: 1 }, { t: '20:00', dose: 1 }],
    },
    {
      name: 'Vitamine D', dci: 'Cholécalciférol', form: 'gouttes',
      strength: '10 000 UI', color: '#3d6630',
      instructions: '4 gouttes par jour au petit-déjeuner.',
      food_rule: 'during',
      notes: 'Exemple : une forme qui se compte en gouttes.',
      stock_qty: 200, stock_alert: 30, pack_qty: 200, pack_price: 800,
      times: [{ t: '08:00', dose: 4 }],
    },
    {
      name: 'Comprimé du soir', dci: '', form: 'comprime',
      strength: '25 mg', color: '#5d4a7a',
      instructions: '½ comprimé le soir, à jeun.',
      food_rule: 'empty',
      notes: 'Exemple : un demi-comprimé, et une consigne de prise à jeun.',
      stock_qty: 30, stock_alert: 7, pack_qty: 30, pack_price: 900,
      times: [{ t: '21:00', dose: 0.5 }],
    },
  ],

  common: {
    prescriber: 'Dr Martin',
    prescription_ref: 'Exemple',
    start_date: null,        /* rempli au chargement : « aujourd'hui » */
    end_date: null,
  },
};
