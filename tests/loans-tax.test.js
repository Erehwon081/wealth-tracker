import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, rateAt, rateChangeCost } from '../www/js/loans.js';
import { fyOf, fyLabel, frankingCredit, matchParcels, unitsHeld, costHeld, netCapitalGain, fySummary, parseDividendRows, taxCsv, totalDivs } from '../www/js/tax.js';

const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('simulate matches the standard amortisation formula', () => {
  const B = 500000, rate = 6, P = 3500, r = rate / 100 / 12;
  const s = simulate([{ balance: -B, rate, repayment: P }]);
  assert.equal(s.months, Math.ceil(-Math.log(1 - (r * B) / P) / Math.log(1 + r)));
  assert.ok(s.paidOff && s.series[0] === B && s.series.at(-1) < 0.01);
  near(s.interest, s.months * P - B, P); // total paid minus principal, within one repayment
});

test('extra repayments, a lump sum and offset each cut time and interest', () => {
  const loan = [{ balance: 500000, rate: 6, repayment: 3500 }];
  const base = simulate(loan);
  for (const opts of [{ extraMonthly: 500 }, { lumpSum: 20000 }, { extraOffset: 20000 }]) {
    const s = simulate(loan, opts);
    assert.ok(s.months < base.months && s.interest < base.interest, JSON.stringify(opts));
  }
  // $20k in offset saves $100 interest in month one at 6%
  near(simulate(loan, {}, 1).interest - simulate(loan, { extraOffset: 20000 }, 1).interest, 100);
});

test('extras go to the highest-rate loan, and a repayment below the interest never pays off', () => {
  const s = simulate([{ balance: 100000, rate: 4, repayment: 600 }, { balance: 100000, rate: 7, repayment: 700 }], { lumpSum: 100000 });
  near(s.series[0], 100000); // the 7% loan is cleared first
  near(simulate([{ balance: 100000, rate: 4, repayment: 600 }, { balance: 100000, rate: 7, repayment: 700 }], { lumpSum: 100000 }, 1).interest, 100000 * 0.04 / 12);
  const never = simulate([{ balance: 500000, rate: 6, repayment: 2000 }]);
  assert.ok(!never.paidOff && never.months === Infinity);
  assert.equal(simulate([]).months, 0);
});

test('rate history: rate in effect, and what a change has cost', () => {
  const h = [{ date: '2026-03-15', rate: 5.89 }, { date: '2023-03-15', rate: 2.09 }];
  assert.equal(rateAt(h, '2025-06'), 2.09); assert.equal(rateAt(h, '2026-03-31'), 5.89); assert.equal(rateAt(h, '2020-01'), 2.09); assert.equal(rateAt([], '2026-01', 6), 6);
  const c = rateChangeCost(h, [{ m: '2026-02', bal: 600000 }, { m: '2026-03', bal: 600000 }, { m: '2026-04', bal: 600000 }]);
  assert.equal(c.months, 2); near(c.cost, 2 * 600000 * (5.89 - 2.09) / 100 / 12);
  assert.equal(rateChangeCost([{ date: '2026-01-01', rate: 5 }], []), null);
});

test('financial years and franking credits', () => {
  assert.equal(fyOf('2026-06-30'), 2026); assert.equal(fyOf('2026-07-01'), 2027); assert.equal(fyLabel(2027), '2026–27');
  near(frankingCredit(700, 100), 300); near(frankingCredit(700, 50), 150); near(frankingCredit(750, 100, 25), 250); assert.equal(frankingCredit(700, 0), 0);
  assert.equal(totalDivs({ divs: 100, divPayments: [{ date: '2026-09-01', amount: 50 }] }), 150);
});

const h = { ticker: 'CBA', lots: [{ date: '2021-05-18', units: 40, price: 100, fee: 20 }, { date: '2026-03-20', units: 10, price: 150, fee: 10 }] };

test('oldest-first matching, the 12-month discount, and what remains', () => {
  const m = matchParcels({ ...h, sales: [{ date: '2026-09-01', units: 45, price: 160, fee: 45 }] });
  assert.equal(m.disposals.length, 2); assert.equal(m.unmatched, 0);
  const [a, b] = m.disposals;
  assert.equal(a.units, 40); assert.ok(a.discount); near(a.cost, 40 * 100 + 20); near(a.proceeds, 40 * 160 - 40); near(a.gain, 6400 - 40 - 4020);
  assert.equal(b.units, 5); assert.ok(!b.discount); near(b.cost, 5 * 151); near(b.proceeds, 5 * 160 - 5);
  assert.equal(unitsHeld({ ...h, sales: [{ date: '2026-09-01', units: 45, price: 160 }] }), 5);
  near(costHeld({ ...h, sales: [{ date: '2026-09-01', units: 45, price: 160 }] }), 5 * 151);
});

test('other methods, earlier sold units, parcels bought after the sale, and overselling', () => {
  assert.equal(matchParcels({ ...h, sales: [{ date: '2026-09-01', units: 5, price: 160, method: 'lifo' }] }).disposals[0].lotDate, '2026-03-20');
  assert.equal(matchParcels({ ...h, sales: [{ date: '2026-09-01', units: 5, price: 160, method: 'maxcost' }] }).disposals[0].lotDate, '2026-03-20');
  assert.equal(unitsHeld({ ...h, sold: 30 }), 20);
  const early = matchParcels({ ...h, sales: [{ date: '2025-01-01', units: 45, price: 120 }] });
  assert.equal(early.disposals.length, 1); assert.equal(early.unmatched, 5); // the 2026 parcel didn't exist yet
  assert.equal(unitsHeld({ lots: [{ date: '2022-01-01', units: 1.5, price: 1650 }] }), 1.5);
});

test('net capital gain applies losses before the discount', () => {
  assert.deepEqual(netCapitalGain(1000, 0, 0), { net: 500, discount: 500, carried: 0 });
  assert.deepEqual(netCapitalGain(1000, 400, 600), { net: 400, discount: 400, carried: 0 });
  assert.deepEqual(netCapitalGain(100, 100, 500), { net: 0, discount: 0, carried: 300 });
});

test('financial year summary, CSV export and dividend import', () => {
  const hold = [{ ...h, companyTax: 30, divPayments: [{ date: '2026-09-20', amount: 700, franked: 100 }, { date: '2026-03-20', amount: 600, franked: 100 }], sales: [{ date: '2026-09-01', units: 45, price: 160, fee: 45 }] }];
  const s = fySummary(hold, 2027);
  assert.equal(s.dividends.length, 1); near(s.cash, 700); near(s.credits, 300); near(s.grossed, 1000);
  near(s.discGains, 2340); near(s.otherGains, 40); assert.equal(s.losses, 0); near(s.net, 40 + 1170);
  assert.equal(fySummary(hold, 2026).dividends.length, 1); assert.equal(fySummary(hold, 2026).disposals.length, 0);
  const csv = taxCsv(s); assert.match(csv, /2026–27/); assert.match(csv, /2026-09-20,CBA,700\.00,100,300\.00,1000\.00/); assert.match(csv, /Net capital gain,1210\.00/);
  const rows = parseDividendRows([{ 'Payment Date': '20/09/2026', Ticker: 'ASX:CBA', 'Net Amount': '$700.00', 'Franking %': '100%' }, { Date: '2026-03-20', Code: 'vas', Amount: '85.5', Franked: '0.8' }, { Date: '', Ticker: 'X', Amount: '1' }],
    (d) => { const m = String(d).match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null; });
  assert.deepEqual(rows, [{ ticker: 'CBA', date: '2026-09-20', amount: 700, franked: 100, units: undefined }, { ticker: 'VAS', date: '2026-03-20', amount: 85.5, franked: 80, units: undefined }]);
});
