// End-to-end check in Chromium. Run: python3 -m http.server 8765 --bind 127.0.0.1 -d www & node tests/e2e.cjs
// Needs Playwright with Chromium available (not run in CI).
const { chromium, devices } = require('playwright');
const fs = require('fs'); const os = require('os'); const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-e2e-'));
let failed = 0;
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
  await firstTx.locator('button', { hasText: "Mark Shonny's" }).click(); await p.waitForTimeout(400);
  ok(await p.locator('#s-tx .tx').first().locator('button', { hasText: /^Shonny's$/ }).count() === 1, 'tag button toggles on');
  await p.click('.tab[data-tab=checkin]'); await p.waitForTimeout(300);
  const onCard = parseFloat(await p.inputValue('#f-shonnyOnCard'));
  ok(onCard >= amt - 0.01, `tagged amount feeds the partner's share on your card (${onCard} >= ${amt})`);
  await p.click('.tab[data-tab=spend]'); await p.waitForTimeout(300);
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
  await pick('#dropzone [data-pick=csvIn]', csvPath); await p.waitForTimeout(800);
  ok(await p.inputValue('#monthPick') === '2026-12' && (await p.textContent('#s-tx')).includes('Woolworths'), 'CSV import works from the button');
  ok((await p.textContent('#s-tx')).includes("Sam's card"), 'partner card from Settings classifies the import');

  // Account list PDF through vendored pdf.js
  const pdfPage = await ctx.newPage();
  await pdfPage.setContent('<p>Accounts 09/11/2026 10:15</p><p>Everyday account BSB: 083-000 Acc: 12341111 $1,234.56</p><p>Credit card Card ending 2222 -$2,000.00</p>');
  const pdfPath = path.join(tmp, 'accounts.pdf');
  const pb = await chromium.launch(); const pp = await pb.newPage(); await pp.setContent(await pdfPage.content()); await pp.pdf({ path: pdfPath }); await pb.close(); await pdfPage.close();
  await p.click('.tab[data-tab=checkin]'); await p.waitForTimeout(300);
  await pick('#v-checkin [data-pick=pdfIn]', pdfPath); await p.waitForTimeout(2500);
  ok(await p.isVisible('text=Balances from NAB'), 'account list PDF opens with the vendored pdf.js');
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
  ok(await p.isVisible('text=Balances from NAB'), 'PDF import works offline');
  await ctx.setOffline(false);

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
  await browser.close();
  console.log(failed ? `${failed} failed` : 'all passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
