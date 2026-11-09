// Live prices from Google Sheets tabs published to the web as CSV.
import { csvRows } from './csv.js';

// Zero-based columns of the holdings table at the top of each tab.
export const SHEET_COLS = {
  etf:    { label: 'ETFs',   price: 3, units: 5, value: 6 }, // A ticker, D price, F units, G value
  stock:  { label: 'Stocks', price: 3, units: 6, value: 7 }, // A ticker, D price, G units, H value
  crypto: { label: 'Crypto', price: 1, units: 3, value: 4 }, // A ticker, B price, D units, E value
};

const num = (v) => { const s = String(v ?? '').trim(); if (!s) return 0; const neg = /^\(.*\)$/.test(s) || /^[-−]/.test(s); const x = parseFloat(s.replace(/[^0-9.]/g, '')); return Number.isFinite(x) ? (neg ? -x : x) : 0; };

// Strips exchange prefixes ("ASX:VAS" -> "VAS").
export const cleanTicker = (s) => String(s ?? '').split(':').pop().trim().toUpperCase();

// Reads only the holdings table: row 1 is the header, and the table ends at the first row with an empty ticker,
// because a purchase history table follows further down the tab.
export function parseHoldingsTable(text, kind) {
  const cols = SHEET_COLS[kind]; if (!cols) throw new Error('Unknown tab ' + kind);
  const rows = csvRows(text);
  const out = [];
  for (const r of rows.slice(1)) {
    if (!r || !String(r[0] ?? '').trim()) break;
    const ticker = cleanTicker(r[0]); if (!ticker || ticker.length > 12) continue;
    const units = num(r[cols.units]), value = num(r[cols.value]), shown = num(r[cols.price]);
    // Small crypto prices round to $0.00 in the sheet, so value / units is the better price when both exist.
    const price = units > 0 && value > 0 ? value / units : shown;
    if (price > 0) out.push({ ticker, price, units, value, kind });
  }
  return out;
}

export function looksLikePublishedCsv(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && u.hostname === 'docs.google.com' && /\/spreadsheets\/d\/e\/[^/]+\/pub/.test(u.pathname) && /output=csv/.test(u.search); } catch { return false; }
}

export class PriceError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

export async function fetchTab(url, kind, fetchImpl = fetch) {
  let res;
  try { res = await fetchImpl(url, { cache: 'no-store', credentials: 'omit', redirect: 'follow' }); }
  catch (e) { throw new PriceError(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'network', e?.message || 'fetch failed'); }
  if (!res.ok) throw new PriceError('http', 'HTTP ' + res.status);
  const text = await res.text();
  if (/^\s*<(!doctype|html)/i.test(text)) throw new PriceError('not_csv', 'Got a web page, not CSV');
  return parseHoldingsTable(text, kind);
}

// Fetches every configured tab. Returns { found: {TICKER: row}, errors: [{kind, code}] }.
export async function fetchAllPrices(links, fetchImpl = fetch) {
  const found = {}, errors = [];
  const kinds = Object.keys(SHEET_COLS).filter((k) => (links?.[k] || '').trim());
  const results = await Promise.allSettled(kinds.map((k) => fetchTab(links[k].trim(), k, fetchImpl)));
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') { for (const row of r.value) if (!found[row.ticker]) found[row.ticker] = row; }
    else errors.push({ kind: kinds[i], code: r.reason?.code || 'network', message: r.reason?.message });
  });
  return { found, errors, tabs: kinds.length };
}
