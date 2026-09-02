/* ============================================================================
   db.js — micro base de donnees relationnelle, embarquee, hors-ligne.

   POURQUOI PAS SQLite/WASM ?
   L'app manipule quelques centaines de lignes. Charger 1,5 Mo de WebAssembly
   avant d'afficher le premier ecran couterait ~1 s de demarrage sur un
   telephone Android d'entree de gamme — exactement ce qu'on veut eviter.
   On garde donc un moteur relationnel minimal (tables, cles, index, contraintes
   ON DELETE CASCADE, migrations) persiste dans IndexedDB : demarrage instantane,
   zero dependance, fonctionne hors-ligne.
   -> L'export SQL (db.toSQL()) produit un vrai dump SQLite : les donnees ne sont
      jamais prisonnieres de l'app.
   -> Si un jour tu veux le vrai SQLite : garde cette API et remplace uniquement
      le contenu des methodes (voir README, section « Passer a SQLite »).
   ========================================================================== */

const IDB_NAME = 'pilulier';
const IDB_STORE = 'kv';
const SNAPSHOT_KEY = 'snapshot';
const MIRROR_KEY = 'pilulier:snapshot';   // copie de secours, ecriture synchrone

/* ------------------------------------------------------------ IndexedDB */
function idb() {
  return new Promise((resolve, reject) => {
    const rq = indexedDB.open(IDB_NAME, 1);
    rq.onupgradeneeded = () => {
      if (!rq.result.objectStoreNames.contains(IDB_STORE)) rq.result.createObjectStore(IDB_STORE);
    };
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}
async function idbGet(key) {
  try {
    const d = await idb();
    return await new Promise((res, rej) => {
      const rq = d.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    });
  } catch { return JSON.parse(localStorage.getItem('pilulier:' + key) || 'null'); }
}
async function idbSet(key, val) {
  try {
    const d = await idb();
    await new Promise((res, rej) => {
      const tx = d.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(val, key);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch { localStorage.setItem('pilulier:' + key, JSON.stringify(val)); }
}

/* ------------------------------------------------------------ Le moteur */
export class DB {
  constructor(schema) {
    this.schema = schema;          // { table: { cols:{name:type}, refs:[{col,table}] } }
    this.data = {};                // { table: { rows: [], seq: n } }
    this.version = 0;
    this.listeners = new Set();
    this._dirty = false;
    this._saveTimer = null;
    for (const t of Object.keys(schema)) this.data[t] = { rows: [], seq: 0 };
  }

  /* --- cycle de vie --- */
  async open() {
    // IndexedDB est la source principale ; le miroir localStorage rattrape le cas
    // ou l'onglet est tue avant que l'ecriture asynchrone n'ait abouti.
    const snap = await idbGet(SNAPSHOT_KEY);
    let mirror = null;
    try { mirror = JSON.parse(localStorage.getItem(MIRROR_KEY) || 'null'); } catch { /* ignore */ }
    const best = [snap, mirror].filter((x) => x && x.data)
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
    if (best) {
      this.version = best.version || 0;
      for (const t of Object.keys(this.schema)) {
        this.data[t] = best.data[t] || { rows: [], seq: 0 };
      }
    }
    // Filet de securite : vider la file d'ecriture avant que l'onglet ne meure.
    const flush = () => this.flushSync();
    addEventListener('pagehide', flush);
    addEventListener('beforeunload', flush);
    addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    return this;
  }

  _snapshot() { return { version: this.version, data: this.data, savedAt: Date.now() }; }

  /** Ecriture immediate et synchrone dans le miroir (survit a une fermeture brutale). */
  flushSync() {
    clearTimeout(this._saveTimer);
    const snap = this._snapshot();
    try { localStorage.setItem(MIRROR_KEY, JSON.stringify(snap)); } catch { /* quota */ }
    if (this._dirty) { this._dirty = false; idbSet(SNAPSHOT_KEY, snap).catch(() => {}); }
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(table) { for (const fn of this.listeners) { try { fn(table); } catch (e) { console.error(e); } } }

  save() {
    this._dirty = true;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._writeNow(), 120);
  }
  _writeNow() {
    this._dirty = false;
    const snap = this._snapshot();
    try { localStorage.setItem(MIRROR_KEY, JSON.stringify(snap)); } catch { /* quota */ }
    idbSet(SNAPSHOT_KEY, snap).catch((e) => console.error('[db] echec sauvegarde', e));
  }
  async flush() {
    clearTimeout(this._saveTimer); this._dirty = false;
    const snap = this._snapshot();
    try { localStorage.setItem(MIRROR_KEY, JSON.stringify(snap)); } catch { /* quota */ }
    await idbSet(SNAPSHOT_KEY, snap);
  }

  /* --- lecture --- */
  all(table)      { return this.data[table].rows.slice(); }
  get(table, id)  { return this.data[table].rows.find((r) => r.id === id) || null; }
  count(table, w) { return this.where(table, w).length; }

  /** where('meds', {profile_id: 2, archived: 0}) ou where('meds', r => r.stock < 5) */
  where(table, cond) {
    const rows = this.data[table].rows;
    if (!cond) return rows.slice();
    if (typeof cond === 'function') return rows.filter(cond);
    return rows.filter((r) => Object.entries(cond).every(([k, v]) =>
      Array.isArray(v) ? v.includes(r[k]) : r[k] === v));
  }
  find(table, cond) { return this.where(table, cond)[0] || null; }

  /* --- ecriture --- */
  insert(table, obj) {
    const t = this.data[table];
    const row = { ...obj, id: obj.id ?? ++t.seq };
    if (typeof row.id === 'number' && row.id > t.seq) t.seq = row.id;
    if (!('created_at' in row)) row.created_at = Date.now();
    t.rows.push(row); this.save(); this._emit(table);
    return row;
  }
  insertMany(table, arr) { const out = arr.map((o) => this.insert(table, o)); return out; }

  update(table, id, patch) {
    const row = this.get(table, id);
    if (!row) return null;
    Object.assign(row, patch, { updated_at: Date.now() });
    this.save(); this._emit(table);
    return row;
  }
  /** insere ou met a jour selon la presence de l'id */
  upsert(table, obj) { return obj.id && this.get(table, obj.id)
    ? this.update(table, obj.id, obj) : this.insert(table, obj); }

  /** Supprime la ligne + cascade sur les tables qui la referencent. */
  remove(table, id) {
    const t = this.data[table];
    const i = t.rows.findIndex((r) => r.id === id);
    if (i < 0) return false;
    t.rows.splice(i, 1);
    for (const [child, def] of Object.entries(this.schema)) {
      for (const ref of def.refs || []) {
        if (ref.table !== table) continue;
        this.where(child, (r) => r[ref.col] === id).forEach((r) => this.remove(child, r.id));
      }
    }
    this.save(); this._emit(table);
    return true;
  }
  removeWhere(table, cond) { const n = this.where(table, cond); n.forEach((r) => this.remove(table, r.id)); return n.length; }

  /* --- sauvegarde / restauration --- */
  toJSON() {
    return { app: 'pilulier', format: 1, version: this.version,
             exportedAt: new Date().toISOString(), data: this.data };
  }
  loadJSON(obj) {
    if (!obj || obj.app !== 'pilulier') throw new Error('Fichier de sauvegarde non reconnu.');
    for (const t of Object.keys(this.schema)) {
      const src = obj.data?.[t];
      this.data[t] = src ? { rows: src.rows || [], seq: src.seq || 0 } : { rows: [], seq: 0 };
    }
    this.version = obj.version || this.version;
    this.save(); this._emit('*');
  }

  /** Dump SQLite complet (ouvrable avec DB Browser for SQLite, sqlite3, etc.). */
  toSQL() {
    const q = (v) => v === null || v === undefined ? 'NULL'
      : typeof v === 'number' ? String(v)
      : `'${String(typeof v === 'object' ? JSON.stringify(v) : v).replace(/'/g, "''")}'`;
    const out = ['PRAGMA foreign_keys=OFF;', 'BEGIN TRANSACTION;'];
    for (const [table, def] of Object.entries(this.schema)) {
      const cols = Object.entries(def.cols).map(([c, ty]) =>
        `  "${c}" ${ty}${c === 'id' ? ' PRIMARY KEY' : ''}`);
      for (const ref of def.refs || [])
        cols.push(`  FOREIGN KEY("${ref.col}") REFERENCES "${ref.table}"("id") ON DELETE CASCADE`);
      out.push(`DROP TABLE IF EXISTS "${table}";`);
      out.push(`CREATE TABLE "${table}" (\n${cols.join(',\n')}\n);`);
      const names = Object.keys(def.cols);
      for (const r of this.data[table].rows) {
        out.push(`INSERT INTO "${table}" (${names.map((n) => `"${n}"`).join(',')}) VALUES (${
          names.map((n) => q(r[n] ?? null)).join(',')});`);
      }
    }
    out.push('COMMIT;');
    return out.join('\n');
  }

  /** Efface tout (utilise par « reinitialiser l'application »). */
  wipe() {
    for (const t of Object.keys(this.schema)) this.data[t] = { rows: [], seq: 0 };
    this.version = 0;
    try { localStorage.removeItem(MIRROR_KEY); } catch { /* ignore */ }
    this.save(); this._emit('*');
  }
}
