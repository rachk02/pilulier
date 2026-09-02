package com.elimmeka.pilulier;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * RecepteurAlarme — l'heure est arrivee.
 *
 * CE QUI NE MARCHAIT PAS, ET POURQUOI
 * Ce recepteur appelait `startActivity()` pour ouvrir l'ecran d'alarme.
 * Depuis Android 10, un demarrage d'activite depuis l'arriere-plan est
 * PUREMENT ET SIMPLEMENT IGNORE : aucune erreur, aucun message, l'ecran ne
 * s'ouvrait jamais. Il ne restait que la notification, et il fallait ouvrir
 * l'application a la main pour voir le rappel.
 *
 * Le seul chemin qu'Android autorise encore est l'intention plein ecran :
 * une notification a haute importance qui porte `setFullScreenIntent()`. Le
 * systeme lance alors l'activite lui-meme — c'est le mecanisme des reveils
 * et des appels entrants.
 *
 * Une limite a connaitre, qui ne se contourne pas : telephone verrouille ou
 * ecran eteint, l'ecran s'ouvre en grand ; telephone deverrouille et en train
 * d'etre utilise, Android affiche une banniere au lieu d'interrompre. C'est
 * la regle du systeme, pas un reglage.
 */
public class RecepteurAlarme extends BroadcastReceiver {

  static final int ID_NOTIF = 7;

  @Override public void onReceive(Context c, Intent intent) {
    String titre = intent.getStringExtra("titre");
    String detail = intent.getStringExtra("detail");
    String heure = intent.getStringExtra("heure");
    long profil = intent.getLongExtra("profil", 0);
    if (titre == null) titre = "Médicament";

    Rappels.creerCanaux(c);

    /* L'application s'ouvre SUR l'alarme : elle lira ces extras et dessinera
       son propre ecran, avec sa sonnerie et sa voix. Le natif ne dessine
       plus rien — c'est la meme regle que partout ailleurs ici. */
    Intent ouvrir = new Intent(c, MainActivity.class)
        .setAction("pilulier.ALARME")
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP
                  | Intent.FLAG_ACTIVITY_SINGLE_TOP)
        .putExtra("alarme", true)
        .putExtra("titre", titre)
        .putExtra("detail", detail == null ? "" : detail)
        .putExtra("heure", heure == null ? "" : heure)
        .putExtra("profil", profil);

    PendingIntent plein = PendingIntent.getActivity(c, 3000, ouvrir,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

    Notification.Builder b = Build.VERSION.SDK_INT >= 26
        ? new Notification.Builder(c, Rappels.canal(c))
        : new Notification.Builder(c);
    b.setSmallIcon(R.drawable.ic_rappel)
     .setContentTitle(titre + (heure != null && !heure.isEmpty() ? " · " + heure : ""))
     .setContentText(detail == null || detail.isEmpty() ? "C'est l'heure de la prise." : detail)
     .setContentIntent(plein)
     .setAutoCancel(true)
     .setCategory(Notification.CATEGORY_ALARM)
     .setVisibility(Notification.VISIBILITY_PUBLIC);
    if (Build.VERSION.SDK_INT >= 21) {
      b.setPriority(Notification.PRIORITY_MAX);
      /* `true` : l'ecran s'ouvre meme si l'utilisateur a deja vu la
         notification. Un rappel de medicament n'est pas un message. */
      b.setFullScreenIntent(plein, true);
    }

    NotificationManager nm = c.getSystemService(NotificationManager.class);
    if (nm != null) nm.notify(ID_NOTIF, b.build());
  }
}
