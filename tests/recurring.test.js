import test from 'node:test';
import assert from 'node:assert/strict';
import { detectRecurring, chargeStatus, addPeriod, rollForward, payeeKey, matches, perMonth } from '../www/js/recurring.js';

const tx = (date, amt, desc, extra = {}) => ({ date, amt, desc, merchant: '', acct: '1111', ...extra });

test('dates move on by the period, keeping the day of the month where it exists', () => {
  assert.equal(addPeriod('2026-01-31', 'month'), '2026-02-28');
  assert.equal(addPeriod('2026-11-15', 'month'), '2026-12-15');
  assert.equal(addPeriod('2026-11-15', 'quarter'), '2027-02-15');
  assert.equal(addPeriod('2026-11-15', 'year'), '2027-11-15');
  assert.equal(addPeriod('2026-11-15', 'fortnight'), '2026-11-29');
  assert.equal(rollForward('2026-08-03', 'month', '2026-11-16'), '2026-12-03');
  assert.equal(Math.round(perMonth(26, 'year') * 100) / 100, 2.17);
});

test('the payee is the shop without card details, numbers or payment prefixes', () => {
  assert.equal(payeeKey(tx('2026-11-01', -1, 'NETFLIX.COM SYDNEY AUS Card ending 4049')), 'NETFLIX SYDNEY');
  assert.equal(payeeKey(tx('2026-11-01', -1, 'SQ *MARKET LANE COFFEE')), 'MARKET LANE');
  assert.ok(matches(tx('2026-11-01', -1, 'NETFLIX.COM SYDNEY'), 'NETFLIX'));
  assert.ok(matches(tx('2026-11-01', -1, 'NETFLIX.COM SYDNEY AUS'), 'NETFLIX SYDNEY'));
  assert.ok(!matches(tx('2026-11-01', -1, 'NETFLIXY'), 'NETFLIX SYDNEY'));
});

test('finds regular charges and leaves everyday shopping alone', () => {
  const rows = [];
  for (const m of ['06', '07', '08', '09', '10', '11']) {
    rows.push(tx(`2026-${m}-03`, -22.99, 'NETFLIX.COM SYDNEY'));
    rows.push(tx(`2026-${m}-1${m === '09' ? '6' : '4'}`, -89.5, 'TELSTRA MOBILE BILL'));
    // supermarket: every week but the amount varies a lot
    ['02', '09', '16', '23'].forEach((d, i) => rows.push(tx(`2026-${m}-${d}`, -[83.2, 141.7, 56.9, 210.4, 97.3, 64.1, 172.8, 119.5, 45.6, 188.2, 133.9, 76.4, 152.3, 61.8, 99.9, 230.1, 71.2, 126.4, 49.5, 167.7, 112.6, 88.8, 201.3, 58.4][(Number(m) - 6) * 4 + i], 'WOOLWORTHS 1234 RICHMOND')));
    // petrol: irregular
    rows.push(tx(`2026-${m}-${m === '07' ? '20' : '05'}`, -70, 'BP RINGWOOD'));
  }
  // weekly gym, stopped in September
  for (const d of ['2026-08-04', '2026-08-11', '2026-08-18', '2026-08-25', '2026-09-01']) rows.push(tx(d, -19.95, 'FITNESS FIRST'));
  // yearly rego and a quarterly water bill
  rows.push(tx('2025-12-10', -812.4, 'VICROADS REGO'), tx('2026-12-08', -826.1, 'VICROADS REGO'));
  rows.push(tx('2026-05-20', -180, 'YARRA VALLEY WATER'), tx('2026-08-19', -192, 'YARRA VALLEY WATER'), tx('2026-11-18', -185, 'YARRA VALLEY WATER'));
  // one shop billing two subscriptions
  for (const m of ['08', '09', '10', '11']) rows.push(tx(`2026-${m}-01`, -4.49, 'APPLE.COM/BILL'), tx(`2026-${m}-12`, -12.99, 'APPLE.COM/BILL'));
  const found = detectRecurring(rows, '2026-12-08');
  const by = Object.fromEntries(found.map((f) => [f.words, f]));
  const keys = found.map((f) => f.key);
  assert.deepEqual([by['NETFLIX SYDNEY'].every, by['NETFLIX SYDNEY'].amount, by['NETFLIX SYDNEY'].last, by['NETFLIX SYDNEY'].next], ['month', 22.99, '2026-11-03', '2027-01-03']);
  assert.equal(by['TELSTRA MOBILE'].every, 'month');
  assert.equal(by['YARRA VALLEY'].every, 'quarter');
  assert.equal(by['VICROADS REGO'].every, 'year');
  assert.equal(keys.filter((k) => k.startsWith('APPLE BILL')).length, 2, keys.join('|'));
  assert.ok(!keys.some((k) => k.startsWith('WOOLWORTHS')), 'supermarket is not recurring');
  assert.ok(!keys.some((k) => k.startsWith('BP')), 'petrol is not recurring');
  assert.ok(!keys.some((k) => k.startsWith('FITNESS')), 'a stopped charge is not suggested');
  assert.ok(!detectRecurring(rows, '2026-12-08', ['NETFLIX SYDNEY']).some((f) => f.words === 'NETFLIX SYDNEY'), 'a payee turned down without an amount is skipped');
  // turning down one of two subscriptions from the same payee keeps the other, and the key it saves works
  const apple = found.filter((f) => f.words === 'APPLE BILL'); assert.equal(apple.length, 2);
  const left = detectRecurring(rows, '2026-12-08', [apple[0].key]).filter((f) => f.words === 'APPLE BILL');
  assert.deepEqual(left.map((f) => f.amount), [apple[1].amount]);
  // older saved keys with a rounded amount still work, and a small price rise doesn't bring it back
  assert.equal(detectRecurring(rows, '2026-12-08', ['APPLE BILL 13']).filter((f) => f.words === 'APPLE BILL').length, 1);
  assert.ok(!detectRecurring(rows, '2026-12-08', ['NETFLIX SYDNEY 21.5']).some((f) => f.words === 'NETFLIX SYDNEY'));
  assert.equal(found[0].words, 'TELSTRA MOBILE'); // most expensive per month first: $89.50 a month beats $819 a year
});

test('a confirmed charge knows its last payment and next date, and notices a price change', () => {
  const rows = [tx('2026-10-03', -22.99, 'NETFLIX.COM'), tx('2026-11-03', -24.99, 'NETFLIX.COM'), tx('2026-11-05', -10, 'OTHER')];
  const s = chargeStatus({ words: 'NETFLIX', amount: 22.99, every: 'month', next: '2026-11-03' }, rows, '2026-11-16');
  assert.deepEqual(s.lastPaid, { date: '2026-11-03', amount: 24.99 });
  assert.equal(s.next, '2026-12-03');
  assert.equal(s.changed, 24.99);
  // nothing paid yet: the next date set by hand stands, rolled on if it has passed
  assert.equal(chargeStatus({ words: 'GYM', amount: 20, every: 'fortnight', next: '2026-11-20' }, rows, '2026-11-16').next, '2026-11-20');
  assert.equal(chargeStatus({ words: 'GYM', amount: 20, every: 'fortnight', next: '2026-11-01' }, rows, '2026-11-16').next, '2026-11-29');
});
