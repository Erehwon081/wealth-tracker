# Changelog

Each Android release on GitHub takes its notes from this file. Add changes under **Unreleased**; when the next APK is published, the build files them under that version number. Editing a released version's notes here updates its GitHub release too.

## Unreleased

### Added
- An Accounts card on Home lists every account with its latest balance, its account number and the date the balance is from. Account numbers are saved from your CSV and OFX files, or type them in under Wealth > edit an account.

### Changed
- CSV is now the recommended bank file. Check-in explains why: it says which account each transaction is from, and gives balances and better categories. OFX works too, and QIF is for when there's nothing else. After a QIF import, the message suggests choosing CSV next time.

### Fixed
- QIF files no longer ask which account they're from every time. The app recognises the account from the card numbers in the file once you've told it, or from transactions it has already saved, and only asks when it can't tell. Purchases on different cards for the same account all go to that account.
- The "Card ending …" line from a QIF is no longer added to each description.

## 1.0.28 (10 Nov 2026)

### Changed
- Messages at the bottom of the screen are back to small bubbles that fit their text, instead of spanning the full width. The "Only this one" button stays readable in dark mode.

## 1.0.26 (10 Nov 2026)

### Changed
- The coloured bar under the Spending totals now fills its full width, with each category's share of the month's spending.

## 1.0.24 (10 Nov 2026)

### Fixed
- Messages at the bottom of the screen now span its full width, with any button on the right.
- The "Only this one" button on the message after changing a category is now readable in dark mode, and the shop name in that message no longer ends with a stray space.

## 1.0.21 (10 Nov 2026)

### Added
- Replace with a fresh import, in Check-in. Choose bank files and they replace what's saved for those accounts and dates, so the app matches your bank exactly. Copies imported twice disappear, and the categories and tags you set are carried across first. You see a summary and confirm before anything changes.
- "Check for duplicates" at the bottom of Spending's transactions finds transactions imported more than once and removes the extra copies after you confirm. It keeps the copy you recategorised or tagged.

### Fixed
- Importing a bank file only adds transactions that are new. Ones already in the app keep the category you gave them, even when a later download formats them a little differently or a pending card purchase has since gone through with a new date.

### Changed
- Changing a transaction's category now remembers it for that shop straight away, so the next import files it the same way. Tap "Only this one" on the message if it was a one-off. Before, it only stuck if you tapped "Yes" within a few seconds.

## 1.0.17 (10 Nov 2026)

### Added
- Import from any bank, not just NAB. Check-in > Import bank files takes CSV, OFX and QIF downloads from internet banking. OFX files also fill in each account's closing balance.
- When a CSV is in a layout the app hasn't seen, it shows the first rows and its best guess at which column is the date, description, amount and balance. You check them and see a preview, and the app remembers that layout so it only asks once. NAB's CSV is recognised straight away, as before.
- New account numbers found in a file ask once to be linked to one of your accounts, added as a new one, or ignored. Files that don't include an account number ask which account they're from.
- Built-in rules sort common Australian shops and billers into categories (Woolworths, Ampol, Telstra, Netflix and many more), for any bank.
- Settings > Importing: edit your own category rules (yours always come first), and see or forget remembered file layouts.
- First-time setup: "Set up" on the welcome screen asks who the app is for and which accounts to track.
- Household setting: choose "Just me" to hide everything about a partner (partner card, partner transactions, partner share and the buy-out option). Your existing setup stays as "Me and a partner".

### Changed
- Check-in's import card is now "Fill in from your bank", with "Import bank files" first. The NAB account list PDF button is still there.
- Wording that assumed NAB now refers to your bank or lender.

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
