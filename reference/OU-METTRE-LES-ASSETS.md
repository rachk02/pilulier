# Le dossier de référence visuelle

**Décompresse `pilulier-assets.zip` ici**, de sorte que tu obtiennes :

```
pilulier/
  reference/
    INDEX.md
    01-ecrans/
    02-sorties/
    03-dessins/
    04-style/
    05-references-origine/
    ANDROID.md
    CLAUDE.md
```

## Pourquoi ici et pas ailleurs

Ce dossier n'est **pas** une partie de l'application : rien n'y est lu à
l'exécution, et `tools/sync-android.mjs` ne copie que `public/` dans l'APK.
Son seul lecteur, c'est **Claude Code** — et Claude Code ne lit que les
fichiers du projet. Posé à côté du projet, il serait invisible ; posé dedans,
il est trouvé tout seul.

`CLAUDE.md` y renvoie explicitement, donc une nouvelle session le trouve sans
qu'on ait à le dire. Si tu veux forcer la lecture au démarrage :

> lis reference/INDEX.md avant de commencer

## Et Git ?

Le dossier pèse une vingtaine de mégaoctets, presque uniquement des captures.
Deux positions défendables :

- **Le versionner.** C'est un instantané de ce à quoi l'application doit
  ressembler ; il vieillit avec elle et se relit dans un an. C'est ce que je
  recommande : `git add reference/`.
- **L'ignorer.** Si le dépôt doit rester léger, ajoute `reference/` à
  `.gitignore` et garde le zip de côté. Tu perds l'historique visuel.

Les images se régénèrent de toute façon : `python3 tools/e2e.py` refait les
captures d'écran, et les planches `/style.html`, `/sorties.html`,
`/graphiques.html`, `/dessins.html`, `/marques.html`, `/schema.html` se
rouvrent dans un navigateur.
