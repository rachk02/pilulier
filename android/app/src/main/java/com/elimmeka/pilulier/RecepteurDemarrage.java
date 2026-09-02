package com.elimmeka.pilulier;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * RecepteurDemarrage — les alarmes ne survivent pas a un redemarrage.
 *
 * Android efface toutes les alarmes posees quand le telephone s'eteint, quand
 * l'application est mise a jour, et quand l'heure ou le fuseau change. Sans
 * ce recepteur, le pilulier se tairait apres la premiere coupure de courant —
 * et personne ne s'en apercevrait avant d'avoir manque plusieurs prises.
 */
public class RecepteurDemarrage extends BroadcastReceiver {
  @Override public void onReceive(Context c, Intent intent) {
    Rappels.creerCanaux(c);
    Rappels.armer(c);
  }
}
