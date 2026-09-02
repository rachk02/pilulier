# Pilulier

Carnet de prises de médicaments. Multi-profils, hors-ligne intégral,
installable sur Android, déployable sur Vercel. **Zéro dépendance, zéro image,
zéro étape de compilation.**

**L'application s'installe vide** : aucun profil, aucun traitement, aucune
donnée de personne. Le premier lancement demande à qui elle va servir, et
propose un exemple entièrement fictif à qui veut d'abord regarder.

---

## La documentation

Elle est dans l'application elle-même, dans son style :

```bash
npx serve public -l 5173
```

puis **<http://localhost:5173/doc.html>** — ou *Réglages → Documentation* dans
l'app. Elle couvre l'usage, l'architecture, la manière dont tout est dessiné,
la vie privée, et ce qui a été délibérément écarté.

Deux autres planches, servies par l'application :

| Adresse | Ce qu'on y voit |
|---|---|
| `/style.html` | la planche de style : palette, corps, espacements, composants |
| `/marques.html` | les quatre marques de statut, à toutes les tailles |
| `/graphiques.html` | les cinq graphiques, avec des données d'exemple |
| `/schema.html` | le plan de l'application en volumes isométriques |
| `/sorties.html` | les sept fichiers que l'application produit, rendus par les vraies fonctions |
| `/dessins.html` | les 50 icônes et les illustrations, à toutes les tailles |
| `/faces.html` | soixante visages tirés par le générateur |

Pour travailler sur le projet avec un agent : **`CLAUDE.md`** contient les
règles à ne pas casser et la carte du code, et **`reference/INDEX.md`** montre
à quoi chaque écran et chaque sortie doit ressembler.
Le dossier `reference/` se remplit en décompressant `pilulier-assets.zip` —
voir `reference/OU-METTRE-LES-ASSETS.md`. Rien n'en dépend à l'exécution.

## Démarrer

```bash
npx serve public -l 5173        # statique
node tools/dev-server.mjs       # + la fonction serverless (port 5300)
```

Aucune dépendance à installer. Les modules ES et le service worker ne
fonctionnent pas en `file://` : il faut servir en HTTP.

## Déployer

```bash
vercel --prod
```

Par le site : **New Project → Import**, *Framework preset* `Other`,
*Output directory* `public`. `vercel.json` fait le reste.

Sur le téléphone : ouvrir l'adresse dans **Chrome/Android**, menu ⋮ →
**Installer l'application**, puis autoriser les notifications dans les
réglages de l'app et passer la batterie en *Sans restriction*.

## Vérifier

```bash
node tools/check.mjs            # 146 vérifications, aucune dépendance
python3 tools/e2e.py            # 42 parcours dans un vrai navigateur
node tools/render-icons.mjs     # régénère les icônes depuis illus.js
node tools/sync-android.mjs     # recopie public/ dans les assets de l'APK
node tools/verifier-android.mjs # « ai-je de quoi compiler l'APK ? »
powershell -File tools/installer-sdk-android.ps1   # installe le SDK (Windows)
```

## Enregistrer un médicament : la boîte le fait

Photo du recto (et du verso pour la péremption). L'application lit, dans cet
ordre :

1. **le code-barres** — Data Matrix GS1 ou EAN-13, via `BarcodeDetector`
   (natif sur Chrome/Android). Il donne le GTIN, la péremption, le lot ;
2. **le texte imprimé** — via `TextDetector` s'il est actif sur le téléphone,
   sinon via un moteur branché à la main (`setOcrEngine`, recette dans
   `CLAUDE.md`). Il donne le nom, le dosage, la forme, la contenance ;
3. **le dictionnaire local** — 40 spécialités courantes, qui propose des
   schémas de prise à valider.

Le code-barres l'emporte sur la péremption et le lot, le texte sur le nom et
le dosage ; l'application dit toujours d'où vient chaque champ. Une boîte
déjà scannée est reconnue par son GTIN : **la deuxième boîte est gratuite.**

## Le premier lancement

Six écrans : ce que c'est, la langue, pour qui, le profil, par où commencer,
les rappels. Chacun tient sans défiler, chacun se saute. Le seul obligatoire
est le nom du profil.

**Aucune donnée de personne n'existe dans ce dépôt.** Le seul jeu de données
est un profil **entièrement fictif** — quatre médicaments courants, aucune
pathologie décrite — chargé uniquement sur demande.
`tools/check.mjs` échoue si un nom, un numéro avec indicatif, un établissement
de soin ou la description de l'état de santé de quelqu'un y réapparaît.

## Plusieurs langues

La clé est **la phrase française**. `t('Tout valider')` cherche une traduction
et rend le français s'il n'en trouve pas : une phrase non traduite s'affiche
dans la langue d'origine plutôt que de laisser un trou.

Le crochet est posé une seule fois, dans `el({ text })` de `util.js` : toute
l'application en bénéficie sans avoir eu à envelopper six cents chaînes. Les
dates, les jours et les séparateurs de milliers suivent la langue via `Intl`.

Ajouter une langue : un fichier dans `js/lang/`, une entrée dans `LANGUES`.
Français et anglais sont livrés.

## La devise

Changer de devise **propose de convertir** les prix enregistrés : le dialogue
montre le taux, ce que deviennent trois vrais prix du dossier, et laisse
corriger le taux à la main. Les taux sont embarqués — donc datés — et
l'application le dit ; seule la parité du franc CFA est exacte, fixée par
traité. Sans cela, passer de FCFA à l'euro transformait « 21 000 FCFA » en
« 21 000 € ».

## L'application Android

`android/` contient une **coque native** autour de la même application.
Elle apporte une seule chose, mais c'est celle qui manquait : des alarmes qui
sonnent vraiment.

```bash
cd android
./gradlew assembleDebug     # APK dans app/build/outputs/apk/debug/
```

- **Aucune dépendance.** Ni AndroidX, ni Material. Sept fichiers Java.
  **L'APK pèse moins d'un mégaoctet.**
- **Aucun serveur.** L'application vient des assets de l'APK.
- `setAlarmClock()` — le mécanisme du réveil du téléphone : Android le sort du
  mode Doze, il sonne à la seconde près, écran éteint et téléphone verrouillé.
- Le web garde toute la logique ; `Rappels.java` ne fait que poser les alarmes.

**Pas besoin d'Android Studio** — un JDK 17+ et les *command line tools* du SDK
suffisent. `node tools/verifier-android.mjs` dit ce qui manque et donne la
commande exacte pour chaque chose. Le wrapper Gradle est dans le dépôt : rien
d'autre à installer.
Mode d'emploi complet : **`android/README.md`**.

## Les rappels, en quatre filets

| | Ce que c'est | Fiabilité |
|---|---|---|
| **0** | **Alarme système** (`setAlarmClock`) — *APK seulement* | **à la seconde près, veille profonde comprise** |
| 1 | Export `.ics` vers l'agenda du téléphone | sonne même app fermée |
| 2 | Notification système | dépend de l'optimisation batterie |
| 3 | Alarme plein écran + voix | app ouverte seulement |

Un navigateur ne peut pas réveiller un Android endormi de façon fiable — c'est
toute la raison d'être de l'APK. Installée depuis Chrome, l'application ne fait
pas semblant : elle superpose les trois filets qui lui restent.
**Ré-exporter le `.ics` après chaque changement d'ordonnance.** Le niveau 0, lui,
se repose tout seul.

---

## Aucun emoji — deux registres de marques

Ni dans l'interface, ni dans les bulletins, ni dans les titres d'événements de
l'agenda. Ils ne se rendent pas pareil d'un téléphone à l'autre, un lecteur
d'écran ne les lit pas, et ils sont étrangers au registre de la planche.
`tools/check.mjs` échoue si un emoji revient dans le code.

À la place, quatre marques, dans deux registres :

| Statut | Texte envoyé | À l'écran et à l'impression |
|---|---|---|
| pris | `■` | une case cochée, tracée à la main |
| oublié | `▲` | une case barrée d'une croix, au trait plus fort |
| sauté | `▨` | une case hachurée — la matière de la planche |
| à venir | `□` | une case vide, au trait léger |

Le texte garde des caractères parce qu'il doit survivre à un copier-coller dans
n'importe quelle messagerie. Partout où l'on peut dessiner — l'aperçu du
bulletin, le rapport du médecin — c'est la case dessinée qui s'affiche.
Les deux viennent de la même source : `statusOfLine()` relit le texte déjà
fabriqué, donc l'aperçu ne peut pas dire autre chose que ce qui partira.

## L'impression garde le style

Le rapport pour le médecin et la fiche d'urgence s'impriment **en papier kaki**,
avec leurs filets, leurs capitales espacées et leurs accents — pas en noir sur
blanc. `print-color-adjust: exact` est la condition. Le mode sombre est forcé en
clair au tirage : il n'a pas de sens sur du papier.

La fiche d'urgence sort en **un exemplaire**. Le second — celui du frigo — se
demande par une case à cocher dans la feuille.

## Avertissement

Cette application aide à ne rien oublier. Elle ne remplace ni l'ordonnance, ni
l'avis du médecin ou du pharmacien. Les horaires proposés au premier lancement
sont une interprétation d'une ordonnance manuscrite : **à faire valider**.
