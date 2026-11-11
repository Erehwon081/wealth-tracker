# Roadmap

Planned features, in the order agreed with the user on 10 Nov 2026. Each is its own release with its own changelog notes. Update the status here when one ships, and record design choices in `docs/DECISIONS.md`. Everything stays on the device: no servers, no third-party services.

## 1. Month-end reminder notifications ✅ Done (1.0.13, confirmed on the user's phone)

- Android app only, using `@capacitor/local-notifications`. The website keeps its Home backup reminder, since it can't schedule notifications without a push server.
- Settings > Reminders: a month-end check-in (off, last day, 1st, or a chosen date, plus a time), and a backup reminder (30 days after the last backup). Later: bills due, once item 2 exists.
- Android can't repeat on "the last day of each month", so the app schedules the next 12 dates and re-plans every time it opens. Notifications are inexact (`allowWhileIdle`), so no exact-alarm permission is needed. Tapping a check-in reminder opens Check-in.

## 2. ~~Bills and set-asides~~ Cancelled

Cancelled by the user on 10 Nov 2026. Don't build it unless they ask again. The original plan is kept below for reference.

- Forecast next month's recurring charges across all imported months: normalise merchant names, detect monthly, quarterly and yearly gaps, and show the expected date and typical (median) amount. Replaces the current one-month Recurring charges card.
- Yearly bills (sinking funds) gain a due month and a progress bar. Progress either builds a twelfth each month since the bill was last paid, or follows a linked savings account's balance. A matching imported payment resets the bill.
- The single cash goal becomes a list of savings goals: target, optional date, and a linked account or a manual balance.
- Lives in Budget.

## 3. Mortgage what-if ✅ Done (released 10 Nov 2026)

- Loan accounts gain: fixed or variable, fixed-term end date, linked offset account, and rate history (date and rate).
- From Wealth > Property and loans, tap a loan to set an extra monthly repayment, a lump sum and extra money in the offset. It shows the payoff date and total interest before and after, the interest saved, and a balance chart with both lines. It works per split and combined.
- "What the rate change has cost": the rate difference applied to actual month-end balances since the change.

## 4. House ledger ✅ Done (released 10 Nov 2026)

- The property account gains "Costs for this property": chosen categories and payees (mortgage, council rates, building insurance by payee, and a new Home repairs category), plus manual entries for years before the app.
- A Wealth card by financial year: totals for each type of cost, mortgage interest vs principal (estimated from the rate), partner contributions from the mortgage-share transfers, and your net contribution. Feeds the House options numbers.

## 5. Financial year (tax) view ✅ Done (released 10 Nov 2026)

Not done: choosing individual parcels by hand (sales offer oldest first, highest cost first or newest first), and a direct import from the user's sheet (a CSV file import exists; its dividend tab layout is unknown).

- Dividends become individual payments: date, cash, franking %, reinvested units. Franking credit = franked amount × 30/70, or 25/75 for base-rate entities; the rate is set per holding.
- Sales become records (date, units, price, brokerage), matched to purchase parcels oldest first by default, with an option to choose parcels. The 50% CGT discount applies to parcels held over 12 months. Crypto works the same way.
- Invest gains a July–June year picker: cash dividends, franking credits, grossed-up income, discounted and non-discounted gains, losses, and a CSV export. Plus an import of dividend history from the user's sheet.
- Needed well before July 2027.

## 6. Bank import beyond NAB ✅ Built 10 Nov 2026 (steps 1–5; NAB is the only built-in bank profile)

Agreed design: (1) OFX/QFX/QIF reader with balances; (2) guided CSV importer that guesses columns, previews, and remembers each layout by its header row; (3) built-in profiles, currently NAB only because no other banks' samples were available; (4) built-in Australian merchant rules under the user's own rules, partner features optional; (5) first-run setup and bank-neutral wording. Selling plan: a paid app on Google Play, no server. Open: built-in profiles for CBA, ANZ, Westpac, ING, Macquarie and Up once scrubbed sample exports are available; a privacy policy page and a Play listing.

- OFX, QFX and QIF import first: standard formats that carry the account number and closing balance. Check which Australian banks offer them.
- CSV bank profiles: header signature, column mapping (date, amount or debit/credit, description, balance, account), date format, and a bank-category map. Detected automatically. A "which column is what" screen saves a new profile for any other bank. Profiles are data files, not code.
- Balances, most reliable first: OFX closing balance, running balance column, bank account-list PDF (fragile), manual entry.
- Open banking (the Consumer Data Right) needs an accredited server or a middleman such as Basiq, which breaks the local-only rule. Leave it out, or offer it as an explicit opt-in in a paid version.
- To generalise for other users, replace the user-specific categorising with editable rules seeded with common Australian merchants, turn the partner fields into household members, and remove NAB-specific wording.

## Added 10 Nov 2026 (order not yet agreed)

Suggested order: 10, 9, 7, 8. The walkthrough goes last because it describes the screens, so it should be written once they've stopped changing.

### 7. Account balances view
- A clearer list of every account's current balance, grouped (everyday and savings, cards, loans, investments, property), with the date each balance is from and where it came from (import, PDF or typed in).
- Each account can store its full account number (and BSB), shown in the view. On the device only, like everything else, and included in backups. Today only the last four digits are kept, as the import match key (`a.match`).
- To decide: where it lives (a card on Home, or the top of Wealth), and whether numbers are masked until tapped.

### 8. Guided walkthrough for new users
- Builds on the existing Set up on the welcome screen. Steps with pop-ups pointing at each tab and its main buttons: setup, importing in Check-in, recategorising in Spending, Budget, Invest, Wealth, Settings and backups.
- Skippable, and can be replayed from Settings. Respects reduced motion.

### 9. Add and remove spending categories
- Categories are fixed in code today (`SPEND_CATS` in `app.js`), with their own icons and colours. Make the spending list editable in Settings: add (name, icon, colour), rename, hide or remove. Flow categories (income, transfers, mortgage, partner) stay fixed, because the app's maths depends on them.
- Removing a category in use asks which category its transactions, rules and budget move to. Renaming updates them. Must stay backup-compatible: older backups use the built-in names.

### 10. Remember which account a QIF file is for ✅ Done (11 Nov 2026)

Recognised by card numbers in the memos (several cards can share one account), or by overlap with saved transactions. The file-name idea wasn't needed.

- QIF files from most banks have no account number, so every import asks. Options, simplest first: recognise the account from transactions already saved (if the file overlaps one account's saved transactions, use it); remember the answer by the file name's pattern; read the account name if the file has an `!Account` block. Check a real (scrubbed) QIF from the user's bank first.

## Ideas from other apps, added 11 Nov 2026

The user's first priority among these: safe-to-spend, the review queue and the app lock. How they rank against items 7 to 9 isn't agreed yet.

### First priority
- **Safe-to-spend.** One number: what's left this month after bills, set-asides and savings. It needs a list of expected bills, which overlaps the cancelled item 2 (bills and set-asides): agree with the user how much of that it needs, for example recurring charges detected from imports, without the sinking-fund screens.
- **Review queue.** New imports land as unreviewed; clear each with one tap (accept the category or change it). Needs a `reviewed` flag on transactions, defaulting to reviewed for existing data.
- **App lock.** Fingerprint or PIN when the Android app opens or returns from the background. Needs a biometric Capacitor plugin; the website can't do this properly.

### Later
- **Cash flow forecast.** The balance projected forward from pay days and recurring bills, as a calendar, so a tight week shows up early.
- **Split a transaction** across categories, and part of it as the partner's.
- **Tags across categories** (a trip, a renovation), each with its total.
- **Rollover budgets.** Money not spent in a category carries into next month. Overlaps item 2's sinking funds.
- **Savings goals** with a target, a date and the monthly amount needed. Also part of the cancelled item 2.
- **Benchmark.** The portfolio's return, dividends included, against an index fund such as VAS or VGS. Needs index prices, which could come from the user's price sheet.
- **Dividend calendar** of expected payments and franking credits.
- **CSV export of everything.**
- **Home screen widget** (Android) showing net worth or safe-to-spend. Needs native code in the generated Android project.
- **Year in review**: biggest categories, savings rate, net worth change, top merchants.
