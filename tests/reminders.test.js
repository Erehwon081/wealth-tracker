import test from 'node:test';
import assert from 'node:assert/strict';
import { planReminders, checkinDate, isOurs } from '../www/js/reminders.js';

const d = (s) => new Date(s); // local time

test('last day of the month handles short months and leap years', () => {
  assert.equal(checkinDate('last', 2026, 1, '19:00').getDate(), 28); // Feb 2026
  assert.equal(checkinDate('last', 2028, 1, '19:00').getDate(), 29); // Feb 2028
  assert.equal(checkinDate('31', 2026, 3, '07:30').getDate(), 30); // day 31 in April clamps to 30
  const t = checkinDate('first', 2026, 11, '07:30'); assert.deepEqual([t.getMonth(), t.getDate(), t.getHours(), t.getMinutes()], [11, 1, 7, 30]);
});

test('plans the next 12 check-ins, all in the future, in order', () => {
  const now = d('2026-11-10T09:00:00');
  const p = planReminders({ checkin: 'last', time: '19:00' }, now);
  assert.equal(p.length, 12);
  assert.ok(p.every((x) => x.at > now && isOurs(x.id)));
  assert.deepEqual([p[0].at.getMonth(), p[0].at.getDate(), p[0].at.getHours()], [10, 30, 19]);
  assert.deepEqual([p[11].at.getFullYear(), p[11].at.getMonth()], [2027, 9]);
  assert.match(p[0].body, /November/);
  assert.equal(new Set(p.map((x) => x.id)).size, 12);
});

test('skips today if the time has passed, keeps it if not', () => {
  assert.equal(planReminders({ checkin: 'last', time: '19:00' }, d('2026-11-30T20:00:00'))[0].at.getMonth(), 11);
  assert.equal(planReminders({ checkin: 'last', time: '19:00' }, d('2026-11-30T18:00:00'))[0].at.getDate(), 30);
});

test('a check-in on the 1st is for the month just finished', () => {
  const p = planReminders({ checkin: 'first', time: '08:00' }, d('2026-11-10T09:00:00'));
  assert.equal(p[0].at.getMonth(), 11); assert.match(p[0].body, /November/);
});

test('backup reminder lands 30 days after the last backup, or tomorrow if overdue', () => {
  const now = d('2026-11-10T09:00:00');
  const soon = planReminders({ backup: 'on', time: '19:00' }, now, d('2026-11-01T12:00:00').toISOString());
  assert.equal(soon.length, 1); assert.deepEqual([soon[0].at.getMonth(), soon[0].at.getDate(), soon[0].at.getHours()], [11, 1, 19]);
  const overdue = planReminders({ backup: 'on', time: '19:00' }, now, d('2026-09-01T12:00:00').toISOString());
  assert.deepEqual([overdue[0].at.getDate(), overdue[0].at.getHours()], [10, 19]);
  const late = planReminders({ backup: 'on', time: '07:00' }, now, d('2026-09-01T12:00:00').toISOString());
  assert.equal(late[0].at.getDate(), 11);
});

test('nothing planned when both are off', () => {
  assert.deepEqual(planReminders({ checkin: 'off', backup: 'off' }, new Date()), []);
  assert.deepEqual(planReminders(undefined, new Date()), []);
});
