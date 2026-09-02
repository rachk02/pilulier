# Le pont JavaScript est appele par reflexion depuis la WebView : ses methodes
# annotees doivent survivre a l'optimisation, sinon l'application se tait.
-keepclassmembers class com.elimmeka.pilulier.Pont {
  @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
