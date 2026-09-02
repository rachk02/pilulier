package com.elimmeka.pilulier;

import android.content.Context;
import android.webkit.WebResourceResponse;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Assets — sert le dossier `public/` depuis l'interieur de l'APK.
 *
 * On n'emploie pas WebViewAssetLoader (il vient d'AndroidX, et AndroidX
 * pesait plus lourd que toute l'application). Une trentaine de lignes
 * suffisent : le chemin est nettoye, le type MIME devine par l'extension, et
 * tout ce qui sort du dossier est refuse.
 */
final class Assets {

  private final Context ctx;
  Assets(Context c) { ctx = c.getApplicationContext(); }

  private static final Map<String, String> TYPES = new HashMap<>();
  static {
    TYPES.put("html", "text/html");
    TYPES.put("js",   "text/javascript");
    TYPES.put("mjs",  "text/javascript");
    TYPES.put("css",  "text/css");
    TYPES.put("json", "application/json");
    TYPES.put("webmanifest", "application/manifest+json");
    TYPES.put("svg",  "image/svg+xml");
    TYPES.put("png",  "image/png");
    TYPES.put("jpg",  "image/jpeg");
    TYPES.put("jpeg", "image/jpeg");
    TYPES.put("ico",  "image/x-icon");
    TYPES.put("woff", "font/woff");
    TYPES.put("woff2","font/woff2");
    TYPES.put("txt",  "text/plain");
    TYPES.put("ics",  "text/calendar");
  }

  /** Les en-tetes que le navigateur attend d'un vrai serveur. */
  private static Map<String, String> entetes() {
    Map<String, String> h = new HashMap<>();
    h.put("Access-Control-Allow-Origin", MainActivity.ORIGINE);
    h.put("Cache-Control", "no-cache");
    /* Une page servie depuis l'APK ne doit joindre personne d'autre que la
       fonction de synchronisation, et seulement si elle est activee. */
    h.put("X-Content-Type-Options", "nosniff");
    return h;
  }

  WebResourceResponse repondre(String chemin) {
    String p = chemin.split("[?#]")[0];
    if (p.isEmpty() || p.endsWith("/")) p += "index.html";
    /* Aucune remontee de dossier : `..` ne doit jamais atteindre la racine
       des assets, ou l'application pourrait lire autre chose qu'elle-meme. */
    if (p.contains("..")) return null;

    String ext = p.lastIndexOf('.') > 0 ? p.substring(p.lastIndexOf('.') + 1).toLowerCase() : "";
    String type = TYPES.containsKey(ext) ? TYPES.get(ext) : "application/octet-stream";
    String encodage = type.startsWith("text/") || type.contains("json")
        || type.contains("javascript") || type.contains("svg") ? "utf-8" : null;

    try {
      InputStream flux = ctx.getAssets().open("web/" + p);
      return new WebResourceResponse(type, encodage, 200, "OK", entetes(), flux);
    } catch (IOException absent) {
      /* Une route de l'application (#/today) n'est pas un fichier : la coque
         renvoie index.html, comme le ferait n'importe quel serveur statique. */
      if (!p.contains(".")) {
        try {
          return new WebResourceResponse("text/html", "utf-8", 200, "OK", entetes(),
              ctx.getAssets().open("web/index.html"));
        } catch (IOException e) { /* rien a faire */ }
      }
      return new WebResourceResponse("text/plain", "utf-8", 404, "Absent",
          entetes(), null);
    }
  }
}
