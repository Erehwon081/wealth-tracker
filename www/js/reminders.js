// Plans reminder notifications for the Android app. Pure: no plugin calls, so it can be unit tested.
// Android can't repeat on "the last day of each month", so we plan individual dates and re-plan whenever the app opens.

export const DEFAULT_REMINDERS = { checkin: 'off', time: '19:00', backup: 'off' };
export const IDS = { checkin: 100, backup: 200 }; // check-ins use 101..112, the backup reminder 201
export const isOurs = (id) => id > 100 && id < 300;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY = 86400000;

function hhmm(time) { const m = String(time || '').match(/^(\d{1,2}):(\d{2})$/); const h = m ? Math.min(23, +m[1]) : 19, mi = m ? Math.min(59, +m[2]) : 0; return [h, mi]; }

// The check-in date in a given month for a setting: 'last', 'first', or a day number (clamped to the month's length).
export function checkinDate(when, year, month, time) {
  const [h, mi] = hhmm(time);
  const days = new Date(year, month + 1, 0).getDate();
  const d = when === 'last' ? days : when === 'first' ? 1 : Math.min(days, Math.max(1, parseInt(when, 10) || 1));
  return new Date(year, month, d, h, mi, 0, 0);
}

export function planReminders(settings, now = new Date(), lastBackup = null, count = 12) {
  const r = { ...DEFAULT_REMINDERS, ...(settings || {}) };
  const out = [];
  if (r.checkin && r.checkin !== 'off') {
    // Start from last month, so a date earlier today that is still ahead isn't skipped, then keep the next `count` future dates.
    for (let k = -1, n = 0; n < count && k < count + 2; k++) {
      const y = now.getFullYear(), m = now.getMonth() + k;
      const at = checkinDate(r.checkin, y, m, r.time);
      if (at <= now) continue;
      // On the 1st (or early in a month) the check-in is for the month just finished.
      const forMonth = r.checkin === 'first' || (r.checkin !== 'last' && at.getDate() <= 7) ? new Date(at.getFullYear(), at.getMonth() - 1, 1) : at;
      out.push({ id: IDS.checkin + 1 + n, at, view: 'checkin', title: 'Month-end check-in', body: `Time to check in for ${MONTHS[forMonth.getMonth()]}: import the month's CSVs and key in your balances.` });
      n++;
    }
  }
  if (r.backup && r.backup !== 'off') {
    const [h, mi] = hhmm(r.time);
    const base = Date.parse(lastBackup || '') || now.getTime();
    const due = new Date(base + 30 * DAY); due.setHours(h, mi, 0, 0);
    let at = due;
    if (at <= now) { at = new Date(now); at.setHours(h, mi, 0, 0); if (at <= now) at = new Date(at.getTime() + DAY); }
    out.push({ id: IDS.backup + 1, at, view: 'home', action: 'backup', title: 'Time for a backup', body: "It's been 30 days since your last backup. Back up to Drive or Files so your data is safe." });
  }
  return out.sort((a, b) => a.at - b.at);
}
