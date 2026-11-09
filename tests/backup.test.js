import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, encryptBackup, decryptBackup, isEncrypted, readBackup, backupFileName } from '../www/js/backup.js';
import { SAMPLE } from '../www/js/sample.js';

test('file name uses the local date', () => {
  assert.equal(backupFileName(new Date(2026, 10, 9, 23, 30)), 'wealth-tracker-backup-2026-11-09.json');
});

test('reads the existing export format', () => {
  const file = { format: 'wealth-tracker-backup', version: 1, ...JSON.parse(JSON.stringify(SAMPLE)) };
  const snap = readBackup(file);
  assert.equal(snap.accounts.length, SAMPLE.accounts.length);
  assert.equal(snap.holdings.length, SAMPLE.holdings.length);
  assert.equal(snap.tx['2026-10'].length, SAMPLE.tx['2026-10'].length);
  assert.deepEqual(snap.config, SAMPLE.config);
});

test('accepts id-keyed maps and {rows} tx', () => {
  const snap = readBackup({ format: 'wealth-tracker-backup', version: 1, accounts: { a1: { name: 'X', type: 'cash' } }, holdings: {}, months: { '2026-01': { income: 1 }, junk: {} }, tx: { '2026-01': { rows: [{ amt: 1 }] } } });
  assert.deepEqual(snap.accounts, [{ id: 'a1', name: 'X', type: 'cash' }]);
  assert.deepEqual(Object.keys(snap.months), ['2026-01']);
  assert.equal(snap.tx['2026-01'].length, 1);
});

test('rejects other files', () => {
  assert.throws(() => readBackup({ hello: 1 }), /isn't a Wealth Tracker backup/);
  assert.throws(() => readBackup({ format: 'wealth-tracker-backup', version: 2 }), /newer version/);
});

test('encrypt and decrypt round trip, wrong passphrase fails', async () => {
  const b = buildBackup(SAMPLE);
  const enc = await encryptBackup(b, 'correct horse');
  assert.ok(isEncrypted(enc));
  assert.ok(!JSON.stringify(enc).includes('Everyday account'));
  assert.deepEqual(await decryptBackup(enc, 'correct horse'), b);
  await assert.rejects(decryptBackup(enc, 'wrong'), (e) => e.code === 'bad_passphrase');
});
