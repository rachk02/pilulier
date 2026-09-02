/* ============================================================================
   api/sync.js — fonction serverless Vercel : une boite aux lettres aveugle.

   Elle stocke un bloc chiffre sous un identifiant opaque et le rend a qui le
   demande. Elle ne voit ni le nom du patient, ni ses medicaments, ni le code
   d'appairage : tout est chiffre par le navigateur avant l'envoi.

   Stockage : Upstash / Vercel KV via son API REST — aucune dependance npm.
   Sans variables d'environnement, un stockage memoire prend le relais (utile
   en developpement, remis a zero quand la fonction s'endort).
   ========================================================================== */

/*
 * Trouver la base, quel que soit le nom que l'hebergeur a donne aux variables.
 *
 * Vercel Storage propose un « Custom Prefix » au moment de brancher Upstash :
 * selon ce qu'on y met — ou ce que l'integration decide — les variables
 * s'appellent KV_REST_API_URL, UPSTASH_REDIS_REST_URL, STORAGE_REST_API_URL,
 * ou autre chose encore. Coder deux noms en dur, c'est faire dependre le bon
 * fonctionnement d'une case de formulaire remplie six mois plus tot.
 *
 * On cherche donc une PAIRE coherente : une adresse REST en https, et le jeton
 * qui porte le meme prefixe. Les noms connus sont essayes d'abord, pour rester
 * previsible ; le balayage n'est qu'un filet.
 *
 * Ce qu'on n'utilise jamais : KV_URL et REDIS_URL, qui sont des chaines de
 * connexion `rediss://` — elles demandent un vrai client Redis, donc une
 * dependance npm, ce que ce fichier n'aura jamais.
 */
export function trouverLaBase(env = process.env) {
  const propre = (v) => String(v || '').trim().replace(/\/+$/, '');

  for (const [u, t] of [
    ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
    ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
  ]) {
    if (env[u] && env[t]) return { url: propre(env[u]), token: String(env[t]).trim() };
  }

  for (const cle of Object.keys(env)) {
    if (!/REST(_API)?_URL$/.test(cle)) continue;
    if (!/^https:\/\//i.test(String(env[cle] || ''))) continue;
    const base = cle.replace(/URL$/, '');
    /* Le jeton en ecriture d'abord : un jeton en lecture seule ferait echouer
       la publication, et seulement la publication — la pire des pannes. */
    const jeton = [base + 'TOKEN', base + 'READ_WRITE_TOKEN']
      .find((n) => env[n] && !/READ_ONLY/.test(n));
    if (jeton) return { url: propre(env[cle]), token: String(env[jeton]).trim() };
  }
  return { url: '', token: '' };
}

const { url: KV_URL, token: KV_TOKEN } = trouverLaBase();
const TTL_SECONDS = 60 * 60 * 24 * 30;      /* un mois sans publication : effacement */
const MAX_BYTES = 512 * 1024;

const memory = new Map();                    /* repli sans base configuree */

const ok = (id) => /^[0-9a-f]{32}$/.test(String(id || ''));

async function kvGet(key) {
  if (!KV_URL) {
    const e = memory.get(key);
    if (!e || e.exp < Date.now()) { memory.delete(key); return null; }
    return e.val;
  }
  const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`,
    { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
  if (!r.ok) return null;
  const j = await r.json();
  return j.result ?? null;
}

async function kvSet(key, value) {
  if (!KV_URL) {
    memory.set(key, { val: value, exp: Date.now() + TTL_SECONDS * 1000 });
    return true;
  }
  const r = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}?EX=${TTL_SECONDS}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
    body: value,
  });
  return r.ok;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const id = (req.query?.id) || new URL(req.url, 'http://x').searchParams.get('id');
  if (!ok(id)) {
    /*
     * Cette reponse est la SIGNATURE du relais : l'application sonde avec un
     * identifiant volontairement invalide, et c'est ainsi qu'elle sait qu'elle
     * parle bien a une fonction Pilulier et non a une page quelconque.
     *
     * On en profite pour dire si une base est branchee. Sans elle, les blocs
     * ne survivent pas au sommeil de la fonction — l'application peut alors
     * prevenir au lieu de laisser croire que tout va bien. Rien de sensible
     * n'est divulgue : ni adresse, ni jeton, juste « durable » ou « memoire ».
     */
    return res.status(400).json({
      error: 'identifiant invalide',
      service: 'pilulier-sync',
      stockage: KV_URL ? 'durable' : 'memoire',
    });
  }
  const key = `pilulier:sync:${id}`;

  if (req.method === 'GET') {
    const val = await kvGet(key);
    if (!val) return res.status(404).json({ error: 'rien de publié' });
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(val);
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    let body = req.body;
    if (typeof body !== 'string') {
      if (body && typeof body === 'object') body = JSON.stringify(body);
      else body = await new Promise((resolve) => {
        let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => resolve(s));
      });
    }
    if (!body || body.length > MAX_BYTES) {
      return res.status(413).json({ error: 'bloc absent ou trop volumineux' });
    }
    let parsed;
    try { parsed = JSON.parse(body); } catch { return res.status(400).json({ error: 'json invalide' }); }
    if (!parsed || typeof parsed.iv !== 'string' || typeof parsed.ct !== 'string') {
      return res.status(400).json({ error: 'bloc chiffré attendu' });
    }
    const saved = await kvSet(key, JSON.stringify({ iv: parsed.iv, ct: parsed.ct, at: Date.now() }));
    if (!saved) return res.status(502).json({ error: 'stockage indisponible' });
    return res.status(200).json({ ok: true, at: Date.now(), ttl: TTL_SECONDS });
  }

  return res.status(405).json({ error: 'méthode non autorisée' });
}
