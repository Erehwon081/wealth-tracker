// Loan maths for the mortgage what-if and the house ledger. Pure, so it can be unit tested.

const num = (v) => { const x = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(x) ? x : 0; };

// Rate history is [{date:'YYYY-MM-DD', rate}]: "from this date the rate is X". The first entry is the starting rate.
export const sortHistory = (h) => [...(h || [])].filter((x) => x && x.date && num(x.rate) > 0).sort((a, b) => a.date.localeCompare(b.date));
export function rateAt(history, date, fallback = 0) {
  const h = sortHistory(history); if (!h.length) return num(fallback);
  let r = h[0].rate;
  for (const x of h) if (x.date.slice(0, date.length) <= date) r = x.rate;
  return num(r);
}

// Simulates paying off one or more loans month by month.
//   loans: [{ balance, rate (% a year), repayment (per month), offset }]
//   opts:  { extraMonthly, lumpSum, extraOffset }  extras go to the highest-rate loan first
// Returns { months (Infinity if never paid off), interest, series (total owing at each month, from month 0), paidOff }.
export function simulate(loans, opts = {}, maxMonths = 720) {
  const L = (loans || []).map((l) => ({ bal: Math.abs(num(l.balance)), r: num(l.rate) / 100 / 12, pay: Math.max(0, num(l.repayment)), off: Math.max(0, num(l.offset)) })).filter((l) => l.bal > 0);
  const order = L.map((_, i) => i).sort((a, b) => L[b].r - L[a].r);
  const total = () => L.reduce((s, l) => s + l.bal, 0);
  const payDown = (amount) => { for (const i of order) { if (amount <= 0) break; const p = Math.min(L[i].bal, amount); L[i].bal -= p; amount -= p; } };
  payDown(Math.max(0, num(opts.lumpSum)));
  if (order.length) L[order[0]].off += Math.max(0, num(opts.extraOffset));
  const series = [total()]; let interest = 0;
  if (series[0] < 0.005) return { months: 0, interest: 0, series, paidOff: true };
  for (let m = 1; m <= maxMonths; m++) {
    for (const l of L) { if (l.bal <= 0) continue; const i = Math.max(0, l.bal - l.off) * l.r; interest += i; l.bal += i; l.bal -= Math.min(l.bal, l.pay); }
    payDown(Math.max(0, num(opts.extraMonthly)));
    const t = total(); series.push(t);
    if (t < 0.005) return { months: m, interest, series, paidOff: true };
  }
  return { months: Infinity, interest, series, paidOff: false };
}

// Extra interest paid since the rate moved off its starting rate, using actual month-end balances.
//   balances: [{ m:'YYYY-MM', bal }]  (interest-bearing balance, positive)
export function rateChangeCost(history, balances) {
  const h = sortHistory(history); if (h.length < 2) return null;
  const base = num(h[0].rate), from = h[1].date.slice(0, 7);
  let cost = 0, months = 0;
  for (const b of balances || []) { if (b.m < from) continue; cost += ((rateAt(h, b.m + '-31') - base) / 100 / 12) * Math.max(0, num(b.bal)); months++; }
  return { cost, months, base, from: h[1].date, now: num(h[h.length - 1].rate) };
}
