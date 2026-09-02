# Pilulier — dossier de référence visuelle

À donner à Claude Code au début d'une session, avec `CLAUDE.md` (joint ici).
Toutes les images sont **engendrées par le code du projet** : ce qu'elles
montrent est ce que l'application affiche.

> **Le style :** papier kaki, encre, monospace, filets d'un pixel. Aucun
> arrondi, aucune ombre, aucun dégradé, **aucune image**, **aucun emoji**.
> La hiérarchie vient des filets, des capitales espacées et du vide.
> **L'impression garde tout ça.**

> **Aucune donnée de personne** n'existe dans ce dépôt ni dans ces captures.
> L'application s'installe vide ; le seul jeu de données est un profil
> **entièrement fictif**, nommé « Exemple », chargé uniquement sur demande.
> `tools/check.mjs` échoue si un nom, un numéro avec indicatif, un
> établissement de soin ou la description de l'état de santé de quelqu'un
> réapparaît quelque part.

---

## 01-ecrans — le premier lancement, puis les écrans

`00` à `04` sont la visite du premier lancement : ce que c'est, la langue, pour
qui, le profil, par où commencer, les rappels. Six écrans, chacun tient sans
défiler, chacun se saute. Le seul obligatoire est le nom du profil.

| Fichier | Ce qu'il faut en retenir |
|---|---|
| `00-premier-lancement.png` | l'application arrive vide ; trois promesses, pas plus |
| `01-langue.png` | proposée d'après celle du téléphone |
| `02-le-profil.png` | un prénom, un portrait choisi parmi six tirés au hasard. Rien d'autre |
| `03-par-ou-commencer.png` | photographier une boîte, saisir, ou voir un exemple |
| `04-les-rappels.png` | ce qu'Android peut faire taire, et le bouton qui ouvre le réglage |
| `05-aujourdhui.png` | panneau à repères de coupe, réglette d'un segment par prise, prises en lignes de relevé |
| `06-prise-validee.png` | la case cochée : encre pleine, nom barré |
| `07-calendrier.png` | vrai papier millimétré ; le jour courant en négatif |
| `08` · `09` · `10` | la fiche indexée par une couleur de repérage |
| `11-scan-de-la-boite.png` | la photo remplit le formulaire ; la ligne grise dit d'où vient chaque champ |
| `12-peremption.png` | encadré d'accent, jamais un aplat rouge |
| `13-suivi.png` · `14-suivi-tension.png` | les gélules, l'anneau, la courbe et le nuage |
| `15-profils.png` | plaques carrées ; les visages sont générés |
| `16-reglages.png` · `17-rappels-du-systeme.png` | chaque réglage est une ligne de relevé |
| `18-alarme.png` | l'écran d'alarme en entier en négatif |
| `19-mode-simple.png` | l'écran du patient : un seul écran, deux boutons |
| `20-vue-du-proche.png` | ce que le proche voit à distance |
| `21-nuit.png` | la même planche, tirée en blanc sur encre |
| `22-bulletin-illustre.png` | chaque prise porte sa case dessinée |
| `23-fiche-urgence.png` | la fiche du portefeuille |
| **`24-en-anglais.png` · `25-reglages-en-anglais.png`** | la même application, l'autre langue |

### Plusieurs langues

La clé est **la phrase française**. `t('Tout valider')` cherche une traduction
et rend le français s'il n'en trouve pas : une phrase non traduite s'affiche
dans la langue d'origine plutôt que de laisser un trou. Le crochet est posé une
seule fois, dans `el({ text })` de `util.js` — toute l'application en bénéficie
sans avoir eu à envelopper six cents chaînes. Dates, jours et séparateurs de
milliers suivent la langue via `Intl`.

Ajouter une langue : un fichier dans `js/lang/`, une entrée dans `LANGUES`.

### La devise

Changer de devise **propose de convertir** les prix enregistrés, montre le taux
et ce que deviennent trois vrais prix du dossier, et laisse corriger le taux à
la main. Les taux sont embarqués — donc datés — et l'application le dit ; seule
la parité du franc CFA est exacte, fixée par traité.

## 02-sorties — chaque fichier que l'application produit

À regarder avant de toucher à `bulletin.js`, `ics.js`, `qr.js`, `buildReport()`
ou `buildCardSheet()`.

| Fichier | Produit par | Règle |
|---|---|---|
| `01-bulletin-du-jour.png` | `bulletin.js → dayText()` | **aucun emoji.** Voir « les deux registres » plus bas |
| `02-bilan-de-la-semaine.png` | `weekText()` | la barre `▮▯` est un caractère : elle survit au copier-coller |
| `03-liste-pharmacie.png` | `refillText()` | calculée sur le stock réel ; le total n'apparaît que si les prix existent |
| `04-fiche-urgence-texte.png` | `emergencyText()` | lisible sans l'application |
| `05-fiche-urgence-qr.png` | `qr.js` | encodeur écrit à la main, 40 versions, 4 niveaux. Aucun service en ligne |
| `06-export-agenda-ics.png` | `ics.js → buildICS()` | l'agenda sonne même application fermée |
| `07-sauvegarde-sql.png` | `db.js → toSQL()` | un vrai dump SQLite |
| **`08-rapport-medecin.png` / `.pdf`** | `app.js → buildReport()` | **le style complet au tirage** : plaque signalétique, filets, capitales, cases dessinées |
| **`09-fiche-urgence-imprimee.png` / `.pdf`** | `urgence.js → buildCardSheet()` | **un seul exemplaire** par défaut |
| `10-fiche-urgence-en-double.png` | idem, `copies: 2` | le second exemplaire est une **case à cocher**, pas un défaut |

`sorties.html`, joint ici et servi par le projet, produit ces images en
appelant les vraies fonctions. Le rouvrir après toute modification suffit.

### Les deux registres de marques

Il n'y a **aucun emoji** dans le projet — ils ne se rendent pas de la même
façon d'un téléphone à l'autre, et un lecteur d'écran ne les lit pas.
À la place, quatre marques, dans deux registres :

| Statut | Texte envoyé | À l'écran et à l'impression |
|---|---|---|
| pris | `■` | une case cochée, tracée à la main |
| oublié | `▲` | une case barrée d'une croix, au trait plus fort |
| sauté | `▨` | une case hachurée — la matière de la planche |
| à venir | `□` | une case vide, au trait léger |

Le texte garde des caractères parce qu'il doit survivre à un copier-coller dans
n'importe quelle messagerie. Partout où l'on peut dessiner, c'est la case
dessinée qui s'affiche. `statusOfLine()` relit le texte déjà fabriqué : les deux
registres ne peuvent donc pas diverger. Tables : `MARK_TEXT`, `MARK_ICON`,
`MARK_LABEL`, en tête de `bulletin.js`.

## 03-dessins — tout est tracé par le code

Il n'y a pas un seul fichier image d'illustration dans le projet. Les PNG de
`public/icons/` sont **générés** depuis `illus.js` par `tools/render-icons.mjs`.

| Fichier | Contenu |
|---|---|
| `01-icones-et-illustrations.png` | les 50 icônes et les cinq scènes d'écran vide |
| `02-visages-generes.png` | soixante visages tirés par le générateur (`avatars.js`) |
| **`03-les-quatre-marques.png`** | les cases de statut, de 14 à 64 px |
| **`04-plan-isometrique.png`** | l'architecture en volumes : hauteur = poids en lignes, densité de hachure = nombre de décisions, position = couche |
| `05` · `06` · `07` | la même icône à 16, 18, 20, 24 px, et le logo à cinq tailles |
| **`08-les-cinq-graphiques.png`** | gélules, courbe, anneau fendu, nuage, fil |

### Les graphiques

Les formes viennent d'une référence monochrome : lignes à bouts ronds, barres
arrondies, aires courbes, anneau fendu, nœuds ronds. Les **dégradés** y sont
remplacés par la **hachure** — la seule matière que la planche autorise.
Et dans un pilulier, une barre est une gélule : elle se remplit à mesure que
les prises sont validées.

`hatchInside()` (dans `draw.js`) calcule les entrées et sorties de chaque
diagonale dans la silhouette : la hachure s'arrête pile au bord, sans masque
SVG, donc elle tient aussi à l'impression.

**Ce sont des dessins, pas des icônes téléchargées.** Le trait tremble, repasse
deux fois et dépasse aux extrémités : c'est le geste de la main. Les fonctions
qui le produisent sont `pen`, `penLoop`, `fan`, `hatch` et `hachureFace` dans
`draw.js` / `illus.js`. Une nouvelle icône doit passer par elles.

## 04-style — la spécification

| Fichier | Contenu |
|---|---|
| `01-planche-de-style.png` | palette, échelle typographique, espacements, géométrie, mouvement, composants, les 50 icônes, et ce que le style interdit |
| `02-documentation-dans-le-style.jpg` | la documentation embarquée (`doc.html`) en entier |
| `03-documentation-le-plan.jpg` | la section « Sous le capot » avec le plan isométrique et sa légende |
| `theme.css` | **la seule source des valeurs** — à lire en premier |
| `app.css` | forme des composants ; aucune valeur brute, et un test le vérifie |
| `style.html` | la page qui engendre la planche, à rouvrir après toute modification |

## L'application Android

`android/` dans le projet : une **coque native** autour de la même application.
Sept fichiers Java, **aucune dépendance**, moins d'un mégaoctet. Elle apporte
une seule chose — `setAlarmClock()`, le mécanisme du réveil du téléphone :
les prises sonnent à la seconde près, écran éteint et téléphone verrouillé.

Le web garde toute la logique ; `Rappels.java` ne fait que poser les alarmes.
`check.mjs` vérifie que chaque méthode appelée depuis `native.js` existe côté
Java — c'est la seule chose qui empêche les deux mondes de se mentir.

**Pas besoin d'Android Studio.** `node tools/verifier-android.mjs` (joint ici)
dit ce qui manque — JDK, SDK, plateforme, build-tools — et donne la commande
exacte pour chaque chose. Le wrapper Gradle est dans le dépôt.

`ANDROID.md`, joint ici, est le mode d'emploi complet : compiler, signer,
ce que fait chaque fichier, et les deux réglages Android qui peuvent faire
taire un rappel.

## 05-references-origine — d'où vient le style

- `planche-technique-*.jpg` — la grammaire adoptée : monospace, filets, plaque
  signalétique, micro-libellés en capitales espacées, aucun arrondi.
  **Pris :** la mise en page et le registre.
  **Écarté :** l'animation, le corps de texte à 10–11 px, le fond sombre.
- `planche-technique-tableau-de-bord.jpg` — le même registre à haute densité :
  panneaux latéraux, jauges, un seul accent rouge réservé à l'alerte.
- **`planche-doc-isometrique.jpg`** — la référence du plan en volumes :
  blocs hachurés sur grille isométrique, fond kaki, étiquettes courtes.
  C'est de là que vient `archDiagram()` dans `illus.js`.
- `dessins-a-la-main-*.jpg` — la référence des visages et du trait dessiné.

---

## Les dix règles à ne pas casser

1. **Zéro dépendance.** Pas de bundler, pas de framework, pas d'étape de build.
2. **Hors-ligne intégral.** Aucun appel réseau sauf `/api/sync`, activé explicitement.
3. **Aucune image.** Tout est tracé par `draw.js` / `icons.js` / `illus.js` / `avatars.js`.
4. **Aucune valeur brute dans `app.css`.** Tout vient de `theme.css`.
5. **Aucun emoji.** Nulle part. Voir « les deux registres » ci-dessus.
6. **L'impression garde le style.** Papier kaki, filets, accents — jamais de `background:#fff`.
7. **Mouvement minimal.** Fondus de 80–130 ms, et un seul clignotement — celui qui porte une information.
8. **Français partout**, et les commentaires expliquent **pourquoi**, jamais **quoi**.
9. **Prudence médicale.** L'application ne dit jamais « arrête », elle dit « demande ».
10. **Rien ne sort du téléphone sans un geste explicite.**

`CLAUDE.md` développe chacune et donne la carte du code.

## Vérifier

```bash
node tools/check.mjs     # 146 vérifications, aucune dépendance
python3 tools/e2e.py     # 42 parcours dans un vrai navigateur
```

`check.mjs` échoue si une valeur brute réapparaît dans `app.css`, si une
capitale est forcée en dur, **si un emoji revient**, si un statut perd sa case
dessinée, si un module se retrouve vide, ou si le pont Java et le pont JavaScript
cessent de s'accorder.
