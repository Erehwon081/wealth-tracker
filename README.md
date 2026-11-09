# Wealth Tracker

A local-first personal finance web app: net worth, monthly check-ins, NAB CSV and account-list PDF imports, budgets, investments and housing scenarios. It installs on Android from Chrome and works offline.

All data stays on the device in IndexedDB. There is no backend and no analytics. The only network request the app makes is fetching the Google Sheets price links you paste into Settings, and the page's Content Security Policy blocks everything else.

App: https://erehwon081.github.io/wealth-tracker/

## Layout

`www/` is the whole app and is what gets deployed (and later becomes the Capacitor `webDir`). `js/storage.js` is the only file that touches IndexedDB, behind a small get/put/del/getAll/replaceAll/snapshot interface, so a native storage adapter can replace it. pdf.js 3.11.174 and the two fonts (SIL OFL) are vendored so nothing loads from a CDN.

## Backups

Settings > Back up now downloads `wealth-tracker-backup-YYYY-MM-DD.json` in the format `{"format":"wealth-tracker-backup","version":1,config,accounts,months,tx,holdings}`. With a passphrase the file is encrypted with AES-GCM using a PBKDF2-SHA-256 key (600,000 iterations). `.gitignore` excludes `*.json` apart from `manifest.json` and `package.json`, so a backup dropped into the repo folder won't be committed.

## Prices

For each of the ETFs, Stocks and Crypto tabs: File > Share > Publish to web, choose the tab and Comma-separated values, publish, and paste the link into Settings. Anyone who has a published link can read that tab.

## Tests

`npm test` runs the unit tests (CSV parsing, price tables, backup format and encryption). `tests/e2e.cjs` drives the app in Chromium with Playwright: serve `www/` on port 8765 and run `node tests/e2e.cjs`.

## Deploying

`.github/workflows/pages.yml` runs the unit tests and publishes `www/` on every push to `main`. In the repository's Settings > Pages, set Source to GitHub Actions once.
