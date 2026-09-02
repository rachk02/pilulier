package com.elimmeka.pilulier;

import android.app.Activity;
import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.content.ContentValues;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import java.io.OutputStream;
import java.util.Locale;

/**
 * Pont — la seule surface par laquelle le web parle au telephone.
 *
 * Elle est volontairement minuscule et sans etat : le web garde toute la
 * logique (quelles prises, a quelle heure, pour quel profil), le natif ne
 * fait qu'executer. Une seule methode compte vraiment, `publierPrises`.
 *
 * Tout ce qui est expose ici est appelable depuis la page. Comme la page vient
 * des assets de l'APK et de nulle part ailleurs, il n'y a pas de tiers a qui
 * cette surface pourrait profiter — mais on n'y met quand meme rien qui
 * puisse lire ou ecrire hors de l'application.
 */
public final class Pont {

  private final Activity hote;
  private final WebView vue;
  private android.speech.tts.TextToSpeech voix;
  /* 0 = on ne sait pas encore, 1 = prete, 2 = aucune voix francaise. */
  private volatile int voixEtat = 0;
  /* Ce qu'on nous a demande de dire avant que le moteur soit pret. */
  private volatile String voixEnAttente = null;
  private volatile float voixVitesse = 1f;

  Pont(Activity a, WebView w) {
    hote = a; vue = w;
    /* Le moteur de synthese est demande DES le demarrage. Son initialisation
       est asynchrone — une demi-seconde, parfois plus — et c'est exactement
       ce qui faisait dire a l'application « aucun moteur de synthese
       vocale » : elle posait la question avant que la reponse existe. */
    preparerLaVoix();
  }

  /** Permet au web de savoir qu'il tourne dans l'APK et non dans Chrome. */
  @JavascriptInterface public String version() { return "2.2.0"; }

  /**
   * Recoit les prochaines prises et arme les vraies alarmes systeme.
   * @param json `[{ "quand": <ms epoch>, "titre": "...", "detail": "...", "heure": "08:00" }]`
   * @return le nombre d'alarmes reellement posees
   */
  @JavascriptInterface public int publierPrises(String json) {
    return Rappels.publier(hote, json == null ? "[]" : json);
  }

  /** Efface tous les rappels poses (changement d'ordonnance, de profil). */
  @JavascriptInterface public void effacerPrises() { Rappels.effacer(hote); }

  /**
   * Tout ce que le systeme autorise, en un seul aller-retour.
   *
   * C'etaient trois methodes separees ; elles racontaient trois moitiés
   * d'histoire, et l'ecran des reglages devait les recoller. Une alarme qui
   * ne sonne pas a rarement une seule cause : c'est la combinaison qui
   * compte, donc c'est la combinaison qu'on rend.
   *
   * @return {"alarmesExactes":bool,"batterieLibre":bool,
   *          "notifications":bool,"pleinEcran":bool,
   *          "voix":"attente"|"prete"|"absente"}
   */
  @JavascriptInterface public String etatDuSysteme() {
    boolean exactes = true;
    if (Build.VERSION.SDK_INT >= 31) {
      AlarmManager am = hote.getSystemService(AlarmManager.class);
      exactes = am != null && am.canScheduleExactAlarms();
    }
    boolean batterie = true;
    if (Build.VERSION.SDK_INT >= 23) {
      android.os.PowerManager pm = hote.getSystemService(android.os.PowerManager.class);
      batterie = pm != null && pm.isIgnoringBatteryOptimizations(hote.getPackageName());
    }
    boolean notifs = Build.VERSION.SDK_INT < 33
        || hote.checkSelfPermission("android.permission.POST_NOTIFICATIONS")
             == android.content.pm.PackageManager.PERMISSION_GRANTED;
    /* Android 14 : ouvrir un ecran par-dessus tout demande une autorisation
       a part, accordee d'office aux applications de reveil et de telephonie
       seulement. Sans elle, la notification s'affiche mais l'ecran ne
       s'ouvre pas — exactement la panne qu'on vient de corriger. */
    boolean plein = true;
    if (Build.VERSION.SDK_INT >= 34) {
      android.app.NotificationManager nm =
          hote.getSystemService(android.app.NotificationManager.class);
      plein = nm != null && nm.canUseFullScreenIntent();
    }
    return "{\"alarmesExactes\":" + exactes + ",\"batterieLibre\":" + batterie
         + ",\"notifications\":" + notifs + ",\"pleinEcran\":" + plein
         + ",\"voix\":\"" + etatDeLaVoix() + "\"}";
  }

  /** Ouvre le reglage d'Android 14 qui autorise l'ecran plein format. */
  @JavascriptInterface public void demanderAlarmePleinEcran() {
    if (Build.VERSION.SDK_INT >= 34) {
      try {
        hote.startActivity(new Intent(
            Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
            Uri.parse("package:" + hote.getPackageName())));
        return;
      } catch (Exception ignore) { }
    }
    ouvrirReglageNotifications();
  }

  /* ========================================================================
     L'ALARME QUI A REVEILLE L'APPLICATION
     Le systeme nous a lances ; le web vient chercher de quoi il s'agit. La
     lecture EFFACE : une alarme ne se consomme qu'une fois, sinon elle
     reviendrait a chaque retour au premier plan.
     ====================================================================== */
  @JavascriptInterface public String alarmeEnAttente() {
    String v = Rappels.enAttente;
    Rappels.enAttente = "";
    return v == null ? "" : v;
  }

  /** L'ecran de l'application a pris le relais : la notification n'a plus
      lieu d'etre, et sa sonnerie systeme non plus. */
  @JavascriptInterface public void taireNotification() {
    try {
      android.app.NotificationManager nm =
          hote.getSystemService(android.app.NotificationManager.class);
      if (nm != null) nm.cancel(RecepteurAlarme.ID_NOTIF);
    } catch (Exception ignore) { }
  }

  /**
   * Qui sonne : le telephone, ou l'application ?
   *
   * Un canal de notification est fige des sa creation — sa sonnerie ne peut
   * plus changer. Il y a donc deux canaux, et ce reglage dit lequel employer.
   */
  @JavascriptInterface public void reglerSonSysteme(boolean actif) {
    Rappels.prefs(hote).edit().putBoolean(Rappels.CLE_SON_SYSTEME, actif).apply();
  }

  /** Ouvre le reglage systeme correspondant, plutot que d'expliquer un chemin. */
  @JavascriptInterface public void ouvrirReglageAlarmes() {
    if (Build.VERSION.SDK_INT < 31) return;
    try {
      hote.startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
          Uri.parse("package:" + hote.getPackageName())));
    } catch (Exception ignore) { }
  }

  /*
   * On demande l'exemption DIRECTEMENT, avec une boite de dialogue oui/non.
   * L'ancien chemin ouvrait la liste de toutes les applications du telephone,
   * ou il fallait retrouver Pilulier a la main : personne n'y arrivait, et le
   * bouton restait sur « Regler » indefiniment. La liste sert de repli si le
   * constructeur a retire la boite de dialogue.
   */
  @JavascriptInterface public void ouvrirReglageBatterie() {
    if (Build.VERSION.SDK_INT >= 23) {
      try {
        hote.startActivity(new Intent(
            Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
            Uri.parse("package:" + hote.getPackageName())));
        return;
      } catch (Exception ignore) { }
    }
    try {
      hote.startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
    } catch (Exception ignore) { }
  }

  /** Partager un bulletin par n'importe quelle messagerie installee. */
  @JavascriptInterface public void partager(String texte, String titre) {
    try {
      Intent envoi = new Intent(Intent.ACTION_SEND).setType("text/plain")
          .putExtra(Intent.EXTRA_TEXT, texte)
          .putExtra(Intent.EXTRA_SUBJECT, titre == null ? "Pilulier" : titre);
      hote.startActivity(Intent.createChooser(envoi, titre));
    } catch (Exception ignore) { }
  }

  /* ========================================================================
     L'IMPRESSION

     `window.print()` ne fait RIEN dans une WebView : la methode existe, elle
     ne leve pas d'erreur, et il ne se passe rien — c'est pourquoi le bouton
     paraissait mort. Le seul chemin est le service d'impression d'Android,
     auquel on donne un adaptateur fabrique par la WebView elle-meme. On
     imprime donc exactement ce qui est a l'ecran, avec le bloc `@media print`
     de l'application : le papier kaki, les filets, les accents.
     ====================================================================== */
  @JavascriptInterface public boolean imprimer(final String nom) {
    final String titre = (nom == null || nom.trim().isEmpty()) ? "Pilulier" : nom.trim();
    try {
      hote.runOnUiThread(new Runnable() { public void run() {
        try {
          PrintManager pm = (PrintManager) hote.getSystemService(Context.PRINT_SERVICE);
          if (pm == null) return;
          PrintDocumentAdapter ad = vue.createPrintDocumentAdapter(titre);
          pm.print(titre, ad, new PrintAttributes.Builder()
              .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
              .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
              .build());
        } catch (Exception ignore) { }
      } });
      return true;
    } catch (Exception e) { return false; }
  }

  /* ========================================================================
     LES FICHIERS

     Une WebView ignore `<a download>` et les URL `blob:` : la sauvegarde,
     l'export SQL et le fichier .ics ne partaient nulle part, sans un mot.
     On ecrit dans le dossier Telechargements du telephone, par MediaStore
     quand il existe (Android 10+), sinon a l'ancienne.
     ====================================================================== */
  @JavascriptInterface public String enregistrerFichier(String nom, String mime, String b64) {
    if (nom == null || nom.isEmpty() || b64 == null) return "";
    byte[] data;
    try { data = Base64.decode(b64, Base64.DEFAULT); }
    catch (Exception e) { return ""; }
    final String type = (mime == null || mime.isEmpty()) ? "application/octet-stream" : mime;
    try {
      if (Build.VERSION.SDK_INT >= 29) {
        ContentValues v = new ContentValues();
        v.put(MediaStore.Downloads.DISPLAY_NAME, nom);
        v.put(MediaStore.Downloads.MIME_TYPE, type);
        v.put(MediaStore.Downloads.IS_PENDING, 1);
        Uri cible = hote.getContentResolver()
            .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
        if (cible == null) return "";
        OutputStream os = hote.getContentResolver().openOutputStream(cible);
        if (os == null) return "";
        os.write(data); os.close();
        v.clear(); v.put(MediaStore.Downloads.IS_PENDING, 0);
        hote.getContentResolver().update(cible, v, null, null);
        return "Téléchargements/" + nom;
      }
      java.io.File dir = Environment.getExternalStoragePublicDirectory(
          Environment.DIRECTORY_DOWNLOADS);
      if (!dir.exists() && !dir.mkdirs()) return "";
      java.io.File f = new java.io.File(dir, nom);
      java.io.FileOutputStream fo = new java.io.FileOutputStream(f);
      fo.write(data); fo.close();
      return f.getAbsolutePath();
    } catch (Exception e) { return ""; }
  }

  /* ========================================================================
     LES NOTIFICATIONS
     L'API `Notification` du web n'existe pas dans une WebView. Les rappels
     passent deja par de vraies notifications systeme (Rappels.java) ; il
     manquait seulement de quoi le DIRE, au lieu de parler d'un navigateur.
     ====================================================================== */
  @JavascriptInterface public void demanderNotifications() {
    if (Build.VERSION.SDK_INT < 33) { ouvrirReglageNotifications(); return; }
    if (hote.checkSelfPermission("android.permission.POST_NOTIFICATIONS")
        == android.content.pm.PackageManager.PERMISSION_GRANTED) {
      ouvrirReglageNotifications(); return;
    }
    try {
      hote.requestPermissions(new String[]{ "android.permission.POST_NOTIFICATIONS" }, 42);
    } catch (Exception ignore) { }
  }

  @JavascriptInterface public void ouvrirReglageNotifications() {
    try {
      Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
          .putExtra(Settings.EXTRA_APP_PACKAGE, hote.getPackageName());
      hote.startActivity(i);
    } catch (Exception ignore) {
      try {
        hote.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:" + hote.getPackageName())));
      } catch (Exception ignore2) { }
    }
  }

  /* ========================================================================
     LA VOIX

     `speechSynthesis` existe dans la WebView mais sa liste de voix revient
     souvent vide : l'application annoncait alors « voix … » sans rien dire.
     Android a un moteur de synthese depuis toujours ; on l'utilise
     directement. Aucune bibliotheque : `android.speech.tts` est dans le
     systeme.
     ====================================================================== */
  /**
   * Dire un texte.
   *
   * Si le moteur n'a pas fini de s'initialiser, on ne perd PAS la phrase :
   * on la garde et on la dit des que possible. Sans ca, la toute premiere
   * annonce apres un demarrage tombait dans le vide, sans que rien ne le
   * signale — le pire genre de panne.
   *
   * @return true si la phrase est dite, ou le sera. false si ce telephone
   *         n'a aucune voix francaise : l'appelant peut alors le dire.
   */
  @JavascriptInterface public boolean parler(String texte, float vitesse) {
    if (texte == null || texte.trim().isEmpty()) return false;
    preparerLaVoix();
    float v = vitesse <= 0 ? 1f : Math.max(0.5f, Math.min(1.5f, vitesse));
    if (voixEtat == 2) return false;
    if (voixEtat == 0) { voixEnAttente = texte; voixVitesse = v; return true; }
    return dire(texte, v);
  }

  private boolean dire(String texte, float vitesse) {
    try {
      voix.setSpeechRate(vitesse);
      voix.speak(texte, android.speech.tts.TextToSpeech.QUEUE_FLUSH, null, "pilulier");
      return true;
    } catch (Exception e) { return false; }
  }

  @JavascriptInterface public void taireLaVoix() {
    voixEnAttente = null;
    try { if (voix != null) voix.stop(); } catch (Exception ignore) { }
  }

  /** « attente » tant qu'on ne sait pas : c'est une reponse honnete, et elle
      evite d'annoncer une absence qui n'existe pas. */
  String etatDeLaVoix() {
    return voixEtat == 1 ? "prete" : voixEtat == 2 ? "absente" : "attente";
  }

  private void preparerLaVoix() {
    if (voix != null) return;
    try {
      voix = new android.speech.tts.TextToSpeech(hote,
          new android.speech.tts.TextToSpeech.OnInitListener() {
            public void onInit(int statut) {
              if (statut != android.speech.tts.TextToSpeech.SUCCESS) { voixEtat = 2; return; }
              int r;
              try { r = voix.setLanguage(Locale.FRENCH); }
              catch (Exception e) { voixEtat = 2; return; }
              boolean bonne = r != android.speech.tts.TextToSpeech.LANG_MISSING_DATA
                           && r != android.speech.tts.TextToSpeech.LANG_NOT_SUPPORTED;
              voixEtat = bonne ? 1 : 2;
              /* La phrase mise de cote pendant l'initialisation. */
              String garde = voixEnAttente;
              voixEnAttente = null;
              if (bonne && garde != null) dire(garde, voixVitesse);
            }
          });
    } catch (Exception e) { voix = null; voixEtat = 2; }
  }

  /** Une petite vibration de confirmation, quand une prise est validee. */
  @JavascriptInterface public void vibrer(int ms) {
    android.os.Vibrator v = (android.os.Vibrator)
        hote.getSystemService(Context.VIBRATOR_SERVICE);
    if (v == null || !v.hasVibrator()) return;
    int d = Math.max(1, Math.min(ms, 400));
    if (Build.VERSION.SDK_INT >= 26) {
      v.vibrate(android.os.VibrationEffect.createOneShot(d,
          android.os.VibrationEffect.DEFAULT_AMPLITUDE));
    } else {
      v.vibrate(d);
    }
  }
}
