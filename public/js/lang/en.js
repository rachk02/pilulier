/* ============================================================================
   lang/en.js — le catalogue anglais.

   La cle est la phrase francaise, telle qu'elle est ecrite dans le code. Une
   phrase absente d'ici s'affiche en francais : l'application ne montre jamais
   de trou ni d'identifiant technique.

   Ce catalogue a ete etabli a partir de l'USAGE — l'application a ete
   parcourue en mode releve (`globalThis.__i18nRec`), et ce sont les phrases
   reellement demandees a l'ecran qui figurent ici. `tools/check.mjs` mesure
   ce qui manque encore.

   Ce qu'on ne traduit pas : les noms de medicaments, les noms propres, les
   noms de devises. Ils tombent en repli, et c'est ce qu'il faut.
   ========================================================================== */
export default {
  /* ------------------------------------------------------- le premier lancement */
  'Un carnet de prises de médicaments. Il sonne à l’heure, il note ce qui a été pris, et il le dit à un proche si on le lui demande.':
    'A medication log. It rings on time, records what was taken, and tells a relative if you ask it to.',
  'Il sonne': 'It rings',
  'Même téléphone verrouillé, même écran éteint.': 'Even locked, even with the screen off.',
  'Rien ne sort d’ici': 'Nothing leaves this phone',
  'Aucun compte, aucun serveur, aucune publicité. Tout reste sur ce téléphone.':
    'No account, no server, no advertising. Everything stays on this phone.',
  'Pour plusieurs personnes': 'For several people',
  'Un profil chacun, avec son traitement et ses horaires.':
    'One profile each, with its own treatment and times.',
  'Passer': 'Skip',
  'Commencer': 'Start',
  'Continuer': 'Continue',
  'Retour': 'Back',
  'La langue': 'Language',
  'Elle se change à tout moment dans les réglages.': 'You can change it any time in settings.',
  'langue d’origine': 'source language',
  'Pour qui est ce carnet ?': 'Who is this log for?',
  'Cela change seulement la façon dont l’application vous parle. On pourra ajouter d’autres personnes ensuite.':
    'This only changes how the app speaks to you. You can add other people later.',
  'Pour moi': 'For me',
  'Je prends moi-même mes médicaments.': 'I take my own medication.',
  'Pour un proche': 'For a relative',
  'Je m’occupe du traitement de quelqu’un — un parent, un conjoint.':
    'I look after someone’s treatment — a parent, a partner.',
  'De qui s’agit-il ?': 'Who is it?',
  'Comment vous appelez-vous ?': 'What is your name?',
  'Le prénom suffit. Il n’est écrit nulle part ailleurs que sur ce téléphone.':
    'A first name is enough. It is written nowhere but on this phone.',
  'Votre prénom': 'Your first name',
  'Prénom': 'First name',
  'Choisir ce portrait': 'Choose this portrait',
  'D’autres portraits': 'Other portraits',
  'Par où commencer ?': 'Where would you like to start?',
  'Trois façons, et aucune n’est définitive.': 'Three ways in, and none of them is final.',
  'Photographier une boîte': 'Photograph a box',
  'L’application lit le nom, le dosage et la péremption. C’est le plus rapide.':
    'The app reads the name, the strength and the expiry date. This is the fastest way.',
  'Saisir un médicament': 'Enter a medication',
  'Nom, dosage, horaires. Trois écrans, guidés.': 'Name, strength, times. Three guided screens.',
  'Partir d’exemples': 'Start from examples',
  'Quelques traitements fictifs déposés dans votre carnet, pour voir comment il vit. Effaçables un par un.':
    'A few fictional treatments dropped into your own log, to see how it lives. Removable one by one.',

  /* Le choix des exemples */
  'Quels exemples ?': 'Which examples?',
  'Ils seront ajoutés au carnet de {nom}, avec leurs horaires. Décochez ce que vous ne voulez pas.':
    'They will be added to {nom}’s log, with their times. Untick anything you do not want.',
  'Ajouter au carnet': 'Add to the log',
  '{n} traitements ajoutés.': '{n} treatments added.',
  'un médicament pris deux fois par jour.': 'a medication taken twice a day.',
  'une cure qui se termine toute seule à la date de fin.':
    'a course that ends by itself on its end date.',
  'une forme qui se compte en gouttes.': 'a form counted in drops.',
  'un demi-comprimé, et une consigne de prise à jeun.':
    'half a tablet, and an on-an-empty-stomach instruction.',
  'Pour que ça sonne vraiment': 'To make it really ring',
  'L’application pose de vraies alarmes, comme le réveil du téléphone. Deux réglages d’Android peuvent malgré tout les faire taire.':
    'The app sets real alarms, like the phone’s own clock. Two Android settings can still silence them.',
  'Un navigateur ne peut pas réveiller un téléphone endormi de façon sûre. L’application superpose donc trois filets — et le plus fiable est l’agenda.':
    'A browser cannot reliably wake a sleeping phone. The app therefore layers three safety nets — and the calendar is the most dependable.',
  'Autoriser l’alarme exacte': 'Allow exact alarms',
  'Sans elle, un rappel peut arriver avec plusieurs minutes de retard.':
    'Without it, a reminder can arrive several minutes late.',
  'Autoriser': 'Allow',
  'Batterie sans restriction': 'Unrestricted battery',
  'Sinon Android endort l’application et retarde les rappels.':
    'Otherwise Android puts the app to sleep and delays reminders.',
  'Régler': 'Set',
  'Tout est en ordre': 'Everything is set',
  'Les prises sonneront à l’heure.': 'Doses will ring on time.',
  'Exporter vers l’agenda': 'Export to the calendar',
  'Depuis les réglages, une fois les horaires saisis. C’est le rappel le plus sûr.':
    'From settings, once the times are entered. It is the most reliable reminder.',
  'C’est parti': 'Let’s go',
  'Proche': 'Relative',
  'Moi': 'Me',

  /* ------------------------------------------------------------- la navigation */
  'Aujourd’hui': 'Today', "Aujourd'hui": 'Today',
  'Calendrier': 'Calendar', 'Traitement': 'Treatment', 'Suivi': 'Follow-up',
  'Réglages': 'Settings', 'Navigation principale': 'Main navigation',
  /* Les libelles courts de la barre d'onglets : ils doivent tenir dans une
     case, donc on abrege en anglais comme on abrege en francais. */
  'Jour': 'Day', 'Mois': 'Month', 'Médic.': 'Meds', 'Régl.': 'Settings',
  'Jour précédent': 'Previous day', 'Jour suivant': 'Next day',
  'Mois précédent': 'Previous month', 'Mois suivant': 'Next month',
  "Revenir à aujourd'hui": 'Back to today',
  'Lun': 'Mon', 'Mar': 'Tue', 'Mer': 'Wed', 'Jeu': 'Thu',
  'Ven': 'Fri', 'Sam': 'Sat', 'Dim': 'Sun',
  'Fermer': 'Close', 'Retirer': 'Remove', 'Supprimer': 'Delete',
  'Sauvegarder': 'Save', 'Annuler': 'Cancel', 'Vérifier': 'Check',
  'Rechercher': 'Search', 'Rechercher un médicament…': 'Search for a medication…',
  'Voir en détail': 'See in detail', 'Liste': 'List', 'Archiver': 'Archive',

  /* ------------------------------------------------------------ l'ecran du jour */
  'Tout valider': 'Mark all taken', 'Tout pris': 'All taken',
  'Marquer comme pris': 'Mark as taken', 'Annuler la prise': 'Undo this dose',
  'Prochaine prise': 'Next dose', 'Journée complète': 'Day complete',
  'Rien à venir': 'Nothing coming up', 'Rien de prévu': 'Nothing scheduled',
  'Prises validées': 'Doses taken', 'des prises': 'of doses',
  'Tu peux encore la valider ou la marquer comme sautée.':
    'You can still mark it taken, or mark it skipped.',
  'Appuie sur la pastille pour valider. Appuie longuement sur une ligne pour plus d’options.':
    'Tap the marker to confirm. Press and hold a row for more options.',
  'Crée d\'abord un profil pour commencer.': 'Create a profile to get started.',
  'Créer un profil': 'Create a profile', 'Aucun profil': 'No profile',
  'Ajouter un médicament': 'Add a medication', 'Ajouter un profil': 'Add a profile',
  'Profils': 'Profiles', 'Nom': 'Name', 'Ordonnance': 'Prescription',
  'Prescripteur': 'Prescriber', 'Substance active': 'Active substance',
  'Début': 'Start', 'Fin': 'End', 'Stock': 'Stock', 'Prix boîte': 'Box price',
  'tous les jours': 'every day',
  /* Les phrases fabriquees : elles portent leurs variables entre accolades.
     Le pluriel est gere par deux entrees distinctes plutot que par une regle
     generique — une regle de pluriel se trompe dans trop de langues. */
  '{n} / {total} prises validées': '{n} of {total} doses taken',
  '{n} prises validées sur {total}': '{n} doses taken out of {total}',
  '{n} prises en retard': '{n} doses overdue',
  '1 prise en retard': '1 dose overdue',
  '{n} prises enregistrées': '{n} doses recorded',
  '1 prise enregistrée': '1 dose recorded',
  '{n} médicaments à cette heure': '{n} medications at this time',
  'en retard': 'overdue',
  'Demain': 'Tomorrow', 'Hier': 'Yesterday',
  "à l'instant": 'just now', 'dans {d}': 'in {d}', 'il y a {d}': '{d} ago',
  'min': 'min', 'h': 'h', 'j': 'd',
  '{dose} {unite} à {heure}': '{dose} {unite} at {heure}',

  /* Les catalogues : formes galeniques, unites, consignes de repas. Ils sont
     affiches tels quels, donc ils passent par le meme repli que le reste. */
  'Comprimé': 'Tablet', 'Gélule': 'Capsule', 'Sirop': 'Syrup', 'Gouttes': 'Drops',
  'Injection': 'Injection', 'Inhalateur': 'Inhaler', 'Patch': 'Patch',
  'Sachet': 'Sachet', 'Suppositoire': 'Suppository', 'Crème/Pommade': 'Cream/Ointment',
  'cp': 'tab', 'gél.': 'cap', 'gttes': 'drops', 'inj.': 'inj.', 'bouff.': 'puffs',
  'sach.': 'sach.', 'supp.': 'supp.', 'appl.': 'appl.',
  'Peu importe': 'Any time', 'Avant le repas': 'Before food',
  'Pendant le repas': 'With food', 'Après le repas': 'After food', 'À jeun': 'On an empty stomach',
  'peu importe': 'any time', 'avant le repas': 'before food',
  'pendant le repas': 'with food', 'après le repas': 'after food', 'à jeun': 'on an empty stomach',

  /* ------------------------------------------------------------------- le suivi */
  'Observance': 'Adherence', 'Répartition': 'Breakdown', 'Par médicament': 'By medication',
  'Constantes': 'Vital signs', 'Ce qu’il ressent': 'How they feel',
  'Une gélule par jour': 'One capsule per day',
  'Plein · hachuré · vide': 'Solid · hatched · empty',
  'Oubliées': 'Missed', 'Oublié': 'Missed', 'Partiel': 'Partial',
  'À venir / rien': 'Upcoming / none', 'Jours d\'affilée': 'Days in a row',
  'Aucun relevé. Tension, glycémie, poids : utile à montrer au médecin.':
    'No readings yet. Blood pressure, blood sugar, weight: useful to show the doctor.',
  'Stock et renouvellement': 'Stock and refills',
  'Renouvellement à prévoir': 'Refill to plan', 'Coût estimé du traitement': 'Estimated cost',
  'Donner des nouvelles': 'Send an update',
  'Envoyer un bulletin à un proche': 'Send an update to a relative',
  'Un message clair, prêt à partir. Rien ne quitte le téléphone sans ce geste.':
    'A clear message, ready to send. Nothing leaves the phone without this action.',
  'Envoyer le bulletin du jour': 'Send today’s update', 'La semaine': 'The week',
  'Rapport pour le médecin': 'Report for the doctor',
  'Une page imprimable avec le traitement, l’observance et les constantes.':
    'A printable page with the treatment, adherence and vital signs.',
  'Fiche d\'urgence': 'Emergency card',
  'Carte de poche imprimable, avec QR code': 'Printable pocket card, with QR code',
  'Urgence': 'Emergency',

  /* ---------------------------------------------------------------- les reglages */
  'Apparence': 'Appearance', 'Langue': 'Language', 'Thème': 'Theme',
  'Clair, sombre ou automatique': 'Light, dark or automatic',
  'Clair': 'Light', 'Sombre': 'Dark', 'Automatique': 'Automatic',
  'Taille du texte': 'Text size', 'Confort de lecture': 'Reading comfort',
  'Normale': 'Normal', 'Grande': 'Large', 'Très grande': 'Very large',
  'Contraste renforcé': 'Higher contrast',
  'Bordures et textes plus marqués': 'Stronger borders and text',
  'Animations': 'Animations',
  'Désactive tout mouvement si l\'affichage saccade': 'Turns off all motion if the display stutters',
  'Langue changée.': 'Language changed.',
  'Rappels': 'Reminders', 'Sonnerie': 'Ringtone',
  'Jouer une sonnerie à l\'heure de la prise': 'Play a ringtone when a dose is due',
  'Volume': 'Volume', 'Vibration': 'Vibration',
  'Vibrer en même temps que la sonnerie': 'Vibrate along with the ringtone',
  'Notifications système': 'System notifications', 'Appuie pour autoriser': 'Tap to allow',
  'Report (snooze)': 'Snooze', 'Fenêtre de rappel': 'Reminder window',
  'Au-delà, la prise est comptée comme oubliée': 'Beyond this, a dose counts as missed',
  'Tester l\'alarme': 'Test the alarm',
  'Voir et entendre ce que ça donne': 'See and hear what it does',
  'Agenda du téléphone': 'Phone calendar',
  'Exporter vers l\'agenda': 'Export to the calendar',
  'La voix': 'Voice', 'Voix': 'Voice', 'Débit': 'Speed', 'Débit de la voix': 'Speaking rate',
  'Annoncer à voix haute': 'Announce out loud',
  'À l\'heure de la prise, le téléphone dit le nom et la dose':
    'When a dose is due, the phone says the name and the dose',
  'Écouter un exemple': 'Hear an example',
  'Aucune voix française trouvée': 'No French voice installed',
  'Écran simplifié': 'Simplified screen', 'Mode simple': 'Simple mode',
  'Une prise à la fois, très gros caractères, deux boutons':
    'One dose at a time, very large type, two buttons',
  'À activer sur le téléphone de la personne qui prend les médicaments. Tout le reste de l’application disparaît.':
    'Turn this on for the phone of the person taking the medication. Everything else disappears.',
  'Sortie protégée': 'Protected exit',
  'Il faut appuyer trois secondes pour quitter le mode simple':
    'Press for three seconds to leave simple mode',
  'Consignes générales': 'General instructions',
  'Consommation': 'Consumption', 'Décompter le stock': 'Deduct from stock',
  'Retirer automatiquement à chaque prise validée': 'Deduct automatically on each dose taken',
  'Devise': 'Currency', 'Changer de devise': 'Change currency',
  'Garder les nombres': 'Keep the numbers', 'Convertir': 'Convert',
  'Suivi à distance': 'Remote follow-up', 'Le proche qui suit': 'The relative following',
  'Ce téléphone est celui du patient': 'This is the patient’s phone',
  'Ce téléphone est celui du proche': 'This is the relative’s phone',
  'Créer un code et publier le compte rendu': 'Create a code and publish the report',
  'Saisir le code reçu pour suivre à distance': 'Enter the code you received to follow remotely',
  'Numéro WhatsApp': 'WhatsApp number',
  'Indicatif du pays compris, sans + ni espaces.': 'Include the country code, without + or spaces.',
  'Relier deux téléphones : celui du patient publie un compte rendu chiffré, celui du proche le lit. Le serveur ne voit qu\'un bloc illisible — le code de liaison ne lui est jamais transmis.':
    'Link two phones: the patient’s publishes an encrypted report, the relative’s reads it. The server only ever sees an unreadable block — the pairing code is never sent to it.',
  'Données': 'Data', 'Sauvegarde du dossier': 'Back up the record',
  'Fichier .json à conserver': 'A .json file to keep safe',
  'Restaurer': 'Restore', 'Depuis un fichier de sauvegarde': 'From a backup file',
  'Exporter en SQL': 'Export as SQL',
  'Base SQLite ouvrable sur ordinateur': 'A SQLite database you can open on a computer',
  'Rapport imprimable': 'Printable report',
  'Charger un exemple': 'Load an example',
  'Un profil fictif avec quatre traitements, pour explorer':
    'A fictional profile with four treatments, to explore',
  'Tout effacer': 'Erase everything', 'Remet l’application à zéro': 'Resets the app',
  'À propos': 'About', 'Confidentialité': 'Privacy',
  'Tout reste sur ce téléphone. Aucun compte, aucun serveur.':
    'Everything stays on this phone. No account, no server.',
  'Documentation': 'Documentation',
  'Comment c’est fait, et ce que ça ne promet pas':
    'How it is built, and what it does not promise',
  'Version': 'Version',
  'Cette application aide à ne rien oublier. Elle ne remplace ni l’ordonnance, ni l’avis du médecin ou du pharmacien.':
    'This app helps you not to forget. It replaces neither the prescription nor the advice of a doctor or pharmacist.',
  "Cette application aide à ne rien oublier. Elle ne remplace ni l'ordonnance, ni l'avis du médecin ou du pharmacien.":
    'This app helps you not to forget. It replaces neither the prescription nor the advice of a doctor or pharmacist.',

  /* ------------------------------------------------------------- les ressentis */
  'Nausées': 'Nausea', 'Insomnie': 'Sleeplessness', 'Diarrhée': 'Diarrhoea',
  'Grande fatigue': 'Severe tiredness', 'Vertiges, tête qui tourne': 'Dizziness',
  'Une tape suffit. Ces boutons sont ceux qui correspondent à ses médicaments.':
    'One tap is enough. These buttons match their medication.',

  /* ------------------------------------------------------- les graphiques */
  'Observance': 'Adherence', 'Répartition': 'Breakdown', 'Ponctualité': 'Punctuality',
  'des prises': 'of doses', 'prises prévues': 'doses planned',
  'rien encore jugé': 'nothing judged yet',
  'min d’écart médian': 'min median gap',
  'Heure prévue en abscisse': 'Planned time on the x-axis',
  'bande hachurée : à l’heure': 'hatched band: on time',
  '{n} prises validées': '{n} doses confirmed',

  /* ------------------------------------------------------------- les langues */
  'Français': 'French', 'Anglais': 'English',
};
