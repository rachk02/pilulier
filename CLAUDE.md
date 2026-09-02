# Pilulier — notes pour Claude Code

Lis ce fichier avant de toucher au projet. Il dit ce qu'il faut savoir, ce
qu'il ne faut pas casser, et ce qui a été écarté volontairement pour que tu ne
le réintroduises pas en croyant bien faire.

La documentation destinée à l'humain est **`public/doc.html`** — servie par
l'application elle-même, dans son style. Ouvre-la, elle est plus agréable que
ce fichier.

---

## Le projet en un paragraphe

Un carnet de prises de médicaments pour une personne âgée suivant plusieurs
traitements par jour. **L'application s'installe vide** : aucune donnée de
personne dans le dépôt, et `check.mjs` échoue si une seule y réapparaît.
Le premier lancement crée le profil ; un exemple fictif est proposé à qui veut
d'abord regarder. L'application est utilisée par deux
personnes : le père qui avale les comprimés, le fils qui veille à distance.
PWA installable, hors-ligne intégral, français uniquement.

## À lire d'abord

**`reference/INDEX.md`** — le dossier de référence visuelle. Il montre à quoi
chaque écran, chaque sortie imprimée et chaque dessin doit ressembler, et
explique pourquoi. Avant de toucher à l'interface ou à un format de sortie,
regarde-le : c'est plus rapide que de deviner, et ça évite de refaire un choix
qui a déjà été tranché.

Si le dossier est absent, décompresse `pilulier-assets.zip` dans `reference/`
(voir `reference/OU-METTRE-LES-ASSETS.md`). Rien n'en dépend à l'exécution.

## Lancer et vérifier

```bash
npx serve public -l 5173        # statique
node tools/dev-server.mjs       # + la fonction serverless (port 5300)

node tools/check.mjs            # 146 vérifications, aucune dépendance
python3 tools/e2e.py            # 42 parcours dans un vrai navigateur
node tools/render-icons.mjs     # régénère les PNG depuis illus.js
```

**Lance `node tools/check.mjs` après chaque modification.** Il ne demande rien
et il attrape la plupart des régressions : syntaxe de tous les modules, QR,
analyseur GS1, dates de péremption, carnet de médicaments, règles de sécurité,
ordonnance de départ, et le fait que toute icône citée dans le code existe.

---

## Les règles non négociables

Ces contraintes ne sont pas des préférences : chacune a été payée d'un choix.

1. **Zéro dépendance.** `package.json` n'a ni `dependencies` ni
   `devDependencies`. Pas de bundler, pas d'étape de build, pas de framework.
   Si tu crois avoir besoin d'une bibliothèque, écris la fonction — c'est ce
   qui a été fait pour le QR, les codes-barres, le moteur de base de données
   et tous les dessins.

2. **Hors-ligne intégral.** Aucun appel réseau, sauf `/api/sync` quand
   l'utilisateur a explicitement activé le suivi à distance. Pas de CDN, pas de
   Google Fonts, pas d'API tierce. La police est embarquée dans `public/fonts/`.

3. **Aucune image.** Il n'y a pas un seul `.png` d'illustration dans le projet.
   Tout ce qui s'affiche est tracé par `draw.js` / `icons.js` / `illus.js` /
   `avatars.js`. Les PNG de `public/icons/` sont **générés** depuis `illus.js`
   par `tools/render-icons.mjs` — ne les édite jamais à la main.

4. **`theme.css` est la seule source des valeurs.** Couleurs, corps de texte,
   épaisseurs de filet, rayons, durées, **et la casse des micro-libellés**
   (`--tt-label`). `app.css` ne contient aucune valeur brute : uniquement des
   `var(--…)`. `check.mjs` le vérifie et échoue sinon — seul le bloc
   `@media print` est exempté, il décrit du papier. C'est cette règle qui
   permet de rhabiller l'application sans la refaire ; ne l'enfreins jamais
   « juste pour cette fois ».

   **Et une variable citée doit exister.** `var(--ok-500)` ne provoque aucune
   erreur : la déclaration est simplement ignorée, la couleur ne s'applique
   pas, et personne ne le voit. Trois jauges sont restées sans couleur pour
   cette raison. `check.mjs` refuse désormais toute variable citée dans
   `app.css` ou dans un module et absente de `theme.css`.

5. **Le mouvement est réduit au minimum, à la demande du propriétaire.**
   Fondus de 80–130 ms, et un seul clignotement — celui qui signale une prise
   en attente, parce qu'il porte une information. Pas de rebond, pas de
   cascade, pas de confettis, pas d'ondulation au toucher.

6. **Français partout.** Interface, commentaires, noms de fonctions métier.
   Les commentaires expliquent **pourquoi**, jamais **quoi** — le code dit
   déjà quoi. Chaque module commence par un en-tête qui justifie son
   existence et ses arbitrages.

7. **Prudence médicale.** L'application ne dit jamais « arrête », elle dit
   « demande ». Aucun schéma de prise n'est appliqué automatiquement : il est
   proposé, et l'utilisateur confirme. Toute suggestion issue de
   `drugbook.js` porte la mention « à confirmer avec l'ordonnance ». Les règles
   de `safety.js` orientent vers le médecin ou le pharmacien, jamais vers une
   décision.

8. **Accessibilité.** Cibles tactiles de 48 px minimum, taille de texte
   « grande » par défaut (l'utilisateur type a plus de 65 ans), contraste renforcé
   disponible, tout est atteignable au clavier.

9. **Aucun emoji, nulle part.** Ni interface, ni bulletins, ni titres
   d'événements `.ics`. `check.mjs` balaie tout `public/` et `api/` et échoue
   si un emoji revient. À la place, **deux registres de marques**, définis en
   tête de `bulletin.js` :
   - `MARK_TEXT` — un caractère (`■ ▲ ▨ □`) pour le texte envoyé par
     messagerie, qui doit survivre au copier-coller ;
   - `MARK_ICON` — le nom d'une case dessinée (`markTaken`, `markMissed`,
     `markSkipped`, `markDue` dans `icons.js`) pour tout ce qui est rendu :
     l'aperçu du bulletin, le rapport du médecin.

   `statusOfLine()` relit le texte déjà fabriqué pour retrouver le statut d'une
   ligne : l'aperçu ne peut donc pas diverger de ce qui partira. Si tu ajoutes
   un statut, ajoute-le aux **trois** tables et dessine sa case.

10. **L'impression garde le style.** Le rapport et la fiche d'urgence sortent
   en papier kaki, avec leurs filets et leurs accents — le bloc `@media print`
   d'`app.css` force le tirage clair et pose `print-color-adjust: exact`.
   N'y remets jamais un `background:#fff`. La fiche d'urgence sort en **un**
   exemplaire ; le second est une case à cocher, pas un défaut.
   `buildReport()` (app.js) et `buildCardSheet()` (urgence.js) fabriquent le
   document sans lancer l'imprimante — c'est par là qu'on le teste.

11. **Rien ne sort du téléphone sans un geste explicite.** Le bulletin part
   quand on appuie. Le suivi à distance publie un compte rendu **chiffré dans
   le navigateur** ; le serveur ne voit qu'un identifiant opaque et un bloc
   illisible.

---

## Carte du code

| Fichier | Rôle |
|---|---|
| `js/app.js` | coque, navigation, thème, rapport imprimable, carte du proche |
| `js/db.js` | moteur relationnel minimal + IndexedDB + miroir localStorage + dump SQL |
| `js/schema.js` | tables, catalogues, réglages par défaut, **EXEMPLE fictif** |
| `js/store.js` | règles métier : occurrences, prises, stock, péremption, observance |
| `js/alarm.js` | moteur de rappel, écran d'alarme plein écran, réveil par le système |
| `js/speech.js` | la voix : phrases françaises, nombres en toutes lettres |
| `js/sound.js` | six sonneries générées en Web Audio |
| `js/safety.js` | familles de molécules, consignes, symptômes, alertes d'oubli |
| `js/drugbook.js` | carnet local : substances, dosages, schémas courants |
| `js/boxscan.js` | `BarcodeDetector`, analyseur GS1, dates de péremption |
| `js/qr.js` | encodeur QR complet (40 versions, 4 niveaux), écrit à la main |
| `js/bulletin.js` | les textes envoyés : jour, semaine, pharmacie, urgence |
| `js/sync.js` | appairage (QR · lien · code), chiffrement de bout en bout, adresse du relais |
| `js/draw.js` | primitives de dessin : trait tremblé, hachure, éventail |
| `js/icons.js` | les 50 icônes |
| `js/illus.js` | marque, scènes d'écran vide, tampon, **plan isométrique** |
| `js/charts.js` | les cinq graphiques, tracés à main levée |
| `js/avatars.js` | générateur de visages |
| `js/ui.js` | toasts, feuilles modales, dialogues, champs, `choice()` |
| `js/util.js` | dates, formats — réexporte `ico` depuis `icons.js` |
| `js/views/` | today · calendar · meds · suivi · settings · profiles · simple · urgence · newmed |
| `js/native.js` | le pont vers l'APK : prochaines prises, état des permissions |
| `js/i18n.js` | la traduction, à repli français ; `js/lang/*.js` les catalogues |
| `js/money.js` | devises, taux, conversion — un prix n'est pas qu'une étiquette |
| `js/views/onboarding.js` | le premier lancement, six écrans |
| `api/sync.js` | fonction serverless Vercel, sans dépendance (Upstash via REST) |
| `android/` | la coque native — 7 fichiers Java, **aucune dépendance** |
| `reference/` | les captures de référence — lues par toi, jamais par l'application |
| `css/theme.css` | **toutes les valeurs** — le fichier à lire en premier |
| `css/app.css` | forme des composants, **aucune valeur brute** |
| `public/style.html` | la planche de style, engendrée depuis theme.css |
| `public/sorties.html` | les sept sorties, rendues par les vraies fonctions |
| `public/marques.html` | les quatre marques de statut, à toutes les tailles |
| `public/schema.html` | le plan de l'application en volumes isométriques |

## Recettes

**Ajouter une icône** — une fonction dans `ICONS` de `js/icons.js`, composée avec
les primitives de `draw.js`. Elle reçoit un `dice` déjà semé par son nom.
Vérifie-la sur `/dessins.html` à 16, 18, 20 et 24 px.

**Ajouter un médicament au carnet** — une entrée dans `BOOK` de `js/drugbook.js` :
`dci`, `brands` (les noms commerciaux rencontrés ici), `form`, `strengths`,
`plans`. Ajoute aussi sa famille dans `js/safety.js` si elle manque.

**Ajouter une règle de sécurité** — une entrée dans `FAMILIES` de `js/safety.js`.
Le champ `match` liste les substances et noms commerciaux ; `neverStop`,
`avoidAfter`, `watch` et `missAlertAfter` pilotent les alertes.

**Compiler l'APK sans Android Studio** — `node tools/verifier-android.mjs`
dit ce qui manque et écrit `android/local.properties` dès qu'un SDK est
trouvé. Sous Windows, `tools/installer-sdk-android.ps1` installe le SDK
complet (command line tools, licences, plateforme 35, build-tools, adb).
L'erreur *« SDK location not found »* veut toujours dire la même chose :
`local.properties` absent ou pointant vers un dossier vide.

**Travailler sur l'APK** — `android/` est une coque, pas une deuxième
application. Règles :
- **Aucune dépendance.** Pas d'AndroidX, pas de Material, pas de bibliothèque
  WebView. Le `dependencies {}` du `build.gradle` doit rester vide, et
  `check.mjs` échoue sinon. C'est ce qui garde l'APK sous le mégaoctet.
- **Le web décide, le natif exécute.** `native.js` calcule les prochaines
  prises et les envoie ; `Rappels.java` les stocke et pose les alarmes. Ne
  recalcule jamais un horaire en Java : les deux divergeraient en silence.
- **Le pont reste petit, mais il a grandi.** Il est passé de 9 à 17 méthodes
  le jour où l'APK a été essayé pour de vrai : **une WebView ne sait ni
  imprimer, ni télécharger, ni notifier, ni parler**, et aucune de ces quatre
  pannes ne levait d'erreur — les boutons ne répondaient simplement pas.
  `window.print()` existe et ne fait rien ; `<a download>` et les URL `blob:`
  sont ignorés ; l'API `Notification` n'existe pas ; `speechSynthesis` répond
  présent mais sa liste de voix revient vide. Le pont porte donc
  `imprimer()`, `enregistrerFichier()`, `notificationsAutorisees()` /
  `demanderNotifications()`, `voixDisponible()` / `parler()`. Côté web, tout
  passe par `native.js` (`imprimerNatif`, `enregistrerFichierNatif`, …), qui
  rend `false` sans le natif pour que le navigateur reprenne la main.
  Toute méthode ajoutée doit être annotée `@JavascriptInterface` et gardée
  dans `proguard-rules.pro`. `check.mjs` vérifie que chaque méthode appelée
  depuis `native.js` existe côté Java, que le pont reste sous 20 méthodes, et
  qu'il n'expose **rien d'arbitraire** (pas de `eval`, pas de lecture de
  fichier libre).
- **Les assets sont une copie.** `android/…/assets/web/` est refait par
  `tools/sync-android.mjs` avant chaque compilation. Ne l'édite jamais.
- `setAlarmClock()` et rien d'autre : c'est le seul mode qu'Android traite
  comme un réveil, donc le seul que l'économiseur de batterie ne repousse pas.
- **L'écran de rappel est celui du web, pas un écran Java.** `EcranAlarme.java`
  a été supprimé : depuis Android 10, `startActivity()` depuis un
  `BroadcastReceiver` est **ignoré sans un mot**, donc cet écran ne s'ouvrait
  jamais quand l'application était fermée — le seul cas qui compte. Le seul
  chemin autorisé est l'**intention plein écran** : une notification à haute
  importance portant `setFullScreenIntent()`, plus la permission
  `USE_FULL_SCREEN_INTENT`. Le système lance alors `MainActivity` lui-même,
  avec les extras de l'alarme ; `alarm.js` les ramasse au démarrage
  (`ouvrirSiReveilSysteme`), bascule sur le bon profil et ouvre son écran,
  avec sa sonnerie et sa voix. Limite qui ne se contourne pas : téléphone
  verrouillé, l'écran s'ouvre en grand ; téléphone déverrouillé et en cours
  d'usage, Android affiche une bannière à la place.
- **Deux canaux de notification**, parce qu'un canal Android est figé dès sa
  création et que sa sonnerie ne peut plus changer : `rappels` porte la
  sonnerie de réveil du téléphone (le filet de sécurité), `rappels-muet` ne
  sonne pas et laisse l'application sonner seule. Le réglage `son_systeme`
  choisit, et `native.js` le repose à chaque démarrage.
- `buildReport()` et `buildCardSheet()` ont leur équivalent ici :
  `Rappels.armer()` est appelable seul, sans interface, pour être testable.

**Traduire** — la clé est la phrase française. Le crochet est dans `el()`
(`util.js`) : n'en pose pas d'autre. Une phrase fabriquée par interpolation ne
peut pas être attrapée par le crochet — appelle `t()` explicitement, avec des
variables entre accolades, et ajoute les **deux** formes du pluriel en entrées
distinctes. Une entrée identique au français n'est pas une erreur (« Stock »,
« Volume »). `check.mjs` vérifie que les variables survivent à la traduction.

**Toucher à l'argent** — jamais en silence. `money.js` porte les devises, les
taux et la conversion ; `convertirLesPrix()` dans `store.js` applique. Le
dialogue de `settings.js` montre le taux, un aperçu sur de vrais prix, et
laisse corriger. Les taux embarqués sont datés : dis-le, ne le cache pas.

**Ajouter un graphique** — `charts.js`. Les règles : la hachure remplace tout
dégradé (`hatchInside()` la borne exactement à la silhouette, sans masque SVG,
donc ça tient à l'impression) ; chaque point mesuré est marqué, parce qu'une
courbe qui passe à côté de ses points ment ; et un graphique n'est jamais
tracé en dessous de trois relevés, sinon il donne l'illusion d'une tendance.
`chartCard()` dans `views/suivi.js` pose l'anatomie : micro-libellé et période,
chiffre en grand, dessin, deux faits en pied.

**Dessiner un schéma isométrique** — `illus.js` porte `archDiagram()`. Le plan
est une simple table `PLAN` : position sur la grille, emprise, hauteur, densité
de hachure, étiquette. Déplacer une entrée redessine tout — aucune coordonnée
n'est écrite à la main. `hachureFace()` hachure un parallélogramme en calculant
exactement les bouts de chaque diagonale (pas de masque, pas de débordement),
et chaque bloc pose d'abord sa silhouette en aplat de papier pour masquer ce
qui est derrière lui. Les blocs sont triés par `gx + gy` : du fond vers l'avant.
Les étiquettes passent en **dernier**, toutes ensemble, sinon un bloc du premier
plan coupe le nom d'un bloc du fond.

**Regarder ce que l'application produit** — deux planches sont servies par le
projet et engendrées par le code, donc elles ne peuvent pas mentir :
`/style.html` (palette, corps, espacements, géométrie, composants, les 50
icônes) et `/sorties.html` (les sept fichiers produits : bulletin du jour,
bilan de la semaine, liste pharmacie, fiche d'urgence en texte et en QR, export
`.ics`, dump SQL). Après toute modification d'un format de sortie ou d'une
valeur de thème, les rouvrir suffit à voir le résultat. Le dossier
`pilulier-assets/` en contient les captures, avec un INDEX qui explique chaque
pièce.

**Brancher un vrai OCR** — `boxscan.js` expose `setOcrEngine(fn)`. Tout ce qui
suit — analyse des lignes, fusion avec le code-barres, pré-remplissage — est
déjà écrit et testé : il n'y a que le moteur à fournir. Avec Tesseract, chargé
à la demande pour ne pas peser sur le démarrage :

```js
import { setOcrEngine } from './boxscan.js';

setOcrEngine(async (src) => {
  const { createWorker } = await import('./vendor/tesseract.esm.min.js');
  const worker = await createWorker('fra', 1, { workerPath: '/vendor/worker.min.js',
    corePath: '/vendor/', langPath: '/vendor/' });
  const { data } = await worker.recognize(src);
  await worker.terminate();
  return data.lines.map((l) => ({
    text: l.text,
    box: { x: l.bbox.x0, y: l.bbox.y0,
           width: l.bbox.x1 - l.bbox.x0, height: l.bbox.y1 - l.bbox.y0 },
  }));
});
```

Les `box` ne sont pas décoratives : le nom du médicament est reconnu comme
**le plus gros texte de la boîte**. Sans hauteur, on retombe sur la position et
la longueur, ce qui marche moins bien. Vendre les fichiers dans
`public/vendor/` et **ne pas** les mettre dans `ASSETS` de `sw.js` : ils se
mettront en cache à la première utilisation.

**Ajouter un écran** — un module dans `js/views/` qui exporte `render(ctx)` et
`title`, puis une entrée dans `VIEWS` de `js/app.js` (avec un `short` qui tient
dans une case de la barre d'onglets).

**Changer l'exemple fictif** — `EXEMPLE` dans `js/schema.js`. Il n'est chargé
que sur demande — au premier lancement si on choisit « Voir un exemple », ou
via *Réglages*. Jamais au démarrage. Il ne doit décrire **personne** : pas de
pathologie, pas d'établissement de soin, pas de numéro. `check.mjs` le vérifie
et échoue sinon.

**Ajouter un champ en base** — une colonne dans `SCHEMA` de `js/schema.js`.
Le moteur est souple : les lignes existantes n'ont simplement pas la clé.

**Après toute modification de `public/`** — pense à `sw.js` : la liste `ASSETS`
et le numéro de `CACHE`. Un fichier absent de la liste ne sera pas disponible
hors ligne. Le numéro de version vit dans `js/app-version.js`.

---

## L'adresse du relais, et ce qui est secret ou non

`public/js/relais.js` **reste vide dans le dépôt** — `check.mjs` échoue sinon.
L'adresse est posée à la compilation par `tools/sync-android.mjs`, depuis
`android/relais.properties` (ignoré par Git) ou la variable
`PILULIER_RELAIS`. Ordre de résolution dans `serveur()` : ce que
l'utilisateur a saisi, puis la valeur de compilation, puis `/api/sync` quand
l'application est servie depuis un vrai domaine.

**Ce que ça fait :** évite de taper l'adresse sur chaque téléphone, et la garde
hors de l'historique Git — qui n'oublie rien.

**Ce que ça ne fait pas :** la rendre secrète. Une APK est une archive :
`unzip` puis `grep` retrouvent la chaîne en dix secondes, et aucun procédé
d'obscurcissement n'y change quoi que ce soit. **Ne jamais mettre dans
l'application quoi que ce soit qui doive rester secret** — pas de jeton
d'API, pas de mot de passe. Ce qui protège les données, c'est qu'elles sont
chiffrées avant de partir, avec une clé que le relais n'a jamais vue.

Les vrais secrets — la clé de signature de l'APK, les jetons Upstash — ne
sont ni dans le dépôt ni dans l'application : `.gitignore` pour les
premiers, variables d'environnement Vercel pour les seconds.

## Ce qu'une WebView ne sait pas faire

Quatre pannes silencieuses, découvertes en installant vraiment l'APK. Elles
partagent une cause et un symptôme : la méthode existe, elle ne lève rien, et
il ne se passe **rien**. Si tu ajoutes une fonctionnalité qui touche au
système, vérifie-la dans l'APK, pas seulement dans Chrome.

| Ce qu'on croit pouvoir faire | Ce qui se passe dans la WebView | Le chemin |
|---|---|---|
| `window.print()` | rien du tout | `Pont.imprimer()` → `PrintManager` sur la WebView elle-même, donc avec le bloc `@media print` |
| `<a download>` / `blob:` | ignoré | `Pont.enregistrerFichier()` → MediaStore, dossier Téléchargements |
| `new Notification(...)` | l'API n'existe pas | `Pont.notificationsAutorisees()` ; les rappels passent déjà par `Rappels.java` |
| `speechSynthesis` | répond présent, `getVoices()` vide | `Pont.parler()` → `android.speech.tts` |
| demander si la voix existe | `TextToSpeech` s'initialise **en asynchrone** : la première réponse est toujours « non » | trois états — `attente` / `prete` / `absente` — et la phrase demandée trop tôt est gardée puis dite |
| `navigator.share` | ne connaît aucune application | `Pont.partager()` → `ACTION_SEND` |
| `fetch('/api/sync')` | 404 : l'origine est `pilulier.local` | adresse du relais réglable, transportée par le QR d'appairage |

Règle qui en découle : **un bouton ne doit jamais échouer en silence**. Chaque
chemin rend un résultat (`'natif'`, `'navigateur'`, un chemin de fichier, `''`)
et l'appelant le dit à l'écran.

## Ce qui a été écarté, et pourquoi

Ne réintroduis pas ces choses sans que le propriétaire le demande.

- **SQLite en WebAssembly** — 1,5 Mo à charger avant le premier écran. Le moteur
  maison de `db.js` fait le travail pour quelques centaines de lignes, et
  `db.toSQL()` produit un vrai dump SQLite : les données ne sont pas prisonnières.
- **Un moteur OCR embarqué** — plusieurs mégaoctets à télécharger, ce qui casse
  la promesse hors-ligne dès le premier lancement. En revanche le lecteur de
  texte du téléphone (`TextDetector`) est utilisé quand il existe, et
  `setOcrEngine()` permet d'en brancher un sans toucher au reste. **L'analyse
  des lignes est déjà écrite et testée** : ne la réécris pas, branche un moteur.
- **Une API de médicaments en ligne** — il n'en existe pas de mondiale, gratuite
  et interrogeable depuis un navigateur. openFDA et RxNorm sont américaines ;
  aucune ne connaît « Paracétamol » ni « Dapaglin ». Le carnet local couvre ce
  qu'on trouve réellement en pharmacie ici.
- **Une synchronisation à deux sens** — le proche doit *voir*, pas *modifier*.
  Une vraie fusion demanderait des identifiants universels et une résolution de
  conflits, pour un besoin qui n'existe pas.
- **Les animations riches** — retirées à la demande explicite du propriétaire.

## État

Tout ce qui est décrit dans `doc.html` fonctionne et est couvert par les tests.
Points connus :

- `BarcodeDetector` n'existe pas sous Linux : `tools/e2e.py` le simule. Sur
  Chrome/Android il est natif. Le chemin est donc testé, pas le lecteur.
- `TextDetector` existe dans la spécification mais n'est **pas activé par
  défaut** dans toutes les versions de Chrome. L'application le détecte et le
  dit franchement à l'utilisateur. Pour l'essayer :
  `chrome://flags/#enable-experimental-web-platform-features`.
- Les **placeholders** sont des noms de convention — Jean Dupont, Marie Dupont,
  Dr Martin, Pharmacie du Centre, `00 00 00 00 00`. Aucun indicatif de pays,
  aucune personne réelle, et aucune donnée réelle nulle part dans le dépôt —
  `check.mjs` refuse un nom, un numéro avec indicatif, un établissement de
  soin ou une pathologie décrivant quelqu'un.
- Le suivi à distance a besoin d'un stockage Vercel KV / Upstash pour survivre
  au sommeil de la fonction. Sans lui, la mémoire de la fonction fait l'affaire
  pour essayer. Voir `doc.html` § 5.
- L'application s'installe **vide**. `estVierge()` le dit, `chargerExemple()`
  remplit à la demande. Ne réintroduis jamais de création automatique de
  profil : c'est ce qui garantit qu'une installation neuve ne contienne les
  données de personne.
- Tout horaire proposé par l'application — carnet embarqué, suggestion de
  schéma — reste **à faire valider par le médecin ou le pharmacien**. Elle
  propose, elle n'applique jamais.
