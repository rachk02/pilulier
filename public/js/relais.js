/* ============================================================================
   relais.js — l'adresse du relais, posee a la compilation.

   CE FICHIER RESTE VIDE DANS LE DEPOT. C'est volontaire, et `check.mjs` le
   verifie : une adresse ecrite ici finirait dans l'historique Git, et Git
   n'oublie rien.

   Comment elle arrive dans l'APK :
     - on la met dans `android/relais.properties` (ignore par Git), ou dans
       la variable d'environnement PILULIER_RELAIS ;
     - `tools/sync-android.mjs` remplace ce fichier dans les assets copies,
       avant chaque compilation.

   CE QUE CELA FAIT, ET CE QUE CELA NE FAIT PAS
   Cela evite d'avoir a taper l'adresse sur chaque telephone, et cela garde
   l'adresse hors du depot. Cela ne la rend PAS secrete : une APK est une
   archive, `unzip` l'ouvre, `grep` retrouve la chaine en dix secondes. Une
   adresse embarquee dans une application n'est jamais un secret, quel que
   soit le procede. Ce qui protege les donnees, c'est qu'elles sont chiffrees
   AVANT de partir, avec une cle que le relais n'a jamais vue.
   ========================================================================== */
export const RELAIS_COMPILE = '';
