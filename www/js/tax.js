// Australian financial-year maths for the tax view: dividends with franking credits and capital gains per parcel.
// Pure, so it can be unit tested. Estimates to take to a tax return or accountant, not tax advice.

const num = (v) => { const x = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[$,%\s]/g, '')); return Number.isFinite(x) ? x : 0; };

// Financial years run 1 July to 30 June and are named by the year they end in: FY 2027 is 2026–27.
export const fyOf = (date) => { const y = +String(date).slice(0, 4), m = +String(date).slice(5, 7); return m >= 7 ? y + 1 : y; };
export const fyLabel = (fy) => `${fy - 1}–${String(fy).slice(2)}`;

// Franking credit on a cash dividend: the tax the company already paid on the franked part.
export const frankingCredit = (amount, frankedPct, taxRate = 30) => { const t = num(taxRate) || 30; return num(amount) * (Math.min(100, Math.max(0, num(frankedPct))) / 100) * (t / (100 - t)); };

export const divPayments = (h) => (h.divPayments || []).filter((p) => p && p.date);
// All-time dividends: the older lump-sum total plus each recorded payment.
export const totalDivs = (h) => num(h.divs) + divPayments(h).reduce((s, p) => s + num(p.amount), 0);

const plusYear = (d) => (+d.slice(0, 4) + 1) + d.slice(4);

// Matches sales to purchase parcels. Returns what is still held and each disposal piece.
//   sale.method: 'fifo' (oldest first, the default), 'lifo' (newest first) or 'maxcost' (highest cost first)
export function matchParcels(h) {
  const pool = (h.lots || []).filter((l) => l && l.date && num(l.units) > 0).map((l) => ({ date: l.date, units: num(l.units), unitCost: num(l.price) + num(l.fee) / num(l.units) })).sort((a, b) => a.date.localeCompare(b.date));
  const take = (list, units, each) => { let left = units; for (const p of list) { if (left <= 1e-9) break; const u = Math.min(p.units, left); if (u <= 0) continue; p.units -= u; left -= u; each?.(p, u); } return left; };
  take(pool, num(h.sold)); // units sold before sales were recorded: oldest parcels, no gain record
  const disposals = []; let unmatched = 0;
  const sales = (h.sales || []).filter((s) => s && s.date && num(s.units) > 0).sort((a, b) => a.date.localeCompare(b.date));
  for (const s of sales) {
    const cands = pool.filter((p) => p.date <= s.date && p.units > 1e-9);
    if (s.method === 'lifo') cands.reverse(); else if (s.method === 'maxcost') cands.sort((a, b) => b.unitCost - a.unitCost);
    const units = num(s.units);
    unmatched += take(cands, units, (p, u) => {
      const proceeds = u * num(s.price) - num(s.fee) * (u / units), cost = u * p.unitCost;
      disposals.push({ saleDate: s.date, lotDate: p.date, units: u, proceeds, cost, gain: proceeds - cost, discount: s.date > plusYear(p.date) });
    });
  }
  return { remaining: pool.filter((p) => p.units > 1e-9), disposals, unmatched };
}

export const unitsHeld = (h) => matchParcels(h).remaining.reduce((s, p) => s + p.units, 0);
export const costHeld = (h) => matchParcels(h).remaining.reduce((s, p) => s + p.units * p.unitCost, 0);

// Net capital gain: losses come off gains that get no discount first, then off discountable gains, then the 50% discount applies.
export function netCapitalGain(discGains, otherGains, losses) {
  const other = Math.max(0, otherGains - losses), lossLeft = Math.max(0, losses - otherGains);
  const disc = Math.max(0, discGains - lossLeft), carried = Math.max(0, lossLeft - discGains);
  return { net: other + disc * 0.5, discount: disc * 0.5, carried };
}

export function fySummary(holdings, fy) {
  const dividends = [], disposals = [];
  for (const h of holdings || []) {
    for (const p of divPayments(h)) { if (fyOf(p.date) !== fy) continue; const credit = frankingCredit(p.amount, p.franked, h.companyTax); dividends.push({ ticker: h.ticker, date: p.date, amount: num(p.amount), franked: num(p.franked), credit, grossed: num(p.amount) + credit }); }
    for (const d of matchParcels(h).disposals) if (fyOf(d.saleDate) === fy) disposals.push({ ticker: h.ticker, ...d });
  }
  dividends.sort((a, b) => a.date.localeCompare(b.date)); disposals.sort((a, b) => a.saleDate.localeCompare(b.saleDate));
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const discGains = sum(disposals, (d) => (d.gain > 0 && d.discount ? d.gain : 0)), otherGains = sum(disposals, (d) => (d.gain > 0 && !d.discount ? d.gain : 0)), losses = sum(disposals, (d) => (d.gain < 0 ? -d.gain : 0));
  return { fy, dividends, disposals, cash: sum(dividends, (d) => d.amount), credits: sum(dividends, (d) => d.credit), grossed: sum(dividends, (d) => d.grossed), discGains, otherGains, losses, ...netCapitalGain(discGains, otherGains, losses) };
}

// Financial years that have any dividend or sale, plus the current one, newest first.
export function fyList(holdings, today) {
  const s = new Set([fyOf(today)]);
  for (const h of holdings || []) { for (const p of divPayments(h)) s.add(fyOf(p.date)); for (const x of h.sales || []) if (x?.date) s.add(fyOf(x.date)); }
  return [...s].sort((a, b) => b - a);
}

// Reads dividend rows from a CSV (already split into header-keyed objects). Column names are matched loosely.
export function parseDividendRows(rows, parseDate) {
  const pick = (r, re, not) => { const k = Object.keys(r).find((x) => re.test(x) && !(not && not.test(x))); return k ? r[k] : ''; };
  const out = [];
  for (const r of rows || []) {
    const date = parseDate(pick(r, /date|paid/i)), ticker = String(pick(r, /ticker|code|symbol|stock|holding/i)).split(':').pop().trim().toUpperCase();
    const amount = num(pick(r, /amount|cash|net|dividend|payment|total/i, /date|frank|unit|share|per|rate|ticker|code/i));
    if (!date || !ticker || !(amount > 0)) continue;
    const fr = pick(r, /frank/i); let franked = num(fr); if (franked > 0 && franked <= 1 && !/%/.test(String(fr))) franked *= 100;
    out.push({ ticker, date, amount, franked: Math.min(100, Math.max(0, franked)), units: num(pick(r, /units|drp|reinvest/i, /date/i)) || undefined });
  }
  return out;
}

const q = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const r2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
export function taxCsv(s) {
  const lines = [[`Wealth Tracker tax summary, financial year ${fyLabel(s.fy)}`], [], ['Dividends'], ['Date', 'Holding', 'Cash', 'Franked %', 'Franking credit', 'Grossed up'],
    ...s.dividends.map((d) => [d.date, d.ticker, r2(d.amount), d.franked, r2(d.credit), r2(d.grossed)]), ['Total', '', r2(s.cash), '', r2(s.credits), r2(s.grossed)], [],
    ['Capital gains'], ['Sold', 'Holding', 'Bought', 'Units', 'Proceeds', 'Cost base', 'Gain or loss', 'Held over 12 months'],
    ...s.disposals.map((d) => [d.saleDate, d.ticker, d.lotDate, +d.units.toFixed(8), r2(d.proceeds), r2(d.cost), r2(d.gain), d.discount ? 'Yes' : 'No']), [],
    ['Gains eligible for the 50% discount', r2(s.discGains)], ['Other gains', r2(s.otherGains)], ['Losses', r2(s.losses)], ['Net capital gain', r2(s.net)], ['Loss carried forward', r2(s.carried)]];
  return lines.map((l) => l.map(q).join(',')).join('\n') + '\n';
}
