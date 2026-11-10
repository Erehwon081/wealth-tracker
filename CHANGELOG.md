# Changelog

Each Android release on GitHub takes its notes from this file. Add changes under **Unreleased**; when the next APK is published, the build files them under that version number. Editing a released version's notes here updates its GitHub release too.

## Unreleased

## 1.0.15 (10 Nov 2026)

### Added
- Mortgage what-if. In Wealth, tap a loan to try an extra monthly repayment, a one-off lump sum or more money in the offset. It shows the new payoff date, the interest and time you'd save, and a chart of both paths. With more than one home loan, "What if: all home loans" covers them together.
- Loan details. Each loan can now record whether it's fixed or variable, when the fixed term ends, its linked offset account and its rate history. With a rate history, the what-if shows roughly how much more interest a rate change has cost you so far.
- House ledger in Wealth. For each financial year, or all years, it totals what's been paid toward the house: mortgage repayments (with an estimate of interest versus principal), council rates, building insurance and repairs. It then takes off Shonny's contributions to show your net contribution. Under Edit, name your building insurer and add totals for years before the app.
- A new "Home repairs" spending category, which feeds the house ledger.
- Tax year view in Invest. Pick a financial year to see cash dividends, franking credits and grossed-up income, plus capital gains for each parcel sold, with the 50% discount for parcels held over 12 months. Export it as a CSV for your tax return.
- Dividends and sales on each holding. Record each dividend with its franked percentage (and units, if reinvested), and each sale with its price and brokerage. Sales come off your oldest parcels by default; you can choose highest cost first or newest first.
- Import dividends from a CSV with Date, Ticker and Amount columns, and optionally Franking %.

### Changed
- A holding's cost and gain now cover only the parcels you still hold.
- The purchase form's price and brokerage boxes now say what they're for.

## 1.0.13 (10 Nov 2026)

### Added
- Reminder notifications in the Android app (Settings > Reminders). Get a month-end check-in reminder on the last day of the month, the 1st, or a date you choose, at a time you choose. Tapping it opens Check-in. There's also an optional backup reminder 30 days after your last backup. Reminders are set on your phone, and nothing is sent anywhere.

### Changed
- The import card is gone from Spending. Import your CSVs and account list PDF in Check-in.

### Fixed
- On the Home cash flow chart, a negative month's amount no longer sits on top of the month name.
- The last two month labels on the net worth chart no longer crowd together.
- Dragging a finger along a chart no longer brings up Android's copy menu or selects the text below.

## 1.0.10 (10 Nov 2026)

### Changed
- Each release on GitHub now lists what changed in it, taken from CHANGELOG.md.

## 1.0.8 (9 Nov 2026)

### Fixed
- Long amounts stay on one line and right-aligned in every list, so a figure like −$781,066 no longer splits across two lines. The account name or note beside it wraps instead.
- Big figures in the Home and Spending tiles shrink slightly to fit when a number is long.

## 1.0.6 (9 Nov 2026)

### Fixed
- In the Android app, the top bar no longer covers the top of the first card on each screen. The page now starts below the phone's status bar.

## 1.0.4 (9 Nov 2026)

First Android release. It includes everything built so far for the website version.

### Android app
- Installs from the GitHub release and updates in place, keeping your data, because every build is signed with the same key.
- Back up now opens the Android share sheet, so you can save the file to Drive or Files.
- The back button closes an open panel first, then returns to Home, then leaves the app.
- Status bar icons match the light or dark theme, and the layout leaves room for the status and gesture bars.
- The app keeps its own data, separate from the website. Move between them with a backup.

### Look and feel
- New violet theme with light and dark modes. Choose Follow phone, Light or Dark in Settings > Appearance.
- Spending categories have their own icons and colours in Spending, Budget and on each transaction.
- The net worth chart sits in the top card on Home. Drag along it to read any month.
- Sheets slide up and close with a drag down. Tabs slide in, charts draw in and totals count up. Toggles give a short vibration.
- Swipe left or right to move between tabs.
- New violet app icon.

### Features
- Budget > Set pay: enter your take-home pay per month, fortnight or week, and Budget plans from that instead of the pay received so far.
- Mark a purchase on your card as Shonny's. Tagged amounts are taken off your spending and appear under the Shonny's filter.
- Partner categories from older backups, such as "Shonny's card", are recognised.
- Live prices from your Google Sheet's published CSV links, set in Settings.
- Backup and restore, with optional passphrase encryption, plus a reminder on Home after 30 days without a backup.
- Everything is stored on the device. Nothing is sent anywhere except the price sheet requests.

### Fixed
- The bottom bar no longer jumps when you switch tabs.
- Tidier spacing on Check-in, Wealth, Invest and Home.
- Empty price link boxes are obvious, and saving them says no links were entered.
- Amounts show "$1,586" instead of "$1 , 586".
