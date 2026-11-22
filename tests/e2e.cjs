// End-to-end check in Chromium. Run: python3 -m http.server 8765 --bind 127.0.0.1 -d www & node tests/e2e.cjs
// Needs Playwright with Chromium available (not run in CI).
const { chromium, devices } = require('playwright');
const fs = require('fs'); const os = require('os'); const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-e2e-'));
let failed = 0;
const n0z = (v) => Number(v) || 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) failed++; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['Pixel 7'], acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const offsite = []; p.on('request', (r) => { if (!r.url().startsWith(BASE)) offsite.push(r.url()); });
  const pick = async (selector, files) => { const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click(selector)]); await fc.setFiles(files); };
  const closeSheets = () => p.evaluate(() => document.querySelectorAll('.sheet-bg').forEach((b) => b.remove()));

  await p.goto(BASE); await p.waitForTimeout(600);
  ok(await p.isVisible('#h-first'), 'first run shows the empty state');
  await p.click('text=Load sample data'); await p.waitForTimeout(600);
  ok(await p.isHidden('#h-first') && (await p.textContent('#h-nw')).startsWith('$'), 'sample data loads');
  const hac = await p.textContent('#h-accts');
  ok(hac.includes('Everyday account') && hac.includes('•••• 1111') && !hac.includes('12341111') && hac.includes('as of 30 Nov 2026') && hac.includes('$1,209.85'), 'Home lists everyday accounts with the number hidden and the latest balance ' + hac.slice(0, 160));
  ok(!hac.includes('Super') && !hac.includes('Home loan') && !hac.includes('Shares'), 'Home accounts leave out super, investments, property and loans');
  await p.click('#h-accts button:text-is("Show numbers")');
  ok((await p.textContent('#h-accts')).includes('083-000 12341111'), 'Show numbers reveals the full account numbers');
  await p.click('#h-accts button:text-is("Hide numbers")');
  ok(await p.isHidden('#h-nudge'), 'no backup reminder right after first use');

  // Settings: partner name replaces Partner labels
  await p.click('#settingsBtn');
  await p.fill('#st-pname', 'Sam'); await p.fill('#st-ms', '40'); await p.fill('#st-every', '3000');
  await p.click('text=Save household'); await p.waitForTimeout(300); await closeSheets();
  await p.click('.tab[data-tab=spend]'); await p.waitForTimeout(400);
  ok((await p.textContent('#s-summary')).includes("Sam's card") && (await p.textContent('#s-filter')).includes("Sam's"), 'partner display name shows in Spending');
  await p.click('.tab[data-tab=budget]'); await p.waitForTimeout(300);
  ok((await p.textContent('#b-fixed')).includes('Mortgage, your 40%') && (await p.textContent('#b-top')).includes('$3,000'), 'mortgage share and everyday target come from Settings');

  // Backup, plain
  await p.click('#settingsBtn');
  let [dl] = await Promise.all([p.waitForEvent('download'), p.click('#st-backup')]);
  ok(/^wealth-tracker-backup-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()), 'backup file name ' + dl.suggestedFilename());
  const plainPath = path.join(tmp, 'plain.json'); await dl.saveAs(plainPath);
  const plain = JSON.parse(fs.readFileSync(plainPath, 'utf8'));
  ok(plain.format === 'wealth-tracker-backup' && plain.version === 1 && plain.config.partnerName === 'Sam' && Array.isArray(plain.tx['2026-10']), 'backup has the expected shape');
  // Backup, encrypted
  await p.fill('#st-pass', 'pass phrase 1'); await p.fill('#st-pass2', 'pass phrase 1');
  [dl] = await Promise.all([p.waitForEvent('download'), p.click('#st-backup')]);
  const encPath = path.join(tmp, 'enc.json'); await dl.saveAs(encPath);
  const enc = JSON.parse(fs.readFileSync(encPath, 'utf8'));
  ok(enc.encrypted && !fs.readFileSync(encPath, 'utf8').includes('Everyday'), 'encrypted backup hides the data');
  await closeSheets();

  // Restore the user's existing format (built from the sample, as an older export would be)
  const legacy = { format: 'wealth-tracker-backup', version: 1, config: { ...plain.config, partnerName: 'Legacy' }, accounts: plain.accounts.slice(0, 3), months: { '2026-10': plain.months['2026-10'] }, tx: { '2026-10': plain.tx['2026-10'] }, holdings: plain.holdings.slice(0, 2) };
  const legacyPath = path.join(tmp, 'legacy.json'); fs.writeFileSync(legacyPath, JSON.stringify(legacy));
  await p.click('#settingsBtn'); await pick('text=Restore from file', legacyPath); await p.waitForTimeout(300);
  ok((await p.textContent('.sheet-bg:last-child')).includes('3 accounts, 1 months'), 'restore preview counts');
  await p.click('text=Replace and restore'); await p.waitForTimeout(600);
  await p.click('.tab[data-tab=wealth]'); await p.waitForTimeout(300);
  ok((await p.$$('#w-list .row')).length === 3, 'restore replaced the accounts');

  // Older backups name partner categories after the person
  const named = JSON.parse(JSON.stringify(legacy)); named.config.partnerName = 'Shonny';
  named.tx['2026-10'] = named.tx['2026-10'].map((t) => ({ ...t, cat: t.cat === "Partner's card" ? "Shonny's card" : t.cat === 'Partner mortgage share' ? 'Shonny mortgage share' : t.cat }));
  const namedPath = path.join(tmp, 'named.json'); fs.writeFileSync(namedPath, JSON.stringify(named));
  await p.click('#settingsBtn'); await pick('text=Restore from file', namedPath); await p.waitForTimeout(300);
  await p.click('text=Replace and restore'); await p.waitForTimeout(600);
  await p.selectOption('#monthPick', '2026-10'); await p.click('.tab[data-tab=spend]'); await p.waitForTimeout(400);
  await p.locator('#s-filter button', { hasText: 'Shonny' }).click(); await p.waitForTimeout(300);
  const shown = await p.$$('#s-tx .tx');
  const expected = named.tx['2026-10'].filter((t) => /^Shonny/.test(t.cat)).length;
  ok(shown.length === expected && expected > 0, `named partner categories show under the partner filter (${shown.length} of ${expected})`);
  ok((await p.textContent('#s-tx')).includes("Shonny's card"), 'they display with the partner name');

  // Tagging a purchase on your card as the partner's
  await p.locator('#s-filter button', { hasText: 'Spending' }).click(); await p.waitForTimeout(300);
  const firstTx = p.locator('#s-tx .tx').first();
  const amt = Math.abs(parseFloat((await firstTx.locator('.num').textContent()).replace(/[^0-9.]/g, '')));
  const months0 = await p.evaluate(async () => { const r = indexedDB.open('wealth-tracker'); const db = await new Promise((res) => { r.onsuccess = () => res(r.result); }); return new Promise((res) => { const q = db.transaction('months').objectStore('months').getAll(); q.onsuccess = () => res(q.result); }); });
  await firstTx.locator('button', { hasText: "Mark Shonny's" }).click(); await p.waitForTimeout(400);
  ok(await p.locator('#s-tx .tx').first().locator('button', { hasText: /^Shonny's$/ }).count() === 1, 'tag button toggles on');
  const months1 = await p.evaluate(async () => { const r = indexedDB.open('wealth-tracker'); const db = await new Promise((res) => { r.onsuccess = () => res(r.result); }); return new Promise((res) => { const q = db.transaction('months').objectStore('months').getAll(); q.onsuccess = () => res(q.result); }); });
  const sumSpend = (d) => Object.values(d.spend || {}).reduce((a, v) => a + v, 0);
  const ch = months1.map((d, i) => [sumSpend(months0[i]) - sumSpend(d), d.shonnyCard - months0[i].shonnyCard]).find(([a]) => Math.abs(a) > 0.001) || [0, 0];
  ok(Math.abs(ch[0] - amt) < 0.01 && Math.abs(ch[1] - amt) < 0.01, `a purchase marked as the partner's leaves your spending and adds to their card (${ch} vs ${amt})`);
  ok((await p.textContent('#s-summary')).includes("marked Shonny's"), "Spending says how much of the partner's card total was marked");
  await p.locator('#s-filter button', { hasText: 'Shonny' }).click(); await p.waitForTimeout(300);
  ok(await p.locator('#s-tx .tx', { hasText: "Shonny's" }).count() === expected + 1, 'tagged purchase shows under the partner filter');
  await p.click('.tab[data-tab=wealth]'); await p.waitForTimeout(300);

  // Restore encrypted: wrong then right passphrase
  await p.click('#settingsBtn'); await pick('text=Restore from file', encPath); await p.waitForTimeout(200);
  await p.fill('#rp-pass', 'nope'); await p.click('text=Unlock'); await p.waitForTimeout(2500);
  ok((await p.textContent('.toast')).includes('Wrong passphrase'), 'wrong passphrase is refused');
  await closeSheets(); await p.click('#settingsBtn'); await pick('text=Restore from file', encPath); await p.waitForTimeout(200);
  await p.fill('#rp-pass', 'pass phrase 1'); await p.click('text=Unlock'); await p.waitForTimeout(2500);
  await p.click('text=Replace and restore'); await p.waitForTimeout(600);
  ok((await p.$$('#w-list .row')).length === plain.accounts.length, 'encrypted restore brings everything back');

  // Data survives a reload
  await p.reload(); await p.waitForTimeout(600);
  ok((await p.$$('#w-list .row')).length === plain.accounts.length, 'data persists in IndexedDB across reloads');

  // CSV import through the hidden input and its button
  const csv = 'Date,Amount,Account Number,Transaction Type,Transaction Details,Balance,Category,Merchant Name\n' +
    '05 Dec 26,-42.50,082-000 12342222,EFTPOS,WOOLWORTHS 1234 MELBOURNE,,Groceries,Woolworths\n' +
    '06 Dec 26,-61.00,082-000 99993333,EFTPOS,KMART MELBOURNE,,Other shopping,Kmart\n';
  const csvPath = path.join(tmp, 'nab.csv'); fs.writeFileSync(csvPath, csv);
  await p.click('.tab[data-tab=spend]'); await p.waitForTimeout(300);
  ok(await p.locator('#v-spend [data-pick=csvIn], #dropzone').count() === 0, 'Spending has no import card (it lives in Check-in)');
  await p.click('.tab[data-tab=checkin]'); await p.waitForTimeout(300);
  await pick('#v-checkin [data-pick=csvIn]', csvPath); await p.waitForTimeout(800);
  await p.click('.tab[data-tab=spend]'); await p.waitForTimeout(500);
  ok(await p.inputValue('#monthPick') === '2026-12' && (await p.textContent('#s-tx')).includes('Woolworths'), 'CSV import works from the button');
  ok((await p.textContent('#s-tx')).includes("Sam's card"), 'partner card from Settings classifies the import');

  // Account list PDF through vendored pdf.js
  const pdfPage = await ctx.newPage();
  await pdfPage.setContent('<p>Accounts 09/11/2026 10:15</p><p>Everyday account BSB: 083-000 Acc: 12341111 $1,234.56</p><p>Credit card Card ending 2222 -$2,000.00</p>');
  const pdfPath = path.join(tmp, 'accounts.pdf');
  const pb = await chromium.launch(); const pp = await pb.newPage(); await pp.setContent(await pdfPage.content()); await pp.pdf({ path: pdfPath }); await pb.close(); await pdfPage.close();
  await p.click('.tab[data-tab=checkin]'); await p.waitForTimeout(300);
  await pick('#v-checkin [data-pick=pdfIn]', pdfPath); await p.waitForTimeout(2500);
  ok(await p.isVisible('text=Balances from the account list'), 'account list PDF opens with the vendored pdf.js');
  await closeSheets();

  // Live prices: mock the published CSV with CORS headers
  const csvEtf = 'Ticker,Name,X,Price,C,Units,Value\nASX:VAS,V,ASX,$120.00,,40,"$4,800.00"\n\nhistory\nVAS,1,2,3';
  await ctx.route('https://docs.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/csv', headers: { 'Access-Control-Allow-Origin': '*' }, body: csvEtf }));
  await p.click('#settingsBtn');
  await p.fill('#st-ps-etf', 'https://docs.google.com/spreadsheets/d/e/2PACX-test/pub?gid=1&single=true&output=csv');
  await p.click('text=Save links'); await p.waitForTimeout(300); await closeSheets();
  await p.click('.tab[data-tab=invest]'); await p.waitForTimeout(1200);
  const live = await p.textContent('#i-live');
  ok(live.startsWith('Live from your Google Sheet'), 'prices fetched on opening Invest: ' + live);
  ok((await p.textContent('#i-list')).includes('$120.00'), 'VAS price updated from the sheet');
  await p.fill('#st-ps-etf', '').catch(() => {});

  // Offline: service worker serves the shell
  await p.goto(BASE); await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10000 }).catch(() => {});
  await p.reload(); await p.waitForTimeout(500);
  await ctx.setOffline(true);
  await p.reload(); await p.waitForTimeout(800); await p.click('.tab[data-tab=home]');
  const offTxt = await p.textContent('#h-nw'); ok(offTxt.startsWith('$') || offTxt.startsWith('−$'), 'app opens offline with data: ' + offTxt);
  await p.click('.tab[data-tab=checkin]'); await pick('#v-checkin [data-pick=pdfIn]', pdfPath); await p.waitForTimeout(2500);
  ok(await p.isVisible('text=Balances from the account list'), 'PDF import works offline');
  await ctx.setOffline(false);

  // Android app draws behind the system bars and reports their size as CSS variables
  await closeSheets(); await p.click('.tab[data-tab=home]'); await p.waitForTimeout(300);
  await p.evaluate(() => { const s = document.documentElement.style; s.setProperty('--safe-area-inset-top', '40px'); s.setProperty('--safe-area-inset-bottom', '24px'); window.scrollTo(0, 0); });
  await p.waitForTimeout(200);
  const ins = await p.evaluate(() => { const h = document.querySelector('.top').getBoundingClientRect(); const first = document.querySelector('#v-home > :not([hidden])').getBoundingClientRect(); window.scrollTo(0, document.documentElement.scrollHeight); const last = [...document.querySelectorAll('#v-home > :not([hidden])')].pop().getBoundingClientRect(); const nav = document.querySelector('.tabs').getBoundingClientRect(); return { top: h.top, hb: h.bottom, first: first.top, last: last.bottom, nav: nav.top, navPad: getComputedStyle(document.querySelector('.tabs')).paddingBottom }; });
  ok(ins.top >= 40 && ins.first >= ins.hb - 0.5, `header sits below the status bar and clear of the first card (${JSON.stringify(ins)})`);
  ok(ins.last <= ins.nav + 0.5 && ins.navPad === '24px', 'last card scrolls clear of the bottom bar, which clears the gesture bar');
  await p.evaluate(() => { const s = document.documentElement.style; s.removeProperty('--safe-area-inset-top'); s.removeProperty('--safe-area-inset-bottom'); });

  // Amounts never wrap or spill out of their card (tables scroll on purpose, so they're skipped)
  const wrapped = [];
  for (const t of ['home', 'checkin', 'spend', 'budget', 'invest', 'wealth']) {
    await p.click(`.tab[data-tab=${t}]`); await p.waitForTimeout(900);
    wrapped.push(...await p.evaluate((t) => [...document.querySelectorAll(`section[data-view="${t}"] .num, section[data-view="${t}"] .row > :last-child:not(:first-child), section[data-view="${t}"] .stat .v`)]
      .filter((n) => !n.closest('table') && !n.matches('button') && !n.querySelector('button') && n.getBoundingClientRect().width)
      .filter((n) => { const r = n.getBoundingClientRect(), cs = getComputedStyle(n); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.45; const box = (n.closest('.card, .stat, .hero') || document.body).getBoundingClientRect(); return r.height > lh * 1.6 || r.right > box.right + 0.5; })
      .map((n) => `${t}: ${n.textContent.trim().slice(0, 30)}`), t));
  }
  ok(wrapped.length === 0, 'no amount wraps or overflows its card on any tab ' + JSON.stringify(wrapped));

  // Swiping between tabs
  const swipe = (sel, x0, x1) => p.evaluate(([sel, x0, x1]) => {
    const t = document.querySelector(sel); const r = t.getBoundingClientRect(); const y = r.top + Math.min(40, r.height / 2);
    const mk = (x) => new Touch({ identifier: 1, target: t, clientX: x, clientY: y });
    t.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [mk(x0)], changedTouches: [mk(x0)] }));
    t.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [mk(x1)] }));
  }, [sel, x0, x1]);
  await closeSheets(); await p.click('.tab[data-tab=home]'); await p.waitForTimeout(300);
  await swipe('#h-stats', 300, 120); await p.waitForTimeout(300);
  ok(await p.evaluate(() => location.hash) === '#checkin', 'swipe left moves to the next tab');
  await swipe('#c-result', 100, 300); await p.waitForTimeout(300);
  ok(await p.evaluate(() => location.hash) === '#home', 'swipe right moves back');
  await swipe('#h-nwchart', 300, 120); await p.waitForTimeout(300);
  ok(await p.evaluate(() => location.hash) === '#home', 'a swipe that starts on a chart does not change tab');

  // The bottom bar stays put while a tab slides in
  await p.click('.tab[data-tab=home]'); await p.waitForTimeout(400);
  await p.evaluate(() => { window.navTops = []; const f = () => { window.navTops.push(Math.round(document.querySelector('.tabs').getBoundingClientRect().top)); if (window.navTops.length < 25) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await p.click('.tab[data-tab=checkin]'); await p.waitForTimeout(700);
  ok(new Set(await p.evaluate(() => window.navTops)).size === 1, 'bottom bar does not move during the tab transition');

  // Expected pay drives Budget
  await p.click('.tab[data-tab=budget]'); await p.waitForTimeout(300);
  await p.click('text=Set pay'); await p.fill('#pay-amt', '2000'); await p.selectOption('#pay-per', 'fortnight'); await p.click('.sheet .btn.primary'); await p.waitForTimeout(500);
  const bt = await p.textContent('#b-top');
  ok(bt.includes('Pay, expected') && bt.includes('$4,333'), 'expected fortnightly pay shows as the monthly budget pay');

  // Theme choice persists and colours the status bar
  await closeSheets(); await p.click('#settingsBtn'); await p.locator('.seg.theme button', { hasText: 'Dark' }).click(); await closeSheets();
  await p.reload(); await p.waitForTimeout(500);
  ok(await p.evaluate(() => document.documentElement.dataset.theme === 'dark' && document.querySelector('meta[name=theme-color]').content === '#0d0f14' && getComputedStyle(document.body).backgroundColor === 'rgb(13, 15, 20)'), 'dark theme choice survives a reload');
  await p.click('#settingsBtn'); await p.locator('.seg.theme button', { hasText: 'Light' }).click(); await closeSheets();
  ok(await p.evaluate(() => getComputedStyle(document.body).backgroundColor === 'rgb(245, 245, 250)'), 'light theme applies straight away');

  // Backup reminder after 30 days
  await p.evaluate(async () => { const r = indexedDB.open('wealth-tracker'); const db = await new Promise((res) => { r.onsuccess = () => res(r.result); }); const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(new Date(Date.now() - 31 * 864e5).toISOString(), 'lastBackup'); await new Promise((res) => { tx.oncomplete = res; }); });
  await p.goto(BASE + '#home'); await p.reload(); await p.waitForTimeout(600);
  ok(await p.isVisible('#h-nudge'), 'reminder shows when the last backup is over 30 days old');

  ok(offsite.every((u) => u.startsWith('https://docs.google.com/')), 'no requests leave the app except the price link: ' + JSON.stringify([...new Set(offsite)]));
  ok(errors.length === 0, 'no page errors ' + JSON.stringify(errors));

  // Cash flow chart: a loss's label never overlaps the month names
  await p.click('.tab[data-tab=home]'); await p.waitForTimeout(800);
  const overlaps = await p.evaluate(() => {
    const texts = [...document.querySelectorAll('#h-cfchart text')].map((t) => t.getBoundingClientRect());
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    let n = 0; for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) if (hit(texts[i], texts[j])) n++;
    return { n, count: texts.length };
  });
  ok(overlaps.count > 0 && overlaps.n === 0, `cash flow labels don't overlap (${JSON.stringify(overlaps)})`);

  // Dragging on a chart must not select text or open the long-press menu
  const sel = await p.evaluate(() => {
    const svg = document.querySelector('#h-nwchart svg'); const cs = getComputedStyle(svg);
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); svg.dispatchEvent(ev);
    const tab = getComputedStyle(document.querySelector('.tab'));
    return { chart: cs.userSelect || cs.webkitUserSelect, tab: tab.userSelect || tab.webkitUserSelect, menuBlocked: ev.defaultPrevented };
  });
  ok(sel.chart === 'none' && sel.tab === 'none' && sel.menuBlocked, `charts and tabs can't be text-selected and the chart blocks the long-press menu (${JSON.stringify(sel)})`);

  // Mortgage what-if, house ledger and tax year, on fresh sample data
  const fctx = await browser.newContext({ ...devices['Pixel 7'], acceptDownloads: true });
  const fp = await fctx.newPage(); const ferrors = []; fp.on('pageerror', (e) => ferrors.push(e.message));
  const fpick = async (selector, files) => { const [fc] = await Promise.all([fp.waitForEvent('filechooser'), fp.click(selector)]); await fc.setFiles(files); };
  const fclose = () => fp.evaluate(() => document.querySelectorAll('.sheet-bg').forEach((b) => b.remove()));
  await fp.goto(BASE); await fp.waitForTimeout(600); await fp.click('text=Load sample data'); await fp.waitForTimeout(800);
  await fp.click('.tab[data-tab=wealth]'); await fp.waitForTimeout(600);
  await fp.locator('#w-property .catrow.tap', { hasText: 'Home loan' }).click(); await fp.waitForTimeout(500);
  const before = await fp.textContent('.sheet');
  ok(before.includes('What if: Home loan') && before.includes('in the offset') && before.includes('Enter an amount above'), 'what-if opens for a loan and counts the linked offset');
  ok(/since the rate moved off 5\.39%/.test(before), 'what-if shows what the rate change has cost');
  await fp.fill('#wi-extra', '500'); await fp.waitForTimeout(300);
  const after = await fp.textContent('.sheet');
  ok(/You save\$[\d,]+ and \d+y \d+m/.test(after) && await fp.locator('.sheet .chart svg path').count() === 2, 'an extra repayment shows the interest and time saved, with both lines charted');
  await fclose();
  const led = await fp.textContent('#w-ledger');
  ok(await fp.isVisible('#w-ledger') && led.includes('Mortgage repayments') && led.includes('$16,800') && led.includes('$525') && /About \$[\d,]+ interest and \$[\d,]+ off the loan/.test(led), 'house ledger totals the financial year and splits interest from principal');
  await fp.click('#w-ledger >> text=Edit'); await fp.fill('#lg-ins', 'PET INSURANCE'); await fp.click('text=Add an earlier amount'); await fp.fill('.sheet [aria-label="Amount"]', '30000');
  await fp.click('.sheet .btn.primary'); await fp.waitForTimeout(700);
  await fp.selectOption('#w-ledger select', '2027'); await fp.waitForTimeout(300);
  ok((await fp.textContent('#w-ledger')).includes('$221'), 'ledger finds insurance by payee in the transactions');
  await fp.selectOption('#w-ledger select', 'all'); await fp.waitForTimeout(300);
  ok((await fp.textContent('#w-ledger')).includes('$51,000'), 'earlier amounts are added to the all-years total');

  await fp.click('.tab[data-tab=invest]'); await fp.waitForTimeout(600);
  const tax0 = await fp.textContent('#i-tax');
  ok(tax0.includes('2026–27') && tax0.includes('$166.20') && tax0.includes('$67.70') && tax0.includes('No sales recorded'), 'tax year shows cash dividends and franking credits');
  await fp.locator('.hold', { hasText: 'CBA' }).click(); await fp.waitForTimeout(400);
  await fp.fill('#ns-units', '10'); await fp.fill('#ns-price', '170'); await fp.fill('#ns-fee', '10'); await fp.click('text=Add sale'); await fp.waitForTimeout(300);
  await fp.fill('#nd-amt', '70'); await fp.fill('#nd-units', '0.5'); await fp.click('text=Add dividend'); await fp.waitForTimeout(300);
  await fp.click('.sheet .btn.primary'); await fp.waitForTimeout(700);
  const tax1 = await fp.textContent('#i-tax');
  ok(tax1.includes('held over 12 months') && tax1.includes('$700.01') && tax1.includes('$350.01') && tax1.includes('$236.20'), 'a sale is matched to the oldest parcel, discounted, and a new dividend is counted');
  ok((await fp.locator('.hold', { hasText: 'CBA' }).textContent()).includes('40.5 @'), 'units held drop by the sale and rise by the reinvested dividend');
  const [tdl] = await Promise.all([fp.waitForEvent('download'), fp.click('#i-tax >> text=Export CSV')]);
  const taxPath = path.join(tmp, 'tax.csv'); await tdl.saveAs(taxPath);
  ok(tdl.suggestedFilename() === 'wealth-tracker-tax-2026-27.csv' && fs.readFileSync(taxPath, 'utf8').includes('Net capital gain,350.01'), 'tax summary exports as CSV');
  const divCsv = path.join(tmp, 'divs.csv'); fs.writeFileSync(divCsv, 'Payment Date,Ticker,Net Amount,Franking %\n15/10/2026,ASX:VGS,55.00,0%\n15/10/2026,ASX:ZZZ,9.00,0%\n');
  await fpick('#i-tax [data-pick=divIn]', divCsv); await fp.waitForTimeout(700);
  ok((await fp.textContent('.toast')).includes('1 dividend added. Not in your holdings: ZZZ') && (await fp.textContent('#i-tax')).includes('$291.20'), 'dividends import from a CSV');
  await fp.reload(); await fp.waitForTimeout(800);
  ok((await fp.textContent('#i-tax')).includes('$350.01'), 'sales and dividends are saved');
  await fp.click('.tab[data-tab=wealth]'); await fp.waitForTimeout(500);
  await fp.locator('#w-list .row', { hasText: 'Home loan' }).click(); await fp.waitForTimeout(400);
  ok(await fp.isVisible('#f-loanbox') && await fp.locator('#f-loanbox input[type=date]').count() === 2 && await fp.inputValue('#f-offset') === 'offset', 'loan details show the rate history and linked offset');
  ok(ferrors.length === 0, 'no page errors in the new screens ' + JSON.stringify(ferrors));
  await fctx.close();

  // First-time setup for one person, then importing files from other banks
  const ictx = await browser.newContext({ ...devices['Pixel 7'] });
  const ip = await ictx.newPage(); const ierrors = []; ip.on('pageerror', (e) => ierrors.push(e.message));
  const ipick = async (selector, files) => { const [fc] = await Promise.all([ip.waitForEvent('filechooser'), ip.click(selector)]); await fc.setFiles(files); };
  await ip.goto(BASE); await ip.waitForTimeout(600);
  await ip.click('#h-first button:text-is("Set up")'); await ip.waitForTimeout(300);
  ok((await ip.textContent('.sheet')).includes('Who is this for?'), 'setup walkthrough opens from the welcome card');
  await ip.click('.sheet .btn.primary'); await ip.waitForTimeout(800);
  ok(await ip.evaluate(() => location.hash) === '#checkin' && (await ip.textContent('#c-bal')).includes('Everyday account') && !(await ip.textContent('#c-flow')).includes('Partner'), 'setup creates the chosen accounts for one person, with no partner fields');
  await ip.click('.tab[data-tab=spend]'); await ip.waitForTimeout(300);
  ok(!(await ip.textContent('#s-filter')).includes('Partner'), 'a one-person household has no partner filter');

  // OFX: account number and closing balance come from the file
  const ofx = path.join(tmp, 'everyday.ofx');
  fs.writeFileSync(ofx, 'OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><ACCTID>123456789</BANKACCTFROM><BANKTRANLIST>\n<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261103<TRNAMT>-42.50<NAME>WOOLWORTHS 1234\n<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261115<TRNAMT>4820.00<NAME>SALARY ACME\n</BANKTRANLIST><LEDGERBAL><BALAMT>5321.09<DTASOF>20261130</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>');
  await ip.click('.tab[data-tab=checkin]'); await ip.waitForTimeout(300);
  await ipick('#v-checkin [data-pick=csvIn]', ofx); await ip.waitForTimeout(500);
  ok((await ip.textContent('.sheet')).includes('Account ending 6789'), 'a new account number in the file asks to be linked');
  await ip.selectOption('.sheet select', { label: 'Everyday account' }); await ip.click('.sheet .btn.primary'); await ip.waitForTimeout(900);
  await ip.selectOption('#monthPick', '2026-11'); await ip.waitForTimeout(400);
  ok(await ip.inputValue('#c-bal input[aria-label="Everyday account"]') === '5321.09' && await ip.inputValue('#f-income') === '4820', 'OFX fills the closing balance and the pay');
  await ip.click('.tab[data-tab=home]'); await ip.waitForTimeout(400);
  const ihac = await ip.textContent('#h-accts');
  ok(ihac.includes('•••• 6789') && ihac.includes('as of 15 Nov 2026') && ihac.includes('$5,321.09'), 'the full account number and the balance date come from the bank file ' + ihac.slice(0, 160));
  await ip.click('.tab[data-tab=spend]'); await ip.waitForTimeout(500);
  ok((await ip.textContent('#s-tx')).includes('WOOLWORTHS') && (await ip.locator('#s-tx select').first().inputValue()) === 'Groceries', 'built-in merchant rules file Woolworths under Groceries');

  // An unknown CSV: confirm the columns once, and it's remembered
  const odd = 'When,What,How much,Left\n04/11/2026,NETFLIX.COM,-22.99,5298.10\n05/11/2026,BUNNINGS 123,-61.00,5237.10\n';
  const oddPath = path.join(tmp, 'other-bank.csv'); fs.writeFileSync(oddPath, odd);
  await ip.click('.tab[data-tab=checkin]'); await ip.waitForTimeout(300);
  await ipick('#v-checkin [data-pick=csvIn]', oddPath); await ip.waitForTimeout(500);
  const chk = await ip.textContent('.sheet');
  ok(chk.includes('Check the columns') && chk.includes('NETFLIX.COM') && chk.includes('−$22.99'), 'an unknown layout shows its columns and a preview of how it will read');
  await ip.selectOption('#map-balance', '3'); await ip.fill('#map-name', 'Other bank'); await ip.click('.sheet .btn.primary'); await ip.waitForTimeout(500);
  ok((await ip.textContent('.sheet')).includes("doesn't say which account"), 'a file with no account number asks which account it is');
  await ip.selectOption('#ia-acct', { label: 'Everyday account' }); await ip.click('.sheet .btn.primary'); await ip.waitForTimeout(900);
  await ip.click('.tab[data-tab=spend]'); await ip.waitForTimeout(500);
  const sp = await ip.textContent('#s-tx');
  ok(sp.includes('NETFLIX.COM') && sp.includes('BUNNINGS'), 'the confirmed layout imports');
  fs.writeFileSync(oddPath, 'When,What,How much,Left\n06/11/2026,SPOTIFY,-13.99,5223.11\n');
  await ip.click('.tab[data-tab=checkin]'); await ip.waitForTimeout(300);
  await ipick('#v-checkin [data-pick=csvIn]', oddPath); await ip.waitForTimeout(500);
  ok(!(await ip.locator('.sheet', { hasText: 'Check the columns' }).count()), 'the same layout is remembered and not asked again');
  if (await ip.locator('.sheet').count()) { await ip.selectOption('#ia-acct', { label: 'Everyday account' }); await ip.click('.sheet .btn.primary'); await ip.waitForTimeout(800); }

  // Re-importing keeps corrections: change a category, then import a later download of the same account
  await ip.click('.tab[data-tab=spend]'); await ip.selectOption('#monthPick', '2026-11'); await ip.waitForTimeout(500);
  await ip.locator('#s-tx .tx', { hasText: 'WOOLWORTHS' }).locator('select').selectOption('Gifts'); await ip.waitForTimeout(500);
  ok((await ip.textContent('.toast')).includes('New "WOOLWORTHS" transactions will be filed as Gifts too'), 'a category change is remembered for that shop straight away');
  const tb = await ip.evaluate(() => { const t = document.querySelector('.toast'), b = t.querySelector('.btn'); return { same: getComputedStyle(b).color === getComputedStyle(t).color, clear: getComputedStyle(b).backgroundColor === 'rgba(0, 0, 0, 0)' }; });
  ok(tb.same && tb.clear, 'the toast button uses the toast text colour, so it reads in light and dark');
  // the later download: Woolworths now posted two days later with a longer description and a balance; one new purchase each
  const ofx2 = path.join(tmp, 'everyday2.ofx');
  fs.writeFileSync(ofx2, 'OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><ACCTID>123456789</BANKACCTFROM><BANKTRANLIST>\n<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261105<TRNAMT>-42.50<NAME>WOOLWORTHS 1234 MELBOURNE AUS\n<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261115<TRNAMT>4820.00<NAME>SALARY ACME\n<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261118<TRNAMT>-30.00<NAME>WOOLWORTHS 5678 SYDNEY\n</BANKTRANLIST><LEDGERBAL><BALAMT>5291.09<DTASOF>20261130</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>');
  await ip.click('.tab[data-tab=checkin]'); await ip.waitForTimeout(300);
  await ipick('#v-checkin [data-pick=csvIn]', ofx2); await ip.waitForTimeout(900);
  ok((await ip.textContent('.toast')).includes('Imported 1 new transaction'), 'only the genuinely new transaction is imported');
  await ip.click('.tab[data-tab=spend]'); await ip.selectOption('#monthPick', '2026-11'); await ip.waitForTimeout(500);
  const wool = await ip.locator('#s-tx .tx', { hasText: 'WOOLWORTHS' }).evaluateAll((els) => els.map((e) => e.querySelector('select').value));
  ok(JSON.stringify(wool) === '["Gifts","Gifts"]', `the earlier correction is kept and the new Woolworths purchase follows it (${wool})`);
  await ip.click('#s-filter button:text-is("All")'); await ip.waitForTimeout(300);
  await ip.locator('#s-tx .tx', { hasText: 'SALARY' }).locator('select').selectOption('Money in'); await ip.waitForTimeout(400);
  await ip.click('.toast >> text=Only this one'); await ip.waitForTimeout(400);
  const rulesNow = await ip.evaluate(async () => { const r = indexedDB.open('wealth-tracker'); const db = await new Promise((res) => { r.onsuccess = () => res(r.result); }); return new Promise((res) => { const q = db.transaction('config').objectStore('config').get('app'); q.onsuccess = () => res(q.result.rules.map((x) => x.match)); }); });
  ok(JSON.stringify(rulesNow) === '["WOOLWORTHS"]', `"Only this one" doesn't keep a rule (${rulesNow})`);

  // Duplicates left by older imports: the same transfer saved twice (different balances), one copy recategorised
  await ip.evaluate(async () => {
    const r = indexedDB.open('wealth-tracker'); const db = await new Promise((res) => { r.onsuccess = () => res(r.result); });
    const rows = await new Promise((res) => { const q = db.transaction('tx').objectStore('tx').get('2026-11'); q.onsuccess = () => res(q.result); });
    const base = { date: '2026-11-06', amt: -2290, desc: 'ONLINE W3624318944 Linked Acc Trns', merchant: '', acct: '6789', type: '', nabCat: '' };
    rows.push({ ...base, bal: 100, cat: 'Transfer' }, { ...base, bal: 200, cat: 'Rent', userCat: true }, { ...base, date: '2026-11-08', amt: -200, desc: 'ONLINE Y3863318977 Linked Acc', bal: 1, cat: 'Transfer' }, { ...base, date: '2026-11-09', amt: -200, desc: 'ONLINE Y3863318977 Linked Acc', bal: 2, cat: 'Transfer' });
    const t = db.transaction('tx', 'readwrite'); t.objectStore('tx').put(rows, '2026-11'); await new Promise((res) => { t.oncomplete = res; });
  });
  await ip.reload(); await ip.waitForTimeout(800);
  await ip.click('.tab[data-tab=spend]'); await ip.selectOption('#monthPick', '2026-11'); await ip.waitForTimeout(500);
  const countBefore = await ip.evaluate(() => document.querySelector('#s-count').textContent);
  await ip.click('#s-dupes'); await ip.waitForTimeout(500);
  const dupText = await ip.textContent('.sheet');
  ok(dupText.includes('2 transactions appear more than once') && dupText.includes('keeps Rent') && dupText.includes('8 Nov, 9 Nov'), 'duplicates are found, keeping the recategorised copy');
  await ip.click('.sheet .btn.primary'); await ip.waitForTimeout(700);
  await ip.click('#s-filter button:text-is("All")'); await ip.waitForTimeout(300);
  const leftover = await ip.evaluate(() => [...document.querySelectorAll('#s-tx .tx')].filter((e) => /W3624318944|Y3863318977/.test(e.textContent)).map((e) => e.querySelector('select').value));
  ok(JSON.stringify(leftover.sort()) === '["Rent","Transfer"]', `one copy of each is left, with the user's category (${leftover}; count was ${countBefore})`);
  await ip.click('#s-dupes'); await ip.waitForTimeout(400);
  ok((await ip.textContent('.toast')).includes('No duplicates found'), 'running it again finds nothing');

  // Replace with a fresh import: duplicates go, recategorised and tagged transactions keep their settings
  await ip.evaluate(async () => {
    const r = indexedDB.open('wealth-tracker'); const db = await new Promise((res) => { r.onsuccess = () => res(r.result); });
    const rows = await new Promise((res) => { const q = db.transaction('tx').objectStore('tx').get('2026-11'); q.onsuccess = () => res(q.result); });
    const base = { merchant: '', acct: '6789', type: '', nabCat: '' };
    rows.push({ ...base, date: '2026-11-20', amt: -64.1, desc: 'ONLINE Z1112223334 Linked Acc', bal: 10, cat: 'Transfer' }, { ...base, date: '2026-11-20', amt: -64.1, desc: 'ONLINE Z1112223334 Linked Acc', bal: 11, cat: 'Gifts', userCat: true, partner: true });
    const t = db.transaction('tx', 'readwrite'); t.objectStore('tx').put(rows, '2026-11'); await new Promise((res) => { t.oncomplete = res; });
  });
  await ip.reload(); await ip.waitForTimeout(800);
  const fresh = path.join(tmp, 'fresh.ofx');
  fs.writeFileSync(fresh, 'OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><ACCTID>123456789</BANKACCTFROM><BANKTRANLIST>\n'
    + '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261103<TRNAMT>-42.50<NAME>WOOLWORTHS 1234\n<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261115<TRNAMT>4820.00<NAME>SALARY ACME\n'
    + '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261118<TRNAMT>-30.00<NAME>WOOLWORTHS 5678 SYDNEY\n<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261120<TRNAMT>-64.10<NAME>ONLINE Z1112223334 LINKED ACC\n'
    + '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261121<TRNAMT>-12.00<NAME>BRAND NEW SHOP\n</BANKTRANLIST><LEDGERBAL><BALAMT>5000.00<DTASOF>20261130</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>');
  await ip.click('.tab[data-tab=checkin]'); await ip.waitForTimeout(300);
  await ipick('#v-checkin [data-pick=replaceIn]', fresh); await ip.waitForTimeout(700);
  const rep = await ip.textContent('.sheet');
  ok(rep.includes('Replace with a fresh import?') && rep.includes('Everyday account: 3 Nov 2026 to 21 Nov 2026') && rep.includes('with the 5 in your file'), 'a fresh import shows what it will replace before doing anything ' + rep.slice(0, 160));
  await ip.click('.sheet .btn.primary'); await ip.waitForTimeout(900);
  await ip.click('.tab[data-tab=spend]'); await ip.selectOption('#monthPick', '2026-11'); await ip.waitForTimeout(400);
  await ip.click('#s-filter button:text-is("All")'); await ip.waitForTimeout(300);
  const after6789 = await ip.evaluate(() => [...document.querySelectorAll('#s-tx .tx')].filter((e) => e.textContent.includes('…6789')).map((e) => e.querySelector('.desc').textContent.slice(0, 14) + '=' + e.querySelector('select').value + (e.textContent.includes("Mark Sam's") || !e.textContent.includes("'s") ? '' : '+tag')));
  ok(after6789.length === 5, `the account now matches the file exactly, with no duplicates (${after6789.length}: ${after6789.join(', ')})`);
  ok(after6789.some((x) => x.startsWith('ONLINE Z111222') && x.includes('=Gifts')) && after6789.filter((x) => x.startsWith('WOOLWORTHS')).every((x) => x.includes('=Gifts')), 'recategorised transactions keep their category through the replace');

  // Category rules: the user's own rule wins over the built-in one
  await ip.click('#settingsBtn'); await ip.click('text=Edit category rules'); await ip.click('text=Add a rule');
  await ip.fill('.sheet:last-child [aria-label="Words to look for"]', 'SPOTIFY'); await ip.selectOption('.sheet:last-child [aria-label="Category"]', 'Entertainment');
  await ip.click('.sheet-bg:last-child .btn.primary'); await ip.waitForTimeout(400);
  const savedRules = await ip.evaluate(async () => { const r = indexedDB.open('wealth-tracker'); const db = await new Promise((res) => { r.onsuccess = () => res(r.result); }); return new Promise((res) => { const q = db.transaction('config').objectStore('config').get('app'); q.onsuccess = () => res(q.result.rules); }); });
  ok(JSON.stringify(savedRules) === JSON.stringify([{ match: 'SPOTIFY', cat: 'Entertainment' }]), 'a category rule saves from Settings ' + JSON.stringify(savedRules));
  // QIF: one account per file. Asked once; then known by its card numbers, or by transactions already saved.
  const qifPath = path.join(tmp, 'Transactions_10.qif');
  await ip.evaluate(() => document.querySelectorAll('.sheet-bg').forEach((b) => b.remove()));
  fs.writeFileSync(qifPath, '!Type:CCard\nD12/11/26\nT-25.60\nPEXAMPLE SHOP     SYDNEY\nMCard ending 4321\n^\nD12/11/26\nT-8.00\nPCORNER CAFE\nMCard ending 8765\n^\nD12/11/26\nT150.00\nPINTERNET PAYMENT\n^\n');
  await ip.click('.tab[data-tab=checkin]'); await ip.waitForTimeout(300);
  await ipick('#v-checkin [data-pick=csvIn]', qifPath); await ip.waitForTimeout(500);
  const qs = await ip.textContent('.sheet');
  ok(qs.includes("doesn't say which account") && !qs.includes('Account ending'), 'a new QIF asks once which account it is, not about each card');
  await ip.selectOption('#ia-acct', { label: 'Everyday account' }); await ip.click('.sheet .btn.primary'); await ip.waitForTimeout(900);
  fs.writeFileSync(qifPath, '!Type:CCard\nD13/11/26\nT-4.50\nPBAKERY\nMCard ending 8765\n^\nD13/11/26\nT20.00\nPINTERNET TRANSFER\n^\n');
  await ipick('#v-checkin [data-pick=csvIn]', qifPath); await ip.waitForTimeout(900);
  const qt = await ip.textContent('.toast');
  ok(!(await ip.locator('.sheet').count()) && qt.includes('Imported 2 new transactions') && qt.includes('choose CSV if your bank offers it'), 'the next QIF with one of those cards imports without asking, and suggests CSV for next time');
  fs.writeFileSync(qifPath, '!Type:Bank\nD12/11/26\nT-25.60\nPEXAMPLE SHOP     SYDNEY\n^\nD12/11/26\nT-8.00\nPCORNER CAFE\n^\nD12/11/26\nT150.00\nPINTERNET PAYMENT\n^\nD14/11/26\nT-6.00\nPMUFFINS\n^\n');
  await ipick('#v-checkin [data-pick=csvIn]', qifPath); await ip.waitForTimeout(900);
  ok(!(await ip.locator('.sheet').count()) && (await ip.textContent('.toast')).includes('Imported 1 new transaction'), 'a QIF with no card numbers is recognised from transactions already saved');
  await ip.click('.tab[data-tab=spend]'); await ip.waitForTimeout(500);
  const qtx = await ip.textContent('#s-tx');
  ok(qtx.includes('CORNER CAFE') && qtx.includes('MUFFINS') && !qtx.includes('Card ending'), 'the card memo is left out of the description');
  // A QIF filed under the wrong account: the message names the account, and Wrong account? moves it and its card number
  const idb = (st) => ip.evaluate(async (st) => { const r = indexedDB.open('wealth-tracker'); const db = await new Promise((res) => { r.onsuccess = () => res(r.result); }); return new Promise((res) => { const q = db.transaction(st).objectStore(st).getAll(); q.onsuccess = () => res(q.result); }); }, st);
  await ip.click('.tab[data-tab=checkin]'); await ip.waitForTimeout(300);
  fs.writeFileSync(qifPath, '!Type:Bank\nD12/11/26\nT-25.60\nPEXAMPLE SHOP     SYDNEY\nMCard ending 5555\n^\nD16/11/26\nT-11.00\nPLYMOON COFFEE\nMCard ending 5555\n^\n');
  await ipick('#v-checkin [data-pick=csvIn]', qifPath); await ip.waitForTimeout(500);
  await ip.selectOption('#ia-acct', { label: 'Savings account' }); await ip.click('.sheet .btn.primary'); await ip.waitForTimeout(900);
  fs.writeFileSync(qifPath, '!Type:Bank\nD17/11/26\nT-3.00\nPCORNER CAFE\nMCard ending 5555\n^\n');
  await ipick('#v-checkin [data-pick=csvIn]', qifPath); await ip.waitForTimeout(900);
  ok(!(await ip.locator('.sheet').count()) && (await ip.textContent('.toast')).includes('QIF filed under Savings account'), 'after one wrong answer the next QIF is filed silently, but the message names the account');
  await ip.click('.toast button:text-is("Wrong account?")'); await ip.waitForTimeout(300);
  ok((await ip.textContent('.sheet')).includes('filed under Savings account by its card number'), 'Wrong account? says how the account was chosen');
  await ip.selectOption('.sheet select', { label: 'Everyday account' }); await ip.click('.sheet .btn.primary'); await ip.waitForTimeout(900);
  let accts = await idb('accounts'); const ev = accts.find((a) => a.name === 'Everyday account'), sv = accts.find((a) => a.name === 'Savings account');
  const evKey = ev.match.split(',')[0], svKey = sv.match.split(',')[0];
  ok(ev.match.split(',').includes('5555') && !sv.match.split(',').includes('5555'), `the card number moves to the right account (${ev.match} / ${sv.match})`);
  let novRows = (await idb('tx')).flat();
  ok(novRows.find((t) => t.desc.startsWith('CORNER CAFE') && t.date === '2026-11-17').acct === evKey, 'the misfiled transactions move to the right account');
  // a file with a new card asks again; the earlier misfiled import isn't touched
  fs.writeFileSync(qifPath, '!Type:Bank\nD18/11/26\nT-2.00\nPNEWSAGENT\nMCard ending 7777\n^\n');
  await ipick('#v-checkin [data-pick=csvIn]', qifPath); await ip.waitForTimeout(500);
  if (await ip.locator('.sheet #ia-acct').count()) { await ip.selectOption('#ia-acct', { label: 'Everyday account' }); await ip.click('.sheet .btn.primary'); await ip.waitForTimeout(900); }
  novRows = (await idb('tx')).flat();
  const lymoon = novRows.filter((t) => t.desc.startsWith('LYMOON'));
  const shops = novRows.filter((t) => t.desc.startsWith('EXAMPLE SHOP'));
  ok(lymoon.length === 1 && lymoon[0].acct === svKey && shops.length === 2, 'an earlier import stays where it was until it is moved');
  fs.writeFileSync(qifPath, '!Type:Bank\nD19/11/26\nT-1.50\nPCORNER CAFE\nMCard ending 5555\n^\n');
  await ipick('#v-checkin [data-pick=csvIn]', qifPath); await ip.waitForTimeout(900);
  ok(!(await ip.locator('.sheet').count()) && (await ip.textContent('.toast')).includes('QIF filed under Everyday account'), 'the next file with that card goes to the right account');
  await ip.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  await ip.click('.tab[data-tab=spend]'); await ip.selectOption('#monthPick', '2026-11'); await ip.waitForTimeout(600);
  ok((await ip.textContent('#s-revlist')).includes('Everyday account'), 'the review list shows the account name');
  ok(ierrors.length === 0, 'no page errors in setup and import ' + JSON.stringify(ierrors));
  await ictx.close();

  // Reminders, as in the Android app: a stand-in for Capacitor's notification plugin records what gets scheduled
  const nctx = await browser.newContext({ ...devices['Pixel 7'] });
  await nctx.addInitScript(() => {
    const calls = (window.__ln = { scheduled: [], cancelled: [], requested: 0, pending: [] });
    const ok = (v) => Promise.resolve(v);
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
      App: { addListener: () => ok({ remove() {} }), exitApp: () => ok() },
      SystemBars: { setStyle: () => ok() },
      LocalNotifications: {
        addListener: () => ok({ remove() {} }),
        getPending: () => ok({ notifications: calls.pending }),
        cancel: (o) => { calls.cancelled.push(...o.notifications.map((x) => x.id)); return ok(); },
        checkPermissions: () => ok({ display: localStorage.getItem('__granted') ? 'granted' : 'prompt' }),
        requestPermissions: () => { calls.requested++; localStorage.setItem('__granted', '1'); return ok({ display: 'granted' }); },
        createChannel: () => ok(),
        schedule: (o) => { calls.scheduled = o.notifications.map((x) => ({ ...x, at: new Date(x.schedule.at).toISOString() })); calls.pending = o.notifications.map((x) => ({ id: x.id })); return ok({ notifications: [] }); },
      },
    } };
  });
  const np = await nctx.newPage(); const nerrors = []; np.on('pageerror', (e) => nerrors.push(e.message));
  await np.goto(BASE); await np.waitForTimeout(600); await np.click('text=Load sample data'); await np.waitForTimeout(800);
  await np.click('#settingsBtn'); await np.waitForTimeout(300);
  await np.selectOption('#rm-checkin', 'last'); await np.fill('#rm-time', '19:30'); await np.selectOption('#rm-backup', 'on');
  await np.click('text=Save reminders'); await np.waitForTimeout(500);
  const ln = await np.evaluate(() => window.__ln);
  const checkins = ln.scheduled.filter((x) => x.extra.view === 'checkin');
  const first = new Date(checkins[0]?.at || 0), now = new Date();
  ok(ln.requested === 1 && checkins.length === 12 && ln.scheduled.length === 13, `saving asks permission once and schedules 12 check-ins plus a backup reminder (${ln.scheduled.length})`);
  ok(first.getDate() === new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate() && first.getHours() === 19 && first.getMinutes() === 30 && first > now, 'first check-in is the last day of the month at 7:30 pm');
  ok(ln.scheduled.every((x) => x.isExactNotification === false && x.schedule.allowWhileIdle && x.smallIcon === 'ic_stat_wealth'), 'reminders are inexact (no exact-alarm permission) and use the app icon');
  ok((await np.textContent('#rm-status')).startsWith('Reminders set. Next:'), 'Settings confirms when the next reminder is');
  await np.reload(); await np.waitForTimeout(800);
  const ln2 = await np.evaluate(() => window.__ln);
  ok(ln2.scheduled.length === 13 && ln2.requested === 0, 'opening the app re-plans the reminders without asking again');
  ok(nerrors.length === 0, 'no page errors in the app build ' + JSON.stringify(nerrors));
  await nctx.close();
  // Spending categories: rename, add, hide and remove; new imports land in the review list
  const cctx = await browser.newContext({ ...devices['Pixel 7'] });
  const cp = await cctx.newPage(); const cerrors = []; cp.on('pageerror', (e) => cerrors.push(e.message));
  const cpick = async (selector, files) => { const [fc] = await Promise.all([cp.waitForEvent('filechooser'), cp.click(selector)]); await fc.setFiles(files); };
  const cclose = () => cp.evaluate(() => document.querySelectorAll('.sheet-bg').forEach((b) => b.remove()));
  const cdb = (st, key) => cp.evaluate(async ([st, key]) => { const r = indexedDB.open('wealth-tracker'); const db = await new Promise((res) => { r.onsuccess = () => res(r.result); }); return new Promise((res) => { const q = db.transaction(st).objectStore(st).get(key); q.onsuccess = () => res(q.result); }); }, [st, key]);
  await cp.goto(BASE); await cp.waitForTimeout(600); await cp.click('text=Load sample data'); await cp.waitForTimeout(800);
  const nov0 = await cdb('months', '2026-10');
  // rename Groceries
  await cp.click('#settingsBtn'); await cp.click('text=Edit spending categories'); await cp.waitForTimeout(300);
  await cp.click('.sheet [aria-label="Edit Groceries"]'); await cp.waitForTimeout(300);
  await cp.fill('#cat-name', 'Food shopping'); await cp.click('.sheet-bg:last-child .btn.primary'); await cp.waitForTimeout(900);
  ok((await cp.textContent('.sheet-bg:last-child .sheet')).includes('Food shopping') && !(await cp.textContent('.sheet-bg:last-child .sheet')).includes('Groceries'), 'renaming a category shows the new name in the list');
  await cclose();
  const nov = await cdb('months', '2026-10'); const novTx = await cdb('tx', '2026-10'); const conf = await cdb('config', 'app');
  ok(nov.spend['Food shopping'] === nov0.spend.Groceries && !('Groceries' in nov.spend) && !novTx.some((t) => t.cat === 'Groceries') && conf.targets['Food shopping'] === 950 && !('Groceries' in conf.targets), 'renaming moves the transactions, month totals and budget target');
  await cp.click('.tab[data-tab=spend]'); await cp.selectOption('#monthPick', '2026-10'); await cp.waitForTimeout(500);
  ok((await cp.textContent('#s-cats')).includes('Food shopping'), 'Spending shows the renamed category');
  ok(await cp.isHidden('#s-review'), 'no review list for data that was already there');
  // new imports follow the rename and wait for review
  const cofx = path.join(tmp, 'review.ofx');
  fs.writeFileSync(cofx, 'OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><ACCTID>12341111</BANKACCTFROM><BANKTRANLIST>\n<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261203<TRNAMT>-61.20<NAME>WOOLWORTHS 4410 RICHMOND\n<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261204<TRNAMT>-14.00<NAME>NEWCAFE ESPRESSO BAR\n</BANKTRANLIST><LEDGERBAL><BALAMT>1100.00<DTASOF>20261204</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>\n');
  await cp.click('.tab[data-tab=checkin]'); await cp.waitForTimeout(300);
  await cpick('#v-checkin [data-pick=csvIn]', cofx); await cp.waitForTimeout(900);
  if (await cp.locator('.sheet').count()) { await cp.click('.sheet .btn.primary'); await cp.waitForTimeout(900); }
  ok((await cp.textContent('.toast')).includes('Check them in Spending'), 'the import toast points to Spending');
  await cp.click('.tab[data-tab=spend]'); await cp.waitForTimeout(600);
  ok(await cp.isVisible('#s-review') && (await cp.textContent('#s-review')).includes('2 new') && !(await cp.textContent('#s-review')).includes('null'), 'imported transactions land in the review list');
  const wv = await cp.locator('#s-revlist .tx', { hasText: 'WOOLWORTHS' }).locator('select').inputValue();
  ok(wv === 'Food shopping', `a built-in rule follows the rename (${wv})`);
  ok(await cp.locator('#s-tx .tx', { hasText: 'WOOLWORTHS' }).locator('.pill:text-is("New")').count() === 1, 'unreviewed transactions are marked New in the list');
  await cp.click('#s-revlist .tx:has-text("WOOLWORTHS") button:text-is("Looks right")'); await cp.waitForTimeout(500);
  ok((await cp.textContent('#s-review')).includes('1 new') && !(await cp.textContent('#s-review')).includes('WOOLWORTHS'), 'Looks right clears one transaction');
  await cp.locator('#s-revlist .tx', { hasText: 'NEWCAFE' }).locator('select').selectOption('Cafes'); await cp.waitForTimeout(700);
  ok(await cp.isHidden('#s-review'), 'choosing a category clears it too, and the list goes when empty');
  const dec = await cdb('tx', '2026-12');
  ok(dec.length === 2 && dec.every((t) => !t.review) && dec.find((t) => /NEWCAFE/.test(t.desc)).cat === 'Cafes', 'reviewed state is saved');
  // add, hide, remove
  await cp.click('#settingsBtn'); await cp.click('text=Edit spending categories'); await cp.click('.sheet button:text-is("Add a category")'); await cp.waitForTimeout(300);
  await cp.fill('#cat-name', 'Kids'); await cp.click('.sheet [data-icon=heart]'); await cp.click('.sheet [data-colour=pink]');
  await cp.click('.sheet-bg:last-child .btn.primary'); await cp.waitForTimeout(700);
  await cp.click('.sheet [aria-label="Edit Pets"]'); await cp.waitForTimeout(300); await cp.check('#cat-hidden');
  await cp.click('.sheet-bg:last-child .btn.primary'); await cp.waitForTimeout(700); await cclose();
  await cp.click('.tab[data-tab=spend]'); await cp.selectOption('#monthPick', '2026-10'); await cp.waitForTimeout(500);
  const opts = await cp.locator('#s-tx .tx select').evaluateAll((ss) => [...ss.find((s) => s.value !== 'Pets').options].map((o) => o.value));
  ok(opts.includes('Kids') && !opts.includes('Pets') && (await cp.textContent('#s-cats')).includes('Pets'), 'a new category can be picked; a hidden one leaves the lists but still counts ' + opts.join('|'));
  const k = await cdb('config', 'app'); const kids = k.spendCats.find((x) => x.name === 'Kids');
  ok(kids && kids.icon === 'heart' && kids.color === 'pink', 'the new category keeps its icon and colour');
  const order = k.spendCats.map((x) => x.name);
  ok(order.indexOf('Kids') === order.indexOf('Other') - 1, 'a new category goes just above Other ' + order.slice(-3).join(','));
  await cp.click('#settingsBtn'); await cp.click('text=Edit spending categories'); await cp.click('.sheet [aria-label="Edit Cafes"]'); await cp.waitForTimeout(300);
  await cp.click('.sheet button:text-is("Remove this category")'); await cp.selectOption('#cat-moveto', 'Eating out');
  await cp.click('.sheet button:text-is("Remove Cafes")'); await cp.waitForTimeout(1000); await cclose();
  const nov2 = await cdb('months', '2026-10'); const dec2 = await cdb('tx', '2026-12'); const k2 = await cdb('config', 'app');
  ok(!('Cafes' in nov2.spend) && Math.abs(nov2.spend['Eating out'] - (nov0.spend['Eating out'] + nov0.spend.Cafes)) < 0.01 && dec2.find((t) => /NEWCAFE/.test(t.desc)).cat === 'Eating out', 'removing a category moves its transactions and totals');
  ok(k2.rules.some((r) => r.cat === 'Eating out' && /NEWCAFE/.test(r.match)) && !k2.rules.some((r) => r.cat === 'Cafes') && !k2.spendCats.some((x) => x.name === 'Cafes'), 'its rules move too');
  await cp.click('#settingsBtn'); await cp.click('text=Edit spending categories'); await cp.click('.sheet button:text-is("Add a category")'); await cp.waitForTimeout(300);
  await cp.fill('#cat-name', 'eating out'); await cp.click('.sheet-bg:last-child .btn.primary'); await cp.waitForTimeout(400);
  ok((await cp.textContent('.toast')).includes("There's already a category called"), 'a duplicate name is refused');
  await cclose(); await cp.reload(); await cp.waitForTimeout(800);
  await cp.click('.tab[data-tab=spend]'); await cp.selectOption('#monthPick', '2026-10'); await cp.waitForTimeout(500);
  ok((await cp.textContent('#s-cats')).includes('Food shopping') && !(await cp.textContent('#s-cats')).includes('Cafes'), 'category changes survive a reload');
  // The same card linked under two numbers: a purchase in both files imports once
  const ofxA = path.join(tmp, 'cardA.ofx'), ofxB = path.join(tmp, 'cardB.ofx');
  fs.writeFileSync(ofxA, 'OFXHEADER:100\n<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CCACCTFROM><ACCTID>55552600</CCACCTFROM><BANKTRANLIST>\n<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261210<TRNAMT>-14.94<NAME>LYMOON COFFEE BALWYN\n</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>\n');
  fs.writeFileSync(ofxB, 'OFXHEADER:100\n<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CCACCTFROM><ACCTID>4000000000004049</CCACCTFROM><BANKTRANLIST>\n<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261207<TRNAMT>-14.94<NAME>LYMOON COFFEE BALWYN AUS Card ending 4049\n<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261208<TRNAMT>-9.00<NAME>ANOTHER CAFE\n</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>\n');
  for (const f of [ofxA, ofxB]) {
    await cp.click('.tab[data-tab=checkin]'); await cp.waitForTimeout(300);
    await cpick('#v-checkin [data-pick=csvIn]', f); await cp.waitForTimeout(600);
    if (await cp.locator('.sheet select').count()) { await cp.selectOption('.sheet select', { label: 'Credit card' }); await cp.click('.sheet .btn.primary'); await cp.waitForTimeout(900); }
  }
  ok((await cp.textContent('.toast')).includes('Imported 1 new transaction'), 'a purchase already imported under the card\'s other number is not imported again ' + await cp.textContent('.toast'));
  ok(cerrors.length === 0, 'no page errors while editing categories ' + JSON.stringify(cerrors));
  await cctx.close();

  // House ledger from the home loan account's own transactions: actual repayments and interest, the partner's share at 50%
  const lctx = await browser.newContext({ ...devices['Pixel 7'] });
  const lp = await lctx.newPage(); const lerrors = []; lp.on('pageerror', (e) => lerrors.push(e.message));
  const ldb = (st, key) => lp.evaluate(async ([st, key]) => { const r = indexedDB.open('wealth-tracker'); const db = await new Promise((res) => { r.onsuccess = () => res(r.result); }); return new Promise((res) => { const q = db.transaction(st).objectStore(st).get(key); q.onsuccess = () => res(q.result); }); }, [st, key]);
  await lp.goto(BASE); await lp.waitForTimeout(600); await lp.click('text=Load sample data'); await lp.waitForTimeout(800);
  const oct0 = await ldb('months', '2026-10');
  const loanOfx = path.join(tmp, 'homeloan.ofx');
  fs.writeFileSync(loanOfx, 'OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><ACCTID>77775555</BANKACCTFROM><BANKTRANLIST>\n<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261001<TRNAMT>2600.00<NAME>LOAN REPAYMENT\n<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261015<TRNAMT>1400.00<NAME>INTERNET PAYMENT LINKED ACC\n<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261031<TRNAMT>-1850.40<NAME>INTEREST CHARGED\n</BANKTRANLIST><LEDGERBAL><BALAMT>-610000.00<DTASOF>20261031</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>\n');
  await lp.click('.tab[data-tab=checkin]'); await lp.waitForTimeout(300);
  const [lfc] = await Promise.all([lp.waitForEvent('filechooser'), lp.click('#v-checkin [data-pick=csvIn]')]); await lfc.setFiles(loanOfx); await lp.waitForTimeout(900);
  if (await lp.locator('.sheet select').count()) { await lp.click('.sheet .btn.primary'); await lp.waitForTimeout(900); }
  const oct1 = await ldb('months', '2026-10'); const octTx = await ldb('tx', '2026-10');
  const sumS = (d) => Object.values(d.spend || {}).reduce((a, v) => a + v, 0);
  ok(oct1.mortgagePaid === Math.max(4000, oct0.mortgagePaid) && oct1.mortgageInterest === 1850.4, `a home loan account's credits are the month's repayments and its interest charges are recorded (${oct1.mortgagePaid}, ${oct1.mortgageInterest})`);
  ok(oct1.income === oct0.income && Math.abs(sumS(oct1) - sumS(oct0)) < 0.01, 'loan account transactions never count as income or spending ' + JSON.stringify([oct0.income, oct1.income, oct0.otherIn, oct1.otherIn, sumS(oct0), sumS(oct1), oct0.mortgagePaid]));
  ok(octTx.filter((t) => t.acct === '5555').every((t) => t.cat === 'Mortgage'), 'loan account transactions are filed as Mortgage');
  await lp.click('.tab[data-tab=wealth]'); await lp.waitForTimeout(500);
  await lp.selectOption('#w-ledger select', '2027'); await lp.waitForTimeout(400);
  const lt = await lp.textContent('#w-ledger');
  ok(lt.includes('$1,850 of the interest is from your loan accounts'), 'the ledger uses the interest the loan account actually charged ' + lt.slice(0, 300));
  const shareTxt = await lp.locator('#w-ledger .row', { hasText: 'share' }).textContent();
  const mortTxt = await lp.locator('#w-ledger .row', { hasText: 'Mortgage repayments' }).first().textContent();
  const mortAmt = parseFloat(mortTxt.match(/\$([\d,]+)\s*$/)[1].replace(/,/g, '')), shareAmt = parseFloat(shareTxt.match(/\$([\d,]+)/)[1].replace(/,/g, ''));
  ok(shareTxt.includes('50% of the mortgage repayments') && Math.abs(shareAmt - mortAmt / 2) <= 1, `the partner's share is half the repayments (${shareAmt} of ${mortAmt})`);
  ok(lerrors.length === 0, 'no page errors with loan account imports ' + JSON.stringify(lerrors));
  await lctx.close();
  // Recurring charges: suggestions from the transactions, confirming, turning down, adding by hand, and a price change
  const rctx = await browser.newContext({ ...devices['Pixel 7'] });
  const rp = await rctx.newPage(); const rerrors = []; rp.on('pageerror', (e) => rerrors.push(e.message));
  await rp.goto(BASE); await rp.waitForTimeout(600); await rp.click('text=Load sample data'); await rp.waitForTimeout(800);
  const recLines = []; const amts = [83.2, 141.7, 56.9, 210.4, 97.3, 64.1, 172.8, 119.5, 45.6, 188.2, 133.9, 76.4, 152.3, 61.8, 99.9, 230.1, 71.2, 126.4, 49.5, 167.7, 112.6, 88.8, 201.3, 58.4];
  ['06', '07', '08', '09', '10', '11'].forEach((m, mi) => {
    recLines.push(`<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>2026${m}03<TRNAMT>${m === '11' ? '-24.99' : '-22.99'}<NAME>DISNEY PLUS SYDNEY`);
    recLines.push(`<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>2026${m}12<TRNAMT>-11.99<NAME>SPOTIFY P0A1B2C3`);
    recLines.push(`<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>2026${m}01<TRNAMT>-4.49<NAME>APPLE.COM/BILL`, `<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>2026${m}14<TRNAMT>-12.99<NAME>APPLE.COM/BILL`);
    ['02', '09', '16', '23'].forEach((d, i) => recLines.push(`<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>2026${m}${d}<TRNAMT>-${amts[mi * 4 + i]}<NAME>WOOLWORTHS 1234 RICHMOND`));
  });
  const recOfx = path.join(tmp, 'recurring.ofx');
  fs.writeFileSync(recOfx, 'OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><ACCTID>12341111</BANKACCTFROM><BANKTRANLIST>\n' + recLines.join('\n') + '\n</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>\n');
  await rp.click('.tab[data-tab=checkin]'); await rp.waitForTimeout(300);
  const [rfc] = await Promise.all([rp.waitForEvent('filechooser'), rp.click('#v-checkin [data-pick=csvIn]')]); await rfc.setFiles(recOfx); await rp.waitForTimeout(1200);
  await rp.click('.tab[data-tab=spend]'); await rp.waitForTimeout(900);
  const sugg = await rp.textContent('#s-recsugg');
  ok(sugg.includes('DISNEY') && sugg.includes('SPOTIFY') && sugg.includes('Monthly, 6 charges') && !sugg.includes('WOOLWORTHS'), 'regular charges are suggested and the weekly supermarket shop is not ' + sugg.slice(0, 200));
  await rp.click('#s-recsugg button[aria-label="SPOTIFY is not recurring"]'); await rp.waitForTimeout(500);
  ok(!(await rp.textContent('#s-subs')).includes('SPOTIFY'), 'Not recurring removes a suggestion');
  // one payee, two subscriptions: turning one down keeps the other
  if (await rp.locator('#s-subs button:has-text("Show all")').count()) { await rp.click('#s-subs button:has-text("Show all")'); await rp.waitForTimeout(300); }
  await rp.locator('#s-recsugg .tx', { hasText: '$4.49' }).locator('button:text-is("Not recurring")').click(); await rp.waitForTimeout(500);
  const appleLeft = await rp.locator('#s-recsugg .tx', { hasText: 'APPLE' }).allTextContents();
  ok(appleLeft.length === 1 && appleLeft[0].includes('$12.99'), 'Not recurring works on one of two charges from the same payee ' + JSON.stringify(appleLeft));
  await rp.click('#s-recsugg button[aria-label^="Add DISNEY"]'); await rp.waitForTimeout(600);
  const rec = await rp.textContent('#s-rec');
  ok(rec.includes('DISNEY') && rec.includes('Monthly · next 3 ') && rec.includes('last charge was $24.99'), 'an added suggestion is listed with its next date, and the price rise is noticed ' + rec);
  ok(!(await rp.locator('#s-recsugg').count()) || !(await rp.textContent('#s-recsugg')).includes('DISNEY'), 'an added charge is no longer suggested');
  ok(!(await rp.textContent('#s-subs')).includes('null'), 'nothing stray in the recurring card');
  await rp.click('#s-rec [aria-label^="Edit DISNEY"]'); await rp.waitForTimeout(300); await rp.click('.sheet button:text-is("Use $24.99")');
  await rp.click('.sheet-bg:last-child .btn.primary'); await rp.waitForTimeout(500);
  const disneyRow = await rp.locator('#s-rec .row', { hasText: 'DISNEY' }).textContent();
  ok(disneyRow.includes('$24.99') && !disneyRow.includes('last charge was'), 'Use the new amount updates the charge ' + disneyRow);
  const totalOf = async () => n0((await rp.textContent('#s-subs')).match(/About \$([\d,]+) a month/)[1]);
  const n0 = (x) => Number(String(x).replace(/,/g, ''));
  const totalBefore = await totalOf();
  await rp.click('#s-subs button:text-is("Add")'); await rp.waitForTimeout(300);
  await rp.fill('#rc-name', 'Swim school'); await rp.fill('#rc-amt', '20'); await rp.selectOption('#rc-every', 'fortnight'); await rp.fill('#rc-next', '2030-01-10');
  await rp.click('.sheet-bg:last-child .btn.primary'); await rp.waitForTimeout(500);
  const rec2 = await rp.textContent('#s-rec');
  ok(rec2.includes('Swim school') && rec2.includes('Fortnightly · next 10 Jan 2030') && Math.abs((await totalOf()) - totalBefore - 43) <= 1, 'a charge added by hand is listed, and adds to the monthly total ' + (await rp.textContent('#s-subs')).slice(0, 300));
  await rp.click('#s-rec [aria-label="Edit Swim school"]'); await rp.waitForTimeout(300); await rp.click('.sheet button:text-is("Remove")'); await rp.waitForTimeout(500);
  await rp.reload(); await rp.waitForTimeout(900); await rp.click('.tab[data-tab=spend]'); await rp.waitForTimeout(900);
  const recAfter = await rp.textContent('#s-subs');
  ok(recAfter.includes('DISNEY') && !recAfter.includes('Fortnightly · next 10 Jan 2030') && !recAfter.includes('SPOTIFY') && !recAfter.includes('$4.49'), 'recurring charges and turned-down suggestions survive a reload');
  ok(rerrors.length === 0, 'no page errors with recurring charges ' + JSON.stringify(rerrors));
  await rctx.close();
  {
  // Bills you save for, safe to spend and savings goals; older yearly bills and the cash goal move across
  const sctx = await browser.newContext({ ...devices['Pixel 7'] });
  const bp = await sctx.newPage(); const serrors = []; bp.on('pageerror', (e) => serrors.push(e.message));
  const sdb = (st, key) => bp.evaluate(async ([st, key]) => { const r = indexedDB.open('wealth-tracker'); const db = await new Promise((res) => { r.onsuccess = () => res(r.result); }); return new Promise((res) => { const q = db.transaction(st).objectStore(st).get(key); q.onsuccess = () => res(q.result); }); }, [st, key]);
  await bp.goto(BASE); await bp.waitForTimeout(600); await bp.click('text=Load sample data'); await bp.waitForTimeout(800);
  // make the config look like an older version's: yearly bills and one cash goal
  await bp.evaluate(async () => { const r = indexedDB.open('wealth-tracker'); const db = await new Promise((res) => { r.onsuccess = () => res(r.result); });
    const c = await new Promise((res) => { const q = db.transaction('config').objectStore('config').get('app'); q.onsuccess = () => res(q.result); });
    delete c.recurring; delete c.goals; delete c.billsMoved; c.sinking = [{ name: 'Car rego', yearly: 1200 }, { name: 'Home insurance', yearly: 960 }]; c.goal = { cash: 30000 };
    await new Promise((res) => { const t = db.transaction('config', 'readwrite'); t.objectStore('config').put(c, 'app'); t.oncomplete = res; }); });
  await bp.reload(); await bp.waitForTimeout(900);
  const mc = await sdb('config', 'app');
  ok(mc.billsMoved && mc.recurring.length === 2 && mc.recurring.every((r) => r.every === 'year' && !r.next) && mc.sinking.length === 0, 'older yearly bills move into the recurring list as yearly charges ' + JSON.stringify(mc.recurring));
  ok(mc.goals.length === 1 && mc.goals[0].target === 30000 && mc.goals[0].source === 'cash', 'the older cash goal becomes the first savings goal');
  await bp.click('.tab[data-tab=budget]'); await bp.waitForTimeout(600);
  const bills0 = await bp.textContent('#b-sink');
  ok(bills0.includes('Car rego') && bills0.includes('Tap to set the due date') && bills0.includes('$100/mo') && bills0.includes('$180'), 'Budget lists bills you save for, a share each month ' + bills0.slice(0, 200));
  await bp.click('#b-bills [aria-label="Edit Car rego"]'); await bp.waitForTimeout(300);
  await bp.fill('#rc-next', '2027-05-17'); await bp.fill('#rc-words', 'VICROADS'); await bp.click('.sheet-bg:last-child .btn.primary'); await bp.waitForTimeout(800);
  const rego = await bp.locator('#b-bills .catrow', { hasText: 'Car rego' }).textContent();
  ok(/\$\d+ of \$1,200 put aside, due 17 May/.test(rego) && await bp.locator('#b-bills .catrow', { hasText: 'Car rego' }).locator('.bar i').count() === 1, 'with a due date, the bill shows how much should be put aside by now ' + rego);
  // a rego payment this month comes out of the set-aside, not everyday spending
  const nov0 = await sdb('months', '2026-11');
  const regoOfx = path.join(tmp, 'rego.ofx');
  fs.writeFileSync(regoOfx, 'OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><ACCTID>12341111</BANKACCTFROM><BANKTRANLIST>\n<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261105<TRNAMT>-180.00<NAME>VICROADS REGO RENEWAL\n<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261106<TRNAMT>-42.00<NAME>CORNER CAFE\n</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>\n');
  await bp.click('.tab[data-tab=checkin]'); await bp.waitForTimeout(300);
  const [sfc] = await Promise.all([bp.waitForEvent('filechooser'), bp.click('#v-checkin [data-pick=csvIn]')]); await sfc.setFiles(regoOfx); await bp.waitForTimeout(1200);
  const nov1 = await sdb('months', '2026-11');
  ok(nov1.billFund === 180 && Math.abs((nov1.lumpy - n0z(nov0.lumpy)) - 180) < 0.01, `a payment for a bill you save for counts as a one-off, paid from the set-aside (${nov1.billFund}, ${nov1.lumpy})`);
  // safe to spend adds up
  await bp.click('.tab[data-tab=budget]'); await bp.waitForTimeout(800);
  const safeTxt = await bp.textContent('#b-safe');
  const nums = await bp.$$eval('#b-safe .list .row .num', (els) => els.map((e) => Number(e.textContent.replace(/[^0-9.]/g, '')) * (e.textContent.includes('−') ? -1 : 1)));
  const safeAmt = await bp.$eval('#b-safeamt', (e) => Number(e.textContent.replace(/[^0-9.]/g, '')) * (e.textContent.includes('−') ? -1 : 1));
  ok(safeTxt.includes('Safe to spend') && safeTxt.includes('until 30 Nov') && safeTxt.includes('Bills still due') && Math.abs(nums.reduce((a, b) => a + b, 0) - safeAmt) <= nums.length, `safe to spend is pay less fixed costs, set-asides, spending and bills still due (${nums} = ${safeAmt})`);
  await bp.click('.tab[data-tab=home]'); await bp.waitForTimeout(800);
  ok(await bp.isVisible('#h-safe') && (await bp.textContent('#h-safe')).includes('Safe to spend') && /\$[\d,]+/.test(await bp.textContent('#h-safeamt')), 'Home shows safe to spend');
  await bp.click('#h-safe'); await bp.waitForTimeout(500);
  ok(await bp.evaluate(() => location.hash) === '#budget', 'tapping it opens Budget');
  // a goal with a date sets aside what it needs each month
  await bp.click('.tab[data-tab=wealth]'); await bp.waitForTimeout(600);
  ok((await bp.textContent('#w-goal')).includes('Cash savings'), 'Wealth lists the savings goals');
  await bp.click('#w-goaledit'); await bp.waitForTimeout(300);
  await bp.fill('#g-name', 'Holiday'); await bp.fill('#g-target', '3000'); await bp.fill('#g-date', '2027-05'); await bp.selectOption('#g-src', 'manual'); await bp.fill('#g-saved', '600');
  await bp.click('.sheet-bg:last-child .btn.primary'); await bp.waitForTimeout(600);
  const gl = await bp.locator('#w-goal .catrow', { hasText: 'Holiday' }).textContent();
  ok(gl.includes('$600 of $3,000') && gl.includes('$400 a month to reach it by May 2027'), 'a goal with a date shows the monthly amount needed ' + gl);
  await bp.click('.tab[data-tab=budget]'); await bp.waitForTimeout(600);
  ok((await bp.locator('#b-top .row', { hasText: 'Saving for goals' }).textContent()).includes('400'), 'Budget sets aside the goal\'s monthly amount');
  ok((await bp.locator('#b-safe .row', { hasText: 'Saving for goals' }).textContent()).includes('400'), 'and so does safe to spend');
  ok(serrors.length === 0, 'no page errors with bills, safe to spend and goals ' + JSON.stringify(serrors));
  await sctx.close();
  }
  // Targets list every category; removing Rego into another category doesn't make that category one-off
  {
    const octx = await browser.newContext({ ...devices['Pixel 7'] });
    const op = await octx.newPage(); const oerrors = []; op.on('pageerror', (e) => oerrors.push(e.message));
    const odb = (st, key) => op.evaluate(async ([st, key]) => { const r = indexedDB.open('wealth-tracker'); const db = await new Promise((res) => { r.onsuccess = () => res(r.result); }); return new Promise((res) => { const q = db.transaction(st).objectStore(st).get(key); q.onsuccess = () => res(q.result); }); }, [st, key]);
    await op.goto(BASE); await op.waitForTimeout(600); await op.click('text=Load sample data'); await op.waitForTimeout(800);
    // the setup the user had before this fix: a category they made, with Rego removed into it
    await op.evaluate(async () => { const r = indexedDB.open('wealth-tracker'); const db = await new Promise((res) => { r.onsuccess = () => res(r.result); });
      const c = await new Promise((res) => { const q = db.transaction('config').objectStore('config').get('app'); q.onsuccess = () => res(q.result); });
      const base = ['Groceries', 'Eating out', 'Cafes', 'Fuel', 'Transport', 'Bills', 'Insurance', 'Health', 'Personal care', 'Shopping', 'Clothing', 'Home & furniture', 'Entertainment', 'Subscriptions', 'Services', 'Pets', 'Gifts', 'Home repairs', 'Council rates', 'Interest & fees', 'Other'];
      c.spendCats = [...base.map((name) => ({ name, icon: 'dots', color: 'grey' })), { name: 'Car costs', icon: 'car', color: 'blue' }];
      c.spendCats.find((x) => x.name === 'Council rates').icon = 'home'; c.catMap = { Rego: 'Car costs' };
      await new Promise((res) => { const t = db.transaction('config', 'readwrite'); t.objectStore('config').put(c, 'app'); t.oncomplete = res; });
      const tx = await new Promise((res) => { const q = db.transaction('tx').objectStore('tx').get('2026-10'); q.onsuccess = () => res(q.result); });
      tx.push({ date: '2026-10-20', amt: -85, desc: 'TYREPOWER RINGWOOD', merchant: '', acct: '1111', bal: null, cat: 'Car costs' });
      await new Promise((res) => { const t = db.transaction('tx', 'readwrite'); t.objectStore('tx').put(tx, '2026-10'); t.oncomplete = res; }); });
    await op.reload(); await op.waitForTimeout(1500);
    const oc = await odb('config', 'app');
    ok(oc.spendCats.find((x) => x.name === 'Car costs').oneOff === false && oc.spendCats.find((x) => x.name === 'Council rates').oneOff === true, 'a category Rego was moved into is not one-off; Council rates still is');
    const oct = await odb('months', '2026-10');
    ok(oct.spend['Car costs'] === 85, 'the month is worked out again with the category in it');
    await op.click('.tab[data-tab=budget]'); await op.waitForTimeout(500); await op.click('#b-edit'); await op.waitForTimeout(400);
    const tl = await op.locator('.sheet-bg:last-child .sheet .field label').allTextContents();
    ok(tl.some((x) => x.startsWith('Car costs')) && tl.some((x) => x.startsWith('Council rates')) && tl.length === 22, 'the targets screen lists every category, including ones you made ' + tl.length);
    await op.fill('.sheet-bg:last-child .sheet [aria-label="Car costs"]', '150'); await op.click('.sheet-bg:last-child .btn.primary'); await op.waitForTimeout(500);
    await op.selectOption('#monthPick', '2026-10'); await op.waitForTimeout(400);
    ok((await odb('config', 'app')).targets['Car costs'] === 150 && (await op.textContent('#b-cats')).includes('$85 of $150'), 'a target for a category you made saves and shows in Budget');
    // the one-off setting in the category editor
    await op.click('#settingsBtn'); await op.click('text=Edit spending categories'); await op.click('.sheet [aria-label="Edit Car costs"]'); await op.waitForTimeout(300);
    ok(!(await op.isChecked('#cat-oneoff')), 'the editor shows whether a category is one-off');
    await op.check('#cat-oneoff'); await op.click('.sheet-bg:last-child .btn.primary'); await op.waitForTimeout(900);
    ok((await odb('months', '2026-10')).lumpy - oct.lumpy === 85, 'switching it to one-off moves its spending out of everyday');
    ok(oerrors.length === 0, 'no page errors with one-off categories ' + JSON.stringify(oerrors));
    await octx.close();
  }
  await browser.close();
  console.log(failed ? `${failed} failed` : 'all passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
