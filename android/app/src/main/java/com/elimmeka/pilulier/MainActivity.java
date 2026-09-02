package com.elimmeka.pilulier;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

/**
 * MainActivity — la coque.
 *
 * L'application reste celle du dossier `public/`, servie depuis les assets de
 * l'APK : aucun serveur, aucun reseau, aucune adresse a taper. Ce que l'APK
 * apporte par rapport a l'installation depuis Chrome, c'est ce que le
 * navigateur ne sait pas faire — sonner a l'heure exacte quand le telephone
 * dort, et se rallumer apres un redemarrage. Voir Rappels.java.
 *
 * Il n'y a volontairement aucune bibliotheque : ni AndroidX, ni Material.
 * Le projet web n'a aucune dependance, l'APK non plus. C'est ce qui la garde
 * sous le mega-octet et ce qui fait qu'elle compilera encore dans cinq ans.
 */
public class MainActivity extends Activity {

  /** Les assets sont servis sous une origine https : sans elle, pas de
      service worker, pas d'IndexedDB fiable, pas d'appareil photo. */
  static final String ORIGINE = "https://pilulier.local/";

  private WebView vue;
  private ValueCallback<Uri[]> attenteFichier;
  private static final int CODE_FICHIER = 41;
  private static final int CODE_NOTIF = 42;

  @SuppressLint("SetJavaScriptEnabled")
  @Override protected void onCreate(Bundle etat) {
    super.onCreate(etat);

    vue = new WebView(this);
    vue.setLayoutParams(new ViewGroup.LayoutParams(-1, -1));
    setContentView(vue);

    WebSettings s = vue.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);            /* localStorage : le miroir       */
    s.setDatabaseEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(false);  /* les sonneries generees   */
    s.setAllowFileAccess(false);             /* rien hors des assets           */
    s.setAllowContentAccess(false);
    s.setCacheMode(WebSettings.LOAD_DEFAULT);
    s.setTextZoom(100);                      /* la taille se regle dans l'app  */

    vue.setWebViewClient(new Client());
    vue.setWebChromeClient(new Chrome());
    /* Le pont a besoin de la WebView elle-meme pour l'impression : c'est SON
       contenu qu'on imprime, avec la feuille @media print de l'application. */
    vue.addJavascriptInterface(new Pont(this, vue), "Pilulier");

    /* Android 13 demande la permission avant d'afficher la moindre
       notification. On la demande au premier lancement, pas plus tard : sans
       elle, les rappels seraient muets sans que personne le sache. */
    if (Build.VERSION.SDK_INT >= 33 &&
        checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(new String[]{ Manifest.permission.POST_NOTIFICATIONS }, CODE_NOTIF);
    }
    Rappels.creerCanaux(this);

    vue.loadUrl(ORIGINE + "index.html");
    lireAlarme(getIntent());
  }

  /* ========================================================================
     L'ALARME

     Le systeme nous lance lui-meme, par l'intention plein ecran de
     RecepteurAlarme. Deux choses a faire ici, et rien de plus : passer
     par-dessus le verrouillage, et mettre l'alarme de cote pour que le web
     vienne la chercher (Pont.alarmeEnAttente). C'est le web qui dessine
     l'ecran, joue sa sonnerie et parle — comme partout ailleurs.
     ====================================================================== */
  /**
   * Un SEUL point d'entree pour les intentions qui arrivent quand
   * l'application tourne deja. Il y en avait deux — celle du rappel et celle
   * de la notification « voir le jour » — et Java refuse net de compiler
   * deux methodes du meme nom. C'etait le bon refus : deux endroits pour
   * decider quoi faire d'une intention, c'est un endroit de trop.
   */
  @Override protected void onNewIntent(Intent i) {
    super.onNewIntent(i);
    setIntent(i);
    lireAlarme(i);
    /* Ouverte depuis une notification : on va droit sur la prise du jour. */
    if (i != null && i.getBooleanExtra("versAujourdhui", false) && vue != null) {
      vue.evaluateJavascript("location.hash = '#/today'", null);
    }
  }

  private void lireAlarme(Intent i) {
    if (i == null || !i.getBooleanExtra("alarme", false)) return;
    reveiller();
    try {
      JSONObject o = new JSONObject();
      o.put("titre", String.valueOf(i.getStringExtra("titre")));
      o.put("detail", String.valueOf(i.getStringExtra("detail")));
      o.put("heure", String.valueOf(i.getStringExtra("heure")));
      o.put("profil", i.getLongExtra("profil", 0));
      Rappels.enAttente = o.toString();
    } catch (Exception ignore) { Rappels.enAttente = "{}"; }
  }

  /** Allumer l'ecran et passer par-dessus le verrouillage. */
  private void reveiller() {
    if (Build.VERSION.SDK_INT >= 27) {
      setShowWhenLocked(true);
      setTurnScreenOn(true);
      KeyguardManager km = getSystemService(KeyguardManager.class);
      if (km != null) km.requestDismissKeyguard(this, null);
    } else {
      getWindow().addFlags(
          WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
          | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
          | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
    }
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  }

  /** Le bouton « retour » d'Android suit l'historique de l'application : il
      ferme une feuille, revient a l'onglet precedent, puis quitte. */
  @Override public boolean onKeyDown(int code, KeyEvent e) {
    if (code == KeyEvent.KEYCODE_BACK && vue.canGoBack()) { vue.goBack(); return true; }
    return super.onKeyDown(code, e);
  }

  @Override protected void onDestroy() {
    if (vue != null) { vue.destroy(); vue = null; }
    super.onDestroy();
  }

  /* ----------------------------------------------------- le routeur d'assets */

  /**
   * Tout ce qui commence par l'origine locale est lu dans les assets ;
   * le reste — un lien vers WhatsApp, le serveur de synchronisation — part
   * dans le navigateur ou l'application concernee, jamais dans cette WebView.
   */
  private final class Client extends WebViewClient {
    private final Assets assets = new Assets(MainActivity.this);

    @Override public android.webkit.WebResourceResponse
        shouldInterceptRequest(WebView v, WebResourceRequest r) {
      String u = r.getUrl().toString();
      if (u.startsWith(ORIGINE)) return assets.repondre(u.substring(ORIGINE.length()));
      return null;
    }

    @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
      String u = r.getUrl().toString();
      if (u.startsWith(ORIGINE)) return false;
      try {
        startActivity(new Intent(Intent.ACTION_VIEW, r.getUrl())
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
      } catch (Exception ignore) { /* aucune application pour ce lien */ }
      return true;
    }
  }

  /* -------------------------------------------- l'appareil photo et le reste */

  private final class Chrome extends WebChromeClient {

    /** L'input[type=file][capture] de l'ecran « nouvelle boite ». */
    @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> retour,
                                               FileChooserParams p) {
      if (attenteFichier != null) attenteFichier.onReceiveValue(null);
      attenteFichier = retour;
      try {
        startActivityForResult(p.createIntent(), CODE_FICHIER);
        return true;
      } catch (Exception e) {
        attenteFichier = null;
        return false;
      }
    }

    /** Le scan en direct demande l'acces a la camera : on l'accorde a notre
        propre page, jamais a une autre — il n'y en a pas d'autre. */
    @Override public void onPermissionRequest(final PermissionRequest demande) {
      runOnUiThread(() -> {
        for (String r : demande.getResources()) {
          if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) {
            if (checkSelfPermission(Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
              requestPermissions(new String[]{ Manifest.permission.CAMERA }, 43);
              demande.deny();
              return;
            }
          }
        }
        demande.grant(demande.getResources());
      });
    }
  }

  @Override protected void onActivityResult(int code, int resultat, Intent data) {
    if (code == CODE_FICHIER) {
      if (attenteFichier == null) return;
      attenteFichier.onReceiveValue(
          WebChromeClient.FileChooserParams.parseResult(resultat, data));
      attenteFichier = null;
      return;
    }
    super.onActivityResult(code, resultat, data);
  }
}
