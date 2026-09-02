<#
  tools/installer-sdk-android.ps1 — installer le SDK Android sans Android Studio.

      cd C:\Users\...\pilulier-app
      powershell -ExecutionPolicy Bypass -File tools\installer-sdk-android.ps1

  Ce que fait le script, et rien d'autre :
    1. verifie qu'un JDK 17+ est present ;
    2. telecharge les « command line tools » de Google (~150 Mo) ;
    3. les range dans %LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest ;
    4. accepte les licences, installe la plateforme 35, les build-tools et adb ;
    5. ecrit android\local.properties pour que Gradle trouve tout ca.

  Il ne touche a rien d'autre, n'installe aucun logiciel systeme, et se
  relance sans risque : ce qui est deja la est saute.

  Si tu preferes tout faire a la main, la section « A LA MAIN » en bas du
  fichier donne les cinq commandes equivalentes.
#>

$ErrorActionPreference = 'Stop'
$racine  = Split-Path -Parent $PSScriptRoot
$sdk     = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$outils  = Join-Path $sdk 'cmdline-tools\latest'

function Titre($t) { Write-Host "`n=== $t" -ForegroundColor Cyan }
function Bien($t)  { Write-Host "  ok     $t" -ForegroundColor Green }
function Info($t)  { Write-Host "  ...    $t" }
function Stop2($t) { Write-Host "  ARRET  $t" -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------- 1. le JDK
<#
  Deux pieges, tous les deux rencontres en vrai :

  1. `winget install` met le JDK dans le PATH de la MACHINE, mais le terminal
     deja ouvert garde l'ancien : `java` y reste introuvable jusqu'a ce qu'on
     ouvre une nouvelle fenetre. On ne se contente donc pas du PATH — on va
     chercher le JDK la ou les installeurs le posent.

  2. `java -version` ecrit sur la sortie d'ERREUR, pas la sortie standard.
     Avec $ErrorActionPreference = 'Stop', Windows PowerShell 5.1 transforme
     cette sortie en erreur bloquante : le script croyait alors qu'il n'y
     avait aucun Java alors qu'il etait installe. D'ou le garde-fou ci-dessous.
#>
Titre 'Java'

function Trouver-Java {
  # a. deja dans le PATH de cette fenetre ?
  $c = Get-Command java.exe -ErrorAction SilentlyContinue
  if ($c) { return Split-Path -Parent (Split-Path -Parent $c.Source) }

  # b. JAVA_HOME, si quelqu'un l'a pose
  foreach ($p in @($env:JAVA_HOME,
                   [Environment]::GetEnvironmentVariable('JAVA_HOME', 'User'),
                   [Environment]::GetEnvironmentVariable('JAVA_HOME', 'Machine'))) {
    if ($p -and (Test-Path (Join-Path $p 'bin\java.exe'))) { return $p }
  }

  # c. les endroits ou les installeurs posent un JDK
  $bases = @(
    "$env:ProgramFiles\Eclipse Adoptium",
    "$env:ProgramFiles\Java",
    "$env:ProgramFiles\Microsoft",
    "$env:ProgramFiles\Amazon Corretto",
    "$env:ProgramFiles\Zulu",
    "${env:ProgramFiles(x86)}\Eclipse Adoptium",
    "$env:LOCALAPPDATA\Programs\Eclipse Adoptium"
  )
  $trouves = @()
  foreach ($b in $bases) {
    if (-not (Test-Path $b)) { continue }
    $trouves += Get-ChildItem $b -Directory -ErrorAction SilentlyContinue |
      Where-Object { Test-Path (Join-Path $_.FullName 'bin\java.exe') } |
      ForEach-Object { $_.FullName }
  }
  if ($trouves.Count) { return ($trouves | Sort-Object -Descending)[0] }
  return $null
}

$jdk = Trouver-Java
if (-not $jdk) {
  Stop2 @"
Aucun JDK trouve.
         Installe-le :   winget install EclipseAdoptium.Temurin.21.JDK
         puis OUVRE UNE NOUVELLE FENETRE PowerShell et relance ce script.
         (le terminal deja ouvert garde l'ancien PATH — c'est la cause la
          plus frequente de ce message juste apres une installation reussie)
"@
}

# On rend ce JDK visible pour CETTE fenetre : le reste du script, et Gradle
# ensuite, en ont besoin.
$env:JAVA_HOME = $jdk
$env:PATH = (Join-Path $jdk 'bin') + ';' + $env:PATH

# La version, lue sans laisser PowerShell prendre la sortie d'erreur pour une panne.
$avant = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$v = (cmd /c "`"$(Join-Path $jdk 'bin\java.exe')`" -version 2>&1") -join ' '
$ErrorActionPreference = $avant

if ($v -match 'version "?(\d+)') {
  if ([int]$Matches[1] -lt 17) {
    Stop2 "JDK $($Matches[1]) trouve ($jdk), il en faut 17 ou plus. winget install EclipseAdoptium.Temurin.21.JDK"
  }
  Bien "JDK $($Matches[1])  →  $jdk"
} else {
  Bien "JDK trouve  →  $jdk"
}

# Et pour les prochaines fois, si personne ne l'a fait.
if (-not [Environment]::GetEnvironmentVariable('JAVA_HOME', 'User')) {
  [Environment]::SetEnvironmentVariable('JAVA_HOME', $jdk, 'User')
  Bien 'JAVA_HOME defini pour ton compte (effectif au prochain terminal)'
}

# ------------------------------------------------- 2. les command line tools
Titre 'Les outils en ligne de commande'
if (Test-Path (Join-Path $outils 'bin\sdkmanager.bat')) {
  Bien "deja installes dans $outils"
} else {
  # Le numero de build change a chaque version. On essaie les plus recents
  # connus, du plus recent au plus ancien : Google garde les anciennes URL.
  $builds = @('13114758', '11479570', '11076708', '10406996', '9477386')
  $zip = Join-Path $env:TEMP 'android-cmdline-tools.zip'
  $ok = $false
  $ProgressPreference = 'SilentlyContinue'    # sinon la barre de progression divise la vitesse par dix
  foreach ($b in $builds) {
    $url = "https://dl.google.com/android/repository/commandlinetools-win-${b}_latest.zip"
    Info "essai $b"
    try {
      Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
      if ((Get-Item $zip).Length -gt 50MB) { $ok = $true; Bien "telecharge ($b)"; break }
    } catch { }
  }
  if (-not $ok) {
    Stop2 @"
Telechargement impossible.
         Prends le zip a la main sur
         https://developer.android.com/studio#command-line-tools-only
         puis decompresse-le de sorte a obtenir :
         $outils\bin\sdkmanager.bat
"@
  }

  $tmp = Join-Path $env:TEMP 'android-cmdline-extract'
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $tmp -Force

  # Le zip contient un dossier `cmdline-tools` : son CONTENU doit atterrir
  # dans `latest`, pas le dossier lui-meme. C'est l'erreur classique, et elle
  # se traduit par un sdkmanager qui refuse de demarrer.
  $source = Join-Path $tmp 'cmdline-tools'
  if (-not (Test-Path $source)) { $source = $tmp }
  New-Item -ItemType Directory -Force -Path $outils | Out-Null
  Copy-Item -Path (Join-Path $source '*') -Destination $outils -Recurse -Force
  Remove-Item $zip, $tmp -Recurse -Force -ErrorAction SilentlyContinue
  Bien "installes dans $outils"
}

$sdkmanager = Join-Path $outils 'bin\sdkmanager.bat'
if (-not (Test-Path $sdkmanager)) { Stop2 "sdkmanager introuvable : $sdkmanager" }

# ----------------------------------------------------------- 3. les paquets
Titre 'Les licences'
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
Info 'acceptation (une serie de « y » automatique)'
$avant = $ErrorActionPreference
$ErrorActionPreference = 'Continue'          # sdkmanager parle sur stderr
$y = ("y`n" * 30)
$y | & $sdkmanager --sdk_root="$sdk" --licenses | Out-Null
$ErrorActionPreference = $avant
Bien 'licences acceptees'

Titre 'La plateforme, les build-tools et adb'
Info 'telechargement (~500 Mo la premiere fois)'
$avant = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& $sdkmanager --sdk_root="$sdk" "platforms;android-35" "build-tools;35.0.0" "platform-tools"
$code = $LASTEXITCODE
$ErrorActionPreference = $avant
if ($code -ne 0) { Stop2 "sdkmanager a echoue (code $code)" }
Bien 'installes'

# ------------------------------------------------------- 4. local.properties
Titre 'Dire a Gradle ou est le SDK'
$loc = Join-Path $racine 'android\local.properties'
$ligne = 'sdk.dir=' + ($sdk -replace '\\', '\\')
Set-Content -Path $loc -Value $ligne -Encoding ascii
Bien "android\local.properties → $sdk"

# ------------------------------------------------------- 5. la variable, en plus
if (-not [Environment]::GetEnvironmentVariable('ANDROID_HOME', 'User')) {
  [Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdk, 'User')
  Bien 'ANDROID_HOME defini pour ton compte (effectif au prochain terminal)'
}

Write-Host "`nTout est pret. Pour fabriquer l'APK :`n" -ForegroundColor Green
Write-Host "    cd android"
Write-Host "    .\gradlew.bat assembleDebug`n"
Write-Host "Elle sortira dans android\app\build\outputs\apk\debug\app-debug.apk`n"

<#
  ===================================================================== A LA MAIN

  1. Telecharge « Command line tools only » :
     https://developer.android.com/studio#command-line-tools-only

  2. Decompresse-le de sorte a obtenir EXACTEMENT ce chemin :
     %LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat
     (le zip contient un dossier `cmdline-tools` : c'est son CONTENU qui va
      dans `latest`, pas le dossier lui-meme)

  3. Dans PowerShell :
     cd $env:LOCALAPPDATA\Android\Sdk\cmdline-tools\latest\bin
     .\sdkmanager.bat --licenses
     .\sdkmanager.bat "platforms;android-35" "build-tools;35.0.0" "platform-tools"

  4. De retour dans le projet :
     node tools\verifier-android.mjs        # ecrit android\local.properties

  5. cd android ; .\gradlew.bat assembleDebug
#>
