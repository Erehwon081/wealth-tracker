// Backup files: {"format":"wealth-tracker-backup","version":1,config,accounts,months,tx,holdings}.
// With a passphrase the same envelope carries {encrypted:{...}, data} instead: AES-GCM 256 with a key from PBKDF2-SHA-256.

export const FORMAT = 'wealth-tracker-backup';
export const VERSION = 1;
const ITERATIONS = 600000;

const b64 = (buf) => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function backupFileName(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `wealth-tracker-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

export function buildBackup(snap) {
  return { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), config: snap.config ?? null, accounts: snap.accounts || [], months: snap.months || {}, tx: snap.tx || {}, holdings: snap.holdings || [] };
}

async function deriveKey(pass, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptBackup(backup, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt, ITERATIONS);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(backup)));
  return { format: FORMAT, version: VERSION, exportedAt: backup.exportedAt, encrypted: { cipher: 'AES-GCM', kdf: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: b64(salt), iv: b64(iv) }, data: b64(ct) };
}

export const isEncrypted = (obj) => !!(obj && obj.format === FORMAT && obj.encrypted && typeof obj.data === 'string');

export async function decryptBackup(obj, pass) {
  const e = obj.encrypted;
  const key = await deriveKey(pass, unb64(e.salt), e.iterations || ITERATIONS);
  let pt;
  try { pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(e.iv) }, key, unb64(obj.data)); }
  catch { const err = new Error('Wrong passphrase, or the file is damaged.'); err.code = 'bad_passphrase'; throw err; }
  return JSON.parse(new TextDecoder().decode(pt));
}

// Validates a decrypted backup and normalises it to the storage snapshot shape.
// Accepts accounts/holdings as arrays or id-keyed maps, and tx months as rows[] or {rows}.
export function readBackup(obj) {
  const fail = (m) => { const e = new Error(m); e.code = 'bad_format'; throw e; };
  if (!obj || typeof obj !== 'object') fail("That file isn't a Wealth Tracker backup.");
  if (obj.format !== FORMAT) fail("That file isn't a Wealth Tracker backup.");
  if (Number(obj.version) > VERSION) fail('That backup comes from a newer version of the app.');
  const list = (v) => Array.isArray(v) ? v : v && typeof v === 'object' ? Object.entries(v).map(([id, x]) => ({ id, ...x })) : [];
  const map = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const accounts = list(obj.accounts).filter((a) => a && a.id != null).map((a) => ({ ...a, id: String(a.id) }));
  const holdings = list(obj.holdings).filter((h) => h && h.id != null).map((h) => ({ ...h, id: String(h.id) }));
  const months = {}; for (const [m, v] of Object.entries(map(obj.months))) if (/^\d{4}-\d{2}$/.test(m) && v && typeof v === 'object') months[m] = v;
  const tx = {}; for (const [m, v] of Object.entries(map(obj.tx))) { const rows = Array.isArray(v) ? v : Array.isArray(v?.rows) ? v.rows : null; if (/^\d{4}-\d{2}$/.test(m) && rows) tx[m] = rows; }
  const config = obj.config && typeof obj.config === 'object' && !Array.isArray(obj.config) ? obj.config : null;
  return { config, accounts, months, tx, holdings };
}
