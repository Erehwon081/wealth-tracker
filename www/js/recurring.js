// Recurring charges: spotting likely ones in the transactions, and working out when a confirmed one is next due.
// Pure functions, no app state, so they can be unit tested.

export const PERIODS = ['week', 'fortnight', 'month', 'quarter', 'year'];
export const PERIOD_LABEL = { week: 'Weekly', fortnight: 'Fortnightly', month: 'Monthly', quarter: 'Quarterly', year: 'Yearly' };
const DAYS = { week: 7, fortnight: 14, month: 30.44, quarter: 91.31, year: 365.25 };
// The gaps between charges that count as each period. Banks post a day or two either side, and months vary in length.
const GAP = { week: [5, 9], fortnight: [12, 16], month: [26, 35], quarter: [84, 98], year: [350, 380] };
// How many charges it takes before a pattern is suggested. Quarterly and yearly bills don't come around often.
const MIN_COUNT = { week: 4, fortnight: 4, month: 3, quarter: 2, year: 2 };
const DAY = 86400000;

export const perMonth = (amount, every) => (Math.abs(Number(amount) || 0) * DAYS.month) / (DAYS[every] || DAYS.month);
const iso = (d) => d.toISOString().slice(0, 10);
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

// The next date after `date`: a week or fortnight on, or the same day of a later month (the 31st becomes the month's last day).
export function addPeriod(date, every) {
  const d = new Date(date + 'T00:00:00Z');
  if (every === 'week' || every === 'fortnight') return iso(new Date(d.getTime() + (every === 'week' ? 7 : 14) * DAY));
  const months = { month: 1, quarter: 3, year: 12 }[every] || 1;
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + months, day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(y, m, Math.min(day, last))));
}
// Steps forward from `date` until it's on or after `today`.
export function rollForward(date, every, today) {
  let d = date; for (let i = 0; i < 600 && d < today; i++) d = addPeriod(d, every);
  return d;
}

// The shop's name without card details, numbers, places' boilerplate or payment-provider prefixes, as its first two words.
const NOISE = new Set(['CARD', 'ENDING', 'AUS', 'AU', 'AUSTRALIA', 'PTY', 'LTD', 'VISA', 'DEBIT', 'PURCHASE', 'EFTPOS', 'POS', 'THE', 'COM', 'WWW', 'NET', 'INTERNET', 'PAYMENT', 'DIRECT', 'DD', 'VALUE', 'DATE']);
export function payeeKey(t) {
  const s = String((t.merchant || t.desc) || '').toUpperCase().replace(/^(SQ|SP|SMP|ZLR|PAYPAL|PP|LS|IZ|TST)\s*\*\s*/, '').replace(/[^A-Z]+/g, ' ');
  return s.split(' ').filter((w) => w.length > 1 && !NOISE.has(w)).slice(0, 2).join(' ');
}
// Whether a transaction is a charge for this recurring item: its description holds the item's words.
export function matches(t, words) {
  // Both sides are cleaned the same way as payeeKey, so a suggestion's words find the charges it came from.
  const clean = (x) => ' ' + String(x || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').split(' ').filter((w) => w && !NOISE.has(w)).join(' ') + ' ';
  const w = clean(words).trim(); if (!w) return false;
  return clean((t.merchant || '') + ' ' + (t.desc || '')).includes(' ' + w);
}
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const i = s.length >> 1; return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };

// Suggests recurring charges from outgoing transactions: the same shop, a similar amount, at regular gaps, and still going.
//   rows: transactions to look at (outgoing spending only; the app leaves out transfers and loans)
//   asOf: the newest date the data covers. skip: payee keys already confirmed or dismissed.
// Returns [{ key, name, words, amount, every, next, last, count }], most expensive per month first.
export function detectRecurring(rows, asOf, skip = []) {
  const skipSet = new Set(skip.map((k) => String(k).toUpperCase()));
  const groups = new Map();
  for (const t of rows || []) {
    if (!(Number(t.amt) < 0) || !t.date) continue;
    const key = payeeKey(t); if (key.length < 3 || skipSet.has(key)) continue;
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(t);
  }
  const out = [];
  for (const [key, list] of groups) {
    // One shop can bill several things (two subscriptions, say), so split it by amount first.
    const sorted = [...list].sort((a, b) => Math.abs(a.amt) - Math.abs(b.amt));
    const clusters = []; for (const t of sorted) { const c = clusters[clusters.length - 1]; const a = Math.abs(t.amt); if (c && a <= c.base * 1.15 + 1) c.rows.push(t); else clusters.push({ base: a, rows: [t] }); }
    for (const c of clusters) {
      const dates = [...new Set(c.rows.map((t) => t.date))].sort(); if (dates.length < 2) continue;
      // A shop you buy from often (a supermarket, a servo) can throw up a few similar amounts by chance. Only count the
      // pattern if it's at least a third of what you spend there by number of purchases.
      if (c.rows.length * 3 < list.length) continue;
      const gaps = dates.slice(1).map((d, i) => days(dates[i], d));
      const g = median(gaps);
      const every = PERIODS.find((p) => g >= GAP[p][0] && g <= GAP[p][1]); if (!every) continue;
      if (dates.length < MIN_COUNT[every]) continue;
      // Most gaps fit the period; a missed or doubled-up month here and there is fine.
      const fit = gaps.filter((x) => x >= GAP[every][0] && x <= GAP[every][1]).length / gaps.length; if (fit < 0.7) continue;
      const amts = c.rows.map((t) => Math.abs(t.amt)); const amount = median(amts);
      if (amts.filter((a) => Math.abs(a - amount) <= Math.max(2, amount * 0.15)).length / amts.length < 0.75) continue;
      const last = dates[dates.length - 1];
      if (days(last, asOf) > DAYS[every] * 1.6 + 3) continue; // stopped: no charge for longer than it should take
      const latest = c.rows.filter((t) => t.date === last)[0];
      // A readable name: the description up to the first word with digits in it (card numbers, references) or card details.
      const words = String(latest.merchant || latest.desc || '').replace(/\s{2,}.*$/, '').split(/\s+/); const keep = [];
      for (const w of words) { if (/\d/.test(w) || /^(CARD|AUS)$/i.test(w) || keep.length >= 4) break; keep.push(w); }
      const name = keep.join(' ').slice(0, 40) || key;
      out.push({ key: clusters.length > 1 ? `${key} ${Math.round(amount)}` : key, words: key, name, amount: Math.round(amount * 100) / 100, every, last, next: rollForward(addPeriod(last, every), every, asOf), count: dates.length });
    }
  }
  return out.sort((a, b) => perMonth(b.amount, b.every) - perMonth(a.amount, a.every));
}

// Where a confirmed charge is up to: the last payment found in the transactions, and the next date it's due.
//   charge: { words, amount, every, next }. today: 'YYYY-MM-DD'.
export function chargeStatus(charge, rows, today) {
  const paid = (rows || []).filter((t) => Number(t.amt) < 0 && matches(t, charge.words)).sort((a, b) => b.date.localeCompare(a.date));
  const lastPaid = paid[0] ? { date: paid[0].date, amount: Math.abs(paid[0].amt) } : null;
  let next = charge.next || (lastPaid ? addPeriod(lastPaid.date, charge.every) : today);
  // A payment from a few days before the due date onwards means that one's done: the next is a period on.
  if (lastPaid && charge.next && days(charge.next, lastPaid.date) >= -5) next = addPeriod(lastPaid.date, charge.every);
  next = rollForward(next, charge.every, today);
  const changed = lastPaid && Math.abs(lastPaid.amount - Math.abs(charge.amount)) > Math.max(1, Math.abs(charge.amount) * 0.05) ? lastPaid.amount : null;
  return { lastPaid, next, changed };
}
