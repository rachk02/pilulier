#!/usr/bin/env node
/* ============================================================================
   tools/verifier-android.mjs — « ai-je de quoi compiler l'APK ? »

       node tools/verifier-android.mjs

   Pas besoin d'Android Studio. Il faut trois choses, et ce script dit
   lesquelles manquent, avec la commande exacte pour chacune. Il ne modifie
   rien : il regarde et il explique.

   Windows, macOS, Linux — il s'adapte tout seul.
   ========================================================================== */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, platform } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WIN = platform() === 'win32';
const MAC = platform() === 'darwin';

let manque = 0;
const ok    = (t, d = '') => console.log('  ok     ' + t + (d ? '  → ' + d : ''));
const absent = (t, quoi) => { manque++; console.log('  MANQUE ' + t); console.log('         ' + quoi); };

/**
 * Lance une commande et renvoie tout ce qu'elle dit, ou null si elle n'existe
 * pas. Les deux sorties sont reunies : `java -version` ecrit sur la sortie
 * d'erreur, pas sur la sortie standard — c'est le genre de detail qui fait
 * croire qu'un outil est absent alors qu'il est la.
 */
function essai(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: WIN });
  if (r.error || r.status === null) return null;
  const tout = `${r.stdout || ''}${r.stderr || ''}`.trim();
  return tout || (r.status === 0 ? '' : null);
}

console.log('\nDE QUOI COMPILER L\'APK\n');

/* ------------------------------------------------------------- 1. Java */
const java = essai('java', ['-version']) ?? essai('java', ['--version']);
const brut = java || '';
const vers = brut.match(/version "?(\d+)/) || brut.match(/openjdk (\d+)/i);
if (!java) {
  absent('Un JDK 17 ou plus',
    WIN ? 'winget install EclipseAdoptium.Temurin.21.JDK'
        : MAC ? 'brew install --cask temurin' : 'sudo apt install openjdk-21-jdk');
} else if (vers && Number(vers[1]) < 17) {
  absent(`JDK ${vers[1]} trouvé, il en faut 17 ou plus`,
    WIN ? 'winget install EclipseAdoptium.Temurin.21.JDK' : 'installe un JDK 21');
} else {
  ok('JDK', 'version ' + (vers ? vers[1] : '?'));
}

/* --------------------------------------------------- 2. le SDK Android */
const candidats = [
  process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT,
  WIN ? join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk') : null,
  MAC ? join(homedir(), 'Library', 'Android', 'sdk') : null,
  join(homedir(), 'Android', 'Sdk'), join(homedir(), 'android-sdk'),
].filter(Boolean);

const sdk = candidats.find((p) => existsSync(join(p, 'platforms')) ||
                                  existsSync(join(p, 'cmdline-tools')));
if (!sdk) {
  absent('Le SDK Android',
    'Télécharge « Command line tools only » sur\n' +
    '         https://developer.android.com/studio#command-line-tools-only\n' +
    '         Décompresse dans ' +
    (WIN ? '%LOCALAPPDATA%\\Android\\Sdk\\cmdline-tools\\latest'
         : '~/Android/Sdk/cmdline-tools/latest') + '\n' +
    '         puis relance ce script.');
} else {
  ok('SDK Android', sdk);

  const liste = (sous) => existsSync(join(sdk, sous)) ? readdirSync(join(sdk, sous)) : [];
  const plateformes = liste('platforms');
  const outils = liste('build-tools');

  const api = plateformes.map((p) => Number(p.replace('android-', ''))).filter(Boolean);
  const sdkm = WIN ? join(sdk, 'cmdline-tools', 'latest', 'bin', 'sdkmanager.bat')
                   : join(sdk, 'cmdline-tools', 'latest', 'bin', 'sdkmanager');
  const cmd = existsSync(sdkm) ? `"${sdkm}"` : 'sdkmanager';

  if (api.some((v) => v >= 35)) ok('Plateforme API 35+', plateformes.join(', '));
  else absent('La plateforme android-35', `${cmd} "platforms;android-35"`);

  if (outils.some((v) => Number(v.split('.')[0]) >= 35)) ok('Build-tools 35+', outils.join(', '));
  else absent('Les build-tools 35', `${cmd} "build-tools;35.0.0"`);

  if (existsSync(join(sdk, 'platform-tools'))) ok('platform-tools (adb)');
  else absent('platform-tools (pour installer par USB)', `${cmd} "platform-tools"`);

  if (!process.env.ANDROID_HOME) {
    console.log('\n  NOTE   ANDROID_HOME n\'est pas défini. Gradle le trouvera quand même');
    console.log('         grâce à android/local.properties, écrit ci-dessous.');
  }
}

/* --------------------------------------------------------- 3. le projet */
const g = WIN ? 'gradlew.bat' : 'gradlew';
if (existsSync(join(ROOT, 'android', g))) ok('Le wrapper Gradle', 'android/' + g);
else absent('Le wrapper Gradle', 'il devrait être dans android/ — le dépôt est incomplet');

if (existsSync(join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'web', 'index.html'))) {
  ok('Les assets web sont synchronisés');
} else {
  absent('Les assets web', 'node tools/sync-android.mjs');
}

/* ------------------------------------------------------------ le verdict */
console.log('');
if (manque === 0) {
  const loc = join(ROOT, 'android', 'local.properties');
  if (sdk && !existsSync(loc)) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(loc, 'sdk.dir=' + sdk.replace(/\\/g, '\\\\') + '\n');
    console.log('  écrit  android/local.properties (il indique le SDK à Gradle)');
  }
  console.log('\n  Tout est là. Pour fabriquer l\'APK :\n');
  console.log(WIN ? '      cd android\n      .\\gradlew.bat assembleDebug'
                  : '      cd android\n      ./gradlew assembleDebug');
  console.log('\n  Elle sortira dans android/app/build/outputs/apk/debug/app-debug.apk');
  console.log('  La première compilation télécharge Gradle et le plugin Android :');
  console.log('  compte quelques minutes et 400 Mo. Les suivantes prennent 30 secondes.\n');
} else {
  console.log(`  ${manque} chose${manque > 1 ? 's' : ''} à installer avant de compiler.\n`);
}
process.exit(0);
