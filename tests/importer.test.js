import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, parseAmount, detectKind, parseOfx, parseQif, guessMapping, applyMapping, resolveMapping, readCsv, signature, mappingOk, last4 } from '../www/js/importer.js';
import { seedCategory } from '../www/js/merchants.js';

test('dates and amounts in the forms banks use', () => {
  for (const [s, d] of [['05 Dec 26', '2026-12-05'], ['5/12/2026', '2026-12-05'], ['05-12-2026', '2026-12-05'], ['2026-12-05', '2026-12-05'], ['20261205120000[+10:AEST]', '2026-12-05'], ['05 December 2026', '2026-12-05'], ['05-Dec-2026', '2026-12-05'], ["5/12'26", '2026-12-05'], ['2026/12/05', '2026-12-05']]) assert.equal(parseDate(s), d, s);
  for (const s of ['', 'hello', '99/99/2026', '12.50']) assert.equal(parseDate(s), null, s);
  for (const [s, v] of [['$1,234.56', 1234.56], ['-12.30', -12.3], ['(12.30)', -12.3], ['12.30 DR', -12.3], ['12.30CR', 12.3], ['−5', -5], ['', null], ['abc', null]]) assert.equal(parseAmount(s), v, s);
  assert.equal(last4('082-000 12342222'), '2222');
});

const ofxSgml = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>AUD
<BANKACCTFROM><BANKID>083000<ACCTID>123456789<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261203<TRNAMT>-42.50<FITID>1<NAME>WOOLWORTHS 1234<MEMO>MELBOURNE
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261215<TRNAMT>4820.00<FITID>2<NAME>SALARY ACME &amp; CO
</BANKTRANLIST>
<LEDGERBAL><BALAMT>5321.09<DTASOF>20261231</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test('OFX: transactions, account number and closing balance (SGML and XML)', () => {
  assert.equal(detectKind('x.ofx', ofxSgml), 'ofx');
  const [a] = parseOfx(ofxSgml);
  assert.equal(a.acct, '6789'); assert.equal(a.kind, 'cash'); assert.equal(a.balance, 5321.09); assert.equal(a.balanceDate, '2026-12-31'); assert.equal(a.rows.length, 2);
  assert.deepEqual({ ...a.rows[0] }, { date: '2026-12-03', amt: -42.5, desc: 'WOOLWORTHS 1234 MELBOURNE', merchant: '', acct: '6789', bal: null, type: 'DEBIT', nabCat: '' });
  assert.equal(a.rows[1].desc, 'SALARY ACME & CO'); assert.equal(a.rows[1].bal, 5321.09); // balance rides on the newest transaction
  const xml = '<?xml version="1.0"?><OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CCACCTFROM><ACCTID>4111222233334444</ACCTID></CCACCTFROM><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261203120000</DTPOSTED><TRNAMT>-9.99</TRNAMT><NAME>NETFLIX</NAME></STMTTRN></BANKTRANLIST><LEDGERBAL><BALAMT>-250.00</BALAMT><DTASOF>20261204</DTASOF></LEDGERBAL></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>';
  const [c] = parseOfx(xml);
  assert.equal(c.kind, 'card'); assert.equal(c.acct, '4444'); assert.equal(c.balance, -250); assert.equal(c.rows[0].amt, -9.99); assert.equal(c.rows[0].desc, 'NETFLIX');
});

test('QIF: day-first dates, payee and memo', () => {
  const qif = '!Type:Bank\nD03/12/2026\nT-42.50\nPWOOLWORTHS\nMCard purchase\n^\nD15/12/2026\nT4,820.00\nPSALARY\n^\n';
  assert.equal(detectKind('x.qif', qif), 'qif');
  const [a] = parseQif(qif);
  assert.deepEqual(a.rows.map((r) => [r.date, r.amt, r.desc]), [['2026-12-03', -42.5, 'WOOLWORTHS Card purchase'], ['2026-12-15', 4820, 'SALARY']]);
});

test('NAB export is recognised without asking, whatever the column order', () => {
  const nab = 'Date,Amount,Account Number,,Transaction Type,Transaction Details,Balance,Category,Merchant Name\n05 Dec 26,-42.50,082-000 12342222,,EFTPOS,WOOLWORTHS 1234 MELBOURNE,1000.10,Groceries,Woolworths\n';
  const r = resolveMapping(readCsv(nab));
  assert.equal(r.source, 'builtin'); assert.equal(r.name, 'NAB');
  assert.deepEqual(applyMapping(readCsv(nab), r.mapping), [{ date: '2026-12-05', amt: -42.5, desc: 'WOOLWORTHS 1234 MELBOURNE', merchant: 'Woolworths', acct: '2222', bal: 1000.1, type: 'EFTPOS', nabCat: 'Groceries' }]);
  const shuffled = 'Merchant Name,Transaction Details,Amount,Date\nWoolworths,WOOLWORTHS,-1.00,05 Dec 26\n';
  assert.equal(applyMapping(readCsv(shuffled), resolveMapping(readCsv(shuffled)).mapping)[0].merchant, 'Woolworths');
});

test('unknown CSVs: guesses from headers, from data alone, and from debit and credit columns', () => {
  const noHeader = '03/12/2026,"-42.50","WOOLWORTHS 1234 MELBOURNE","+1000.10"\n15/12/2026,"+4820.00","SALARY ACME","+5820.10"\n';
  const g1 = resolveMapping(readCsv(noHeader));
  assert.equal(g1.source, 'guess'); assert.ok(mappingOk(g1.mapping)); assert.equal(g1.signature, 'n:4');
  assert.deepEqual(applyMapping(readCsv(noHeader), g1.mapping).map((r) => [r.date, r.amt, r.desc, r.bal]), [['2026-12-03', -42.5, 'WOOLWORTHS 1234 MELBOURNE', 1000.1], ['2026-12-15', 4820, 'SALARY ACME', 5820.1]]);
  const drcr = 'Bank Account,Date,Narrative,Debit Amount,Credit Amount,Balance,Categories,Serial\n032000123456,03/12/2026,WOOLWORTHS,42.50,,1000.10,PAYMENT,\n032000123456,15/12/2026,SALARY,,4820.00,5820.10,DEP,\n';
  const g2 = resolveMapping(readCsv(drcr));
  assert.ok(mappingOk(g2.mapping)); assert.equal(g2.mapping.map.amount, -1);
  assert.deepEqual(applyMapping(readCsv(drcr), g2.mapping).map((r) => [r.date, r.amt, r.desc, r.bal, r.acct]), [['2026-12-03', -42.5, 'WOOLWORTHS', 1000.1, '3456'], ['2026-12-15', 4820, 'SALARY', 5820.1, '3456']]);
  const flipped = applyMapping(readCsv(noHeader), { ...g1.mapping, flip: true }); assert.equal(flipped[0].amt, 42.5);
});

test('a saved profile is reused for the same layout only', () => {
  const csv = 'When,What,How much\n03/12/2026,WOOLWORTHS,-42.50\n'; const rows = readCsv(csv);
  const saved = [{ signature: signature(rows), name: 'My bank', mapping: { header: true, flip: false, map: { date: 0, amount: 2, debit: -1, credit: -1, desc: 1, balance: -1, account: -1, category: -1, merchant: -1, type: -1 } } }];
  const r = resolveMapping(rows, saved);
  assert.equal(r.source, 'saved'); assert.equal(applyMapping(rows, r.mapping)[0].amt, -42.5);
  assert.equal(resolveMapping(readCsv('When,What,How much,Extra\n03/12/2026,X,-1,y\n'), saved).source, 'guess');
});

test('starter merchant rules', () => {
  for (const [d, c] of [['WOOLWORTHS 1234 MELBOURNE', 'Groceries'], ['COLES EXPRESS 1234', 'Fuel'], ['UBER *EATS SYDNEY', 'Eating out'], ['UBER *TRIP', 'Transport'], ['NETFLIX.COM', 'Subscriptions'], ['Bunnings 123', 'Home & furniture'], ['VICROADS REGO', 'Rego'], ['AGL SALES PTY', 'Bills']]) assert.equal(seedCategory(d), c, d);
  assert.equal(seedCategory('SOMETHING UNKNOWN PTY LTD'), null);
});

import { newOnly } from '../www/js/importer.js';
const tx = (date, amt, desc, extra = {}) => ({ date, amt, desc, acct: '2222', bal: null, ...extra });

test('re-importing adds only what is new, and ignores formatting and balance differences', () => {
  const existing = [tx('2026-12-03', -42.5, 'WOOLWORTHS 1234 MELBOURNE', { cat: 'Gifts' }), tx('2026-12-04', -18, 'SOME CAFE')];
  const incoming = [tx('2026-12-03', -42.5, 'Woolworths  1234, Melbourne', { bal: 999 }), tx('2026-12-04', -18, 'SOME CAFE'), tx('2026-12-05', -61, 'KMART')];
  assert.deepEqual(newOnly(existing, incoming).map((t) => t.desc), ['KMART']);
});

test('two identical purchases on one day both import, but only once', () => {
  const two = [tx('2026-12-04', -5, 'CAFE'), tx('2026-12-04', -5, 'CAFE')];
  assert.equal(newOnly([], two).length, 2);
  assert.equal(newOnly([two[0]], two).length, 1);
  assert.equal(newOnly(two, two).length, 0);
});

test('a pending purchase that went through with a new date or longer description is the same transaction', () => {
  const pending = [tx('2026-11-30', -42.5, 'WOOLWORTHS 1234')];
  const posted = [tx('2026-11-29', -10, 'OTHER'), tx('2026-12-02', -42.5, 'WOOLWORTHS 1234 MELBOURNE AUS')];
  assert.equal(newOnly(pending, posted).length, 1); // only OTHER is new
  // different amount, different shop, or too far apart: new
  assert.equal(newOnly(pending, [tx('2026-11-29', -1, 'X'), tx('2026-12-02', -42.6, 'WOOLWORTHS 1234')]).length, 2);
  assert.equal(newOnly(pending, [tx('2026-11-29', -1, 'X'), tx('2026-12-02', -42.5, 'COLES 99')]).length, 2);
  assert.equal(newOnly(pending, [tx('2026-11-20', -1, 'X'), tx('2026-12-06', -42.5, 'WOOLWORTHS 1234')]).length, 2);
});

test("an older purchase outside the new file's dates never swallows a genuine new one", () => {
  const earlier = [tx('2026-12-04', -5, 'SOME CAFE')];
  assert.equal(newOnly(earlier, [tx('2026-12-09', -5, 'SOME CAFE')]).length, 1); // 5 days apart: a new purchase
  // posted after the new file's first date: still the same purchase
  assert.equal(newOnly([tx('2026-11-03', -42.5, 'WOOLWORTHS 1234')], [tx('2026-11-05', -42.5, 'WOOLWORTHS 1234 MELBOURNE AUS'), tx('2026-11-18', -30, 'WOOLWORTHS 5678')]).length, 1);
});

import { findDuplicates } from '../www/js/importer.js';
test('finds copies of the same transaction and keeps the one the user changed', () => {
  const a1 = tx('2026-11-06', -2290, 'ONLINE W3624318944 Linked Acc', { acct: '4049', cat: 'Transfer' });
  const a2 = tx('2026-11-06', -2290, 'ONLINE  W3624318944 LINKED ACC', { acct: '4049', cat: 'Shopping', userCat: true });
  const b1 = tx('2026-11-08', -200, 'ONLINE Y3863318977 Linked Acc', { acct: '4417' });
  const b2 = tx('2026-11-09', -200, 'ONLINE Y3863318977 Linked Acc', { acct: '4417' });
  const other = tx('2026-11-06', -2290, 'ONLINE W3624318944 Linked Acc', { acct: '9999' }); // different account
  const far = tx('2026-11-20', -200, 'ONLINE Y3863318977 Linked Acc', { acct: '4417' });  // too far apart
  const g = findDuplicates([a1, b1, a2, b2, other, far], (t) => (t.userCat ? 2 : 0));
  assert.equal(g.length, 2);
  assert.equal(g.find((x) => x.keep.acct === '4049').keep, a2);
  assert.deepEqual(g.find((x) => x.keep.acct === '4417').remove, [b2]);
  assert.deepEqual(findDuplicates([a1, other, far]), []);
});
