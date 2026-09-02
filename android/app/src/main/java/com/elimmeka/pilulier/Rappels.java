package com.elimmeka.pilulier;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Rappels — la seule vraie raison d'avoir une APK.
 *
 * Installee depuis Chrome, l'application ne peut compter que sur trois filets
 * imparfaits : l'agenda du telephone, une notification que l'optimisation de
 * batterie peut retarder, et une alarme qui ne sonne que si l'onglet est
 * ouvert. Ici, on emploie `setAlarmClock()` : c'est le meme mecanisme que le
 * reveil du telephone. Android le sort du mode Doze, il sonne a la seconde
 * pres, telephone verrouille et ecran eteint, et le systeme affiche meme
 * l'icone du prochain reveil dans la barre d'etat.
 *
 * Le web reste la source de verite : `native.js` envoie la liste des prochaines
 * prises, on la stocke telle quelle et on arme les alarmes. Rien n'est calcule
 * deux fois — donc rien ne peut diverger.
 */
public final class Rappels {

  /* Deux canaux pour une seule chose, parce qu'un canal Android est fige des
     sa creation : sa sonnerie ne peut plus changer. Le premier porte la
     sonnerie de reveil du telephone, le second est muet — c'est alors
     l'application qui sonne, avec sa propre sonnerie et sa voix. */
  static final String CANAL_RAPPEL = "rappels";
  static final String CANAL_MUET = "rappels-muet";
  private static final String PREFS = "pilulier";
  private static final String CLE_PRISES = "prochaines";
  static final String CLE_SON_SYSTEME = "sonSysteme";
  /** L'alarme qui vient de reveiller l'application, en attente d'etre lue. */
  static volatile String enAttente = "";
  /** Au-dela, on n'arme plus : le web republiera bien avant. */
  private static final int MAX_ALARMES = 24;

  private Rappels() { }

  /* ------------------------------------------------------------- les canaux */

  static void creerCanaux(Context c) {
    if (Build.VERSION.SDK_INT < 26) return;
    NotificationManager nm = c.getSystemService(NotificationManager.class);
    if (nm == null) return;

    if (nm.getNotificationChannel(CANAL_RAPPEL) == null) {
      NotificationChannel canal = new NotificationChannel(CANAL_RAPPEL,
          c.getString(R.string.canal_rappels), NotificationManager.IMPORTANCE_HIGH);
      commun(c, canal);
      /* La sonnerie de reveil du telephone : elle passe le mode silencieux
         comme une alarme. C'est le filet de securite, celui qui sonne meme si
         le systeme refuse d'ouvrir l'ecran de l'application. */
      canal.setSound(
          RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
          new AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_ALARM)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
      nm.createNotificationChannel(canal);
    }

    if (nm.getNotificationChannel(CANAL_MUET) == null) {
      NotificationChannel muet = new NotificationChannel(CANAL_MUET,
          c.getString(R.string.canal_rappels_muet), NotificationManager.IMPORTANCE_HIGH);
      commun(c, muet);
      muet.setSound(null, null);
      nm.createNotificationChannel(muet);
    }
  }

  private static void commun(Context c, NotificationChannel canal) {
    canal.setDescription(c.getString(R.string.canal_rappels_desc));
    canal.enableVibration(true);
    canal.setVibrationPattern(new long[]{ 0, 400, 250, 400 });
    canal.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    canal.setBypassDnd(false);
  }

  /** Quel canal employer : celui qui sonne, ou le muet quand l'application
      prefere sonner elle-meme avec sa propre sonnerie. */
  static String canal(Context c) {
    return prefs(c).getBoolean(CLE_SON_SYSTEME, true) ? CANAL_RAPPEL : CANAL_MUET;
  }

  /* ------------------------------------------------- ce que le web publie */

  /**
   * Recoit la liste des prochaines prises, au format
   * `[{ "quand": 1756108800000, "titre": "Captopril", "detail": "1/2 cp" }]`,
   * la garde de cote (pour le re-armement apres redemarrage) et arme tout.
   */
  static int publier(Context c, String json) {
    prefs(c).edit().putString(CLE_PRISES, json).apply();
    return armer(c);
  }

  /** Re-arme depuis ce qui a ete publie la derniere fois. */
  static int armer(Context c) {
    String json = prefs(c).getString(CLE_PRISES, "[]");
    AlarmManager am = c.getSystemService(AlarmManager.class);
    if (am == null) return 0;

    int poses = 0;
    try {
      JSONArray liste = new JSONArray(json);
      long maintenant = System.currentTimeMillis();
      for (int i = 0; i < liste.length() && poses < MAX_ALARMES; i++) {
        JSONObject p = liste.getJSONObject(i);
        long quand = p.optLong("quand", 0);
        if (quand <= maintenant + 5_000) continue;      /* deja passe */

        Intent sonne = new Intent(c, RecepteurAlarme.class)
            .setAction("pilulier.SONNE." + i)
            .putExtra("titre", p.optString("titre", "Médicament"))
            .putExtra("detail", p.optString("detail", ""))
            .putExtra("heure", p.optString("heure", ""))
            /* Le profil voyage avec l'alarme : sans lui, l'application
               s'ouvrirait sur le carnet courant, qui n'est pas forcement
               celui dont c'est l'heure. */
            .putExtra("profil", p.optLong("profil", 0));
        PendingIntent pi = PendingIntent.getBroadcast(c, 1000 + i, sonne,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        /* `setAlarmClock` plutot que `setExactAndAllowWhileIdle` : c'est le
           seul mode qu'Android traite comme un reveil, donc le seul qui ne
           soit jamais repousse par l'economiseur de batterie. */
        if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) {
          Intent voir = new Intent(c, MainActivity.class)
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
              .putExtra("versAujourdhui", true);
          PendingIntent afficher = PendingIntent.getActivity(c, 2000 + i, voir,
              PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
          am.setAlarmClock(new AlarmManager.AlarmClockInfo(quand, afficher), pi);
        } else {
          /* La permission d'alarme exacte a ete retiree : on previent quand
             meme, moins precisement, plutot que de se taire. */
          am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, quand, pi);
        }
        poses++;
      }
    } catch (Exception e) {
      return 0;
    }
    return poses;
  }

  /** Efface toutes les alarmes posees (changement d'ordonnance, profil...). */
  static void effacer(Context c) {
    AlarmManager am = c.getSystemService(AlarmManager.class);
    if (am == null) return;
    for (int i = 0; i < MAX_ALARMES; i++) {
      Intent sonne = new Intent(c, RecepteurAlarme.class).setAction("pilulier.SONNE." + i);
      PendingIntent pi = PendingIntent.getBroadcast(c, 1000 + i, sonne,
          PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
      if (pi != null) { am.cancel(pi); pi.cancel(); }
    }
  }

  static SharedPreferences prefs(Context c) {
    return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }
}
