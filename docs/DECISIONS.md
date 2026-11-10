# Decisions and open threads

The engineering record for Claude Code chats. `CLAUDE.md` holds the rules; `CHANGELOG.md` holds what the user sees. This file records why things are the way they are, and what is still unfinished. Read it at the start of a chat; update it before the chat ends.

## Open threads

- **Live prices are unverified against a real sheet.** The cloud sandbox blocks docs.google.com, so cross-origin fetches of the published CSV were never tested. The user hasn't yet pasted real links (they once saved three empty boxes). If Refresh prices says "Couldn't reach Google Sheets", try Google's other CSV link format (`/gviz/tq?tqx=out:csv&sheet=<tab>`, which needs link sharing on), or an Apps Script web app returning JSON. Don't add a proxy.
- **Untested on a real phone:** Back up now through the share sheet, the back-button order, status bar icon colour per theme, and vibration. The user has installed the APK and reported layout issues only so far.
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

### Releases
- **Notes come from `CHANGELOG.md`**: the Unreleased section becomes the release notes, then CI commits it under the version. `release-notes.yml` re-syncs every release when the changelog changes on main.

## Log

- **9 Nov 2026**: Built the PWA from the artifact, deployed to Pages. Partner tagging, expected pay, the new look, motion and swipe, the first Android releases (1.0.4, 1.0.6, 1.0.8).
- **10 Nov 2026**: Release notes from the changelog (1.0.10). Added `CLAUDE.md` and this file. The user plans one Claude Code chat per release, grouped in a Claude project.
