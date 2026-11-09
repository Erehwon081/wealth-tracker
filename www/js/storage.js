// On-device storage. Everything the app keeps lives in IndexedDB on this device.
//
// The app only talks to the interface below, so a native wrapper (for example a Capacitor
// SQLite or Preferences adapter) can replace this file without touching the rest:
//   open()                      -> Promise<void>
//   get(store, key)             -> Promise<value | undefined>
//   getAll(store)               -> Promise<{ [key]: value }>
//   put(store, key, value)      -> Promise<void>
//   del(store, key)             -> Promise<void>
//   replaceAll(snapshot)        -> Promise<void>   wipes the data stores, then writes the snapshot atomically
//   snapshot()                  -> Promise<{ config, accounts[], months{}, tx{}, holdings[] }>
//   persist()                   -> Promise<boolean | null>
//
// Stores: config (key "app"), accounts (key = id), months (key = YYYY-MM), tx (key = YYYY-MM, value = rows[]),
// holdings (key = id), meta (app bookkeeping such as the last backup time, never exported).

const DB_NAME = 'wealth-tracker';
const DB_VERSION = 1;
export const DATA_STORES = ['config', 'accounts', 'months', 'tx', 'holdings'];
const ALL_STORES = [...DATA_STORES, 'meta'];

let dbP = null;
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new DOMException('Aborted', 'AbortError')); });

export function open() {
  if (dbP) return dbP;
  dbP = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => { const db = r.result; for (const s of ALL_STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s); };
    r.onsuccess = () => { const db = r.result; db.onversionchange = () => db.close(); res(db); };
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('Storage is open in another tab'));
  });
  dbP.catch(() => { dbP = null; });
  return dbP;
}

export async function get(store, key) { const db = await open(); return req(db.transaction(store).objectStore(store).get(key)); }

export async function getAll(store) {
  const db = await open(); const os = db.transaction(store).objectStore(store);
  const [keys, vals] = await Promise.all([req(os.getAllKeys()), req(os.getAll())]);
  const out = {}; keys.forEach((k, i) => { out[k] = vals[i]; }); return out;
}

export async function put(store, key, value) { const db = await open(); const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value, key); return done(tx); }

export async function del(store, key) { const db = await open(); const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key); return done(tx); }

export async function replaceAll(snap) {
  const db = await open(); const tx = db.transaction(DATA_STORES, 'readwrite');
  for (const s of DATA_STORES) tx.objectStore(s).clear();
  if (snap.config) tx.objectStore('config').put(snap.config, 'app');
  for (const a of snap.accounts || []) tx.objectStore('accounts').put(a, a.id);
  for (const [m, v] of Object.entries(snap.months || {})) tx.objectStore('months').put(v, m);
  for (const [m, rows] of Object.entries(snap.tx || {})) tx.objectStore('tx').put(rows, m);
  for (const h of snap.holdings || []) tx.objectStore('holdings').put(h, h.id);
  return done(tx);
}

export async function snapshot() {
  const [config, accounts, months, tx, holdings] = await Promise.all(DATA_STORES.map((s) => getAll(s)));
  return { config: config.app ?? null, accounts: Object.values(accounts), months, tx, holdings: Object.values(holdings) };
}

export async function persist() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return null; }
}

export async function persisted() { try { return navigator.storage?.persisted ? await navigator.storage.persisted() : null; } catch { return null; } }
