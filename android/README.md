# Pilulier — l'application Android

Une **coque native** autour de l'application de `public/`. Elle n'apporte
qu'une chose, mais c'est la seule qui manquait : **des alarmes qui sonnent
vraiment**, à l'heure exacte, téléphone verrouillé et écran éteint.

- **Aucune dépendance.** Ni AndroidX, ni Material, ni bibliothèque WebView.
  Sept fichiers Java, 755 lignes. L'APK pèse **moins d'un mégaoctet**.
- **Aucun serveur.** L'application est servie depuis les assets de l'APK,
  sous l'origine `https://pilulier.local/`. Rien à héberger, rien à taper.
- **Aucun compte.** Les données restent dans la WebView du téléphone.

---

## Compiler

**Pas besoin d'Android Studio.** Il faut un JDK 17+ et le SDK Android (API 35).

D'abord, savoir ce qui manque :

```bash
node tools/verifier-android.mjs
```

Il vérifie le JDK, cherche le SDK aux endroits habituels, contrôle la
plateforme et les build-tools, et **écrit `android/local.properties`** dès
qu'il trouve un SDK — c'est ce fichier qui fait disparaître l'erreur
*« SDK location not found »*.

S'il manque le SDK, sous Windows :

```powershell
powershell -ExecutionPolicy Bypass -File tools\installer-sdk-android.ps1
```

Le script télécharge les *command line tools* de Google, les range au bon
endroit, accepte les licences, installe la plateforme 35 et les build-tools,
et écrit `local.properties`. Il se relance sans risque. Le fichier contient
aussi, en commentaire à la fin, les cinq commandes équivalentes si tu préfères
tout faire à la main.

Ensuite :

```bash
cd android
./gradlew assembleDebug        # APK de test, signée avec la clé de debug
```

L'APK sort dans `android/app/build/outputs/apk/debug/app-debug.apk`.
Copie-la sur le téléphone et ouvre-la : Android demandera d'autoriser
l'installation depuis cette source, c'est normal pour une application qui ne
vient pas du Play Store.

> `assembleDebug` suffit pour installer chez soi. La version *release* n'est
> utile que pour distribuer.

### Pour une version release signée

```bash
keytool -genkeypair -v -keystore pilulier.jks -alias pilulier \
        -keyalg RSA -keysize 4096 -validity 10000
```

Puis dans `app/build.gradle`, remplace `signingConfig signingConfigs.debug`
par ta configuration, et :

```bash
./gradlew assembleRelease
```

**Garde le `.jks` et son mot de passe.** Sans lui, aucune mise à jour ne
pourra s'installer par-dessus : Android refuse un APK signé par une autre clé.

---

## Ce que fait la coque

| Fichier | Rôle |
|---|---|
| `MainActivity.java` | la WebView, le bouton retour, l'appareil photo |
| `Assets.java` | sert `public/` depuis l'intérieur de l'APK, sans AndroidX |
| `Rappels.java` | pose les alarmes système (`setAlarmClock`) |
| `RecepteurAlarme.java` | l'heure est arrivée : notification + écran plein format |
| `EcranAlarme.java` | l'écran de rappel, dessiné en code, dans le style de la planche |
| `RecepteurDemarrage.java` | ré-arme tout après un redémarrage ou un changement d'heure |
| `Pont.java` | la seule surface par laquelle le web parle au téléphone |

### Pourquoi `setAlarmClock`

C'est le mécanisme du **réveil** du téléphone. Android le sort du mode Doze,
il sonne à la seconde près, et le système affiche même l'icône du prochain
réveil dans la barre d'état. `setExactAndAllowWhileIdle` peut être repoussé ;
une notification web peut arriver une heure en retard ; un onglet fermé ne
sonne pas du tout. Pour un traitement cardiaque, ces trois-là ne suffisent pas.

### Le partage des rôles

Le web garde **toute** la logique : quelles prises, à quelle heure, pour quel
profil. Le natif ne fait qu'exécuter. `native.js` envoie une liste déjà
calculée, `Rappels.java` la stocke et pose les alarmes. Rien n'est calculé
deux fois, donc rien ne peut diverger entre l'écran et la sonnerie.

Les alarmes sont reposées à chaque redessin de l'écran (regroupées, une seule
fois par seconde au plus), quand l'application repasse au premier plan, et
juste avant qu'elle soit mise de côté.

---

## Les assets

`android/app/src/main/assets/web/` est une **copie** de `public/`, faite par
`tools/sync-android.mjs`. Ne l'édite jamais à la main : Gradle la refait avant
chaque compilation. La source est `public/`, et elle seule.

Ce qui n'est pas copié : le service worker et le manifeste web (inutiles ici,
les fichiers sont déjà dans le téléphone), et les planches de travail
(`dessins`, `sorties`, `style`, `marques`, `schema`) qui n'ont rien à faire
dans le téléphone du patient.

---

## Après l'installation

L'application demande deux choses au premier lancement, et il faut dire oui
aux deux — sinon les rappels se taisent sans prévenir :

1. **Les notifications** (Android 13+), demandées automatiquement ;
2. **L'alarme exacte** et la **batterie sans restriction** — *Réglages →
   Rappels du système* dans l'application dit lesquelles manquent et ouvre le
   réglage Android correspondant d'un bouton.

L'export `.ics` vers l'agenda reste disponible : c'est un quatrième filet,
et il ne coûte rien.
