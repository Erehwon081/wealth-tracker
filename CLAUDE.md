# Wealth Tracker

A local-first personal finance app: a vanilla JS single-page app (no framework, no bundler) in `www/`, published as a website on GitHub Pages and as an Android APK built with Capacitor. Tabs: Home, Check-in, Spending, Budget, Invest, Wealth, plus Settings (gear icon).

Live site: https://erehwon081.github.io/wealth-tracker/ · Releases (APKs): https://github.com/Erehwon081/wealth-tracker/releases

## Hard rules

- All data stays on the device (IndexedDB). No backend, no analytics, no third-party requests except the published Google Sheets CSV price links the user configures. The CSP in `www/index.html` enforces this; keep it that way.
- The repo is public. Never commit personal data: no backups, no real account names or balances, no signing key. `*.json` is gitignored except `manifest.json`, `package.json`, `package-lock.json` and `capacitor.config.json`. The sample data in `www/js/sample.js` is made up.
- Don't add features the user didn't ask for. Keep the existing look and tabs.

## Layout

- `www/index.html`, `www/app.css`: markup and styles. Colours are CSS tokens on `:root`, with dark mode under `prefers-color-scheme` and `[data-theme="dark"]`.
- `www/js/app.js`: the app. `www/js/storage.js`: the only code touching IndexedDB (swappable adapter). `backup.js`: backup format and AES-GCM/PBKDF2 encryption. `prices.js`, `csv.js`: published-CSV price parsing. `theme.js`: applies the saved theme before first paint. `reminders.js`: plans reminder notifications (Android app). `loans.js`: loan simulation and rate history. `tax.js`: financial years, franking credits, parcel matching and capital gains. `importer.js`: reads bank CSV/OFX/QIF files and holds the built-in bank profiles. `merchants.js`: built-in category rules for common Australian merchants. `sample.js`: sample data.
- `www/sw.js`: service worker; `__BUILD__` is replaced with the commit in CI. Add any new shell file to its `SHELL` list.
- Vendored, so the app works offline: `www/vendor/pdfjs/` (pdf.js 3.11.174) and `www/fonts/` (Bricolage Grotesque, Inter).
- `assets/`: sources for the Android icon and splash; `assets/android-res/` is copied into the generated Android project's `res/` (for example, the notification icon). The `android/` project is not committed; CI generates it.
- `wealth-tracker-source.html`: the original artifact the app was built from. Reference only, not deployed.

## Data shapes (keep backups compatible)

Backup file: `{"format":"wealth-tracker-backup","version":1,config,accounts[],months{YYYY-MM},tx{YYYY-MM: rows[]},holdings[]}`, optionally encrypted. Month fields named `shonny*` and categories like "Partner's card" are stored keys: the partner's display name comes from Settings, and older names like "Shonny's card" are mapped to the Partner keys when loaded.

## Testing

- `npm test`: unit tests (CSV, prices, backup, changelog, reminders, loans, tax, importer). These run in CI.
- End-to-end in Chromium (Playwright is preinstalled in cloud sessions): `cd www && python3 -m http.server 8765 --bind 127.0.0.1 &` then `node tests/e2e.cjs`. Not run in CI. Run it before merging any UI change, and add a check for each bug fixed.
- Check layout at phone width (390–412px), in both light and dark. To mimic the Android app's system bars, set `--safe-area-inset-top`/`--safe-area-inset-bottom` on `<html>`.

## Handover between chats

Each release or batch of work happens in a new Claude Code chat, so this repo is the only memory. At the start of a chat, read `docs/DECISIONS.md` for the reasons behind past choices and the open threads, and `docs/ROADMAP.md` for the planned features and their agreed order. Before the chat ends, update it: add decisions worth keeping (with the reason), add or close open threads, and add a dated line to its Log. Keep entries short. Don't copy the changelog into it.

## Workflow the user expects

1. Work on the session's `claude/...` branch. If its PR was already merged, restart it from `origin/main` first.
2. Add a user-facing note under `## Unreleased` in `CHANGELOG.md` for every change to the app. Write plain language, in the user's terms.
3. Run the tests, push, open a PR to `main`, and merge when the user approves. The user usually says "merge it when it passes".
4. Merging to `main` deploys the website (`pages.yml`) and, when `www/`, `assets/`, the package files or `android.yml` change, builds and publishes a signed APK (`android.yml`). The release uses the Unreleased notes; the build then commits them under the new version (`Changelog: release 1.0.N`). Pull before starting new work.
5. Confirm the release is up and give the user the direct `.apk` link. Tell them to copy it into Chrome itself, because tapping a link in the Claude app opens an in-app browser that stalls on APK downloads.

## Android notes

- Capacitor 8, app id `io.github.erehwon081.wealthtracker`. Version is `1.0.<run number>` (branch builds use up numbers too, so releases skip numbers).
- Signing uses repo secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. The user keeps the keystore backup privately. Every release must use the same key, or updates won't install over the app.
- Plugins are reached as `window.Capacitor.Plugins.<Name>` (no bundler). Backups go through Filesystem + Share because the WebView can't download blobs. The back button closes a panel, then goes Home, then exits.
- The WebView draws behind the system bars. Use `max(env(safe-area-inset-*), var(--safe-area-inset-*))` for insets, and keep `body`'s top padding, which stops the sticky header from covering content.
- The app and website keep separate data; users move between them with a backup.

## Style

- Writing in the UI: plain, specific, Australian English, no jargon.
- Amounts never wrap: `.num` and the last child of `.row` are `nowrap`.
- Respect `prefers-reduced-motion`. Swipe navigation ignores swipes that start on charts, scrollers, `.seg`, inputs or the screen edges.
