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
    const card = /^CCSTMTRS>/i.test(st); const acctId = tag(st, 'ACCTID'); const acct = last4(acctId) || acctId.slice(-4); const number = acctId.trim();
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
    out.push({ acct, number, kind: card ? 'card' : 'cash', balance, balanceDate, rows });
  }
  return out;
}

// ---------- QIF ----------
// A QIF file is one account, with no account number. Some banks put the card used in each memo ("Card ending 1234"):
// those numbers are collected in `cards` to help recognise the account, kept on the row as `card`, and left out of the description.
const QIF_CARD = /^\s*(?:(?:credit |debit )?card|account|acct)\b\D*[\d\s\-x*]*?(\d{4})\s*$/i;
export function parseQif(text) {
  const rows = []; const cards = new Set(); let cur = {}, isCard = false;
  for (const line of String(text).split(/\r?\n/)) {
    const k = line[0], v = line.slice(1).trim();
    if (k === '!' && /^!Type:\s*CCard/i.test(line)) isCard = true;
    if (k === '^') {
      const date = parseDate(cur.D), amt = parseAmount(cur.T ?? cur.U); const cm = (cur.M || '').match(QIF_CARD); const memo = cm ? '' : cur.M;
      if (date && amt != null) { const t = { date, amt, desc: [cur.P, memo && memo !== cur.P ? memo : ''].filter(Boolean).join(' ').trim(), merchant: '', acct: '', bal: null, type: '', nabCat: '' }; if (cm) { t.card = cm[1]; cards.add(cm[1]); } rows.push(t); }
      cur = {};
    } else if (k && k !== '!') cur[k] = v;
  }
  return [{ acct: '', kind: isCard ? 'card' : 'cash', balance: null, balanceDate: null, cards: [...cards], rows }];
}

// For a file with no account number: the account whose saved transactions it overlaps, if that's clear.
// A match is the same date, amount and start of description. Needs at least 3 matches, 80% of them on one account.
export function guessAccount(saved, rows) {
  const key = (t) => [t.date, Math.round(Number(t.amt) * 100), normDesc(t.desc).slice(0, 6)].join('|');
  const by = new Map(); for (const t of saved || []) { if (!t.acct) continue; const k = key(t); if (!by.has(k)) by.set(k, []); by.get(k).push(t.acct); }
  const votes = new Map(); let total = 0;
  for (const t of rows || []) { const accts = by.get(key(t)); if (!accts) continue; total++; for (const a of new Set(accts)) votes.set(a, (votes.get(a) || 0) + 1); }
  let best = '', n = 0; for (const [a, v] of votes) if (v > n) { best = a; n = v; }
  return n >= 3 && n >= 0.8 * total ? best : '';
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
    const t = { date, amt, desc: g(r, 'desc'), merchant: g(r, 'merchant'), acct: last4(g(r, 'account')), bal, type: g(r, 'type'), nabCat: g(r, 'category') };
    // The full account number, for the account's details. The app takes it off the row before saving.
    if (g(r, 'account').trim()) Object.defineProperty(t, 'acctNo', { value: g(r, 'account').trim().replace(/\s+/g, ' '), enumerable: false });
    out.push(t);
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

// ---------- telling new transactions from ones already imported ----------
// Upper case, letters and digits only, so spacing and punctuation differences between downloads don't matter.
export const normDesc = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const cents = (t) => Math.round(Number(t.amt) * 100);
// The running balance is left out on purpose: it can differ between two downloads of the same transaction.
export const matchKey = (t) => [t.date, cents(t), t.acct || '', normDesc(t.desc).slice(0, 40)].join('|');
const DAY = 86400000;

// Returns only the incoming transactions that aren't already in `existing`.
// 1. Exact matches (same date, amount, account and description), counted, so two identical coffees on one day still both import.
// 2. A card purchase that was pending in an earlier download can come back with a new date or longer description once it
//    goes through. An existing transaction counts as the same one if it has the same account and amount, the description
//    starts the same way, it's within `days` days, and it falls within the dates the new file covers for that account,
//    widened by `days` because a purchase often posts a day or two after it was pending. Older purchases the new file
//    doesn't reach can't swallow a genuine new one.
export function newOnly(existing, incoming, days = 3) {
  const pool = new Map();
  for (const e of existing || []) { const k = matchKey(e); if (!pool.has(k)) pool.set(k, []); pool.get(k).push(e); }
  const used = new Set(); const rest = [];
  for (const t of incoming || []) { const hit = (pool.get(matchKey(t)) || []).find((e) => !used.has(e)); if (hit) used.add(hit); else rest.push(t); }
  const range = new Map();
  for (const t of incoming || []) { const a = t.acct || ''; const r = range.get(a) || [t.date, t.date]; range.set(a, [t.date < r[0] ? t.date : r[0], t.date > r[1] ? t.date : r[1]]); }
  const fresh = [];
  for (const t of rest) {
    const a = t.acct || '', r = range.get(a), head = normDesc(t.desc).slice(0, 6), d = Date.parse(t.date);
    const from = Date.parse(r[0]) - days * DAY, to = Date.parse(r[1]) + days * DAY;
    const hit = (existing || []).find((e) => !used.has(e) && (e.acct || '') === a && cents(e) === cents(t) && Date.parse(e.date) >= from && Date.parse(e.date) <= to
      && Math.abs(Date.parse(e.date) - d) <= days * DAY && head.length >= 3 && normDesc(e.desc).slice(0, 6).startsWith(head));
    if (hit) used.add(hit); else fresh.push(t);
  }
  return fresh;
}

// ---------- finding duplicates already saved ----------
// Groups transactions that look like the same one imported more than once: same account and amount, the same
// description (ignoring spacing and punctuation), within `days` days. `score` picks the copy to keep (highest wins,
// earliest date on a tie), so a copy the user recategorised or tagged survives.
export function findDuplicates(rows, score = () => 0, days = 3) {
  const by = new Map();
  for (const t of rows || []) { const k = [t.acct || '', cents(t), normDesc(t.desc)].join('|'); if (!by.has(k)) by.set(k, []); by.get(k).push(t); }
  const groups = [];
  for (const list of by.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.date.localeCompare(b.date));
    let cur = [list[0]];
    const flush = () => { if (cur.length > 1) { const keep = cur.reduce((best, t) => (score(t) > score(best) ? t : best)); groups.push({ keep, remove: cur.filter((t) => t !== keep) }); } };
    for (const t of list.slice(1)) { if (Date.parse(t.date) - Date.parse(cur[0].date) <= days * DAY) cur.push(t); else { flush(); cur = [t]; } }
    flush();
  }
  return groups.sort((a, b) => b.keep.date.localeCompare(a.keep.date));
}

// ---------- replacing saved transactions with a fresh import ----------
// The files become the record for each account over the dates they cover. Saved transactions in that window are
// replaced; anything the user set on them (category, tags) is copied to the matching new transaction first.
//   saved: every saved transaction; incoming: [{ acct, rows }] from the files; score picks which saved copy to take
//   settings from when the same transaction was saved more than once.
// Returns { replace: saved rows to remove, rows: incoming rows with settings carried over, carried: how many }.
export const CARRY = ['cat', 'userCat', 'lumpy', 'partner'];
export function planReplace(saved, incoming, score = () => 0, days = 3) {
  const all = (incoming || []).flatMap((g) => g.rows);
  const windows = new Map();
  for (const t of all) { const a = t.acct || ''; const w = windows.get(a) || [t.date, t.date]; windows.set(a, [t.date < w[0] ? t.date : w[0], t.date > w[1] ? t.date : w[1]]); }
  const inWindow = (t, pad) => { const w = windows.get(t.acct || ''); return !!w && Date.parse(t.date) >= Date.parse(w[0]) - pad && Date.parse(t.date) <= Date.parse(w[1]) + pad; };
  const replace = (saved || []).filter((t) => inWindow(t, 0));
  // Saved transactions just outside the dates can still be the pending version of one inside them.
  const near = (saved || []).filter((t) => !inWindow(t, 0) && inWindow(t, days * DAY));
  const used = new Set(); const rows = []; let carried = 0;
  const carry = (t, from) => { const out = { ...t }; for (const f of CARRY) if (from[f] !== undefined) out[f] = from[f]; carried++; return out; };
  const byScore = (a, b) => score(b) - score(a);
  // 1. Exact matches. If the same transaction was saved more than once, the best copy's settings are used and every copy goes.
  const savedByKey = new Map(); for (const t of replace) { const k = matchKey(t); if (!savedByKey.has(k)) savedByKey.set(k, []); savedByKey.get(k).push(t); }
  const newByKey = new Map(); for (const t of all) { const k = matchKey(t); if (!newByKey.has(k)) newByKey.set(k, []); newByKey.get(k).push(t); }
  const rest = [];
  for (const [k, news] of newByKey) {
    const olds = (savedByKey.get(k) || []).sort(byScore);
    news.forEach((t, i) => { if (olds[i]) rows.push(carry(t, olds[i])); else rest.push(t); });
    olds.forEach((x) => used.add(x));
  }
  // 2. Pending purchases that went through with a new date or longer description.
  for (const t of rest) {
    const head = normDesc(t.desc).slice(0, 6), d = Date.parse(t.date);
    const like = (x) => !used.has(x) && cents(x) === cents(t) && head.length >= 3 && normDesc(x.desc).slice(0, 6).startsWith(head) && Math.abs(Date.parse(x.date) - d) <= days * DAY;
    const cands = [...replace, ...near].filter((x) => like(x) && (x.acct || '') === (t.acct || '')).sort(byScore);
    if (cands.length) { used.add(cands[0]); if (!replace.includes(cands[0])) replace.push(cands[0]); rows.push(carry(t, cands[0])); }
    else rows.push({ ...t });
  }
  return { replace, rows, carried };
}
