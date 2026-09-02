#!/usr/bin/env python3
"""
tools/e2e.py — les parcours reels, dans un vrai navigateur.

    npm i -D playwright && npx playwright install chromium
    pip install playwright            # ou : pipx install playwright
    node tools/dev-server.mjs &       # sur le port 5300
    python3 tools/e2e.py

Ce que ca verifie : le demarrage, l'ordonnance de depart, la navigation, la
validation d'une prise, l'ajout d'un medicament et d'un profil, la persistance
apres rechargement, le mode simple, l'ajout par la photo (avec un lecteur de
code-barres simule, absent sous Linux), et la synchronisation entre deux
telephones. Les captures atterrissent dans shots/.

`node tools/check.mjs` couvre le reste et ne demande rien.
"""
import json, os, sys, pathlib
BASE = os.environ.get('BASE', 'http://127.0.0.1:5300')
ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / 'shots'
SHOTS.mkdir(exist_ok=True)

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit("playwright manquant :  pip install playwright && playwright install chromium")

CHROME = os.environ.get('CHROME_PATH')

# Chrome sous Linux ne fournit pas BarcodeDetector ; Android si. On le simule
# pour verifier que notre code exploite correctement ce qu'un vrai lecteur rend.
FAKE_SCANNER = """
window.BarcodeDetector = class {
  static async getSupportedFormats(){ return ['data_matrix','ean_13','qr_code']; }
  async detect(){ return [{ format:'data_matrix',
    rawValue: ']d2' + '01' + '04012345678901' + '17' + '271130' + '10' + 'L4521A' }]; }
};
// TextDetector n'est pas active par defaut dans Chrome : on le simule avec le
// relevé qu'une vraie boite de Clopi Denk produirait.
window.TextDetector = class {
  async detect(){
    const L = (t,h,y) => ({ rawValue:t, boundingBox:{x:0,y:y,width:200,height:h} });
    return [L('Denk',14,10), L('Clopi Denk',46,30), L('75 mg',26,90),
            L('Clopidogrel',18,130), L('30 Filmtabletten',14,170),
            L('Exp.: 11/2027',12,210), L('Ch.-B.: L4521A',12,240)];
  }
};
"""

errs, checks = [], []
def check(nom, cond, detail=''):
    checks.append((nom, bool(cond), detail))
    print(('  ok   ' if cond else '  ECHEC ') + nom + (f'  → {detail}' if detail and not cond else ''))

# La sonde du relais interroge VOLONTAIREMENT un identifiant invalide : la
# fonction repond 400, c'est sa signature. Le navigateur journalise ce 400
# comme une erreur reseau — ce n'en est pas une.
ATTENDUES = ('status of 400 (Bad Request)',)

def hook(pg, tag):
    pg.on('pageerror', lambda e: errs.append(f'{tag}: {e}'))
    pg.on('console', lambda m: errs.append(f'{tag}: {m.text}')
          if m.type == 'error' and not any(a in m.text for a in ATTENDUES) else None)

def dessine(pg, sel):
    """Y a-t-il vraiment de l'encre dans ce conteneur ? Un <svg> vide, ou des
    traces posees hors d'un <svg>, ne dessinent rien — et c'est precisement le
    genre de panne qu'un simple comptage d'elements laisse passer."""
    return pg.evaluate("""(sel) => {
        const n = [...document.querySelectorAll(sel)];
        return n.length > 0 && n.every((e) => {
            const svg = e.querySelector('svg');
            return !!svg && svg.querySelectorAll('path,circle,rect,line,polyline,text').length >= 3;
        });
    }""", sel)

def calm(pg):
    """
    L'alarme peut se declencher d'elle-meme AU MILIEU d'un parcours et
    intercepter les clics — un ecran plein format, c'est fait pour. Il ne
    suffit donc pas de la refermer : on arrete aussi le battement, sinon elle
    revient quinze secondes plus tard, en plein formulaire.

    Les tests qui portent sur l'alarme rechargent la page, ce qui relance le
    moteur : ils ne perdent rien.
    """
    pg.evaluate("""(async()=>{
        const m = await import('/js/alarm.js');
        try { m.stopAlarms(); } catch (e) { /* deja arrete */ }
        try { m.dismissAlarm(); } catch (e) { /* aucune a l'ecran */ }
    })()""")
    pg.wait_for_timeout(300)

with sync_playwright() as pw:
    launch = {'args': ['--no-sandbox']}
    if CHROME: launch['executable_path'] = CHROME
    b = pw.chromium.launch(**launch)
    mk = lambda: b.new_context(viewport={'width': 412, 'height': 900}, device_scale_factor=2,
                               locale='fr-FR', timezone_id='Europe/Paris',
                               is_mobile=True, has_touch=True)

    # ------------------------------------------------- premier lancement
    """
    L'application s'installe VIDE. Le premier lancement est donc le premier
    parcours a verifier — et le seul moyen d'arriver a un ecran rempli.
    """
    print('\nPREMIER LANCEMENT')
    c1 = mk(); c1.add_init_script(FAKE_SCANNER)
    pg = c1.new_page(); hook(pg, 'app')
    pg.goto(BASE, wait_until='networkidle'); pg.wait_for_timeout(2200)

    vide = pg.evaluate("""async()=>{const s=await import('/js/store.js');
        return {vierge: s.estVierge(), profils: s.profiles().length};}""")
    check('l\'application s\'installe vide', vide['vierge'] is True and vide['profils'] == 0,
          str(vide))
    check('la visite du premier lancement s\'ouvre', pg.locator('.ob').count() > 0)
    pg.screenshot(path=str(SHOTS / '00-accueil.png'))

    # --- 1/6 accueil ---------------------------------------------------
    check('l\'accueil annonce le nom',
          pg.locator('.ob-title').inner_text().strip().upper() == 'PILULIER')
    check('l\'accueil montre ses trois promesses', pg.locator('.ob-point').count() == 3)
    check('le logo est dessine', dessine(pg, '.ob-mark'))
    pg.get_by_role('button', name='Commencer').click(); pg.wait_for_timeout(400)

    # --- 2/6 la langue -------------------------------------------------
    check('la langue est proposee', pg.locator('.ob-opt').count() >= 2)
    check('une langue est deja retenue', pg.locator('.ob-opt[aria-pressed="true"]').count() == 1)
    pg.screenshot(path=str(SHOTS / '00b-langue.png'))
    pg.get_by_role('button', name='Continuer').click(); pg.wait_for_timeout(400)

    # --- 3/6 pour qui --------------------------------------------------
    check('les deux destinataires sont offerts', pg.locator('.ob-opt').count() == 2)
    pg.get_by_role('button', name='Pour un proche').click(); pg.wait_for_timeout(500)

    # --- 4/6 le profil -------------------------------------------------
    """
    Le bug de la planche de contact : `faceSVG` ne rend que des traces, sans le
    <svg> qui les porte. Compter six cases ne suffit donc pas — c'est ce que
    faisait ce test, et il passait au vert devant six carres vides. On regarde
    maintenant DANS chaque case.
    """
    check('la question porte sur le proche',
          'De qui' in pg.locator('.ob-h').inner_text())
    check('six portraits sont proposes', pg.locator('.ob-face').count() == 6)
    faces = pg.evaluate("""() => [...document.querySelectorAll('.ob-face')].map((b) => {
        const svg = b.querySelector('svg');
        if (!svg) return { svg: false };
        const r = svg.getBoundingClientRect();
        return { svg: true, traces: svg.querySelectorAll('path').length,
                 w: Math.round(r.width), h: Math.round(r.height),
                 encre: svg.innerHTML.length };
    })""")
    check('chaque portrait porte un <svg>', all(f['svg'] for f in faces), str(faces[:2]))
    check('chaque portrait est reellement dessine',
          all(f.get('traces', 0) >= 8 for f in faces),
          str([f.get('traces') for f in faces]))
    check('chaque portrait occupe sa case',
          all(f.get('w', 0) > 20 and f.get('h', 0) > 20 for f in faces),
          str([(f.get('w'), f.get('h')) for f in faces]))
    check('les six portraits sont differents',
          len({f.get('encre') for f in faces}) == 6,
          str(sorted(f.get('encre', 0) for f in faces)))
    check('un portrait est retenu', pg.locator('.ob-face[aria-pressed="true"]').count() == 1)

    # on en choisit un autre : la selection suit
    pg.locator('.ob-face').nth(3).click(); pg.wait_for_timeout(250)
    check('choisir un portrait le retient',
          pg.locator('.ob-face').nth(0).get_attribute('aria-pressed') == 'true')
    pg.get_by_role('button', name='D\u2019autres portraits').click(); pg.wait_for_timeout(250)
    check('on peut retirer six autres portraits',
          pg.locator('.ob-face').count() == 6 and dessine(pg, '.ob-face'))

    suite = pg.get_by_role('button', name='Continuer')
    check('le nom est obligatoire', suite.is_disabled())
    pg.locator('.ob-input').fill('Jean Dupont'); pg.wait_for_timeout(250)
    check('le nom saisi debloque la suite', suite.is_enabled())
    pg.screenshot(path=str(SHOTS / '00c-profil.png'))
    suite.click(); pg.wait_for_timeout(450)

    # --- 5/6 par ou commencer -----------------------------------------
    check('trois portes sont offertes', pg.locator('.ob-opt').count() == 3)
    pg.screenshot(path=str(SHOTS / '00d-commencer.png'))
    pg.get_by_role('button', name='Partir d\u2019exemples').click(); pg.wait_for_timeout(500)

    # --- 5 bis : le choix des exemples --------------------------------
    """
    Ici se jouait la seconde plainte : « voir un exemple » filait droit vers
    l'agenda ET fabriquait un second profil « Exemple ». On verifie donc que
    l'ecran existe, qu'il reste dans la visite, et qu'il depose ses exemples
    dans LE carnet de la personne.
    """
    check('l\'ecran des exemples s\'ouvre, la visite continue',
          pg.locator('.ob').count() == 1 and pg.locator('.ob-exemple').count() == 4)
    check('le carnet de la personne est nomme',
          'Jean Dupont' in pg.locator('.ob-lead').inner_text())
    check('tout est coche au depart',
          pg.locator('.ob-exemple[aria-pressed="true"]').count() == 4)
    pg.screenshot(path=str(SHOTS / '00e-exemples.png'))

    pg.locator('.ob-exemple').nth(1).click(); pg.wait_for_timeout(200)
    check('on peut en decocher un',
          pg.locator('.ob-exemple[aria-pressed="true"]').count() == 3)
    entre = pg.evaluate("""async()=>{const s=await import('/js/store.js');
        return s.profiles().length;}""")
    check('aucun second profil n\'est fabrique', entre == 1, str(entre))

    pg.get_by_role('button', name='Ajouter au carnet').click(); pg.wait_for_timeout(700)

    # --- 6/6 les rappels ----------------------------------------------
    check('la visite se termine par les rappels',
          pg.locator('.ob').count() == 1
          and pg.get_by_role('button', name='C\u2019est parti').count() == 1)
    pg.screenshot(path=str(SHOTS / '00f-rappels.png'))
    pg.get_by_role('button', name='C\u2019est parti').click(); pg.wait_for_timeout(1100)
    calm(pg)

    seed = pg.evaluate("""async()=>{const s=await import('/js/store.js');
        const p=s.activeProfile();
        return {profil:p.name, profils:s.profiles().length, avatar:p.avatar_value,
                meds:s.medsOf(p.id).map(m=>m.name),
                prises:s.dosesForDate(new Date()).length};}""")
    check('un seul profil, celui demande',
          seed['profils'] == 1 and seed['profil'] == 'Jean Dupont', str(seed))
    check('le portrait choisi est conserve', bool(seed['avatar']), str(seed['avatar']))
    check('les exemples retenus sont dans SON carnet',
          len(seed['meds']) == 3 and 'Amoxicilline' not in seed['meds'], str(seed['meds']))
    check('quatre prises programmees', seed['prises'] == 4, str(seed['prises']))
    check('la visite ne revient pas', pg.locator('.ob').count() == 0)
    pg.screenshot(path=str(SHOTS / '01-today.png'), full_page=True)

    # ---------------------------------------------------------- navigation
    print('\nNAVIGATION')
    for tab, titre in [('calendar', 'Calendrier'), ('meds', 'Traitement'),
                       ('suivi', 'Suivi'), ('settings', 'Réglages')]:
        calm(pg); pg.locator(f'#tab-{tab}').click(); pg.wait_for_timeout(450)
        vu = pg.locator('.topbar h1').inner_text()
        check(f'onglet {titre}', vu.upper() == titre.upper(), vu)
        pg.screenshot(path=str(SHOTS / f'0-{tab}.png'), full_page=True)

    # ------------------------------------------------------- valider une prise
    print('\nUNE PRISE')
    calm(pg); pg.locator('#tab-today').click(); pg.wait_for_timeout(400); calm(pg)
    pg.locator('.take-btn').first.click(); pg.wait_for_timeout(500)
    r = pg.evaluate("""async()=>{const s=await import('/js/store.js');
        const d=s.dosesForDate(new Date());
        return {pris:d.filter(x=>x.status==='taken').length,
                stock:s.medsOf(s.activeProfile().id).map(m=>m.stock_qty)};}""")
    check('la prise est enregistree', r['pris'] >= 1, str(r['pris']))
    check('le stock a ete decompte', any(x not in (30, 60) for x in r['stock']), str(r['stock']))

    # ------------------------------------------------- ajout par la photo
    print('\nAJOUT PAR LA PHOTO')
    calm(pg)
    img = ROOT / 'shots' / '_boite-test.jpg'
    if not img.exists():
        try:
            from PIL import Image, ImageDraw
            im = Image.new('RGB', (900, 600), (232, 228, 214)); d = ImageDraw.Draw(im)
            d.rectangle([40, 40, 860, 560], outline=(30, 28, 20), width=6)
            d.text((80, 120), 'CLOPI DENK 75 mg', fill=(30, 28, 20))
            im.save(img, quality=85)
        except ImportError:
            img = None
    if img:
        pg.evaluate("""async()=>{const M=await import('/js/views/newmed.js');
            const a=await import('/js/app.js'); M.openBoxScan(a.ctx);}""")
        pg.wait_for_timeout(700)
        pg.locator('.sheet input[type=file]').first.set_input_files(str(img))
        pg.wait_for_timeout(1300)
        check('la peremption vient du code-barres',
              pg.locator('.sheet input[type=date]').first.input_value() == '2027-11-30')
        nom = pg.locator('.sheet input.input').first.input_value()
        check('le nom est lu sur la boite', nom == 'Clopi Denk', nom)
        dosage = pg.locator('.sheet input.input').nth(1).input_value()
        check('le dosage est lu sur la boite', dosage == '75 mg', dosage)
        statut = pg.locator('.sheet .step').first.inner_text()
        check('les deux sources sont annoncees',
              'code-barres' in statut and 'texte' in statut, statut.splitlines()[-1][:90])
        pg.wait_for_timeout(400)
        check('le carnet reconnait le medicament', pg.locator('.sheet .banner').count() > 0)
        check('un schema de prise est propose', pg.locator('.sheet .plan-choice').count() > 0)
        pg.locator('.sheet .chip-select').nth(1).locator('.chip').first.click()
        pg.locator('.sheet .plan-choice').first.click(); pg.wait_for_timeout(250)
        pg.screenshot(path=str(SHOTS / '30-scan.png'))
        pg.locator('.sheet-foot .btn-primary').click(); pg.wait_for_timeout(900)
        saved = pg.evaluate("""async()=>{const s=await import('/js/store.js');
            const m=s.medsOf(s.activeProfile().id).find(x=>x.gtin);
            return m && {nom:m.name, dci:m.dci, exp:m.expiry, lot:m.lot};}""")
        check('le medicament est enregistre avec ses infos',
              saved and saved['dci'] == 'Clopidogrel' and saved['lot'] == 'L4521A',
              json.dumps(saved, ensure_ascii=False))

        # --- la meme boite, rachetee le mois suivant ---
        pg.evaluate("""async()=>{const M=await import('/js/views/newmed.js');
            const a=await import('/js/app.js'); M.openBoxScan(a.ctx);}""")
        pg.wait_for_timeout(600)
        pg.locator('.sheet input[type=file]').first.set_input_files(str(img))
        pg.wait_for_timeout(1400)
        connue = pg.locator('.sheet h2:has-text("Boîte déjà connue")').count()
        check('une boite deja scannee est reconnue', connue > 0)
        if connue:
            # deux feuilles empilees : c'est celle du dessus qui porte le bouton
            pg.locator('.sheet').last.locator('.sheet-foot .btn-primary').click()
            pg.wait_for_timeout(700)
            repris = pg.locator('.sheet input.input').first.input_value()
            check('tout est repris de la boite precedente', repris == 'Clopi Denk', repris)
            pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(400)

    # ------------------------------------------------------------ profils
    print('\nPROFILS')
    """
    Le portrait de la barre du haut EST le profil : avec un seul carnet il
    mene a sa fiche (une liste d'un element ne repond a aucune question),
    avec plusieurs il mene a la liste, et chaque ligne a sa fiche.
    """
    calm(pg); pg.locator('.topbar .icon-btn').first.click(); pg.wait_for_timeout(700)
    check('un seul carnet : le portrait ouvre sa fiche',
          pg.locator('.sheet input.input').first.input_value() == 'Jean Dupont',
          pg.locator('.sheet input.input').first.input_value())
    pg.locator('.sheet .sheet-close, .sheet [aria-label="Fermer"]').first.click()
    pg.wait_for_timeout(500); calm(pg)

    # le second profil se cree depuis les reglages
    pg.locator('#tab-settings').click(); pg.wait_for_timeout(600); calm(pg)
    pg.locator('button:has-text("Ajouter un profil")').first.click(); pg.wait_for_timeout(700)
    pg.locator('.sheet input.input').first.fill('Marie Dupont')
    pg.locator('.sheet .face-cell').nth(3).click(); pg.wait_for_timeout(200)
    pg.locator('.sheet-foot .btn-primary').click(); pg.wait_for_timeout(800)
    prof = pg.evaluate("""async()=>{const s=await import('/js/store.js');
        await s.db.flush(); return s.profiles().map(p=>p.name);}""")
    check('le second profil existe', 'Marie Dupont' in prof, str(prof))

    calm(pg); pg.locator('.topbar .icon-btn').first.click(); pg.wait_for_timeout(700)
    lignes = pg.locator('.sheet .card.row')
    check('plusieurs carnets : le portrait ouvre la liste', lignes.count() == 2,
          str(lignes.count()))
    check('chaque ligne mene a sa fiche',
          pg.locator('.sheet .card.row button:has-text("Détails")').count() == 2)
    check('le carnet ouvert est signale',
          pg.locator('.sheet .card.row[aria-pressed="true"]').count() == 1)
    pg.locator('.sheet .card.row button:has-text("Détails")').first.click()
    pg.wait_for_timeout(700)
    check('la fiche demandee s\'ouvre',
          pg.locator('.sheet input.input').count() > 0)
    pg.locator('.sheet .sheet-close, .sheet [aria-label="Fermer"]').first.click()
    pg.wait_for_timeout(500); calm(pg)

    # -------------------------------------------------------- persistance
    print('\nPERSISTANCE')
    pg.evaluate("""async()=>{const s=await import('/js/store.js');
        s.setActiveProfile(s.profiles().find(p=>p.name === 'Jean Dupont').id);
        await s.db.flush();}""")
    pg.reload(wait_until='networkidle'); pg.wait_for_timeout(1600); calm(pg)
    after = pg.evaluate("""async()=>{const s=await import('/js/store.js');
        const p=s.activeProfile();
        return {actif:p.name, meds:s.medsOf(p.id).length,
                pris:s.dosesForDate(new Date()).filter(x=>x.status==='taken').length};}""")
    check('le profil actif survit au rechargement', after['actif'] == 'Jean Dupont', after['actif'])
    check('les medicaments survivent', after['meds'] >= 4, str(after['meds']))
    check('les prises validees survivent', after['pris'] >= 1, str(after['pris']))

    # ------------------------------------------------------ la coque Android
    print('\nLA COQUE ANDROID')
    """
    Le pont Java n'existe pas dans un navigateur : on le simule. Ce qui est
    teste ici, c'est tout ce qui peut casser sans Android — le calcul des
    prochaines prises, le format envoye, et le fait que valider une prise
    repose bien les alarmes.
    """
    pg.evaluate("""()=>{ window.__recu = [];
      window.Pilulier = {
        version: () => '2.1.0',
        publierPrises: (j) => { window.__recu.push(j); return JSON.parse(j).length; },
        effacerPrises: () => {},
        etatDuSysteme: () => JSON.stringify({ alarmesExactes: true, batterieLibre: false,
                                              notifications: true, pleinEcran: true,
                                              voix: window.__voix || 'prete' }),
        ouvrirReglageAlarmes: () => {}, ouvrirReglageBatterie: () => {},
        ouvrirReglageNotifications: () => {}, demanderNotifications: () => {},
        demanderAlarmePleinEcran: () => {},
        alarmeEnAttente: () => window.__alarme || '',
        taireNotification: () => { window.__notifTue = true; },
        reglerSonSysteme: (v) => { window.__sonSysteme = v; },
        partager: () => {}, vibrer: () => {},
      };}""")
    n = pg.evaluate("""async()=>{const n=await import('/js/native.js');
        return { natif: n.estNatif(), poses: n.publierRappels(),
                 etat: n.etatDesRappels() };}""")
    check('le pont est reconnu', n['natif'] is True)
    check('des rappels sont posés', n['poses'] > 0, str(n['poses']))
    check('l\'état des alarmes est lisible',
          n['etat']['alarmesExactes'] is True and n['etat']['batterieLibre'] is False)

    envoi = pg.evaluate("()=>JSON.parse(window.__recu[window.__recu.length-1])")
    check('chaque prise porte un instant, un titre et un détail',
          all(isinstance(p.get('quand'), int) and p.get('titre') and 'heure' in p
              for p in envoi), json.dumps(envoi[:1], ensure_ascii=False))
    check('les prises sont dans l\'ordre du temps',
          [p['quand'] for p in envoi] == sorted(p['quand'] for p in envoi))
    check('rien de déjà passé n\'est armé',
          all(p['quand'] > 0 for p in envoi) and
          pg.evaluate("()=>Date.now()") < envoi[0]['quand'])
    check('le pont ne reçoit jamais plus de 24 alarmes', len(envoi) <= 24, str(len(envoi)))

    # les réglages doivent dire franchement ce qu'Android empêche
    pg.locator('#tab-settings').click(); pg.wait_for_timeout(700)
    check('les réglages annoncent les rappels du système',
          pg.locator('.section-head:has-text("Rappels du système")').count() > 0)
    check('une restriction de batterie est signalée',
          pg.locator('.setting-row:has-text("Batterie")').count() > 0)
    pg.screenshot(path=str(SHOTS / '98-reglages-android.png'))

    # valider une prise doit reposer les alarmes
    avant = pg.evaluate("()=>window.__recu.length")
    pg.locator('#tab-today').click(); pg.wait_for_timeout(400)
    if pg.locator('.take-btn').count():
        pg.locator('.take-btn').first.click()
        pg.wait_for_timeout(1600)
    check('valider une prise repose les rappels',
          pg.evaluate("()=>window.__recu.length") > avant)

    # ------------------------------------------------ reveille par le systeme
    """
    Le coeur du probleme : depuis Android 10, une application en arriere-plan
    ne peut PAS ouvrir un ecran. Le systeme le fait a sa place, par
    l'intention plein ecran, et nous lance avec les extras de l'alarme.

    Pour prouver que c'est bien CE chemin qui ouvre l'ecran et pas le
    battement ordinaire, on laisse le carnet ouvert sur un profil VIDE :
    seul le reveil systeme sait qu'il faut basculer sur l'autre.
    """
    prepare = pg.evaluate("""async()=>{
      const s = await import('/js/store.js');
      const jean = s.profiles().find(x => x.name === 'Jean Dupont');
      const autre = s.profiles().find(x => x.name !== 'Jean Dupont');
      const d = new Date();
      const hhmm = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
      const m = s.medsOf(jean.id)[0];
      const sc = s.schedulesOf(m.id)[0];
      s.db.update('schedules', sc.id, { times: JSON.stringify([{ t: hhmm, dose: 1 }]) });
      /* on regarde le carnet de l'AUTRE : sans le profil porte par l'alarme,
         rien ne peut s'ouvrir */
      s.setActiveProfile((autre || jean).id);
      await s.db.flush();
      return { profil: jean.id, heure: hhmm, med: m.name, autre: (autre||jean).name };
    }""")

    # le pont doit exister DES le demarrage : un rechargement repart d'un
    # contexte vierge, ou `window.Pilulier` n'existerait plus.
    # Le script s'installe UNE fois : sessionStorage survit aux rechargements,
    # donc les sections suivantes retrouvent un navigateur ordinaire.
    pg.add_init_script("""(() => {
      if (sessionStorage.getItem('pontSimule')) return;
      sessionStorage.setItem('pontSimule', '1');
      window.__recu = [];
      window.__alarme = ALARME_JSON;
      window.Pilulier = {
        version: () => '2.1.0',
        publierPrises: (j) => { window.__recu.push(j); return JSON.parse(j).length; },
        effacerPrises: () => {},
        etatDuSysteme: () => JSON.stringify({ alarmesExactes: true, batterieLibre: false,
                                              notifications: true, pleinEcran: true,
                                              voix: window.__voix || 'prete' }),
        ouvrirReglageAlarmes: () => {}, ouvrirReglageBatterie: () => {},
        ouvrirReglageNotifications: () => {}, demanderNotifications: () => {},
        demanderAlarmePleinEcran: () => {},
        alarmeEnAttente: () => { const v = window.__alarme; window.__alarme = ''; return v; },
        taireNotification: () => { window.__notifTue = true; },
        reglerSonSysteme: (v) => { window.__sonSysteme = v; },
        partager: () => {}, vibrer: () => {},
      };
    })();""".replace('ALARME_JSON', json.dumps(json.dumps({
        'titre': prepare['med'], 'detail': '1 gél.',
        'heure': prepare['heure'], 'profil': prepare['profil'] }))))

    pg.reload(wait_until='networkidle'); pg.wait_for_timeout(2400)

    check('l\'écran de rappel s\'ouvre tout seul au réveil',
          pg.locator('.alarm').count() == 1, str(pg.locator('.alarm').count()))
    vu = pg.locator('.alarm').inner_text() if pg.locator('.alarm').count() else ''
    check('il porte le médicament annoncé', prepare['med'] in vu, vu[:90])
    check('il a basculé sur le bon carnet',
          'JEAN DUPONT' in vu.upper(), vu[:90])
    check('la notification du système est coupée',
          pg.evaluate("()=>window.__notifTue") is True)
    check('l\'alarme n\'est consommée qu\'une fois',
          pg.evaluate("()=>window.__alarme") == '')
    check('le réglage « qui sonne » est transmis au natif',
          pg.evaluate("()=>window.__sonSysteme") is True)
    pg.screenshot(path=str(SHOTS / '93-reveil.png'))

    pg.evaluate("(async()=>{const m=await import('/js/alarm.js');m.dismissAlarm();})()")
    pg.wait_for_timeout(500)

    verrous = pg.evaluate("""async()=>{const n=await import('/js/native.js');
        return n.etatDesRappels();}""")
    check('l\'état du système se lit d\'un seul coup',
          set(verrous or {}) == {'alarmesExactes', 'batterieLibre', 'notifications',
                                 'pleinEcran', 'voix'},
          str(verrous))
    check('le plein écran est signalé comme actif', (verrous or {}).get('pleinEcran') is True)

    # ------------------------------------ ce qu'une WebView ne sait pas faire
    """
    Quatre choses etaient mortes dans l'APK, et AUCUNE ne levait d'erreur :
    l'impression, les telechargements, les notifications et la voix. Un bouton
    qui ne repond pas, sans un mot, est la pire panne possible. On simule donc
    un pont complet et on verifie que chaque chemin passe bien par lui.
    """
    pg.evaluate("""()=>{
      window.__trace = { imprime: [], fichiers: [], parle: [], notifs: 0 };
      Object.assign(window.Pilulier, {
        imprimer: (nom) => { window.__trace.imprime.push(nom); return true; },
        enregistrerFichier: (nom, mime, b64) => {
          window.__trace.fichiers.push({ nom, mime, taille: b64.length });
          return 'Téléchargements/' + nom;
        },
        notificationsAutorisees: () => false,
        demanderNotifications: () => { window.__trace.notifs++; },
        ouvrirReglageNotifications: () => {},
        parler: (t, v) => { window.__trace.parle.push({ t, v }); return true; },
        taireLaVoix: () => {},
      });
      /* et on casse ce que le web croyait pouvoir faire, comme une vraie WebView */
      window.print = () => { window.__trace.printWeb = true; };
    }""")

    r = pg.evaluate("""async()=>{
      const ics = await import('/js/ics.js');
      const sp  = await import('/js/speech.js');
      const na  = await import('/js/native.js');
      const via = ics.lancerImpression('essai');
      const sauv = await ics.exportBackup();
      sp.say('Il est huit heures.');
      return { via, sauv, moteur: sp.moteur(), notif: na.etatDesNotifications(),
               trace: window.__trace };
    }""")
    check('l\'impression passe par le service d\'Android',
          r['via'] == 'natif' and r['trace']['imprime'] == ['essai'] and
          not r['trace'].get('printWeb'), str(r['via']))
    check('la sauvegarde est vraiment écrite',
          r['sauv']['result'] == 'saved' and r['sauv']['chemin'].startswith('Téléchargements/')
          and r['trace']['fichiers'][0]['taille'] > 100, str(r['sauv']))
    check('le fichier garde son nom et son type',
          r['trace']['fichiers'][0]['nom'].endswith('.json') and
          r['trace']['fichiers'][0]['mime'] == 'application/json',
          str(r['trace']['fichiers'][0]))
    check('la voix passe par le moteur d\'Android',
          r['moteur'] == 'android' and len(r['trace']['parle']) == 1,
          str(r['moteur']))
    check('l\'état des notifications vient du téléphone',
          r['notif'] is not None and r['notif']['autorisees'] is True, str(r['notif']))

    # --- la voix qui n'est pas encore prete ------------------------------
    """
    `TextToSpeech` s'initialise en asynchrone. Repondre « non » pendant ce
    temps-la, c'est annoncer une absence qui n'existe pas : les reglages
    affichaient « aucun moteur de synthese vocale » au demarrage, jusqu'a ce
    qu'une alarme reveille le moteur. « Pas encore » n'est pas « jamais ».
    """
    etats = pg.evaluate("""async()=>{
      const sp = await import('/js/speech.js');
      const na = await import('/js/native.js');
      const out = {};
      window.__voix = 'attente';
      out.attente = { moteur: sp.moteur(), prepare: sp.voixEnPreparation(),
                      supporte: sp.supported() };
      window.__voix = 'absente';
      out.absente = { moteur: sp.moteur(), etat: na.etatDeLaVoix() };
      window.__voix = 'prete';
      out.prete = { moteur: sp.moteur(), prepare: sp.voixEnPreparation() };
      return out;
    }""")
    check('« pas encore prête » n\'est pas « pas de voix »',
          etats['attente']['moteur'] == 'android' and etats['attente']['supporte'] is True,
          str(etats['attente']))
    check('elle est annoncée comme en préparation',
          etats['attente']['prepare'] is True)
    check('une vraie absence est bien vue comme telle',
          etats['absente']['moteur'] != 'android' and etats['absente']['etat'] == 'absente',
          str(etats['absente']))
    check('une fois prête, plus rien n\'est en attente',
          etats['prete']['moteur'] == 'android' and etats['prete']['prepare'] is False,
          str(etats['prete']))

    # et le mot juste dans les reglages : plus de « ce navigateur »
    pg.locator('#tab-settings').click(); pg.wait_for_timeout(700)
    txt = pg.locator('.view').inner_text()
    check('les réglages ne parlent plus d\'un navigateur',
          'ce navigateur' not in txt.lower(),
          [l for l in txt.split('\n') if 'navigateur' in l.lower()][:1])
    check('les notifications disent la vérité',
          'Refusées' in txt or 'Autorisées' in txt)

    pg.evaluate("()=>{ delete window.Pilulier; }")
    pg.reload(wait_until='networkidle'); pg.wait_for_timeout(1400); calm(pg)

    # -------------------------------------------------------- mode simple
    print('\nMODE SIMPLE')
    # Le profil actif doit etre celui qui a des traitements : le second profil
    # cree plus haut est volontairement vide.
    pg.evaluate("""async()=>{const s=await import('/js/store.js');
        const p=s.profiles().find(x=>x.name==='Jean Dupont');
        if (p) s.setActiveProfile(p.id);
        s.setS('simple_mode',true); await s.db.flush();}""")
    pg.reload(wait_until='networkidle'); pg.wait_for_timeout(1400); calm(pg)
    check('un seul ecran, deux boutons',
          pg.locator('.simple-btn').count() == 2 and pg.locator('.tabbar:not(.hidden)').count() == 0)
    pg.screenshot(path=str(SHOTS / '20-simple.png'))
    pg.evaluate("""async()=>{const s=await import('/js/store.js'); s.setS('simple_mode',false); await s.db.flush();}""")

    # ---------------------------------------------------- fiche d'urgence
    print("\nFICHE D'URGENCE")
    u = pg.evaluate("""async()=>{const s=await import('/js/store.js');const b=await import('/js/bulletin.js');
        const q=await import('/js/qr.js'); const t=b.emergencyText(s.activeProfile());
        const m=q.encode(t,{ecl:'M'}); return {len:t.length, ver:m.version};}""")
    check('la fiche tient dans un QR', 0 < u['ver'] <= 25, json.dumps(u))

    # ------------------------------------------------- suivi a distance
    """
    Le vrai parcours, de bout en bout : le patient cree un code et publie, le
    QR transporte le code ET l'adresse du relais, le proche scanne et lit. Le
    point qui manquait : dans l'APK l'adresse `/api/sync` n'existe pas, donc
    le lien doit voyager en absolu.
    """
    print('\nSUIVI A DISTANCE')
    lien = pg.evaluate("""async()=>{const y=await import('/js/sync.js');const s=await import('/js/store.js');
        const p=s.profiles().find(x=>x.name==='Jean Dupont');
        if (p) s.setActiveProfile(p.id);
        const c=y.makeCode(); s.setS('sync_code',y.normalizeCode(c)); s.setS('sync_role','patient');
        try { await y.publish(); } catch(e){ return 'ERREUR:'+e.message; }
        return y.lienDAppairage();}""")
    if str(lien).startswith('ERREUR'):
        check('publication du compte rendu', False, lien + ' (le serveur api/ tourne-t-il ?)')
    else:
        check('le lien d\'appairage porte le code et le relais',
              lien.startswith('PILULIER1|') and lien.count('|') == 2, lien)
        check('l\'adresse du relais voyage en absolu',
              lien.split('|')[2].startswith('http'), lien.split('|')[2])

        c2 = mk(); fils = c2.new_page(); hook(fils, 'aidant')
        fils.goto(BASE, wait_until='networkidle'); fils.wait_for_timeout(1800)
        if fils.locator('.ob').count():          # ce navigateur-la est vierge
            fils.get_by_role('button', name='Passer').click(); fils.wait_for_timeout(600)
        calm(fils)
        got = fils.evaluate("""async(l)=>{const y=await import('/js/sync.js');const s=await import('/js/store.js');
            const p=y.lireLienDAppairage(l);
            if(!p) return null;
            if(p.serveur) y.setServeur(p.serveur);
            s.setS('sync_code',p.code); s.setS('sync_role','aidant');
            const r=await y.receive(p.code); await s.db.flush();
            return r && {nom:r.profile.name, pris:r.today.taken, total:r.today.total,
                         relais:y.serveur()};}""", lien)
        check('un seul scan relie les deux téléphones',
              got and got['nom'] == 'Jean Dupont' and got['relais'].startswith('http'), str(got))
        tamper = fils.evaluate("""async(l)=>{
            const y=await import('/js/sync.js');
            const p=y.lireLienDAppairage(l);
            const enc=new TextEncoder();
            const id=await crypto.subtle.digest('SHA-256', enc.encode('pilulier-id|'+p.code));
            const keyId=[...new Uint8Array(id).slice(0,16)].map(x=>x.toString(16).padStart(2,'0')).join('');
            await fetch(y.serveur()+'?id='+keyId,{method:'PUT',headers:{'Content-Type':'application/json'},
              body:JSON.stringify({iv:'AAAAAAAAAAAAAAAA',ct:'Y29ycm9tcHU='})});
            try { await y.receive(p.code); return false; } catch(e){ return true; } }""", lien)
        check('un bloc corrompu est refuse', tamper)
        # l'appairage se fait depuis les reglages ; on revient a l'accueil
        fils.reload(wait_until='networkidle'); fils.wait_for_timeout(1600); calm(fils)
        check('la carte « suivi a distance » apparait',
              fils.locator('.card-hero').count() >= 1,
              str(fils.locator('.card-hero').count()))
        fils.screenshot(path=str(SHOTS / '21-aidant.png'))

    # l'ecran d'appairage. Le mode simple a ete eteint plus haut sans
    # rechargement : la barre d'onglets est encore cachee.
    pg.reload(wait_until='networkidle'); pg.wait_for_timeout(1500); calm(pg)
    pg.locator('#tab-settings').click(); pg.wait_for_timeout(700)
    check('le suivi s\'explique avant de se regler',
          pg.locator('button:has-text("Comment ça marche")').count() == 1)
    pg.locator('button:has-text("Comment ça marche")').first.click(); pg.wait_for_timeout(600)
    check('l\'explication tient en trois etapes',
          pg.locator('.sheet .ob-point').count() == 3,
          str(pg.locator('.sheet .ob-point').count()))
    pg.locator('.sheet [aria-label="Fermer"]').first.click(); pg.wait_for_timeout(500)
    check('l\'adresse du relais est un reglage a part entiere',
          pg.locator('button:has-text("Adresse du relais")').count() == 1)
    check('l\'écran dit d\'où vient l\'adresse',
          'servie avec l’application' in pg.locator('button:has-text("Adresse du relais")').inner_text()
          or 'saisie ici' in pg.locator('button:has-text("Adresse du relais")').inner_text(),
          pg.locator('button:has-text("Adresse du relais")').inner_text())

    # une adresse mal tapée ne doit plus être acceptée en silence
    verdicts = pg.evaluate("""async()=>{
      const y = await import('/js/sync.js');
      const out = {};
      out.propre = y.normaliserAdresse('mon-projet.vercel.app');
      try { await y.testerRelais(location.origin + '/doc.html'); out.faux = 'ACCEPTE'; }
      catch (e) { out.faux = 'refusé'; }
      try { out.vrai = await y.testerRelais('/api/sync'); }
      catch (e) { out.vrai = 'ERREUR ' + e.message; }
      return out;
    }""")
    check('un domaine seul devient une adresse appelable',
          verdicts['propre'] == 'https://mon-projet.vercel.app/api/sync', str(verdicts['propre']))
    check('une page qui n\'est pas le relais est refusée', verdicts['faux'] == 'refusé')
    check('le vrai relais est reconnu',
          isinstance(verdicts['vrai'], dict) and verdicts['vrai']['url'].endswith('/api/sync'),
          str(verdicts['vrai']))
    check('il dit s\'il a une vraie base ou non',
          isinstance(verdicts['vrai'], dict)
          and verdicts['vrai']['stockage'] in ('durable', 'memoire'),
          str(verdicts['vrai']))

    # ----------------------------------------------------- les graphiques
    """
    La planche de graphiques n'a de sens que remplie. On fabrique donc un vrai
    passe — deux semaines de prises et dix releves — et on verifie que CHAQUE
    cadran est dessine. Un tableau de bord dont les cadrans disparaissent
    quand la mesure manque ne se lit pas : on ne sait jamais si c'est le
    graphique ou la donnee qui est absente.
    """
    print('\nLES GRAPHIQUES')
    calm(pg); pg.locator('#tab-suivi').click(); pg.wait_for_timeout(700); calm(pg)
    vierge = pg.locator('.chart-card').count()
    check('deux cadrans des le premier jour', vierge >= 2, str(vierge))
    check('aucun cadran vide', dessine(pg, '.chart-card .chart-svg'))
    pg.screenshot(path=str(SHOTS / '90-suivi-vierge.png'), full_page=True)

    pg.evaluate("""async()=>{
      const s = await import('/js/store.js');
      const p = s.activeProfile();
      const jour = (t) => new Date(t).toISOString().slice(0, 10);
      const debut = jour(Date.now() - 20 * 86400000);
      for (const m of s.medsOf(p.id)) s.db.update('meds', m.id, { start_date: debut, end_date: null });
      for (const sc of s.db.all('schedules')) s.db.update('schedules', sc.id, { anchor_date: debut });
      /* Un passe reproductible : pas de hasard, une prise sur sept oubliee. */
      let k = 0;
      for (let i = 13; i >= 1; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        for (const x of s.dosesForDate(d, p.id)) {
          if (x.intake) continue;
          k++;
          const st = k % 7 === 0 ? 'missed' : (k % 11 === 0 ? 'skipped' : 'taken');
          s.db.insert('intakes', { profile_id: p.id, med_id: x.med.id, schedule_id: x.sched.id,
            slot: x.slot, planned_at: x.planned.getTime(), status: st,
            taken_at: st === 'taken' ? x.planned.getTime() + ((k % 9) - 3) * 600000 : null,
            dose: x.dose });
        }
      }
      for (let i = 9; i >= 0; i--) {
        const at = Date.now() - i * 86400000;
        s.db.insert('measures', { profile_id: p.id, kind: 'bp',
          v1: 118 + (i * 3) % 22, v2: 70 + (i * 2) % 16, v3: 68 + i, at });
        s.db.insert('measures', { profile_id: p.id, kind: 'weight',
          v1: 72 + i / 3.7, at });
      }
      await s.db.flush();
    }""")
    pg.reload(wait_until='networkidle'); pg.wait_for_timeout(1700); calm(pg)
    pg.locator('#tab-suivi').click(); pg.wait_for_timeout(800); calm(pg)

    cadrans = pg.evaluate("""() => [...document.querySelectorAll('.chart-card')].map((c) => ({
        titre: c.querySelector('.chart-head b')?.textContent || '',
        traces: c.querySelectorAll('.chart-svg svg path, .chart-svg svg circle').length,
    }))""")
    titres = [c['titre'] for c in cadrans]
    for attendu in ['Observance', 'Répartition', 'Ponctualité', 'Tension', 'Haute et basse']:
        check(f'le cadran « {attendu} » est là', attendu in titres, str(titres))
    check('chaque cadran est vraiment dessiné',
          all(c['traces'] >= 8 for c in cadrans),
          str([(c['titre'], c['traces']) for c in cadrans]))
    fils_ = pg.locator('.stat-fil svg').count()
    check('chaque constante a son fil de tendance', fils_ >= 2, str(fils_))
    longs = pg.evaluate("""() => [...document.querySelectorAll('.stat b')]
        .map((b) => b.textContent.trim())
        .filter((t) => /,\d{3,}/.test(t))""")
    check('les relevés sont arrondis', not longs, str(longs))
    pg.screenshot(path=str(SHOTS / '91-suivi-plein.png'), full_page=True)

    # ------------------------------------------------------- les ecrans repris
    """
    Les corrections demandees apres l'installation de l'APK. Chacune avait la
    meme cause : quelque chose etait affiche sans qu'on puisse savoir ce que
    ca voulait dire, ou sans mener quelque part.
    """
    print('\nLES ECRANS REPRIS')

    # 1. le repere de la ligne du temps ne colle plus au premier creneau
    calm(pg); pg.locator('#tab-today').click(); pg.wait_for_timeout(600); calm(pg)
    pg.evaluate("""async()=>{const s=await import('/js/store.js');const p=s.activeProfile();
        for(const x of s.dosesForDate(new Date(),p.id)) if(!x.intake) s.markTaken(x);
        await s.db.flush();}""")
    pg.reload(wait_until='networkidle'); pg.wait_for_timeout(1500); calm(pg)
    check('journée finie : plus aucun repère',
          pg.locator('.timeblock-tag').count() == 0,
          pg.locator('.timeblock-tag').first.inner_text() if pg.locator('.timeblock-tag').count() else '')

    # 2. les selecteurs sont ceux de l'application
    calm(pg); pg.locator('#tab-settings').click(); pg.wait_for_timeout(700)
    check('aucun sélecteur du système dans les réglages',
          pg.locator('.view select').count() == 0, str(pg.locator('.view select').count()))
    check('les choix sont des boutons maison', pg.locator('.choice').count() >= 5,
          str(pg.locator('.choice').count()))
    pg.locator('.choice').nth(2).click(); pg.wait_for_timeout(600)
    check('la feuille de choix s\'ouvre au bon style',
          pg.locator('.sheet .choice-opt').count() == 3 and
          pg.locator('.sheet .choice-opt[aria-pressed="true"]').count() == 1)
    pg.locator('.sheet .choice-opt').first.click(); pg.wait_for_timeout(600)
    check('le choix est retenu',
          pg.evaluate("async()=>{const s=await import('/js/store.js');return s.getS('scale');}") == 'normal')

    # 3. le renouvellement mene au renouvellement
    calm(pg); pg.locator('#tab-meds').click(); pg.wait_for_timeout(700)
    check('les jauges de stock sont hachurées',
          pg.evaluate("""()=>{const i=document.querySelector('.stockbar i');
            return !!i && /repeating-linear-gradient/.test(getComputedStyle(i).backgroundImage);}"""))
    if pg.locator('button:has-text("Renouveler")').count():
        pg.locator('button:has-text("Renouveler")').first.click(); pg.wait_for_timeout(700)
        check('« Renouveler » ouvre bien le renouvellement',
              pg.locator('.sheet').count() == 1 and
              pg.locator('.sheet button:has-text("Ajouter")').count() >= 1)
        pg.locator('.sheet [aria-label="Fermer"]').first.click(); pg.wait_for_timeout(500)

    # 4. la fiche d'urgence tient dans sa case, meme en tres grand texte
    pg.evaluate("""async()=>{const s=await import('/js/store.js');s.setS('scale','xlarge');
        await s.db.flush();}""")
    pg.reload(wait_until='networkidle'); pg.wait_for_timeout(1500); calm(pg)
    pg.evaluate("(async()=>{const u=await import('/js/views/urgence.js');u.openEmergencyCard({});})()")
    pg.wait_for_timeout(800)
    deborde = pg.evaluate("""()=>{const s=document.querySelector('.sheet-body');
        if(!s) return -1;
        const bord=s.getBoundingClientRect().right;
        return [...s.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>bord+1).length;}""")
    check('la fiche d\'urgence ne déborde plus', deborde == 0, str(deborde))
    pg.screenshot(path=str(SHOTS / '92-urgence.png'), full_page=True)

    # 5. la documentation s'habille comme l'application
    pg.evaluate("""async()=>{const s=await import('/js/store.js');s.setS('theme','light');
        s.setS('scale','large'); await s.db.flush();}""")
    doc = c1.new_page(); hook(doc, 'doc')
    doc.goto(BASE + '/doc.html', wait_until='networkidle'); doc.wait_for_timeout(700)
    check('la documentation suit le thème choisi',
          doc.evaluate("()=>document.documentElement.getAttribute('data-theme')") == 'light')
    check('elle suit aussi la taille du texte',
          doc.evaluate("()=>document.documentElement.getAttribute('data-scale')") == 'large')
    doc.close()

    b.close()

print('\n=== ERREURS CONSOLE ===')
print('\n'.join(dict.fromkeys(errs)) if errs else 'aucune')
rates = sum(1 for _, ok_, _ in checks if not ok_)
print(f'\n{len(checks) - rates} verifications passees, {rates} echec(s).')
sys.exit(1 if (rates or errs) else 0)
