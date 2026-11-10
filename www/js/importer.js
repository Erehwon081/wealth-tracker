// Reads bank export files into one transaction shape: { date, amt, desc, merchant, acct, bal, type, nabCat }.
// Three routes: standard bank files (OFX/QFX, QIF), a built-in profile for a known bank's CSV, or a column mapping
// the user confirms once (saved as a profile). Pure, so it can be unit tested. Nothing here talks to a network.
import { csvRows } from './csv.js';

const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const p2 = (x) => String(x).padStart(2, '0');
const yr = (y) => (+y < 100 ? 2000 + +y : +y);
const valid = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y > 1970 ? `${y}-${p2(m)}-${p2(d)}` : null);

// Australian day-first dates, ISO dates, and OFX's YYYYMMDD.
export function parseDate(s) {
  s = String(s ?? '').trim().replace(/^"|"$/g, ''); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return valid(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/))) return valid(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})(?!\d{1}$)/)) && s.length >= 8 && /^\d{8}/.test(s)) return valid(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-'](\d{2,4})/))) return valid(yr(m[3]), +m[2], +m[1]);
  if ((m = s.match(/^(\d{1,2})[\s\-]([A-Za-z]{3})[A-Za-z]*[\s\-,]+(\d{2,4})/))) { const mo = MON.indexOf(m[2].toLowerCase()) + 1; return mo ? valid(yr(m[3]), mo, +m[1]) : null; }
  return null;
}

// "$1,234.56", "-12.30", "(12.30)", "12.30 DR", "12.30CR".
export function parseAmount(v) {
  let s = String(v ?? '').trim(); if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || /^[-−]/.test(s) || /DR$/i.test(s) || /-$/.test(s);
  const x = parseFloat(s.replace(/[^0-9.]/g, '')); if (!Number.isFinite(x)) return null;
  return neg ? -x : x;
}
export const last4 = (s) => (String(s ?? '').replace(/\s/g, '').match(/(\d{4})\D*$/) || [])[1] || '';

export function detectKind(name, text) {
  const head = String(text || '').slice(0, 2000);
  if (/OFXHEADER|<OFX>/i.test(head)) return 'ofx';
  if (/^\s*!(Type|Account):/im.test(head) || /\.qif$/i.test(name || '')) return 'qif';
  return 'csv';
}

// ---------- OFX / QFX ----------
const tag = (block, name) => { const m = block.match(new RegExp('<' + name + '>([^<\\r\\n]*)', 'i')); return m ? m[1].trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : ''; };
export function parseOfx(text) {
  const out = []; const stmts = String(text).split(/<(?=(?:CC)?STMTRS>)/i).slice(1);
  for (const st of stmts) {
    const card = /^CCSTMTRS>/i.test(st); const acctId = tag(st, 'ACCTID'); const acct = last4(acctId) || acctId.slice(-4);
    const lb = st.match(/<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<AVAILBAL>|<\/(?:CC)?STMTRS>|$)/i);
    const balance = lb ? parseAmount(tag(lb[1], 'BALAMT')) : null; const balanceDate = lb ? parseDate(tag(lb[1], 'DTASOF')) : null;
    const rows = [];
    for (const t of st.split(/<STMTTRN>/i).slice(1)) {
      const date = parseDate(tag(t, 'DTPOSTED')), amt = parseAmount(tag(t, 'TRNAMT')); if (!date || amt == null) continue;
      const name = tag(t, 'NAME'), memo = tag(t, 'MEMO');
      rows.push({ date, amt, desc: [name, memo && memo !== name ? memo : ''].filter(Boolean).join(' ').trim(), merchant: '', acct, bal: null, type: tag(t, 'TRNTYPE'), nabCat: '' });
    }
    // Carry the closing balance on the newest transaction, which is where the app reads month-end balances from.
    if (balance != null && rows.length) { const newest = rows.reduce((a, b) => (b.date > a.date ? b : a)); newest.bal = balance; }
    out.push({ acct, kind: card ? 'card' : 'cash', balance, balanceDate, rows });
  }
  return out;
}

// ---------- QIF ----------
export function parseQif(text) {
  const rows = []; let cur = {};
  for (const line of String(text).split(/\r?\n/)) {
    const k = line[0], v = line.slice(1).trim();
    if (k === '^') { const date = parseDate(cur.D), amt = parseAmount(cur.T ?? cur.U); if (date && amt != null) rows.push({ date, amt, desc: [cur.P, cur.M && cur.M !== cur.P ? cur.M : ''].filter(Boolean).join(' ').trim(), merchant: '', acct: '', bal: null, type: '', nabCat: '' }); cur = {}; }
    else if (k && k !== '!') cur[k] = v;
  }
  return [{ acct: '', kind: 'cash', balance: null, balanceDate: null, rows }];
}

// ---------- CSV ----------
// A mapping says which column (by position) holds each field. -1 means the file doesn't have it.
export const FIELDS = ['date', 'amount', 'debit', 'credit', 'desc', 'balance', 'account', 'category', 'merchant', 'type'];
const HEADER_HINTS = {
  date: /^(transaction |posting |effective |value |trans\.? ?)?date$|^date/i, amount: /^amount$|^amt$|^value$|transaction amount|^amount \(/i, debit: /debit|withdrawal|money out|paid out|^dr$/i, credit: /credit|deposit|money in|paid in|^cr$/i,
  desc: /description|narrative|narration|details|particulars|payee|memo|reference|^transaction$/i, balance: /balance/i, account: /account( number| no\.?)?$|^bank account$|^bsb/i, category: /^categor/i, merchant: /merchant/i, type: /^(transaction )?type$|^tran type$/i,
};
const looksDate = (v) => !!parseDate(v);
const looksMoney = (v) => /^[\s($\-−+]*\d[\d,]*(\.\d+)?\)?\s*(CR|DR)?$/i.test(String(v ?? '').trim()) && /\d/.test(v);

export function hasHeaderRow(rows) { const first = rows[0] || []; return !first.some((c) => looksDate(c)) && first.some((c) => /[A-Za-z]/.test(c)); }
export const signature = (rows) => (hasHeaderRow(rows) ? 'h:' + rows[0].map((c) => c.trim().toLowerCase()).join('|') : 'n:' + (rows[0] || []).length);

// Best guess at the mapping, from the header names if there are any and from what the data looks like otherwise.
export function guessMapping(rows) {
  const header = hasHeaderRow(rows); const data = rows.slice(header ? 1 : 0).filter((r) => r.some((c) => String(c).trim())).slice(0, 25);
  const ncol = Math.max(0, ...rows.slice(0, 10).map((r) => r.length)); const map = Object.fromEntries(FIELDS.map((f) => [f, -1]));
  const free = (i) => !Object.values(map).includes(i);
  if (header) for (const f of FIELDS) { const i = rows[0].findIndex((c, k) => free(k) && HEADER_HINTS[f].test(c.trim())); if (i >= 0) map[f] = i; }
  const frac = (i, test) => (data.length ? data.filter((r) => test(r[i])).length / data.length : 0);
  if (map.date < 0) for (let i = 0; i < ncol; i++) if (free(i) && frac(i, looksDate) > 0.8) { map.date = i; break; }
  if (map.amount < 0 && (map.debit < 0 || map.credit < 0)) {
    const money = []; for (let i = 0; i < ncol; i++) if (free(i) && frac(i, (v) => looksMoney(v) && !looksDate(v)) > 0.6) money.push(i);
    // With no header, the first money column is the amount and a later one the running balance.
    if (money.length) { map.amount = money[0]; if (map.balance < 0 && money.length > 1) map.balance = money[money.length - 1]; }
  }
  if (map.amount >= 0) { map.debit = -1; map.credit = -1; }
  if (map.desc < 0) { let best = -1, len = 0; for (let i = 0; i < ncol; i++) { if (!free(i)) continue; const avg = data.reduce((s, r) => s + (/[A-Za-z]{3}/.test(r[i] || '') ? String(r[i]).length : 0), 0) / (data.length || 1); if (avg > len) { len = avg; best = i; } } map.desc = best; }
  return { header, map, flip: false };
}

export const mappingOk = (m) => !!m && m.map.date >= 0 && m.map.desc >= 0 && (m.map.amount >= 0 || m.map.debit >= 0 || m.map.credit >= 0);

export function applyMapping(rows, m) {
  const g = (r, f) => (m.map[f] >= 0 ? String(r[m.map[f]] ?? '').trim() : '');
  const out = [];
  for (const r of rows.slice(m.header ? 1 : 0)) {
    const date = parseDate(g(r, 'date')); if (!date) continue;
    let amt = m.map.amount >= 0 ? parseAmount(g(r, 'amount')) : null;
    if (amt == null) { const d = parseAmount(g(r, 'debit')), c = parseAmount(g(r, 'credit')); if (d == null && c == null) continue; amt = Math.abs(c || 0) - Math.abs(d || 0); }
    if (m.flip) amt = -amt;
    const balTxt = g(r, 'balance'); const bal = balTxt === '' ? null : parseAmount(balTxt);
    out.push({ date, amt, desc: g(r, 'desc'), merchant: g(r, 'merchant'), acct: last4(g(r, 'account')), bal, type: g(r, 'type'), nabCat: g(r, 'category') });
  }
  return out;
}

// Built-in bank profiles: matched by the column names a bank's export always has, mapped by name so column order doesn't matter.
export const BUILTIN_PROFILES = [
  { id: 'nab', name: 'NAB', requires: ['date', 'amount', 'transaction details'], names: { date: 'date', amount: 'amount', desc: 'transaction details', balance: 'balance', account: 'account number', category: 'category', merchant: 'merchant name', type: 'transaction type' } },
];

// Finds how to read a CSV: a built-in bank profile, a profile the user saved earlier, or a guess to confirm.
export function resolveMapping(rows, saved = []) {
  const sig = signature(rows);
  if (hasHeaderRow(rows)) {
    const head = rows[0].map((c) => c.trim().toLowerCase());
    for (const p of BUILTIN_PROFILES) if (p.requires.every((x) => head.includes(x))) return { source: 'builtin', name: p.name, signature: sig, mapping: { header: true, flip: false, map: Object.fromEntries(FIELDS.map((f) => [f, p.names[f] ? head.indexOf(p.names[f]) : -1])) } };
  }
  const s = (saved || []).find((x) => x.signature === sig && mappingOk(x.mapping));
  if (s) return { source: 'saved', name: s.name || 'Saved format', signature: sig, mapping: s.mapping };
  return { source: 'guess', name: '', signature: sig, mapping: guessMapping(rows) };
}

export const readCsv = (text) => csvRows(text).filter((r) => r.some((c) => String(c).trim()));
