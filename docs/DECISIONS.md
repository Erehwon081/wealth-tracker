# Decisions and open threads

The engineering record for Claude Code chats. `CLAUDE.md` holds the rules; `CHANGELOG.md` holds what the user sees. This file records why things are the way they are, and what is still unfinished. Read it at the start of a chat; update it before the chat ends.

## Open threads

- **Live prices are unverified against a real sheet.** The cloud sandbox blocks docs.google.com, so cross-origin fetches of the published CSV were never tested. The user hasn't yet pasted real links (they once saved three empty boxes). If Refresh prices says "Couldn't reach Google Sheets", try Google's other CSV link format (`/gviz/tq?tqx=out:csv&sheet=<tab>`, which needs link sharing on), or an Apps Script web app returning JSON. Don't add a proxy.
- **Untested on a real phone:** Back up now through the share sheet, the back-button order, status bar icon colour per theme, and vibration. The user has installed the APK and reported layout issues only so far.
- **Roadmap items 3, 4 and 5 are untested with the user's real data.** They need: each mortgage split's linked offset and rate history entered (Wealth > tap the loan in Accounts and loans), the building insurer named in the ledger's Edit, and dividends entered or imported. Ask for the headers of the user's dividend sheet tab if the CSV import doesn't read it.
- **Roadmap item 6 (bank import) is next.** Agree the design with the user before building; they want it simple to use and maintain, with no cloud or API connections.
- **Version numbering:** `1.0.<run number>` skips numbers because branch builds use them too. A version set in `package.json` (minor for features, patch for fixes), with `versionCode` still taken from the run number, was suggested but not decided.
- **Node 20 deprecation warnings** in Actions: `actions/upload-artifact@v4`, and `upload-pages-artifact@v3` / `deploy-pages@v4` in `pages.yml`. Bump them when newer majors are available.

## Decisions

### Storage and data
- **IndexedDB through `www/js/storage.js` only**, with the same shapes the original artifact used (config, accounts, months, tx, holdings), so backups from the artifact restore unchanged. `meta` (lastBackup, since) is never exported.
- **Stored category keys stay "Partner…"**, with the display name substituted at render (`pLabel`). Older data that names the partner ("Shonny's card") is mapped to the keys when a month loads (`fixCat`), because real backups came from a version that used the partner's name.
- **Tagging a purchase as the partner's** sets `t.partner`. It feeds the partner's share on your card as `max(transfer-based estimate, tagged total)`, so a tagged purchase they already paid back isn't counted twice. Tagged purchases keep their category, so category bars still show total card spend.
- **Expected pay** (`config.expectedPay {amount, per}`) is used only by Budget. Check-in, Home and cash flow keep actual pay, because they report what happened.
- **Backups**: plain JSON, or AES-GCM 256 with a PBKDF2-SHA-256 key (600,000 iterations) when a passphrase is given. Restore accepts accounts and holdings as arrays or maps, and tx as `rows[]` or `{rows}`.

### Look and behaviour
- **Violet theme, light and dark.** Chosen from a preview by the user. The theme choice is in localStorage (`bm-theme`, per device, not in backups) and applied by `theme.js` before first paint.
- **Fonts and pdf.js are vendored** because the original loaded from Google Fonts and a CDN, which broke the no-third-party rule and offline use.
- **`main` has `overflow-x: clip`**: a sliding page was overflowing 12px, which made Android rescale the layout and bounce the bottom bar.
- **Amounts never wrap**: long values stay on one line and the label wraps; stat tiles scale with container units (`cqi`).

### Android
- **Capacitor 8, project generated in CI** (not committed), so the repo stays the web app plus config. Icons and splash come from `assets/` via `@capacitor/assets`.
- **Signed with one release key held in repo secrets**, so updates install in place and keep data. Signing uses `apksigner` (v2/v3); its folder is added to PATH because Capacitor calls it by name.
- **Plugins via `window.Capacitor.Plugins`**: the native bridge injects them, so no bundler or core script is needed.
- **Body top padding equals the status-bar inset**: without it the sticky header was pushed down over the first card in the app.
- **APK links must be opened in Chrome itself**: the Claude app's in-app browser stalls on APK downloads.

### Loans, ledger and tax (roadmap 3–5)
- **Pure maths in `www/js/loans.js` and `www/js/tax.js`, unit tested.** `simulate()` runs loans month by month; extras go to the highest-rate loan first; a shared offset is counted once. Freed-up repayments are not rolled into other loans, in either the baseline or the scenario.
- **Loan fields on the account:** `rateType`, `fixedUntil`, `offsetId`, `rateHistory [{date, rate}]` (first entry is the starting rate). `a.rate` stays the current rate; history is only for past months.
- **Rate-change cost** uses actual month-end balances net of the linked offset, against the first rate in the history.
- **House ledger reads month summaries** (`mortgagePaid`, `shonnyMortgage`, `spend`), not transactions, so manually keyed months count. Only building insurance needs transactions, matched by payee within the Insurance category, so all months' tx are loaded once (`ensureAllTx`). Settings live on the property account as `ledger {insurers[], manual[{fy, type, amount}]}`.
- **Interest vs principal is an estimate:** each month's balance (net of offset) × the rate then ÷ 12, capped at what was paid.
- **Dividends:** `h.divs` is kept as the lump-sum total from before; `h.divPayments [{date, amount, franked, units?}]` are added to it (`totalDivs`). A reinvested dividend also adds a purchase lot (`drp: true`) so the cost base is right. `h.companyTax` (30 or 25) sets the franking rate.
- **Sales:** `h.sales [{date, units, price, fee, method}]`, matched to lots by `matchParcels` (fifo, maxcost or lifo). `h.sold` (older, undated) comes off the oldest lots first with no gain recorded. `hUnits` and `hCost` now come from the parcels still held.
- **CGT:** discount if the sale date is more than 12 months after the purchase date; losses offset non-discount gains first, then discount gains, then 50% off. Financial years are named by their end year (FY 2027 = 2026–27).

### Reminders
- **Planned in `www/js/reminders.js` (pure, unit tested), scheduled in `syncReminders()`.** The next 12 check-in dates are scheduled one by one, because Android can't repeat on "last day of the month", and re-planned on every app open, after a backup and after a restore. IDs 101–112 are check-ins and 201 is the backup reminder; only IDs 101–299 are cancelled.
- **Inexact on purpose** (`isExactNotification: false`, `allowWhileIdle`): otherwise the plugin opens Android's exact-alarm settings screen. A few minutes' delay doesn't matter for a month-end nudge.
- **Settings live in `config.reminders`**, so they come back with a restore. The website shows an explanation instead of controls.
- **Status bar icon** `assets/android-res/drawable/ic_stat_wealth.xml` is copied into the generated project in CI. Without it Android shows a generic info icon.

### Spending and charts
- **Imports happen only in Check-in.** The Spending import card was a duplicate, removed at the user's request.
- **The bar chart reserves a label row under the axis when any month is negative**, so loss labels don't sit on the month names. Month labels skip a regular one that would crowd the last (`showLabel`).

### Releases
- **Notes come from `CHANGELOG.md`**: the Unreleased section becomes the release notes, then CI commits it under the version. `release-notes.yml` re-syncs every release when the changelog changes on main.

## Log

- **9 Nov 2026**: Built the PWA from the artifact, deployed to Pages. Partner tagging, expected pay, the new look, motion and swipe, the first Android releases (1.0.4, 1.0.6, 1.0.8).
- **10 Nov 2026**: Release notes from the changelog (1.0.10). Added `CLAUDE.md` and this file. The user plans one Claude Code chat per release, grouped in a Claude project.
- **10 Nov 2026**: The user confirmed on their phone (1.0.13) that reminders work: the permission prompt, delivery, the status bar icon and tap-to-open Check-in. Chart dragging no longer brings up the copy menu, and the Spending and chart fixes are good. Not yet checked: delivery after a phone restart.
- **10 Nov 2026**: The user cancelled roadmap item 2 (bills and set-asides). Items 1, 3, 4 and 5 are done. Item 6 is the only one left.
- **10 Nov 2026**: Built roadmap items 3, 4 and 5 (mortgage what-if, house ledger, tax year) in one go, with sample data extended to show them.
- **10 Nov 2026**: Added `docs/ROADMAP.md` (six features, agreed order). Built roadmap item 1, reminder notifications. Removed the Spending import card. Fixed cash flow chart label overlap.
