import * as store from './storage.js';
import { parseCSV } from './csv.js';
import { fetchAllPrices, looksLikePublishedCsv, SHEET_COLS } from './prices.js';
import { buildBackup, encryptBackup, decryptBackup, isEncrypted, readBackup, backupFileName } from './backup.js';

'use strict';
// ---------- constants ----------
const SPEND_CATS = ['Groceries','Eating out','Cafes','Fuel','Transport','Bills','Insurance','Health','Personal care','Shopping','Clothing','Home & furniture','Entertainment','Subscriptions','Services','Pets','Gifts','Rego','Council rates','Interest & fees','Other'];
const FLOW_CATS = ['Income','Money in','Rent','Mortgage','Car loan','Child support','Partner mortgage share','Partner other','Transfer',"Partner's card"];
const ALL_CATS = [...SPEND_CATS, ...FLOW_CATS];
const LUMPY_CATS = new Set(['Rego','Council rates']);
const NAB_MAP = { 'Restaurants & takeaway':'Eating out','Cafe & coffee':'Cafes','Groceries':'Groceries','Fuel':'Fuel','Parking & tolls':'Transport','Travel expenses':'Transport','Vehicle expenses':'Transport','Phone & internet':'Bills','Utilities':'Bills','Insurance':'Insurance','Medical':'Health','Other shopping':'Shopping','Clothing & accessories':'Clothing','Homeware':'Home & furniture','Home improvements':'Home & furniture','Media':'Entertainment','Hobbies':'Entertainment','Subscriptions':'Subscriptions','Electronics & technology':'Subscriptions','Services':'Services','Pets':'Pets','Fees':'Interest & fees','Loans':'Interest & fees','Government':'Other','Gifts & donations':'Gifts' };
const TYPES = { cash:'Cash account', offset:'Offset account', card:'Credit card', super:'Super', invest:'Investments', property:'Property', vehicle:'Vehicle', other:'Other asset', mortgage:'Mortgage', loan:'Loan' };
const LIAB = new Set(['card','mortgage','loan']);
const LIQUID = new Set(['cash','offset','card']);

// ---------- state ----------
const S = { config: null, meta: {}, accounts: [], months: {}, tx: {}, view: 'home', month: null, draft: null, holdings: [], filter: 'spend', catFilter: null, search: '', sort: 'date', ready: { config:false, accounts:false, months:false } };

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); } for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k))); return e; };
const n = (v) => { const x = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(x) ? x : 0; };
const has = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const fmt0 = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtK = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', notation: 'compact', maximumFractionDigits: 1 });
const $0 = (v) => fmt0.format(Math.round(v)).replace('-', '−');
const $2 = (v) => fmt2.format(v).replace('-', '−');
const $k = (v) => fmtK.format(v).replace('-', '−');
const sgn = (v, f = $0) => (v > 0 ? '+' : '') + f(v);
const pct = (v) => (v * 100).toFixed(0) + '%';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const mLabel = (m, long) => { const [y, mo] = m.split('-').map(Number); return long ? new Date(Date.UTC(y, mo - 1, 1)).toLocaleString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : MONTHS[mo - 1] + ' ' + String(y).slice(2); };
const mAdd = (m, k) => { let [y, mo] = m.split('-').map(Number); mo += k; while (mo < 1) { mo += 12; y--; } while (mo > 12) { mo -= 12; y++; } return y + '-' + String(mo).padStart(2, '0'); };
const thisMonth = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const clone = (o) => JSON.parse(JSON.stringify(o ?? null));
let toastT; const toast = (msg) => { $$('.toast').forEach((t) => t.remove()); const t = el('div', { class: 'toast', role: 'status', text: msg }); document.body.append(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2600); };
const setSave = (txt) => { $('#saveState').textContent = txt; };

const DEFAULT_CONFIG = {
  mortgageShare: 0.5, childSupport: 0, everydayTarget: 5200,
  fixed: { rent: 1387, carLoan: 1081.36 },
  targets: { Groceries: 1100, 'Eating out': 450, Cafes: 150, Fuel: 650, Transport: 150, Bills: 450, Insurance: 300, Health: 200, 'Personal care': 100, Shopping: 500, Clothing: 150, 'Home & furniture': 200, Entertainment: 80, Subscriptions: 115, Services: 150, Pets: 100, Gifts: 50, Other: 100 },
  sinking: [ { name: 'Car rego', yearly: 2694 }, { name: 'Car insurance', yearly: 1478 }, { name: 'Council rates, your half', yearly: 1050 } ],
  rules: [], partnerName: 'Partner', partnerCards: [], partnerNames: [], rentPayees: [], priceSheets: { etf: '', stock: '', crypto: '' },
  goal: { cash: 50000 }, scenario: { sellCostPct: 2.5, breakCost: 0, leaseRentWeek: 650, leaseCostPct: 15 }
};
const cfg = () => ({ ...DEFAULT_CONFIG, ...(S.config || {}), fixed: { ...DEFAULT_CONFIG.fixed, ...(S.config?.fixed || {}) }, goal: { ...DEFAULT_CONFIG.goal, ...(S.config?.goal || {}) }, scenario: { ...DEFAULT_CONFIG.scenario, ...(S.config?.scenario || {}) }, priceSheets: { ...DEFAULT_CONFIG.priceSheets, ...(S.config?.priceSheets || {}) } });
// Display name for the partner; categories keep their stored keys ("Partner's card" etc.) so backups stay compatible.
const pName = () => (cfg().partnerName || '').trim() || 'Partner';
const pLabel = (k) => String(k).replace(/Partner/g, pName());

// ---------- persistence ----------
// Paths keep the shape the app was written against: app/config, accounts/<id>, months/<YYYY-MM>, tx/<YYYY-MM>, holdings/<id>.
const storeFor = (path) => { const [col, id] = path.split('/'); return col === 'app' ? ['config', 'app'] : [col, id]; };
async function writeDoc(path, data) {
  const [st, key] = storeFor(path);
  try { setSave('Saving…'); await store.put(st, key, st === 'tx' ? clone(data.rows ?? data) : clone(data)); setSave('Saved on this device'); return true; }
  catch (e) { setSave('Not saved'); toast(e?.name === 'QuotaExceededError' ? 'Storage is full. Delete old imports to make room.' : "Couldn't save on this device. Try again."); return false; }
}
async function deleteDoc(path) { const [st, key] = storeFor(path); try { await store.del(st, key); } catch { toast("Couldn't delete that. Try again."); } }
const saveConfig = (patch) => { S.config = { ...(S.config || {}), ...patch }; render(); return writeDoc('app/config', S.config); };

// ---------- calculations ----------
const sortedMonths = () => Object.keys(S.months).sort();
function balanceFor(acct, m) {
  // latest known balance on or before month m
  const ms = sortedMonths().filter((x) => x <= m).reverse();
  for (const k of ms) { const b = S.months[k]?.balances?.[acct.id]; if (has(b)) return { v: Number(b), m: k }; }
  return null;
}
function netWorth(m) {
  let assets = 0, liab = 0, liquid = 0, missing = [];
  const by = {};
  for (const a of S.accounts) {
    const b = balanceFor(a, m); const share = (a.ownerPct ?? 100) / 100;
    if (!b) { missing.push(a.name); continue; }
    const v = b.v * share;
    if (LIAB.has(a.type)) liab += v; else assets += v;
    if (LIQUID.has(a.type)) liquid += v;
    by[a.type] = (by[a.type] || 0) + v;
  }
  return { nw: assets + liab, assets, liab, liquid, missing, by };
}
function flows(m) {
  const c = cfg(); const d = S.months[m] || {};
  const income = n(d.income), otherIn = n(d.otherIn), rent = n(d.rent), car = n(d.carLoan);
  const mortgageHalf = has(d.mortgagePaid) ? n(d.mortgagePaid) * c.mortgageShare : 0;
  const child = has(d.childSupport) ? n(d.childSupport) : 0;
  const spendCats = d.spend || {};
  const cardSpend = Object.values(spendCats).reduce((s, v) => s + n(v), 0);
  const shonnyOnCard = n(d.shonnyOnCard);
  const own = Math.max(0, cardSpend - shonnyOnCard);
  const lumpy = n(d.lumpy);
  const everyday = Math.max(0, own - lumpy);
  const inTotal = income + otherIn;
  const net = inTotal - rent - car - mortgageHalf - child - own;
  return { income, otherIn, rent, car, mortgageHalf, child, cardSpend, shonnyOnCard, own, lumpy, everyday, net, netExLumpy: net + lumpy, rate: inTotal ? net / inTotal : null, hasData: inTotal > 0 || cardSpend > 0 };
}
function payoff(balance, ratePct, payment) {
  const B = Math.abs(n(balance)), r = n(ratePct) / 100 / 12, P = n(payment);
  if (!B || !P) return null; if (!r) return { months: Math.ceil(B / P), interestMonth: 0 };
  if (P <= B * r) return { months: Infinity, interestMonth: B * r };
  return { months: Math.ceil(-Math.log(1 - (r * B) / P) / Math.log(1 + r)), interestMonth: B * r };
}

// ---------- CSV ----------
function parseDate(s) {
  s = String(s || '').trim(); let m;
  if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})$/))) { const mo = MONTHS.findIndex((x) => x.toLowerCase() === m[2].toLowerCase()) + 1; let y = +m[3]; if (y < 100) y += 2000; return `${y}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) { let y = +m[3]; if (y < 100) y += 2000; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
const last4 = (s) => (String(s || '').match(/(\d{4})\D*$/) || [])[1] || '';
function classify(r, c) {
  const det = (r.desc || '').toUpperCase(); const type = (r.type || '').toUpperCase(); const amt = r.amt;
  for (const rule of c.rules || []) if (rule.match && det.includes(String(rule.match).toUpperCase())) return { cat: rule.cat };
  if ((c.partnerCards || []).includes(r.acct)) return { cat: "Partner's card" };
  if (type.includes('CREDIT CARD PAYMENT') || type.includes('CASH ADVANCE')) return { cat: 'Transfer' };
  if (type === 'FEES' || type.includes('INTEREST')) return { cat: 'Interest & fees' };
  if (type.includes('SALARY') || det.includes('SALARY')) return { cat: 'Income' };
  if (/FIXED REPAYMENT|VARIABLE REPAYMENT|HOME LOAN/.test(det)) return { cat: 'Mortgage' };
  if (/CAR LOAN/.test(det)) return { cat: 'Car loan' };
  if (/CHILD SUPPORT/.test(det)) return { cat: 'Child support' };
  if (amt > 0 && (c.partnerNames || []).some((p) => det.includes(p.toUpperCase()))) return { cat: det.includes('MORTGAGE') ? 'Partner mortgage share' : 'Partner other' };
  if (amt < 0 && (c.rentPayees || []).some((p) => det.includes(p.toUpperCase()))) return { cat: 'Rent' };
  if (/LINKED ACC|INTERNET PAYMENT|INTERNAL/.test(det) || r.nabCat === 'Internal transfers') return { cat: 'Transfer' };
  if (amt > 0) return { cat: 'Money in' };
  if (/VICROADS/.test(det)) return { cat: 'Rego' };
  if (/COUNCIL/.test(det) && Math.abs(amt) > 100) return { cat: 'Council rates' };
  if (/DRY CLEAN|HAIR/.test(det)) return { cat: /HAIR/.test(det) ? 'Personal care' : 'Services' };
  if (/SKINCARE/.test(det)) return { cat: 'Personal care' };
  if (/ANMF/.test(det)) return { cat: 'Other' };
  return { cat: NAB_MAP[r.nabCat] || (/BAKER|BROTHERS|IGA|COLES|WOOLWORTHS|ALDI/.test(det) ? 'Groceries' : /CAFE|COFFEE|JORGE/.test(det) ? 'Cafes' : /DUMPLING|RAMEN|SUSHI|KITCHEN/.test(det) ? 'Eating out' : 'Other') };
}
function normaliseRows(raw) {
  return raw.map((r) => {
    const date = parseDate(r['Date'] || r['Transaction Date'] || r['date']);
    const amt = n(r['Amount'] ?? r['amount'] ?? r['Debit'] ?? 0) || (n(r['Credit']) - n(r['Debit']));
    const desc = r['Transaction Details'] || r['Description'] || r['Narrative'] || '';
    const merchant = r['Merchant Name'] || '';
    const acct = last4(r['Account Number'] || r['Account'] || '');
    const bal = has(n(r['Balance'])) && r['Balance'] !== '' ? n(r['Balance']) : null;
    return date ? { date, amt, desc, merchant, acct, bal, type: r['Transaction Type'] || '', nabCat: r['Category'] || '' } : null;
  }).filter(Boolean);
}
const txKey = (t) => [t.date, t.amt.toFixed(2), t.acct, t.desc, t.bal ?? ''].join('|');
function isLumpy(t) { return t.lumpy ?? (LUMPY_CATS.has(t.cat) || (SPEND_CATS.includes(t.cat) && -t.amt >= 400)); }
function summarise(rows) {
  const s = { income: 0, otherIn: 0, rent: 0, carLoan: 0, mortgagePaid: 0, childSupport: 0, shonnyMortgage: 0, shonnyOther: 0, shonnyCard: 0, tagged: 0, spend: {}, lumpy: 0 };
  for (const t of rows) {
    const v = t.amt; const c = t.cat;
    if (c === 'Income') s.income += v; else if (c === 'Money in') s.otherIn += v;
    else if (c === 'Rent') s.rent -= v; else if (c === 'Car loan') s.carLoan -= v; else if (c === 'Mortgage') s.mortgagePaid -= v; else if (c === 'Child support') s.childSupport -= v;
    else if (c === 'Partner mortgage share') s.shonnyMortgage += v; else if (c === 'Partner other') s.shonnyOther += v;
    else if (c === "Partner's card") s.shonnyCard -= v;
    else if (SPEND_CATS.includes(c)) { s.spend[c] = (s.spend[c] || 0) - v; if (isLumpy(t)) s.lumpy -= v; if (t.partner) s.tagged -= v; }
  }
  for (const k of Object.keys(s.spend)) s.spend[k] = Math.round(s.spend[k] * 100) / 100;
  return s;
}
function balancesFromRows(rows) {
  const out = {};
  for (const a of S.accounts) {
    const keys = (a.match || '').split(/[,\s]+/).filter(Boolean); if (!keys.length) continue;
    const mine = rows.filter((t) => keys.includes(t.acct) && t.bal != null);
    if (!mine.length) continue;
    const maxD = mine.reduce((m, t) => (t.date > m ? t.date : m), '');
    const t = mine.find((x) => x.date === maxD);
    out[a.id] = t.bal;
  }
  return out;
}
async function importFiles(files) {
  const c = cfg(); let all = [];
  for (const f of files) { try { all = all.concat(normaliseRows(parseCSV(await f.text()))); } catch { toast(`Couldn't read ${f.name}. Export it as CSV from NAB internet banking.`); } }
  if (!all.length) { toast('No transactions found in those files.'); return; }
  const byMonth = {};
  for (const t of all) { const m = t.date.slice(0, 7); (byMonth[m] ||= []).push(t); }
  let added = 0;
  for (const [m, rows] of Object.entries(byMonth)) {
    const existing = await loadTx(m);
    const seen = new Set(existing.map(txKey));
    const fresh = rows.filter((t) => !seen.has(txKey(t))).map((t) => ({ ...t, cat: classify(t, c).cat }));
    added += fresh.length;
    const merged = existing.concat(fresh).sort((a, b) => b.date.localeCompare(a.date));
    S.tx[m] = merged;
    await writeDoc('tx/' + m, { rows: merged, updatedAt: new Date().toISOString() });
    await applySummary(m, true);
  }
  const months = Object.keys(byMonth).sort();
  S.month = months[months.length - 1]; fillMonthPick();
  toast(`Imported ${added} new transaction${added === 1 ? '' : 's'} for ${months.map((m) => mLabel(m)).join(', ')}`);
  render();
}
async function applySummary(m, withBalances) {
  const rows = S.tx[m] || []; const s = summarise(rows); const c = cfg();
  const prev = S.months[m] || {};
  const half = s.mortgagePaid * c.mortgageShare;
  // Partner's share on your card: the larger of what their extra transfers cover and what you've tagged as theirs.
  // Taking the larger avoids counting a tagged purchase twice when a transfer already paid you back for it.
  const shonnyOnCard = Math.max(0, s.shonnyMortgage - half - s.shonnyCard, s.tagged);
  const patch = { income: r2(s.income), otherIn: r2(s.otherIn), rent: r2(s.rent), carLoan: r2(s.carLoan), mortgagePaid: r2(s.mortgagePaid), shonnyMortgage: r2(s.shonnyMortgage), shonnyCard: r2(s.shonnyCard), shonnyOnCard: r2(shonnyOnCard), spend: s.spend, lumpy: r2(s.lumpy), txCount: rows.length, source: 'csv' };
  if (s.childSupport) patch.childSupport = r2(s.childSupport);
  if (withBalances) patch.balances = { ...(prev.balances || {}), ...balancesFromRows(rows) };
  S.months[m] = { ...prev, ...patch };
  await writeDoc('months/' + m, S.months[m]);
}
const r2 = (v) => Math.round(v * 100) / 100;
// Older data names the partner categories after the person ("Shonny's card", "Shonny mortgage share", "Shonny other").
// Map them to the stored keys the app uses; the display name comes from Settings.
const LEGACY_CATS = [[/^.+['’]s card$/i, "Partner's card"], [/^.+ mortgage share$/i, 'Partner mortgage share'], [/^.+ other$/i, 'Partner other']];
function fixCat(cat) { if (!cat || ALL_CATS.includes(cat)) return cat; for (const [re, key] of LEGACY_CATS) if (re.test(cat)) return key; return cat; }
function fixRows(rows) { let changed = false; for (const t of rows) { const c = fixCat(t.cat); if (c !== t.cat) { t.cat = c; changed = true; } } return changed; }
async function loadTx(m) {
  if (S.tx[m]) return S.tx[m];
  try { const rows = await store.get('tx', m); S.tx[m] = Array.isArray(rows) ? rows : []; } catch { return []; }
  if (fixRows(S.tx[m])) await writeDoc('tx/' + m, { rows: S.tx[m] });
  return S.tx[m];
}

// ---------- account list PDF ----------
let pdfLibP;
function loadPdfJs() {
  if (pdfLibP) return pdfLibP;
  const base = new URL('../vendor/pdfjs/', import.meta.url).href;
  const add = (src) => new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = src; sc.onload = res; sc.onerror = () => rej(new Error('load')); document.head.append(sc); });
  pdfLibP = (async () => { await add(base + 'pdf.min.js'); const lib = window.pdfjsLib || window['pdfjs-dist/build/pdf']; lib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js'; return lib; })();
  pdfLibP.catch(() => { pdfLibP = null; });
  return pdfLibP;
}
async function pdfLines(file) {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p); const tc = await page.getTextContent(); const rows = new Map();
    for (const it of tc.items) { if (!it.str || !it.str.trim()) continue; const y = Math.round(it.transform[5] / 2) * 2; if (!rows.has(y)) rows.set(y, []); rows.get(y).push({ x: it.transform[4], s: it.str }); }
    [...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([, its]) => lines.push(its.sort((a, b) => a.x - b.x).map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim()));
  }
  return lines;
}
function parseAccountList(lines) {
  const found = []; let date = null; let buf = [];
  const amtRe = /([+\-−])?\s?\$\s?([\d,]+\.\d{2})/g;
  const amounts = (t) => [...t.matchAll(amtRe)].map((m) => (m[1] === '-' || m[1] === '−' ? -1 : 1) * n(m[2]));
  for (const ln of lines) {
    const dm = ln.match(/(\d{2})\/(\d{2})\/(\d{4})\s+\d{1,2}:\d{2}/); if (dm) date = `${dm[3]}-${dm[2]}-${dm[1]}`;
    const idm = ln.match(/Acc:\s*(\d+)|Card ending\s*(\d{4})|Loan number:\s*([A-Z0-9]+)/i);
    if (!idm) { buf.push(ln); continue; }
    const block = [...buf, ln]; buf = [];
    const id = (idm[1] || idm[2] || idm[3] || '').slice(-4);
    const amts = block.flatMap(amounts); if (!amts.length) continue;
    const names = block.map((t) => t.replace(amtRe, '').replace(/BSB:.*$|Card ending.*$|Loan number:.*$/i, '').replace(/\b(Available|Current|Internet Banking|Accounts)\b/g, '').replace(/[+\-−]/g, '').trim()).filter((t) => /[A-Za-z]{2}/.test(t));
    const name = names[names.length - 1] || 'Account …' + id;
    const kind = /card ending/i.test(ln) ? 'card' : /home loan|mortgage/i.test(name) ? 'mortgage' : /loan/i.test(name) || /Loan number/i.test(ln) ? 'loan' : /offset/i.test(name) ? 'offset' : 'cash';
    found.push({ id, name, bal: amts[amts.length - 1], kind });
  }
  return { found, date };
}
async function importAccountPdf(file) {
  let parsed;
  try { toast('Reading account list…'); parsed = parseAccountList(await pdfLines(file)); }
  catch { toast("Couldn't read that PDF. Use the Accounts list PDF from NAB internet banking."); return; }
  if (!parsed.found.length) { toast('No account balances found in that PDF.'); return; }
  const month = parsed.date ? parsed.date.slice(0, 7) : S.month;
  const guess = (f) => S.accounts.find((a) => (a.match || '').split(/[,\s]+/).includes(f.id)) || S.accounts.find((a) => a.type === f.kind && !(a.match || '').trim() && f.kind !== 'cash');
  const body = el('div', { class: 'card' });
  body.append(el('p', { class: 'cap muted', text: `Dated ${parsed.date ? new Date(parsed.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'unknown'}. Balances go into ${mLabel(month, true)}. Check each one is linked to the right account.` }));
  const picks = parsed.found.map((f, i) => {
    const g = guess(f); const sel = el('select', { class: 'month-pick', id: 'pdf-' + i, 'aria-label': 'Link ' + f.name }, el('option', { value: '' }, 'Skip'), el('option', { value: '__new' }, 'Add as new account'), S.accounts.map((a) => el('option', { value: a.id, selected: g && g.id === a.id }, a.name)));
    if (!g) sel.value = '__new';
    body.append(el('div', { class: 'field' }, el('label', { for: 'pdf-' + i }, f.name, el('small', { text: `…${f.id} · ${$2(f.bal)}` })), sel));
    return { f, sel };
  });
  sheet('Balances from NAB', body, async () => {
    if (S.month !== month) { S.month = month; fillMonthPick(); }
    if (S.view !== 'checkin') go('checkin');
    renderCheckin(true); const bal = S.draft.d.balances; let count = 0;
    for (const { f, sel } of picks) {
      let id = sel.value; if (!id) continue;
      if (id === '__new') { const a = { id: 'a' + Date.now().toString(36) + count, name: f.name, type: f.kind, ownerPct: f.kind === 'mortgage' ? n(cfg().mortgageShare) * 100 : 100, match: f.id, order: S.accounts.length }; S.accounts.push(a); await writeDoc('accounts/' + a.id, a); id = a.id; }
      else { const a = S.accounts.find((x) => x.id === id); const keys = (a.match || '').split(/[,\s]+/).filter(Boolean); if (!keys.includes(f.id)) { a.match = [...keys, f.id].join(','); await writeDoc('accounts/' + a.id, { ...a }); } }
      bal[id] = f.bal; count++;
    }
    S.draft.dirty = true; renderCheckin(); toast(`${count} balances filled in. Check them, then tap Save month.`);
  }, 'Fill in balances');
}

// ---------- charts ----------
function lineChart(host, pts, opts = {}) {
  host.replaceChildren();
  if (!pts.length) { host.append(el('p', { class: 'cap muted', text: opts.empty || 'Nothing to chart yet.' })); return; }
  const W = Math.max(280, host.clientWidth || 320), H = 170, pad = { l: 8, r: 8, t: 22, b: 22 };
  const vals = pts.map((p) => p.v); let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo -= Math.abs(lo) * 0.1 || 1; hi += Math.abs(hi) * 0.1 || 1; }
  const span = hi - lo; lo -= span * 0.15; hi += span * 0.15;
  const x = (i) => pts.length === 1 ? W / 2 : pad.l + 24 + (i * (W - pad.l - pad.r - 48)) / (pts.length - 1);
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - (v - lo) / (hi - lo));
  const ns = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', opts.label || 'Chart');
  const mk = (t, a) => { const e = document.createElementNS(ns, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); svg.append(e); return e; };
  for (let g = 0; g <= 2; g++) { const yy = pad.t + (g * (H - pad.t - pad.b)) / 2; mk('line', { x1: 0, x2: W, y1: yy, y2: yy, stroke: 'var(--line)', 'stroke-width': 1 }); }
  if (pts.length > 1) {
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
    mk('path', { d: d + `L${x(pts.length - 1)},${H - pad.b}L${x(0)},${H - pad.b}Z`, fill: 'var(--accent-soft)', opacity: 0.7 });
    mk('path', { d, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  }
  pts.forEach((p, i) => { mk('circle', { cx: x(i), cy: y(p.v), r: i === pts.length - 1 ? 4.5 : 2.5, fill: 'var(--accent)' }); });
  const step = Math.ceil(pts.length / 6);
  pts.forEach((p, i) => { if (i % step === 0 || i === pts.length - 1) { const t = mk('text', { x: x(i), y: H - 6, 'text-anchor': 'middle' }); t.textContent = mLabel(p.m); } });
  const lastI = pts.length - 1; const lt = mk('text', { x: Math.min(W - 4, Math.max(4, x(lastI))), y: y(pts[lastI].v) - 10, 'text-anchor': pts.length === 1 ? 'middle' : 'end' }); lt.textContent = $k(pts[lastI].v); lt.style.fill = 'var(--fg)';
  host.append(svg);
}
function barChart(host, pts, opts = {}) {
  host.replaceChildren();
  if (!pts.length) { host.append(el('p', { class: 'cap muted', text: opts.empty || 'Nothing to chart yet.' })); return; }
  const W = Math.max(280, host.clientWidth || 320), H = 160, pad = { t: 20, b: 22 };
  const vals = pts.map((p) => p.v); const hi = Math.max(0, ...vals), lo = Math.min(0, ...vals); const span = (hi - lo) || 1;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - (v - lo) / span);
  const bw = Math.min(34, (W - 16) / pts.length * 0.6); const x = (i) => 8 + ((i + 0.5) * (W - 16)) / pts.length;
  const ns = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', opts.label || 'Chart');
  const mk = (t, a) => { const e = document.createElementNS(ns, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); svg.append(e); return e; };
  mk('line', { x1: 0, x2: W, y1: y(0), y2: y(0), stroke: 'var(--line)', 'stroke-width': 1 });
  const step = Math.ceil(pts.length / 6);
  pts.forEach((p, i) => {
    const top = y(Math.max(0, p.v)), h = Math.max(1.5, Math.abs(y(p.v) - y(0)));
    mk('rect', { x: x(i) - bw / 2, y: top, width: bw, height: h, rx: 3, fill: p.v >= 0 ? 'var(--good)' : 'var(--bad)', opacity: 0.85 });
    const vt = mk('text', { x: x(i), y: p.v >= 0 ? top - 5 : top + h + 11, 'text-anchor': 'middle' }); vt.textContent = $k(p.v);
    if (i % step === 0 || i === pts.length - 1) { const t = mk('text', { x: x(i), y: H - 5, 'text-anchor': 'middle' }); t.textContent = mLabel(p.m); }
  });
  host.append(svg);
}

// ---------- sheet (modal) ----------
function sheet(title, body, onSave, saveLabel = 'Save') {
  const bg = el('div', { class: 'sheet-bg', onclick: (e) => { if (e.target === bg) close(); } });
  const close = () => bg.remove();
  const s = el('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
    el('div', { class: 'row' }, el('h2', { text: title }), el('button', { class: 'btn small', type: 'button', onclick: close, text: 'Close' })),
    body,
    onSave ? el('div', { class: 'btns' }, el('button', { class: 'btn primary', type: 'button', text: saveLabel, onclick: async () => { if ((await onSave()) !== false) close(); } })) : null);
  bg.append(s); document.body.append(bg);
  if (onSave) setTimeout(() => s.querySelector('input,select,textarea')?.focus(), 50);
  return close;
}
const moneyInput = (id, val, label) => el('div', { class: 'money' }, el('input', { id, type: 'text', inputmode: 'decimal', value: has(val) ? String(Number(val) !== 0 && Math.abs(Number(val)) < 1 ? +Number(val).toPrecision(4) : r2(Number(val))) : '', 'aria-label': label, placeholder: '0' }));
const fieldRow = (labelTxt, sub, control, forId) => el('div', { class: 'field' }, el('label', { for: forId }, labelTxt, sub ? el('small', { text: sub }) : null), control);

function accountSheet(acct) {
  const a = acct ? { ...acct } : { id: 'a' + Date.now().toString(36), name: '', type: 'cash', ownerPct: 100, order: S.accounts.length };
  const typeSel = el('select', { id: 'f-type', class: 'month-pick' }, Object.entries(TYPES).map(([k, v]) => el('option', { value: k, selected: k === a.type }, v)));
  const body = el('div', { class: 'card' },
    fieldRow('Name', null, el('input', { id: 'f-name', class: 'plain', value: a.name, placeholder: 'e.g. NAB offset' }), 'f-name'),
    fieldRow('Type', null, typeSel, 'f-type'),
    fieldRow('Your share', 'Percent you own', el('input', { id: 'f-own', class: 'plain', inputmode: 'decimal', value: a.ownerPct ?? 100 }), 'f-own'),
    fieldRow('Match CSV account', 'Last 4 digits, comma separated', el('input', { id: 'f-match', class: 'plain', value: a.match || '', inputmode: 'numeric' }), 'f-match'),
    fieldRow('Interest rate', '% a year, for loans', el('input', { id: 'f-rate', class: 'plain', inputmode: 'decimal', value: a.rate ?? '' }), 'f-rate'),
    fieldRow('Repayment', 'Per month', moneyInput('f-pay', a.repayment, 'Repayment'), 'f-pay'),
    fieldRow('Note', null, el('input', { id: 'f-note', class: 'plain', value: a.note || '' }), 'f-note'),
    acct ? el('button', { class: 'btn small', type: 'button', text: 'Remove this account', onclick: async (e) => {
      const b = e.currentTarget; if (b.dataset.armed) { await deleteDoc('accounts/' + a.id); S.accounts = S.accounts.filter((x) => x.id !== a.id); render(); $('.sheet-bg')?.remove(); toast('Removed'); }
      else { b.dataset.armed = '1'; b.textContent = 'Tap again to remove'; } } }) : null);
  sheet(acct ? 'Edit account' : 'Add account or loan', body, async () => {
    const name = $('#f-name').value.trim(); if (!name) { toast('Give it a name'); return false; }
    Object.assign(a, { name, type: $('#f-type').value, ownerPct: Math.max(0, Math.min(100, n($('#f-own').value) || 0)), match: $('#f-match').value.trim(), rate: $('#f-rate').value ? n($('#f-rate').value) : null, repayment: $('#f-pay').value ? n($('#f-pay').value) : null, note: $('#f-note').value.trim() });
    const i = S.accounts.findIndex((x) => x.id === a.id); if (i >= 0) S.accounts[i] = a; else S.accounts.push(a);
    render(); await writeDoc('accounts/' + a.id, a); toast('Saved');
  });
}

// ---------- views ----------
function renderHome() {
  renderFirstRun($('#h-first')); renderBackupNudge($('#h-nudge'));
  const m = S.month; const ms = sortedMonths();
  const cur = netWorth(m); const prevM = ms.filter((x) => x < m).pop(); const prev = prevM ? netWorth(prevM) : null;
  $('#h-nw').textContent = S.accounts.length ? $0(cur.nw) : '—';
  const d = $('#h-nwd'); d.replaceChildren();
  if (prev && S.accounts.length) { const ch = cur.nw - prev.nw; d.append(el('span', { class: ch >= 0 ? 'pos' : 'neg', text: sgn(ch) }), ` since ${mLabel(prevM)}`); }
  else d.append(S.accounts.length ? `At end of ${mLabel(m, true)}` : 'Add your accounts in Wealth to see this.');
  if (cur.missing.length) d.append(el('span', { class: 'muted', text: ` · no balance yet for ${cur.missing.length} account${cur.missing.length > 1 ? 's' : ''}` }));

  const f = flows(m); const c = cfg();
  const stats = $('#h-stats'); stats.replaceChildren();
  const stat = (l, v, cls, sub, subCls) => el('div', { class: 'stat' }, el('span', { class: 'l', text: l }), el('span', { class: 'v ' + (cls || ''), text: v }), sub ? el('span', { class: 'd ' + (subCls || 'muted'), text: sub }) : null);
  const ess = n(c.fixed.rent) + n(c.fixed.carLoan) + n(c.childSupport) + (f.mortgageHalf || 0) + n(c.everydayTarget);
  stats.append(
    stat('Cash flow', f.hasData ? $0(f.net) : '—', f.net >= 0 ? 'pos' : 'neg', f.hasData ? `${$0(f.netExLumpy)} without one-offs` : 'Import or key in this month'),
    stat('Savings rate', f.rate == null ? '—' : pct(f.rate), f.rate >= 0 ? 'pos' : 'neg', 'Of money in'),
    stat('Everyday spending', f.hasData ? $0(f.everyday) : '—', f.everyday <= c.everydayTarget ? 'pos' : 'neg', `Target ${$0(c.everydayTarget)}`),
    stat('Emergency cover', cur.liquid > 0 && ess ? (cur.liquid / ess).toFixed(1) + ' months' : '—', '', `Cash ${$k(cur.liquid)}, your share`)
  );
  const nwPts = ms.filter((x) => S.months[x]?.balances && Object.keys(S.months[x].balances).length).map((x) => ({ m: x, v: netWorth(x).nw }));
  lineChart($('#h-nwchart'), nwPts, { label: 'Net worth by month', empty: 'Save a check-in to start the chart.' });
  barChart($('#h-cfchart'), ms.filter((x) => flows(x).hasData).map((x) => ({ m: x, v: flows(x).net })), { label: 'Cash flow by month', empty: 'Import a month of transactions to start.' });

  const todo = $('#h-todo'); todo.replaceChildren(el('h2', { text: `${mLabel(m, true)} checklist` }));
  const md = S.months[m] || {};
  const item = (done, txt, tab) => el('div', { class: 'row', style: 'padding-block:8px;border-top:1px solid var(--line)' }, el('span', {}, el('span', { class: done ? 'pos' : 'muted', text: done ? '✓ ' : '○ ' }), txt), done ? null : el('button', { class: 'btn small', type: 'button', text: 'Go', onclick: () => go(tab) }));
  const balCount = Object.keys(md.balances || {}).length;
  todo.append(
    item(md.txCount > 0, md.txCount ? `${md.txCount} transactions imported` : 'Import the month\'s CSVs', 'spend'),
    item(balCount >= S.accounts.length && S.accounts.length > 0, `Balances keyed in (${balCount} of ${S.accounts.length})`, 'checkin'),
    item(f.cardSpend > 0 && f.everyday <= c.everydayTarget, f.cardSpend > 0 ? (f.everyday <= c.everydayTarget ? 'Everyday spending on target' : `Everyday spending ${$0(f.everyday - c.everydayTarget)} over target`) : 'Check spending against targets', 'budget'));
  if (md.notes) todo.append(el('p', { class: 'cap muted', text: md.notes }));
}

function renderCheckin(force) {
  const m = S.month; $('#c-title').textContent = mLabel(m, true);
  if (!S.draft || S.draft.m !== m || force) S.draft = { m, d: clone(S.months[m] || {}) };
  const d = S.draft.d; d.balances ||= {};
  const bal = $('#c-bal'); bal.replaceChildren();
  if (!S.accounts.length) bal.append(el('div', { class: 'empty' }, el('p', { text: 'No accounts yet. Add your bank accounts, card, super, property and loans.' })));
  const groups = [['Cash and cards', ['cash','offset','card']], ['Investments and super', ['invest','super']], ['Property and vehicles', ['property','vehicle','other']], ['Loans', ['mortgage','loan']]];
  for (const [gname, types] of groups) {
    const accts = S.accounts.filter((a) => types.includes(a.type)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); if (!accts.length) continue;
    bal.append(el('h3', { text: gname, style: 'margin-top:8px' }));
    for (const a of accts) {
      const last = balanceFor(a, mAdd(m, -1)); const id = 'b-' + a.id;
      const inp = moneyInput(id, d.balances[a.id], a.name);
      inp.querySelector('input').addEventListener('input', (e) => { S.draft.dirty = true; const v = e.target.value.trim(); if (v === '') delete d.balances[a.id]; else d.balances[a.id] = n(v) * (LIAB.has(a.type) && n(v) > 0 ? -1 : 1); renderCheckinResult(); });
      const sub = [a.ownerPct !== 100 ? `Your share ${a.ownerPct}%` : null, last ? `Last: ${$0(last.v)} (${mLabel(last.m)})` : null, LIAB.has(a.type) ? 'owing' : null].filter(Boolean).join(' · ');
      bal.append(fieldRow(a.name, sub, inp, id));
    }
  }
  const flow = $('#c-flow'); flow.replaceChildren();
  const F = [['income', 'Pay received', 'After tax'], ['otherIn', 'Other money in', 'Reimbursements, sales, gifts'], ['rent', 'Rent paid', null], ['carLoan', 'Car loan repayments', null], ['mortgagePaid', 'Mortgage repayments, total', `Your share ${pct(cfg().mortgageShare)}`], ['childSupport', 'Child support', null], ['shonnyCard', pLabel("Partner's card"), 'Not counted as yours'], ['shonnyOnCard', pLabel("Partner's share on your card"), 'Taken off your spending'], ['lumpy', 'One-off and yearly bills', 'Within your card spending']];
  for (const [k, l, s] of F) { const id = 'f-' + k; const inp = moneyInput(id, d[k], l); inp.querySelector('input').addEventListener('input', (e) => { S.draft.dirty = true; d[k] = e.target.value.trim() === '' ? null : n(e.target.value); renderCheckinResult(); }); flow.append(fieldRow(l, s, inp, id)); }
  const spendTotal = Object.values(d.spend || {}).reduce((s, v) => s + n(v), 0);
  const sid = 'f-spendtotal'; const sInp = moneyInput(sid, spendTotal || null, 'Card spending total');
  sInp.querySelector('input').addEventListener('input', (e) => { S.draft.dirty = true; d.spend = { Other: n(e.target.value) }; renderCheckinResult(); });
  flow.append(fieldRow('Card spending, total', d.txCount ? `From ${d.txCount} imported transactions` : 'Or import CSVs for categories', sInp, sid));
  if (d.txCount) sInp.querySelector('input').readOnly = true;
  $('#c-notes').value = d.notes || '';
  renderCheckinResult();
}
function renderCheckinResult() {
  const m = S.month; const saved = S.months[m]; S.months[m] = S.draft.d; const f = flows(m); const nw = netWorth(m); if (saved) S.months[m] = saved; else delete S.months[m];
  const r = $('#c-result'); r.replaceChildren(el('h2', { text: 'This month' }));
  const line = (l, v, cls) => el('div', { class: 'row', style: 'padding-block:6px' }, el('span', { class: 'muted', text: l }), el('span', { class: 'num ' + (cls || ''), text: v }));
  r.append(line('Net worth, your share', $0(nw.nw)), line('Your own spending', $0(f.own)), line('Everyday spending', $0(f.everyday), f.everyday <= cfg().everydayTarget ? 'pos' : 'neg'), line('Cash flow', $0(f.net), f.net >= 0 ? 'pos' : 'neg'), line('Savings rate', f.rate == null ? '—' : pct(f.rate)));
}

async function renderSpend() {
  const m = S.month; const rows = await loadTx(m); if (S.view !== 'spend' || S.month !== m) return;
  const md = S.months[m] || {}; const f = flows(m); const c = cfg();
  const sum = $('#s-summary'); sum.replaceChildren(el('div', { class: 'row' }, el('h2', { text: mLabel(m, true) }), el('span', { class: 'pill ' + (f.everyday <= c.everydayTarget ? 'ok' : 'bad'), text: f.cardSpend ? (f.everyday <= c.everydayTarget ? 'On target' : 'Over target') : 'No data' })));
  if (!f.cardSpend && !rows.length) sum.append(el('p', { class: 'muted cap', text: 'Import this month\'s CSVs to see where the money went.' }));
  else sum.append(el('div', { class: 'grid2' },
    el('div', { class: 'stat' }, el('span', { class: 'l', text: 'Card spending' }), el('span', { class: 'v', text: $0(f.cardSpend) })),
    el('div', { class: 'stat' }, el('span', { class: 'l', text: 'Your everyday' }), el('span', { class: 'v ' + (f.everyday <= c.everydayTarget ? 'pos' : 'neg'), text: $0(f.everyday) })),
    el('div', { class: 'stat' }, el('span', { class: 'l', text: 'One-offs' }), el('span', { class: 'v', text: $0(f.lumpy) })),
    el('div', { class: 'stat' }, el('span', { class: 'l', text: pLabel("Partner's card") }), el('span', { class: 'v', text: $0(n(md.shonnyCard)) }))),
    el('p', { class: 'cap muted', text: f.shonnyOnCard ? `${$0(f.shonnyOnCard)} of the card spending is treated as ${pName()}'s share, from transfers beyond the mortgage share and ${pName()}'s card.` : 'Tap a category on any transaction to fix it. Changes update the month straight away.' }));
  const cats = $('#s-cats'); cats.replaceChildren();
  const sp = Object.entries(md.spend || {}).filter(([, v]) => n(v) > 0).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...sp.map(([, v]) => n(v)));
  $('#s-total').textContent = sp.length ? $0(sp.reduce((s, [, v]) => s + n(v), 0)) : '';
  if (!sp.length) cats.append(el('p', { class: 'cap muted', text: 'No spending recorded for this month yet.' }));
  const pickCat = (k) => { S.catFilter = S.catFilter === k ? null : k; renderSpend().then(() => { if (S.catFilter) $('#s-txcard').scrollIntoView({ behavior: 'smooth', block: 'start' }); }); };
  for (const [k, v] of sp) { const tgt = c.targets[k]; const over = tgt && v > tgt; cats.append(el('div', { class: 'catrow tap' + (S.catFilter === k ? ' sel' : ''), role: 'button', tabindex: '0', 'aria-label': `Show ${k} transactions`, onclick: () => pickCat(k), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickCat(k); } } }, el('div', { class: 'row' }, el('span', { text: k }), el('span', { class: 'num ' + (over ? 'neg' : ''), text: $0(v) + (tgt ? ` / ${$0(tgt)}` : '') })), el('div', { class: 'bar' }, el('i', { class: LUMPY_CATS.has(k) ? 'lumpy' : over ? 'over' : '', style: `width:${(v / max) * 100}%` })))); }

  // recurring charges
  const subs = $('#s-subs'); subs.replaceChildren(el('h2', { text: 'Recurring charges' }));
  const allRows = Object.values(S.tx).flat();
  const by = {}; for (const t of rows) if (SPEND_CATS.includes(t.cat) && t.amt < 0) { const k = (t.merchant || t.desc).replace(/\d{3,}.*$/, '').trim().slice(0, 32); (by[k] ||= []).push(t); }
  const rec = Object.entries(by).filter(([k, ts]) => ['Subscriptions', 'Bills', 'Insurance'].includes(ts[0].cat) || allRows.filter((x) => (x.merchant || x.desc).startsWith(k) && x.date.slice(0, 7) !== m).length).map(([k, ts]) => [k, ts.reduce((s, t) => s - t.amt, 0), ts.length]).sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (!rec.length) subs.append(el('p', { class: 'cap muted', text: 'Subscriptions and bills show here once a month is imported.' }));
  else { subs.append(el('div', { class: 'list' }, rec.map(([k, v, cnt]) => el('div', { class: 'row' }, el('span', { text: k + (cnt > 1 ? ` ×${cnt}` : '') }), el('span', { class: 'num', text: $2(v) }))))); subs.append(el('p', { class: 'cap muted', text: `About ${$0(rec.reduce((s, r) => s + r[1], 0))} a month. Worth a look for anything you no longer use.` })); }

  // transactions
  const filters = [['spend', 'Spending'], ['flow', 'Bills & transfers'], ['shonny', pLabel("Partner's")], ['all', 'All']];
  const seg = $('#s-filter'); seg.replaceChildren(...filters.map(([k, l]) => el('button', { type: 'button', 'aria-pressed': !S.catFilter && S.filter === k ? 'true' : 'false', text: l, onclick: () => { S.filter = k; S.catFilter = null; renderSpend(); } })));
  const q = S.search.trim().toLowerCase();
  let show = rows.filter((t) => S.catFilter ? t.cat === S.catFilter : (S.filter === 'all' || (S.filter === 'spend' ? SPEND_CATS.includes(t.cat) : S.filter === 'shonny' ? /Partner/.test(t.cat) || t.partner : FLOW_CATS.includes(t.cat) && !/Partner/.test(t.cat))));
  if (q) show = show.filter((t) => (t.merchant + ' ' + t.desc).toLowerCase().includes(q));
  if (S.sort === 'amount') show = [...show].sort((a, b) => Math.abs(b.amt) - Math.abs(a.amt));
  $('#s-sort').textContent = S.sort === 'amount' ? 'Largest first' : 'Newest first';
  $('#s-count').textContent = rows.length ? `${show.length} of ${rows.length}` : '';
  const act = $('#s-active'); act.replaceChildren();
  if (S.catFilter || q) {
    const total = show.reduce((sum, t) => sum - t.amt, 0);
    act.append(el('div', { class: 'row' },
      el('span', { class: 'btns' }, S.catFilter ? el('button', { class: 'chip', type: 'button', 'aria-label': `Clear ${S.catFilter} filter`, onclick: () => { S.catFilter = null; renderSpend(); } }, pLabel(S.catFilter), el('span', { 'aria-hidden': 'true', text: '×' })) : null,
        q ? el('button', { class: 'chip', type: 'button', 'aria-label': 'Clear search', onclick: () => { S.search = ''; $('#s-search').value = ''; renderSpend(); } }, `“${S.search.trim()}”`, el('span', { 'aria-hidden': 'true', text: '×' })) : null),
      el('span', { class: 'num cap', text: `${show.length} · ${$2(total)}` })));
  }
  const list = $('#s-tx'); list.replaceChildren();
  if (!rows.length) { list.append(el('div', { class: 'empty' }, el('p', { text: 'No transactions imported for this month.' }), el('button', { class: 'btn small primary', type: 'button', 'data-pick': 'csvIn', text: 'Import CSVs' }))); return; }
  if (!show.length) list.append(el('p', { class: 'cap muted', style: 'padding-block:12px', text: 'No transactions match.' }));
  for (const t of show.slice(0, 400)) {
    const sel = el('select', { 'aria-label': 'Category for ' + t.desc }, [...ALL_CATS, ...(ALL_CATS.includes(t.cat) ? [] : [t.cat])].map((k) => el('option', { value: k, selected: k === t.cat }, pLabel(k))));
    sel.addEventListener('change', async () => {
      t.cat = sel.value; t.lumpy = undefined;
      const key = t.desc.replace(/\d{4,}.*$/, '').trim().slice(0, 24);
      await writeDoc('tx/' + m, { rows: S.tx[m], updatedAt: new Date().toISOString() }); await applySummary(m, false);
      renderSpend();
      const cfgNow = cfg();
      if (key && !cfgNow.rules.some((r) => r.match === key)) {
        const t2 = el('div', { class: 'toast', role: 'status' }, `Always file "${key}" as ${pLabel(t.cat)}? `, el('button', { class: 'btn small', type: 'button', text: 'Yes', style: 'margin-left:8px', onclick: async () => { t2.remove(); await saveConfig({ rules: [...cfgNow.rules.filter((r) => r.match !== key), { match: key, cat: t.cat }] }); toast('Rule saved'); } }));
        $$('.toast').forEach((x) => x.remove()); document.body.append(t2); setTimeout(() => t2.remove(), 6000);
      }
    });
    const lumpyBtn = SPEND_CATS.includes(t.cat) ? el('button', { class: 'pill' + (isLumpy(t) ? ' ok' : ''), type: 'button', text: isLumpy(t) ? 'One-off' : 'Mark one-off', onclick: async () => { t.lumpy = !isLumpy(t); await writeDoc('tx/' + m, { rows: S.tx[m], updatedAt: new Date().toISOString() }); await applySummary(m, false); renderSpend(); } }) : null;
    const partnerBtn = SPEND_CATS.includes(t.cat) && t.amt < 0 ? el('button', { class: 'pill' + (t.partner ? ' ok' : ''), type: 'button', 'aria-pressed': t.partner ? 'true' : 'false', text: t.partner ? `${pName()}'s` : `Mark ${pName()}'s`, onclick: async () => { t.partner = !t.partner || undefined; await writeDoc('tx/' + m, { rows: S.tx[m] }); await applySummary(m, false); renderSpend(); } }) : null;
    const excluded = FLOW_CATS.includes(t.cat) && ['Transfer', "Partner's card"].includes(t.cat);
    list.append(el('div', { class: 'tx' + (excluded ? ' excluded' : '') },
      el('span', { class: 'desc', text: t.merchant || t.desc }),
      el('span', { class: 'num ' + (t.amt > 0 ? 'pos' : ''), text: $2(t.amt) }),
      el('span', { class: 'meta' }, el('span', { text: t.date.slice(8) + ' ' + MONTHS[+t.date.slice(5, 7) - 1] + (t.acct ? ' · …' + t.acct : '') }), sel, lumpyBtn, partnerBtn)));
  }
}

function renderBudget() {
  const m = S.month; const c = cfg(); const f = flows(m); const md = S.months[m] || {};
  const income = f.income || (S.months[sortedMonths().filter((x) => n(S.months[x].income) > 0).pop()]?.income ?? 0);
  const sinkMonthly = (c.sinking || []).reduce((s, x) => s + n(x.yearly) / 12, 0);
  const mortgageHalf = f.mortgageHalf || (() => { const mm = S.accounts.filter((a) => a.type === 'mortgage').reduce((s, a) => s + n(a.repayment), 0); return mm * c.mortgageShare; })();
  const fixed = n(c.fixed.rent) + n(c.fixed.carLoan) + mortgageHalf + n(c.childSupport);
  const left = n(income) - fixed - sinkMonthly; const tTotal = Object.values(c.targets).reduce((s, v) => s + n(v), 0);
  const top = $('#b-top'); top.replaceChildren(el('h2', { text: 'Where your pay goes' }));
  const line = (l, v, cls) => el('div', { class: 'row', style: 'padding-block:6px;border-top:1px solid var(--line)' }, el('span', { text: l }), el('span', { class: 'num ' + (cls || ''), text: v }));
  top.append(line('Pay', $0(n(income))), line('Fixed costs', '−' + $0(fixed).replace('−', '')), line('Yearly bills set-aside', '−' + $0(sinkMonthly).replace('−', '')), line('Left for everyday', $0(left), left >= c.everydayTarget ? 'pos' : 'neg'), line('Everyday target', $0(c.everydayTarget)), line('Category targets add up to', $0(tTotal), tTotal > left ? 'neg' : ''));
  top.append(el('p', { class: 'cap muted', text: left - c.everydayTarget >= 0 ? `About ${$0(left - c.everydayTarget)} a month spare at target.` : `Target is ${$0(c.everydayTarget - left)} more than you have. Lower it, or cut fixed costs.` }));
  const box = $('#b-cats'); box.replaceChildren();
  const actual = md.spend || {};
  for (const k of SPEND_CATS) {
    const tgt = n(c.targets[k]); const a = n(actual[k]); if (!tgt && !a) continue;
    const ratio = tgt ? a / tgt : (a ? 1 : 0); const over = tgt && a > tgt;
    const open = () => { S.catFilter = k; go('spend'); setTimeout(() => $('#s-txcard')?.scrollIntoView({ block: 'start' }), 300); };
    box.append(el('div', { class: 'catrow' + (a ? ' tap' : ''), role: a ? 'button' : null, tabindex: a ? '0' : null, 'aria-label': a ? `Show ${k} transactions` : null, onclick: a ? open : null, onkeydown: a ? (e) => { if (e.key === 'Enter') open(); } : null }, el('div', { class: 'row' }, el('span', { text: k }), el('span', { class: 'num cap ' + (over ? 'neg' : 'muted'), text: `${$0(a)} of ${tgt ? $0(tgt) : 'no target'}` })), el('div', { class: 'bar' }, el('i', { class: LUMPY_CATS.has(k) ? 'lumpy' : over ? 'over' : '', style: `width:${Math.min(100, ratio * 100)}%` }))));
  }
  if (!box.children.length) box.append(el('p', { class: 'cap muted', text: 'Set targets to compare against.' }));
  const sink = $('#b-sink'); sink.replaceChildren(el('div', { class: 'list' }, (c.sinking || []).map((x) => el('div', { class: 'row' }, el('span', { text: x.name }), el('span', { class: 'num', text: `${$0(n(x.yearly))}/yr · ${$0(n(x.yearly) / 12)}/mo` })))), el('div', { class: 'row', style: 'padding-top:8px' }, el('strong', { text: 'Set aside each month' }), el('strong', { class: 'num', text: $0(sinkMonthly) })));
  const fx = $('#b-fixed'); fx.replaceChildren(el('div', { class: 'list' },
    el('div', { class: 'row' }, el('span', { text: 'Rent' }), el('span', { class: 'num', text: $0(n(c.fixed.rent)) })),
    el('div', { class: 'row' }, el('span', { text: 'Car loan' }), el('span', { class: 'num', text: $0(n(c.fixed.carLoan)) })),
    el('div', { class: 'row' }, el('span', { text: `Mortgage, your ${pct(c.mortgageShare)}` }), el('span', { class: 'num', text: $0(mortgageHalf) })),
    el('div', { class: 'row' }, el('span', { text: 'Child support' }), el('span', { class: 'num', text: n(c.childSupport) ? $0(n(c.childSupport)) : 'Not started' }))));
}

function renderWealth() {
  const m = S.month; const c = cfg(); const nw = netWorth(m);
  const mix = $('#w-mix'); mix.replaceChildren(el('div', { class: 'row' }, el('h2', { text: 'What you own and owe' }), el('span', { class: 'cap muted', text: 'your share' })));
  const order = ['property', 'super', 'invest', 'offset', 'cash', 'vehicle', 'other', 'card', 'mortgage', 'loan'];
  const total = Math.max(1, nw.assets);
  mix.append(el('div', { class: 'list' }, order.filter((t) => nw.by[t]).map((t) => el('div', { class: 'catrow' }, el('div', { class: 'row' }, el('span', { text: TYPES[t] }), el('span', { class: 'num ' + (nw.by[t] < 0 ? 'neg' : ''), text: $0(nw.by[t]) })), nw.by[t] > 0 ? el('div', { class: 'bar' }, el('i', { style: `width:${(nw.by[t] / total) * 100}%` })) : null))));
  mix.append(el('div', { class: 'row', style: 'padding-top:8px;border-top:1px solid var(--line)' }, el('strong', { text: 'Net worth' }), el('strong', { class: 'num', text: $0(nw.nw) })));

  // property & loans
  const prop = $('#w-property'); prop.replaceChildren(el('h2', { text: 'Property and loans' }));
  const houses = S.accounts.filter((a) => a.type === 'property'); const morts = S.accounts.filter((a) => a.type === 'mortgage'); const loans = S.accounts.filter((a) => a.type === 'loan');
  const hv = houses.reduce((s, a) => s + (balanceFor(a, m)?.v || 0), 0); const mb = morts.reduce((s, a) => s + (balanceFor(a, m)?.v || 0), 0);
  if (hv) {
    const lvr = Math.abs(mb) / hv; const eq = hv + mb;
    prop.append(el('div', { class: 'grid2' },
      el('div', { class: 'stat' }, el('span', { class: 'l', text: 'House value, whole' }), el('span', { class: 'v', text: $k(hv) })),
      el('div', { class: 'stat' }, el('span', { class: 'l', text: 'Mortgage, whole' }), el('span', { class: 'v neg', text: $k(mb) })),
      el('div', { class: 'stat' }, el('span', { class: 'l', text: 'Loan to value' }), el('span', { class: 'v ' + (lvr > 0.8 ? 'wrn' : ''), text: pct(lvr) })),
      el('div', { class: 'stat' }, el('span', { class: 'l', text: 'Equity, your share' }), el('span', { class: 'v pos', text: $k(eq * (houses[0]?.ownerPct ?? 100) / 100) }))));
  }
  for (const a of [...morts, ...loans]) {
    const b = balanceFor(a, m); const p = b ? payoff(b.v, a.rate, a.repayment) : null;
    const yrs = p && Number.isFinite(p.months) ? `${Math.floor(p.months / 12)}y ${p.months % 12}m to go` : p ? 'Repayment doesn\'t cover interest' : 'Add balance, rate and repayment';
    prop.append(el('div', { class: 'catrow' }, el('div', { class: 'row' }, el('strong', { text: a.name }), el('span', { class: 'num neg', text: b ? $0(b.v) : 'No balance' })),
      el('div', { class: 'row cap muted' }, el('span', { text: [a.rate ? a.rate + '%' : null, a.repayment ? $0(a.repayment) + '/mo' : null, yrs].filter(Boolean).join(' · ') }), el('span', { text: p ? `~${$0(p.interestMonth)} interest/mo` : '' }))));
  }
  if (!hv && !morts.length && !loans.length) prop.append(el('p', { class: 'cap muted', text: 'Add the house, mortgage and car loan to see equity and payoff dates.' }));

  // accounts list
  const wl = $('#w-list'); wl.replaceChildren();
  if (!S.accounts.length) wl.append(el('div', { class: 'empty' }, el('p', { text: 'No accounts yet.' })));
  else wl.append(el('div', { class: 'list' }, [...S.accounts].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type)).map((a) => { const b = balanceFor(a, m); return el('div', { class: 'row', style: 'cursor:pointer', role: 'button', tabindex: '0', onclick: () => accountSheet(a), onkeydown: (e) => { if (e.key === 'Enter') accountSheet(a); } }, el('span', {}, a.name, el('small', { class: 'cap muted', style: 'display:block', text: [TYPES[a.type], a.ownerPct !== 100 ? `${a.ownerPct}% yours` : null, b && b.m !== m ? `as of ${mLabel(b.m)}` : null, a.note].filter(Boolean).join(' · ') })), el('span', { class: 'num ' + (b && b.v < 0 ? 'neg' : ''), text: b ? $0(b.v) : 'Not set' })); })));

  // housing scenarios
  const sc = $('#w-scen'); const s = c.scenario; sc.replaceChildren(el('div', { class: 'row' }, el('h2', { text: 'House options' }), el('button', { class: 'btn small', type: 'button', text: 'Assumptions', onclick: scenSheet })));
  const share = (houses[0]?.ownerPct ?? 50) / 100; const mortPay = morts.reduce((s2, a) => s2 + n(a.repayment), 0);
  const myHalf = mortPay * c.mortgageShare; const rent = n(c.fixed.rent);
  const saleNet = hv * (1 - n(s.sellCostPct) / 100) + mb - n(s.breakCost);
  const leaseNet = n(s.leaseRentWeek) * 52 / 12 * (1 - n(s.leaseCostPct) / 100);
  const rows = [
    ['Keep as is', rent + myHalf, 'Rent plus your share of the mortgage'],
    ['Sell, keep renting', rent, hv ? `Your cash from sale about ${$k(saleNet * share)}` : 'Add house value and mortgage'],
    ['Rent it out jointly', rent + myHalf - leaseNet * share, `At ${$0(n(s.leaseRentWeek))}/wk, before tax deductions`],
    [`Buy ${pName()} out`, mortPay + (hv + mb > 0 ? ((hv + mb) * (1 - share)) * (0.06 / 12) / (1 - Math.pow(1 + 0.06 / 12, -360)) : 0), `Full mortgage plus a 30-year loan for ${pName()}'s equity at 6%`]
  ];
  sc.append(el('div', { class: 'list' }, rows.map(([l, v, sub]) => el('div', { class: 'row' }, el('span', {}, l, el('small', { class: 'cap muted', style: 'display:block', text: sub })), el('span', { class: 'num', text: $0(v) + '/mo' })))));
  sc.append(el('p', { class: 'cap muted', text: 'Monthly housing cost to you. Rough numbers to compare options, not financial advice.' }));

  // goal
  const goal = $('#w-goal'); goal.replaceChildren();
  const ms = sortedMonths().filter((x) => flows(x).hasData).slice(-6); const avg = ms.length ? ms.reduce((s2, x) => s2 + flows(x).netExLumpy - n(cfg().sinking.reduce((a2, y) => a2 + n(y.yearly) / 12, 0)), 0) / ms.length : 0;
  const gap = n(c.goal.cash) - nw.liquid; const mo = avg > 0 ? Math.ceil(gap / avg) : null;
  goal.append(el('div', { class: 'catrow' }, el('div', { class: 'row' }, el('span', { text: `${$0(nw.liquid)} of ${$0(n(c.goal.cash))}` }), el('span', { class: 'cap muted', text: pct(Math.max(0, Math.min(1, nw.liquid / n(c.goal.cash)))) })), el('div', { class: 'bar' }, el('i', { style: `width:${Math.max(0, Math.min(100, (nw.liquid / n(c.goal.cash)) * 100))}%` }))));
  goal.append(el('p', { class: 'cap muted', text: gap <= 0 ? 'Goal reached.' : mo ? `About ${mo} months at your recent pace of ${$0(avg)} a month after yearly bills.` : 'Your recent months aren\'t saving after yearly bills, so there\'s no date yet.' }));

  // history
  const t = $('#w-hist'); t.replaceChildren();
  const hm = sortedMonths().reverse();
  const th = (x, left) => el('th', { text: x, style: `text-align:${left ? 'left' : 'right'};padding:6px 8px;color:var(--muted);font-weight:500;border-bottom:1px solid var(--line);white-space:nowrap` });
  const td = (x, cls, left) => el('td', { class: 'num ' + (cls || ''), text: x, style: `text-align:${left ? 'left' : 'right'};padding:6px 8px;border-bottom:1px solid var(--line);white-space:nowrap` });
  t.append(el('thead', {}, el('tr', {}, th('Month', 1), th('Net worth'), th('Cash'), th('Cash flow'), th('Everyday'), th('Notes', 1))));
  t.append(el('tbody', {}, hm.length ? hm.map((x) => { const w = netWorth(x), f = flows(x); return el('tr', { style: 'cursor:pointer', onclick: () => { S.month = x; fillMonthPick(); go('checkin'); } }, td(mLabel(x), '', 1), td($k(w.nw)), td($k(w.liquid)), td(f.hasData ? $0(f.net) : '—', f.net >= 0 ? 'pos' : 'neg'), td(f.hasData ? $0(f.everyday) : '—'), td((S.months[x].notes || '').slice(0, 40), 'muted', 1)); }) : el('tr', {}, td('No months saved yet', 'muted', 1))));
}
function scenSheet() {
  const s = cfg().scenario;
  const body = el('div', { class: 'card' },
    fieldRow('Selling costs', '% of sale price', el('input', { id: 's-sc', class: 'plain', inputmode: 'decimal', value: s.sellCostPct }), 's-sc'),
    fieldRow('Fixed-rate break cost', 'Ask NAB for a quote', moneyInput('s-bc', s.breakCost, 'Break cost'), 's-bc'),
    fieldRow('Rent if leased', 'Per week', moneyInput('s-rw', s.leaseRentWeek, 'Weekly rent'), 's-rw'),
    fieldRow('Leasing costs', '% of rent: agent, repairs, landlord insurance', el('input', { id: 's-lc', class: 'plain', inputmode: 'decimal', value: s.leaseCostPct }), 's-lc'));
  sheet('House option assumptions', body, () => saveConfig({ scenario: { sellCostPct: n($('#s-sc').value), breakCost: n($('#s-bc').value), leaseRentWeek: n($('#s-rw').value), leaseCostPct: n($('#s-lc').value) } }));
}
function targetsSheet() {
  const c = cfg(); const body = el('div', { class: 'card' }, el('p', { class: 'cap muted', text: `Everyday target ${$0(c.everydayTarget)} a month. Change it in Settings.` }), ...SPEND_CATS.filter((k) => !LUMPY_CATS.has(k)).map((k) => fieldRow(k, null, moneyInput('t-' + k.replace(/\W/g, ''), c.targets[k], k), 't-' + k.replace(/\W/g, ''))));
  sheet('Monthly targets', body, () => { const t = {}; for (const k of SPEND_CATS) { const i = $('#t-' + k.replace(/\W/g, '')); if (i && i.value) t[k] = n(i.value); } return saveConfig({ targets: t }); });
}
function sinkSheet() {
  const c = cfg(); const items = clone(c.sinking || []);
  const body = el('div', { class: 'card' }); const draw = () => { body.replaceChildren(...items.map((x, i) => el('div', { class: 'field' }, el('input', { class: 'plain', value: x.name, 'aria-label': 'Bill name', oninput: (e) => { x.name = e.target.value; } }), el('div', { class: 'money' }, el('input', { type: 'text', inputmode: 'decimal', value: x.yearly, 'aria-label': 'Yearly cost', oninput: (e) => { x.yearly = n(e.target.value); } })))), el('button', { class: 'btn small', type: 'button', text: 'Add a bill', onclick: () => { items.push({ name: '', yearly: 0 }); draw(); } }), el('p', { class: 'cap muted', text: 'Clear a name to remove that bill.' })); }; draw();
  sheet('Yearly bills', body, () => saveConfig({ sinking: items.filter((x) => x.name.trim()) }));
}
function fixedSheet() {
  const c = cfg(); const body = el('div', { class: 'card' },
    fieldRow('Rent', 'Per month', moneyInput('x-rent', c.fixed.rent, 'Rent'), 'x-rent'),
    fieldRow('Car loan', 'Per month', moneyInput('x-car', c.fixed.carLoan, 'Car loan'), 'x-car'),
    fieldRow('Child support', 'Per month, once it starts', moneyInput('x-cs', c.childSupport, 'Child support'), 'x-cs'),
    el('p', { class: 'cap muted', text: `Your mortgage share is ${pct(c.mortgageShare)}. Change it in Settings.` }));
  sheet('Fixed costs', body, () => saveConfig({ fixed: { rent: n($('#x-rent').value), carLoan: n($('#x-car').value) }, childSupport: n($('#x-cs').value) }));
}
function goalSheet() { const c = cfg(); sheet('Cash goal', el('div', { class: 'card' }, fieldRow('Cash savings goal', 'Your share of cash accounts', moneyInput('g-cash', c.goal.cash, 'Goal'), 'g-cash')), () => saveConfig({ goal: { cash: n($('#g-cash').value) } })); }

// ---------- investments ----------
const KINDS = { etf: 'ETFs', stock: 'Shares', crypto: 'Crypto', fund: 'Managed funds' };
const KIND_C = { etf: 'var(--accent)', stock: '#0f9d6b', crypto: '#f59f4c', fund: '#9b6bd6' };
const hUnits = (h) => h.lots?.length ? h.lots.reduce((s, l) => s + n(l.units), 0) - n(h.sold) : n(h.units);
const hCost = (h) => h.lots?.length ? h.lots.reduce((s, l) => s + n(l.units) * n(l.price) + n(l.fee), 0) : n(h.cost);
const hValue = (h) => hUnits(h) * n(h.price);
const fmtUnits = (u) => u >= 100 ? Math.round(u).toLocaleString('en-AU') : (+u.toFixed(4)).toString();
const fmtPrice = (p) => p >= 1 ? $2(p) : '$' + (+p.toPrecision(3)).toString();
function hSeries(h) {
  // value over time: units held at each known price point (purchase prices, saved price updates, current price)
  const pts = new Map();
  (h.lots || []).forEach((l) => { if (l.date && n(l.price)) pts.set(l.date, n(l.price)); });
  (h.history || []).forEach((x) => { if (x.d && n(x.p)) pts.set(x.d, n(x.p)); });
  if (n(h.price)) pts.set(h.priceAt || new Date().toISOString().slice(0, 10), n(h.price));
  const lots = [...(h.lots || [])].sort((a, b) => a.date.localeCompare(b.date));
  return [...pts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([d, p]) => {
    const u = lots.length ? lots.filter((l) => l.date <= d).reduce((s2, l) => s2 + n(l.units), 0) : n(h.units);
    return { d, v: u * p };
  }).filter((x) => x.v > 0);
}
function sparkline(series) {
  const ns = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 64 26'); svg.setAttribute('class', 'spark'); svg.setAttribute('aria-hidden', 'true');
  if (series.length < 2) return svg;
  const t0 = Date.parse(series[0].d), t1 = Date.parse(series[series.length - 1].d) || t0 + 1;
  const vs = series.map((x) => x.v), lo = Math.min(...vs), hi = Math.max(...vs), sp = hi - lo || 1;
  const X = (d) => 2 + ((Date.parse(d) - t0) / ((t1 - t0) || 1)) * 60, Y = (v) => 23 - ((v - lo) / sp) * 20;
  const d = series.map((x, i) => `${i ? 'L' : 'M'}${X(x.d).toFixed(1)},${Y(x.v).toFixed(1)}`).join('');
  const up = vs[vs.length - 1] >= vs[0]; const col = up ? 'var(--good)' : 'var(--bad)';
  const area = document.createElementNS(ns, 'path'); area.setAttribute('d', d + `L${X(series[series.length - 1].d).toFixed(1)},25L${X(series[0].d).toFixed(1)},25Z`); area.setAttribute('fill', col); area.setAttribute('opacity', '0.12'); svg.append(area);
  const line = document.createElementNS(ns, 'path'); line.setAttribute('d', d); line.setAttribute('fill', 'none'); line.setAttribute('stroke', col); line.setAttribute('stroke-width', '1.6'); line.setAttribute('stroke-linecap', 'round'); line.setAttribute('stroke-linejoin', 'round'); svg.append(line);
  const last = series[series.length - 1]; const dot = document.createElementNS(ns, 'circle'); dot.setAttribute('cx', X(last.d)); dot.setAttribute('cy', Y(last.v)); dot.setAttribute('r', '2'); dot.setAttribute('fill', col); svg.append(dot);
  return svg;
}
const addHistory = (h, d, p) => { h.history = (h.history || []).filter((x) => x.d !== d); h.history.push({ d, p }); h.history.sort((a, b) => a.d.localeCompare(b.d)); if (h.history.length > 400) h.history = h.history.slice(-400); };
function invTotals() { let v = 0, c = 0, d = 0; for (const h of S.holdings) { if (!hUnits(h)) continue; v += hValue(h); c += hCost(h); d += n(h.divs); } return { v, c, d, g: v - c }; }
function renderInvest() {
  const hs = S.holdings.filter((h) => hUnits(h) > 0).sort((a, b) => hValue(b) - hValue(a));
  const T = invTotals();
  $('#i-total').textContent = hs.length ? $0(T.v) : '—';
  const g = $('#i-gain'); g.replaceChildren();
  if (hs.length) {
    g.append(el('span', { class: T.g >= 0 ? 'pos' : 'neg', text: `${sgn(T.g)} (${T.c ? sgn(T.g / T.c * 100, (x) => x.toFixed(0) + '%') : '—'})` }), ` on ${$0(T.c)} invested`);
    const newest = hs.map((h) => h.priceAt || '').sort().pop();
    if (newest) g.append(el('span', { class: 'muted', text: ` · prices ${new Date(newest + (newest.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` }));
  } else g.append('Add your holdings to track them here.');
  // allocation
  const al = $('#i-alloc'); al.replaceChildren(el('h2', { text: 'Allocation' }));
  const byKind = {}; hs.forEach((h) => { byKind[h.kind] = (byKind[h.kind] || 0) + hValue(h); });
  if (T.v) {
    al.append(el('div', { class: 'alloc' }, Object.entries(byKind).map(([k, v]) => el('i', { style: `width:${(v / T.v) * 100}%;background:${KIND_C[k]}`, title: KINDS[k] }))));
    al.append(el('div', { class: 'legend' }, Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => el('span', { style: `--c:${KIND_C[k]}`, text: `${KINDS[k]} ${pct(v / T.v)} · ${$k(v)}` }))));
    const top = hs[0]; if (top && hValue(top) / T.v > 0.5) al.append(el('p', { class: 'cap muted', text: `${top.ticker} is ${pct(hValue(top) / T.v)} of the portfolio. A single holding that size carries most of the risk.` }));
  } else al.append(el('p', { class: 'cap muted', text: 'Nothing held yet.' }));
  // list
  const li = $('#i-list'); li.replaceChildren(el('div', { class: 'row' }, el('h2', { text: 'Holdings' }), el('span', { class: 'cap muted', text: 'tap for detail' })));
  for (const k of Object.keys(KINDS)) {
    const group = hs.filter((h) => h.kind === k); if (!group.length) continue;
    const gv = group.reduce((s2, h) => s2 + hValue(h), 0);
    li.append(el('div', { class: 'row', style: 'margin-top:8px' }, el('h3', { text: KINDS[k] }), el('span', { class: 'num cap muted', text: $0(gv) })));
    li.append(el('div', {}, group.map((h) => {
      const v = hValue(h), c = hCost(h), gn = v - c, gp = c ? gn / c : 0; const share = gv ? v / gv : 0;
      return el('div', { class: 'hold', role: 'button', tabindex: '0', onclick: () => holdingSheet(h), onkeydown: (e) => { if (e.key === 'Enter') holdingSheet(h); } },
        el('div', {}, el('div', { class: 'tk', text: h.ticker }), el('div', { class: 'nm', text: `${h.name || ''} · ${fmtUnits(hUnits(h))} @ ${fmtPrice(n(h.price))}` })),
        el('div', { class: 'mid' }, sparkline(hSeries(h)), el('div', { class: 'r' }, el('div', { class: 'num', text: $0(v) }), el('div', { class: 'cap num ' + (gn >= 0 ? 'pos' : 'neg'), text: `${sgn(gn)} · ${c ? (gp * 100).toFixed(0) + '%' : '—'}` }))),
        h.target ? el('div', { class: 'cap muted', style: 'grid-column:1/-1', text: `${pct(share)} of ${KINDS[k]}, target ${h.target}%${Math.abs(share * 100 - h.target) >= 5 ? (share * 100 > h.target ? ' · over' : ' · under') : ''}` }) : null);
    })));
  }
  if (!hs.length) li.append(el('div', { class: 'empty' }, el('p', { text: 'No holdings yet.' })));
  const sold = S.holdings.filter((h) => !hUnits(h));
  if (sold.length) li.append(el('p', { class: 'cap muted', style: 'margin-top:8px', text: `Watching: ${sold.map((h) => h.ticker).join(', ')}` }));
  // dividends
  const dv = $('#i-divs'); dv.replaceChildren(el('h2', { text: 'Dividends received' }));
  const withD = hs.filter((h) => n(h.divs) > 0);
  if (withD.length) { dv.append(el('div', { class: 'list' }, withD.map((h) => el('div', { class: 'row' }, el('span', { text: h.ticker + (h.drp ? ' · reinvested' : '') }), el('span', { class: 'num', text: $0(n(h.divs)) }))))); dv.append(el('div', { class: 'row', style: 'padding-top:8px;border-top:1px solid var(--line)' }, el('strong', { text: 'Total return incl. dividends' }), el('strong', { class: 'num ' + (T.g + T.d >= 0 ? 'pos' : 'neg'), text: sgn(T.g + T.d) }))); }
  else dv.append(el('p', { class: 'cap muted', text: 'Record dividends on each holding to include them in your return.' }));
}
let liveBusy = false;
const setLive = (t, cls) => { const p = $('#i-live'); if (p) { p.textContent = t; p.className = 'cap ' + (cls || 'muted'); } };
const hasPriceLinks = () => Object.values(cfg().priceSheets || {}).some((u) => String(u || '').trim());
const PRICE_ERR = { offline: "You're offline. Showing the last saved prices.", network: "Couldn't reach Google Sheets. The link may be wrong or the sheet unpublished.", http: 'Google Sheets refused the link. Publish the tab to the web again and paste the new CSV link.', not_csv: "That link returns a web page, not CSV. Use File > Share > Publish to web > CSV." };
async function refreshFromSheet(manual) {
  if (!hasPriceLinks()) { setLive('Add your price sheet links in Settings to get live prices, or use Edit prices.'); return; }
  if (liveBusy) return; liveBusy = true;
  try {
    setLive('Getting prices from your Google Sheet…');
    const { found, errors, tabs } = await fetchAllPrices(cfg().priceSheets);
    const today = new Date().toISOString().slice(0, 10); let changed = 0; const mismatch = [];
    for (const h of S.holdings) {
      const f = found[h.ticker]; if (!f) continue;
      if (hUnits(h) > 0 && f.units > 0 && Math.abs(f.units - hUnits(h)) > 1e-6) mismatch.push(`${h.ticker} (sheet ${fmtUnits(f.units)}, here ${fmtUnits(hUnits(h))})`);
      if (Math.abs(f.price - n(h.price)) < 1e-9 && h.priceAt === today) continue;
      h.price = f.price; h.priceAt = today; addHistory(h, today, f.price); changed++;
      await writeDoc('holdings/' + h.id, { ...h });
    }
    const extra = Object.entries(found).filter(([tk, f]) => f.units > 0 && !S.holdings.some((h) => h.ticker === tk)).map(([tk]) => tk);
    if (changed) await syncInvestBalance();
    if (errors.length < tabs) { try { localStorage.setItem('bm-live', String(Date.now())); } catch {} }
    const time = new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
    const errTxt = errors.map((e) => `${SHEET_COLS[e.kind].label}: ${PRICE_ERR[e.code] || PRICE_ERR.network}`);
    if (errors.length === tabs) setLive(errTxt.join(' '), errors.every((e) => e.code === 'offline') ? 'muted' : 'neg');
    else setLive(`Live from your Google Sheet · ${time}` + (mismatch.length ? ` · Units differ for ${mismatch.join(', ')}` : '') + (extra.length ? ` · In the sheet but not here: ${extra.join(', ')}` : '') + (errTxt.length ? ` · ${errTxt.join(' ')}` : ''), mismatch.length || errTxt.length ? 'wrn' : 'muted');
    if (S.view === 'invest') renderInvest();
  } catch { setLive("Couldn't update prices just now. Tap Refresh prices to try again.", 'neg'); }
  finally { liveBusy = false; }
}
function maybeAutoRefresh() { if (!S.holdings.length || !hasPriceLinks()) return; let last = 0; try { last = +localStorage.getItem('bm-live') || 0; } catch {} if (Date.now() - last > 20 * 60 * 1000) refreshFromSheet(false); }
async function syncInvestBalance() {
  const acct = S.accounts.find((a) => a.type === 'invest'); if (!acct) return;
  const m = thisMonth(); const total = r2(invTotals().v);
  const md = S.months[m] || {}; S.months[m] = { ...md, balances: { ...(md.balances || {}), [acct.id]: total } };
  await writeDoc('months/' + m, S.months[m]);
}
function pricesSheet() {
  const hs = S.holdings.filter((h) => hUnits(h) > 0).sort((a, b) => hValue(b) - hValue(a));
  const body = el('div', { class: 'card' }, el('p', { class: 'cap muted', text: 'Key in today\'s price for each holding in AUD. Leave a box as it is to keep the old price.' }),
    ...hs.map((h) => fieldRow(h.ticker, `${KINDS[h.kind]} · ${fmtUnits(hUnits(h))} units`, moneyInput('p-' + h.id, h.price, h.ticker + ' price'), 'p-' + h.id)));
  sheet('Update prices', body, async () => {
    const today = new Date().toISOString().slice(0, 10); let ch = 0;
    for (const h of hs) { const v = $('#p-' + h.id).value.trim(); if (v === '' || n(v) === n(h.price)) continue; addHistory(h, h.priceAt || today, n(h.price)); h.price = n(v); h.priceAt = today; addHistory(h, today, h.price); ch++; await writeDoc('holdings/' + h.id, { ...h }); }
    await syncInvestBalance(); render(); toast(ch ? `${ch} price${ch > 1 ? 's' : ''} updated` : 'No prices changed');
  }, 'Save prices');
}
function holdingSheet(hIn) {
  const h = hIn ? clone(hIn) : { id: 'h' + Date.now().toString(36), ticker: '', name: '', kind: 'etf', price: null, lots: [], divs: 0 };
  const lots = h.lots || []; const body = el('div', { class: 'card' });
  const draw = () => {
    const ch = el('div', { class: 'chart' }); const ser = hSeries({ ...h, lots });
    if (hIn && ser.length > 1) lineChart(ch, ser.map((x) => ({ m: x.d.slice(0, 7), v: x.v })), { label: h.ticker + ' value over time' });
    body.replaceChildren(
      hIn && ser.length > 1 ? el('div', {}, el('h3', { text: 'Value over time' }), ch, el('p', { class: 'cap muted', text: 'Built from your purchase prices and each price update, so it fills in more as you update prices.' })) : null,
      fieldRow('Ticker', 'e.g. VAS, NAB, ETH', el('input', { id: 'hd-tk', class: 'plain', value: h.ticker, autocapitalize: 'characters' }), 'hd-tk'),
      fieldRow('Name', null, el('input', { id: 'hd-nm', class: 'plain', value: h.name || '' }), 'hd-nm'),
      fieldRow('Type', null, el('select', { id: 'hd-kind', class: 'month-pick' }, Object.entries(KINDS).map(([k, v]) => el('option', { value: k, selected: k === h.kind }, v))), 'hd-kind'),
      fieldRow('Current price', 'AUD per unit', moneyInput('hd-px', h.price, 'Price'), 'hd-px'),
      fieldRow('Target', '% of its group', el('input', { id: 'hd-tg', class: 'plain', inputmode: 'decimal', value: h.target ?? '' }), 'hd-tg'),
      fieldRow('Dividends received', 'After tax, all time', moneyInput('hd-dv', h.divs, 'Dividends'), 'hd-dv'),
      fieldRow('Units sold', 'Taken off the units bought', el('input', { id: 'hd-sold', class: 'plain', inputmode: 'decimal', value: h.sold ?? '' }), 'hd-sold'),
      el('h3', { text: 'Purchases', style: 'margin-top:8px' }),
      lots.length ? el('div', { style: 'overflow-x:auto;max-height:16rem' }, el('table', { class: 'lots' }, el('thead', {}, el('tr', {}, el('th', { text: 'Date' }), el('th', { text: 'Units' }), el('th', { text: 'Price' }), el('th', { text: 'Cost' }), el('th', { text: '' }))),
        el('tbody', {}, [...lots].map((l, i) => [l, i]).sort((a, b) => b[0].date.localeCompare(a[0].date)).map(([l, i]) => el('tr', {}, el('td', { text: l.date.split('-').reverse().join('/') }), el('td', { class: 'num', text: fmtUnits(n(l.units)) }), el('td', { class: 'num', text: fmtPrice(n(l.price)) }), el('td', { class: 'num', text: $0(n(l.units) * n(l.price) + n(l.fee)) }), el('td', {}, el('button', { class: 'btn small', type: 'button', text: '×', 'aria-label': 'Remove purchase', onclick: () => { keep(); lots.splice(i, 1); draw(); } }))))))) : el('p', { class: 'cap muted', text: 'No purchases recorded.' }),
      el('div', { class: 'field' }, el('input', { id: 'nl-date', class: 'plain', type: 'date', 'aria-label': 'Purchase date', value: new Date().toISOString().slice(0, 10) }), el('input', { id: 'nl-units', class: 'plain', inputmode: 'decimal', placeholder: 'Units', 'aria-label': 'Units' })),
      el('div', { class: 'field' }, moneyInput('nl-price', null, 'Price per unit'), moneyInput('nl-fee', null, 'Brokerage')),
      el('button', { class: 'btn small', type: 'button', text: 'Add purchase', onclick: () => { const u = n($('#nl-units').value), p = n($('#nl-price').value); if (!u || !p) { toast('Enter units and price'); return; } keep(); lots.push({ date: $('#nl-date').value || new Date().toISOString().slice(0, 10), units: u, price: p, fee: n($('#nl-fee').value) }); draw(); } }),
      hIn ? el('button', { class: 'btn small', type: 'button', text: 'Delete holding', style: 'margin-top:8px', onclick: async (e) => { const b = e.currentTarget; if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again to delete'; return; } await deleteDoc('holdings/' + h.id); S.holdings = S.holdings.filter((x) => x.id !== h.id); await syncInvestBalance(); render(); $('.sheet-bg')?.remove(); toast('Deleted'); } }) : null);
  };
  const keep = () => { h.ticker = $('#hd-tk').value.trim().toUpperCase(); h.name = $('#hd-nm').value.trim(); h.kind = $('#hd-kind').value; h.price = $('#hd-px').value ? n($('#hd-px').value) : null; h.target = $('#hd-tg').value ? n($('#hd-tg').value) : null; h.divs = n($('#hd-dv').value); h.sold = $('#hd-sold').value ? n($('#hd-sold').value) : 0; };
  draw();
  sheet(hIn ? h.ticker : 'Add holding', body, async () => {
    const oldPx = hIn ? n(hIn.price) : null; keep(); if (!h.ticker) { toast('Add a ticker'); return false; }
    h.lots = lots; if (n(h.price) !== oldPx) { const today = new Date().toISOString().slice(0, 10); if (hIn?.priceAt && oldPx) addHistory(h, hIn.priceAt, oldPx); h.priceAt = today; addHistory(h, today, n(h.price)); }
    const i = S.holdings.findIndex((x) => x.id === h.id); if (i >= 0) S.holdings[i] = h; else S.holdings.push(h);
    await writeDoc('holdings/' + h.id, h); await syncInvestBalance(); render(); toast('Saved');
  });
}

// ---------- settings, backup, restore ----------
const hasData = () => !!(S.config || S.accounts.length || Object.keys(S.months).length || S.holdings.length);
async function setMeta(k, v) { S.meta[k] = v; try { await store.put('meta', k, v); } catch {} }
const DAY = 86400000;
function backupDue() {
  if (!hasData()) return false;
  const ref = Date.parse(S.meta.lastBackup || S.meta.since || '') || Date.now();
  return Date.now() - ref > 30 * DAY;
}
const listTxt = (a) => (a || []).join(', ');
const listVal = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

function downloadFile(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = el('a', { href: url, download: name, style: 'display:none' }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function backupNow(pass) {
  try {
    setSave('Preparing backup…');
    let out = buildBackup(await store.snapshot());
    if (pass) out = await encryptBackup(out, pass);
    downloadFile(backupFileName(), JSON.stringify(out, null, pass ? 0 : 1));
    await setMeta('lastBackup', new Date().toISOString()); setSave('Saved on this device');
    toast(pass ? 'Encrypted backup downloaded' : 'Backup downloaded'); render(); return true;
  } catch { setSave('Saved on this device'); toast("Couldn't make the backup. Try again."); return false; }
}
function askPassphrase() {
  return new Promise((resolve) => {
    let settled = false; const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    const body = el('div', { class: 'card' }, el('p', { class: 'cap muted', text: 'This backup is encrypted. Enter the passphrase you used when you made it.' }),
      fieldRow('Passphrase', null, el('input', { id: 'rp-pass', class: 'plain', type: 'password', autocomplete: 'current-password' }), 'rp-pass'));
    const close = sheet('Encrypted backup', body, () => finish($('#rp-pass').value), 'Unlock');
    const bg = $$('.sheet-bg').pop(); new MutationObserver((_, o) => { if (!bg.isConnected) { o.disconnect(); finish(null); } }).observe(document.body, { childList: true });
    $('#rp-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') { finish(e.target.value); close(); } });
  });
}
async function restoreFromFile(file) {
  let obj;
  try { obj = JSON.parse(await file.text()); } catch { toast("That file isn't a Wealth Tracker backup."); return; }
  let snap;
  try {
    if (isEncrypted(obj)) {
      const pass = await askPassphrase(); if (!pass) return;
      toast('Unlocking…'); obj = await decryptBackup(obj, pass);
    }
    snap = readBackup(obj);
  } catch (e) { toast(e.message || "That file couldn't be read."); return; }
  const txCount = Object.values(snap.tx).reduce((a, r) => a + r.length, 0);
  const body = el('div', { class: 'card' },
    el('p', { text: `${snap.accounts.length} accounts, ${Object.keys(snap.months).length} months, ${txCount} transactions and ${snap.holdings.length} holdings${obj.exportedAt ? `, backed up ${fmtDate(obj.exportedAt)}` : ''}.` }),
    el('p', { class: 'cap muted', text: hasData() ? 'Restoring replaces everything on this device. Back up first if you want to keep what is here now.' : 'This fills the app with the backup.' }));
  sheet('Restore this backup?', body, async () => {
    try { await store.replaceAll(snap); } catch { toast("Couldn't restore. Nothing was changed."); return false; }
    await setMeta('since', new Date().toISOString());
    $$('.sheet-bg').forEach((b) => b.remove());
    await reloadAll(); toast('Backup restored');
  }, 'Replace and restore');
}
async function loadSample() {
  const { SAMPLE } = await import('./sample.js');
  const snap = clone(SAMPLE); snap.config.partnerName = 'Alex';
  try { await store.replaceAll(snap); } catch { toast("Couldn't load the sample data."); return; }
  await setMeta('since', new Date().toISOString());
  await reloadAll(); toast('Sample data loaded. Restore a backup any time to replace it.');
}

function settingsSheet() {
  const c = cfg();
  const household = el('div', { class: 'card' }, el('h2', { text: 'Household' }),
    fieldRow('Partner display name', 'Shown wherever the app says Partner', el('input', { id: 'st-pname', class: 'plain', value: c.partnerName || '', placeholder: 'Partner', autocomplete: 'off' }), 'st-pname'),
    fieldRow('Partner card, last 4 digits', 'Comma separated', el('input', { id: 'st-pcards', class: 'plain', inputmode: 'numeric', value: listTxt(c.partnerCards) }), 'st-pcards'),
    fieldRow('Partner names in transfers', 'As they appear in bank descriptions, comma separated', el('input', { id: 'st-pnames', class: 'plain', value: listTxt(c.partnerNames), autocapitalize: 'characters' }), 'st-pnames'),
    fieldRow('Rent payees', 'Words in rent payment descriptions, comma separated', el('input', { id: 'st-rent', class: 'plain', value: listTxt(c.rentPayees), autocapitalize: 'characters' }), 'st-rent'),
    fieldRow('Your mortgage share', '% of repayments', el('input', { id: 'st-ms', class: 'plain', inputmode: 'decimal', value: r2(n(c.mortgageShare) * 100) }), 'st-ms'),
    fieldRow('Everyday target', 'Monthly, excluding one-offs', moneyInput('st-every', c.everydayTarget, 'Everyday target'), 'st-every'),
    el('p', { class: 'cap muted', text: 'Cards, names and payees sort transactions as they are imported. Change a category on a transaction to fix one already imported.' }),
    el('div', { class: 'btns' }, el('button', { class: 'btn primary small', type: 'button', text: 'Save household', onclick: async () => {
      const ms = n($('#st-ms').value); if (ms < 0 || ms > 100) { toast('Mortgage share is a percent from 0 to 100'); return; }
      await saveConfig({ partnerName: $('#st-pname').value.trim(), partnerCards: listVal($('#st-pcards').value).map((x) => x.replace(/\D/g, '').slice(-4)).filter(Boolean), partnerNames: listVal($('#st-pnames').value), rentPayees: listVal($('#st-rent').value), mortgageShare: ms / 100, everydayTarget: n($('#st-every').value) });
      toast('Household saved');
    } })));

  const linkRow = (kind) => { const id = 'st-ps-' + kind; const inp = el('input', { id, class: 'plain url', type: 'url', inputmode: 'url', value: c.priceSheets[kind] || '', placeholder: 'Paste the CSV link here', autocomplete: 'off', spellcheck: 'false' });
    return el('div', { class: 'field wide' }, el('label', { for: id }, `${SHEET_COLS[kind].label} tab`), inp); };
  const prices = el('div', { class: 'card' }, el('h2', { text: 'Price sheet links' }),
    el('p', { class: 'cap muted', text: 'In Google Sheets, choose File > Share > Publish to web, pick a tab, choose Comma-separated values (.csv), then Publish and paste the link here. Do this for each of the ETFs, Stocks and Crypto tabs. Anyone with a published link can read that tab.' }),
    ...Object.keys(SHEET_COLS).map(linkRow),
    el('div', { class: 'btns' }, el('button', { class: 'btn primary small', type: 'button', text: 'Save links', onclick: async () => {
      const links = {}; const bad = [];
      for (const k of Object.keys(SHEET_COLS)) { const v = $('#st-ps-' + k).value.trim(); links[k] = v; if (v && !looksLikePublishedCsv(v)) bad.push(SHEET_COLS[k].label); }
      if (bad.length) { toast(`${bad.join(', ')}: use the Publish to web link ending in output=csv`); return; }
      await saveConfig({ priceSheets: links }); try { localStorage.removeItem('bm-live'); } catch {}
      const count = Object.values(links).filter(Boolean).length;
      toast(count ? `${count} link${count > 1 ? 's' : ''} saved. Prices update when you open Invest.` : 'No links entered. Paste a published CSV link into each box first.');
    } })));

  const last = S.meta.lastBackup;
  const backup = el('div', { class: 'card' }, el('h2', { text: 'Backup' }),
    el('p', { class: 'cap muted', text: (last ? `Last backup ${fmtDate(last)}. ` : 'No backup made on this device yet. ') + 'Your data lives only on this device, so keep a backup somewhere safe, such as your Google Drive.' }),
    fieldRow('Passphrase', 'Optional. Encrypts the backup file', el('input', { id: 'st-pass', class: 'plain', type: 'password', autocomplete: 'new-password' }), 'st-pass'),
    fieldRow('Repeat passphrase', null, el('input', { id: 'st-pass2', class: 'plain', type: 'password', autocomplete: 'new-password' }), 'st-pass2'),
    el('p', { class: 'cap muted', text: "There's no way to open an encrypted backup without its passphrase." }),
    el('div', { class: 'btns' },
      el('button', { class: 'btn primary small', type: 'button', id: 'st-backup', text: 'Back up now', onclick: async () => {
        const p1 = $('#st-pass').value, p2 = $('#st-pass2').value;
        if (p1 !== p2) { toast("Passphrases don't match"); return; }
        if (await backupNow(p1)) { $('#st-pass').value = ''; $('#st-pass2').value = ''; }
      } }),
      el('button', { class: 'btn small', type: 'button', 'data-pick': 'restoreIn', text: 'Restore from file' })));

  const persistTxt = S.persisted === true ? 'The browser has agreed to keep this data unless you clear it yourself.' : S.persisted === false ? "The browser may clear this data if the phone runs low on space. Installing the app usually fixes that. Keep backups." : 'Keep backups, in case the browser clears its storage.';
  const about = el('div', { class: 'card' }, el('h2', { text: 'On this device' }), el('p', { class: 'cap muted', text: 'Nothing is sent anywhere. The only request the app makes is to fetch the price links above. ' + persistTxt }));
  sheet('Settings', el('div', { style: 'display:flex;flex-direction:column;gap:var(--s3)' }, household, prices, backup, about));
}

function renderFirstRun(host) {
  host.replaceChildren(); host.hidden = hasData();
  if (host.hidden) return;
  host.append(el('div', { class: 'empty' },
    el('h2', { text: 'Welcome to Wealth Tracker' }),
    el('p', { text: 'Everything stays on this phone. Start with made-up numbers to look around, or bring in your backup.' }),
    el('div', { class: 'btns', style: 'justify-content:center' },
      el('button', { class: 'btn primary', type: 'button', text: 'Load sample data', onclick: loadSample }),
      el('button', { class: 'btn', type: 'button', 'data-pick': 'restoreIn', text: 'Restore a backup' }))));
}
function renderBackupNudge(host) {
  host.replaceChildren(); host.hidden = !backupDue();
  if (host.hidden) return;
  const last = S.meta.lastBackup;
  host.append(el('div', { class: 'row' }, el('span', { text: last ? `Your last backup was ${fmtDate(last)}. Worth making a fresh one.` : "You haven't backed up yet. A backup keeps your data safe if this phone is lost." }),
    el('button', { class: 'btn small', type: 'button', text: 'Back up', onclick: settingsSheet })));
}

// ---------- routing ----------
function fillMonthPick() {
  const sel = $('#monthPick'); const set = new Set(sortedMonths()); set.add(thisMonth()); set.add(mAdd(thisMonth(), -1)); if (S.month) set.add(S.month);
  const list = [...set].sort().reverse(); sel.replaceChildren(...list.map((m) => el('option', { value: m, selected: m === S.month }, mLabel(m, true))));
}
function go(view) {
  S.view = view; $('#topTitle').textContent = { home: 'Home', checkin: 'Check-in', spend: 'Spending', budget: 'Budget', invest: 'Invest', wealth: 'Wealth' }[view] || 'Home';
  $$('[data-view]').forEach((s) => { s.hidden = s.dataset.view !== view; });
  $$('.tab').forEach((t) => t.setAttribute('aria-current', t.dataset.tab === view ? 'page' : 'false'));
  try { localStorage.setItem('bm-view', view); } catch {}
  if (location.hash.slice(1) !== view) history.replaceState(null, '', '#' + view);
  render(true); window.scrollTo(0, 0);
}
function render(force) {
  if (!S.month) return;
  if (S.view === 'home') renderHome();
  else if (S.view === 'checkin') { if (force) renderCheckin(true); }
  else if (S.view === 'spend') renderSpend();
  else if (S.view === 'budget') renderBudget();
  else if (S.view === 'wealth') renderWealth();
  else if (S.view === 'invest') { renderInvest(); if (force && S.ready.months) maybeAutoRefresh(); }
}

// ---------- events ----------
$$('.tab').forEach((t) => t.addEventListener('click', () => go(t.dataset.tab)));
$('#monthPick').addEventListener('change', (e) => { S.month = e.target.value; S.draft = null; S.catFilter = null; render(true); });
$('#pdfIn').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importAccountPdf(f); });
let sq; $('#s-search').addEventListener('input', (e) => { clearTimeout(sq); sq = setTimeout(() => { S.search = e.target.value; renderSpend(); }, 180); });
$('#s-sort').addEventListener('click', () => { S.sort = S.sort === 'amount' ? 'date' : 'amount'; renderSpend(); });
$('#csvIn').addEventListener('change', (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) importFiles(fs); });
$('#restoreIn').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) restoreFromFile(f); });
// File inputs are hidden; any button with data-pick="<input id>" opens that picker.
document.addEventListener('click', (e) => { const b = e.target.closest?.('[data-pick]'); if (b) $('#' + b.dataset.pick)?.click(); });
$('#settingsBtn').addEventListener('click', settingsSheet);
const dz = $('#dropzone');
['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
dz.addEventListener('drop', (e) => { const fs = [...(e.dataTransfer?.files || [])].filter((f) => /\.csv$/i.test(f.name)); if (fs.length) importFiles(fs); });
$('#c-save').addEventListener('click', async () => { const m = S.month; const d = S.draft.d; d.notes = $('#c-notes').value.trim(); d.updatedAt = new Date().toISOString(); S.months[m] = clone(d); if (await writeDoc('months/' + m, S.months[m])) { S.draft.dirty = false; toast(`${mLabel(m, true)} saved`); } fillMonthPick(); });
$('#c-reset').addEventListener('click', () => { renderCheckin(true); toast('Changes undone'); });
$('#c-notes').addEventListener('input', (e) => { if (S.draft) { S.draft.dirty = true; S.draft.d.notes = e.target.value; } });
$('#c-addacct').addEventListener('click', () => accountSheet(null));
$('#w-add').addEventListener('click', () => accountSheet(null));
$('#b-edit').addEventListener('click', targetsSheet);
$('#b-sinkedit').addEventListener('click', sinkSheet);
$('#b-fixedit').addEventListener('click', fixedSheet);
$('#w-goaledit').addEventListener('click', goalSheet);
$('#i-prices').addEventListener('click', pricesSheet);
$('#i-refresh').addEventListener('click', () => refreshFromSheet(true));
$('#i-add').addEventListener('click', () => holdingSheet(null));
let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (S.view === 'home') renderHome(); }, 150); });

// ---------- boot ----------
function pickStartMonth() { const ms = sortedMonths(); return ms.length ? ms[ms.length - 1] : mAdd(thisMonth(), -1); }
function onReady() {
  if (!S.month) { S.month = pickStartMonth(); }
  fillMonthPick(); render(S.view !== 'checkin' || !S.draft?.dirty);
}
async function loadState() {
  const [config, accounts, months, holdings, meta] = await Promise.all([store.get('config', 'app'), store.getAll('accounts'), store.getAll('months'), store.getAll('holdings'), store.getAll('meta')]);
  S.config = config ?? null; S.accounts = Object.values(accounts); S.months = months; S.holdings = Object.values(holdings); S.tx = {}; S.meta = meta || {};
  S.draft = null; S.catFilter = null;
  if (S.config?.rules?.some((r) => fixCat(r.cat) !== r.cat)) { S.config.rules = S.config.rules.map((r) => ({ ...r, cat: fixCat(r.cat) })); await store.put('config', 'app', clone(S.config)); }
  S.ready = { config: true, accounts: true, months: true };
}
async function reloadAll() { await loadState(); S.month = pickStartMonth(); fillMonthPick(); render(true); }
(async function start() {
  let v = location.hash.slice(1); if (!['home', 'checkin', 'spend', 'budget', 'invest', 'wealth'].includes(v)) { try { v = localStorage.getItem('bm-view') || 'home'; } catch { v = 'home'; } }
  S.month = mAdd(thisMonth(), -1); fillMonthPick(); go(v); S.month = null;
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h && h !== S.view && ['home', 'checkin', 'spend', 'budget', 'invest', 'wealth'].includes(h)) go(h); });
  try { await loadState(); setSave('Saved on this device'); }
  catch { setSave('Storage unavailable'); toast("This browser won't let the app store data. Private browsing can cause this."); S.ready = { config: true, accounts: true, months: true }; }
  if (hasData() && !S.meta.since) await setMeta('since', new Date().toISOString());
  onReady();
  S.persisted = await store.persist();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
