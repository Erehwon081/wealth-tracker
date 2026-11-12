# Roadmap

Every planned feature, numbered and grouped by what it does. Renumbered on 12 Nov 2026; "was N" gives the old number, which older log entries in `docs/DECISIONS.md` use. Each feature is its own release with its own changelog notes. Update the status here when one ships, keep the Roadmap section of `README.md` in step, and record design choices in `docs/DECISIONS.md`. Everything stays on the device: no servers, no third-party services.

## Suggested build order

Agreed in outline on 11 Nov 2026: 8, 9, then 3 alongside 7, then 23. The user chose to build 3 and 7 first (done 12 Nov 2026). Done items are struck through.

Remaining: 8, 9, then 23 (it can go in any time), then 24 last, because it describes the screens and should be written once they've stopped changing. Everything marked Later comes after these, in no agreed order.

| # | Feature | Status |
|---|---------|--------|
| ~~1~~ | ~~Bank import beyond NAB~~ | Built (NAB is the only built-in profile) |
| ~~2~~ | ~~Remember which account a QIF file is for~~ | Done |
| ~~3~~ | ~~Review queue~~ | Done |
| 4 | Split a transaction | Later |
| 5 | Tags across categories | Later |
| 6 | CSV export of everything | Later |
| ~~7~~ | ~~Add and remove spending categories~~ | Done |
| 8 | Recurring charges you can edit | First priority |
| 9 | Safe-to-spend | First priority |
| 10 | Cash flow forecast | Later |
| 11 | Rollover budgets | Later |
| 12 | Savings goals | Later |
| ~~13~~ | ~~Bills and set-asides~~ | Cancelled |
| ~~14~~ | ~~Account balances view~~ | Done |
| 15 | Year in review | Later |
| 16 | Home screen widget | Later |
| ~~17~~ | ~~Mortgage what-if~~ | Done |
| ~~18~~ | ~~House ledger~~ | Done |
| ~~19~~ | ~~Financial year (tax) view~~ | Done (two parts left) |
| 20 | Benchmark against an index fund | Later |
| 21 | Dividend calendar | Later |
| ~~22~~ | ~~Month-end reminder notifications~~ | Done |
| 23 | App lock | First priority |
| 24 | Guided walkthrough for new users | Last |

## Importing and transactions

### ~~1. Bank import beyond NAB~~ (was 6) ✅ Built 10 Nov 2026 (steps 1–5; NAB is the only built-in bank profile)

Agreed design: (1) OFX/QFX/QIF reader with balances; (2) guided CSV importer that guesses columns, previews, and remembers each layout by its header row; (3) built-in profiles, currently NAB only because no other banks' samples were available; (4) built-in Australian merchant rules under the user's own rules, partner features optional; (5) first-run setup and bank-neutral wording. Selling plan: a paid app on Google Play, no server. Open: built-in profiles for CBA, ANZ, Westpac, ING, Macquarie and Up once scrubbed sample exports are available; a privacy policy page and a Play listing.

- OFX, QFX and QIF import first: standard formats that carry the account number and closing balance. Check which Australian banks offer them.
- CSV bank profiles: header signature, column mapping (date, amount or debit/credit, description, balance, account), date format, and a bank-category map. Detected automatically. A "which column is what" screen saves a new profile for any other bank. Profiles are data files, not code.
- Balances, most reliable first: OFX closing balance, running balance column, bank account-list PDF (fragile), manual entry.
- Open banking (the Consumer Data Right) needs an accredited server or a middleman such as Basiq, which breaks the local-only rule. Leave it out, or offer it as an explicit opt-in in a paid version.
- To generalise for other users, replace the user-specific categorising with editable rules seeded with common Australian merchants, turn the partner fields into household members, and remove NAB-specific wording.

### ~~2. Remember which account a QIF file is for~~ (was 10) ✅ Done (11 Nov 2026)

Recognised by card numbers in the memos (several cards can share one account), or by overlap with saved transactions. The file-name idea wasn't needed.

- QIF files from most banks have no account number, so every import asks. Options, simplest first: recognise the account from transactions already saved (if the file overlaps one account's saved transactions, use it); remember the answer by the file name's pattern; read the account name if the file has an `!Account` block. Check a real (scrubbed) QIF from the user's bank first.

### ~~3. Review queue~~ ✅ Done (12 Nov 2026)

Built as a To review card at the top of Spending, with Looks right per transaction and Accept all. Imported rows carry `review: true`; anything without it counts as reviewed.

- New imports land as unreviewed; clear each with one tap (accept the category or change it). Needs a `reviewed` flag on transactions, defaulting to reviewed for existing data.

### 4. Split a transaction (later)
- Across categories, and part of it as the partner's.

### 5. Tags across categories (later)
- A trip or a renovation, for example, each with its total.

### 6. CSV export of everything (later)

## Spending, bills and budgets

### ~~7. Add and remove spending categories~~ (was 9) ✅ Done (12 Nov 2026)

Built in Settings > Importing > Edit spending categories: add (name, icon, colour), rename, hide, or remove into another category.

- Categories are fixed in code today (`SPEND_CATS` in `app.js`), with their own icons and colours. Make the spending list editable in Settings: add (name, icon, colour), rename, hide or remove. Flow categories (income, transfers, mortgage, partner) stay fixed, because the app's maths depends on them.
- Removing a category in use asks which category its transactions, rules and budget move to. Renaming updates them. Must stay backup-compatible: older backups use the built-in names.

### 8. Recurring charges you can edit (first priority)
- Spending's Recurring charges card is worked out from one month's transactions and can't be changed, so it lists everyday shops (supermarkets, petrol) as recurring. Let the user add, edit and remove recurring charges (name, amount, how often, next date), with detected ones only suggested until confirmed. This is the bills list that 9 and 10 need, so build it with or before them.

### 9. Safe-to-spend (first priority)
- One number: what's left this month after bills, set-asides and savings. It needs the bills list from 8, which overlaps the cancelled 13: agree with the user how much of that it needs, for example recurring charges detected from imports, without the sinking-fund screens.

### 10. Cash flow forecast (later)
- The balance projected forward from pay days and recurring bills, as a calendar, so a tight week shows up early. Needs 8.

### 11. Rollover budgets (later)
- Money not spent in a category carries into next month. Overlaps 13's sinking funds.

### 12. Savings goals (later)
- A target, a date and the monthly amount needed. Also part of the cancelled 13.

### 13. ~~Bills and set-asides~~ (was 2) Cancelled

Cancelled by the user on 10 Nov 2026. Don't build it unless they ask again. Parts of it live on in 8, 9, 11 and 12. The original plan is kept below for reference.

- Forecast next month's recurring charges across all imported months: normalise merchant names, detect monthly, quarterly and yearly gaps, and show the expected date and typical (median) amount. Replaces the current one-month Recurring charges card.
- Yearly bills (sinking funds) gain a due month and a progress bar. Progress either builds a twelfth each month since the bill was last paid, or follows a linked savings account's balance. A matching imported payment resets the bill.
- The single cash goal becomes a list of savings goals: target, optional date, and a linked account or a manual balance.
- Lives in Budget.

## Accounts and the big picture

### ~~14. Account balances view~~ (was 7) ✅ Done (11 Nov 2026)

Built as an Accounts card on Home, at the user's request: everyday accounts only (cash, offset, cards), each with its latest balance, account number (saved from CSV and OFX files, or typed in) and the date the balance is from. Numbers show the last 4 digits until Show numbers is tapped (not remembered).

- A clearer list of every account's current balance, grouped (everyday and savings, cards, loans, investments, property), with the date each balance is from and where it came from (import, PDF or typed in).
- Each account can store its full account number (and BSB), shown in the view. On the device only, like everything else, and included in backups. Today only the last four digits are kept, as the import match key (`a.match`).

### 15. Year in review (later)
- Biggest categories, savings rate, net worth change, top merchants.

### 16. Home screen widget (later)
- Android, showing net worth or safe-to-spend. Needs native code in the generated Android project.

## Property and loans

### ~~17. Mortgage what-if~~ (was 3) ✅ Done (released 10 Nov 2026)

- Loan accounts gain: fixed or variable, fixed-term end date, linked offset account, and rate history (date and rate).
- From Wealth > Property and loans, tap a loan to set an extra monthly repayment, a lump sum and extra money in the offset. It shows the payoff date and total interest before and after, the interest saved, and a balance chart with both lines. It works per split and combined.
- "What the rate change has cost": the rate difference applied to actual month-end balances since the change.

### ~~18. House ledger~~ (was 4) ✅ Done (released 10 Nov 2026)

- The property account gains "Costs for this property": chosen categories and payees (mortgage, council rates, building insurance by payee, and a new Home repairs category), plus manual entries for years before the app.
- A Wealth card by financial year: totals for each type of cost, mortgage interest vs principal (estimated from the rate), partner contributions from the mortgage-share transfers, and your net contribution. Feeds the House options numbers.

## Investing and tax

### ~~19. Financial year (tax) view~~ (was 5) ✅ Done (released 10 Nov 2026)

Not done: choosing individual parcels by hand (sales offer oldest first, highest cost first or newest first), and a direct import from the user's sheet (a CSV file import exists; its dividend tab layout is unknown).

- Dividends become individual payments: date, cash, franking %, reinvested units. Franking credit = franked amount × 30/70, or 25/75 for base-rate entities; the rate is set per holding.
- Sales become records (date, units, price, brokerage), matched to purchase parcels oldest first by default, with an option to choose parcels. The 50% CGT discount applies to parcels held over 12 months. Crypto works the same way.
- Invest gains a July–June year picker: cash dividends, franking credits, grossed-up income, discounted and non-discounted gains, losses, and a CSV export. Plus an import of dividend history from the user's sheet.
- Needed well before July 2027.

### 20. Benchmark against an index fund (later)
- The portfolio's return, dividends included, against an index fund such as VAS or VGS. Needs index prices, which could come from the user's price sheet.

### 21. Dividend calendar (later)
- Expected payments and franking credits.

## The app itself

### ~~22. Month-end reminder notifications~~ (was 1) ✅ Done (1.0.13, confirmed on the user's phone)

- Android app only, using `@capacitor/local-notifications`. The website keeps its Home backup reminder, since it can't schedule notifications without a push server.
- Settings > Reminders: a month-end check-in (off, last day, 1st, or a chosen date, plus a time), and a backup reminder (30 days after the last backup). Later: bills due, now that 8 is planned.
- Android can't repeat on "the last day of each month", so the app schedules the next 12 dates and re-plans every time it opens. Notifications are inexact (`allowWhileIdle`), so no exact-alarm permission is needed. Tapping a check-in reminder opens Check-in.

### 23. App lock (first priority)
- Fingerprint or PIN when the Android app opens or returns from the background. Needs a biometric Capacitor plugin; the website can't do this properly.

### 24. Guided walkthrough for new users (was 8)
- Builds on the existing Set up on the welcome screen. Steps with pop-ups pointing at each tab and its main buttons: setup, importing in Check-in, recategorising in Spending, Budget, Invest, Wealth, Settings and backups.
- Skippable, and can be replayed from Settings. Respects reduced motion.
