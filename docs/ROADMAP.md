# Roadmap

Planned features, in the order agreed with the user on 10 Nov 2026. Each is its own release with its own changelog notes. Update the status here when one ships, and record design choices in `docs/DECISIONS.md`. Everything stays on the device: no servers, no third-party services.

## 1. Month-end reminder notifications (shipped in 1.0.13, confirmed working on the user's phone)

- Android app only, using `@capacitor/local-notifications`. The website keeps its Home backup reminder, since it can't schedule notifications without a push server.
- Settings > Reminders: a month-end check-in (off, last day, 1st, or a chosen date, plus a time), and a backup reminder (30 days after the last backup). Later: bills due, once item 2 exists.
- Android can't repeat on "the last day of each month", so the app schedules the next 12 dates and re-plans every time it opens. Notifications are inexact (`allowWhileIdle`), so no exact-alarm permission is needed. Tapping a check-in reminder opens Check-in.

## 2. Bills and set-asides

- Forecast next month's recurring charges across all imported months: normalise merchant names, detect monthly, quarterly and yearly gaps, and show the expected date and typical (median) amount. Replaces the current one-month Recurring charges card.
- Yearly bills (sinking funds) gain a due month and a progress bar. Progress either builds a twelfth each month since the bill was last paid, or follows a linked savings account's balance. A matching imported payment resets the bill.
- The single cash goal becomes a list of savings goals: target, optional date, and a linked account or a manual balance.
- Lives in Budget.

## 3. Mortgage what-if (built 10 Nov 2026)

- Loan accounts gain: fixed or variable, fixed-term end date, linked offset account, and rate history (date and rate).
- From Wealth > Property and loans, tap a loan to set an extra monthly repayment, a lump sum and extra money in the offset. It shows the payoff date and total interest before and after, the interest saved, and a balance chart with both lines. It works per split and combined.
- "What the rate change has cost": the rate difference applied to actual month-end balances since the change.

## 4. House ledger (built 10 Nov 2026)

- The property account gains "Costs for this property": chosen categories and payees (mortgage, council rates, building insurance by payee, and a new Home repairs category), plus manual entries for years before the app.
- A Wealth card by financial year: totals for each type of cost, mortgage interest vs principal (estimated from the rate), partner contributions from the mortgage-share transfers, and your net contribution. Feeds the House options numbers.

## 5. Financial year (tax) view (built 10 Nov 2026)

Not done: choosing individual parcels by hand (sales offer oldest first, highest cost first or newest first), and a direct import from the user's sheet (a CSV file import exists; its dividend tab layout is unknown).

- Dividends become individual payments: date, cash, franking %, reinvested units. Franking credit = franked amount × 30/70, or 25/75 for base-rate entities; the rate is set per holding.
- Sales become records (date, units, price, brokerage), matched to purchase parcels oldest first by default, with an option to choose parcels. The 50% CGT discount applies to parcels held over 12 months. Crypto works the same way.
- Invest gains a July–June year picker: cash dividends, franking credits, grossed-up income, discounted and non-discounted gains, losses, and a CSV export. Plus an import of dividend history from the user's sheet.
- Needed well before July 2027.

## 6. Bank import beyond NAB (needed to commercialise)

- OFX, QFX and QIF import first: standard formats that carry the account number and closing balance. Check which Australian banks offer them.
- CSV bank profiles: header signature, column mapping (date, amount or debit/credit, description, balance, account), date format, and a bank-category map. Detected automatically. A "which column is what" screen saves a new profile for any other bank. Profiles are data files, not code.
- Balances, most reliable first: OFX closing balance, running balance column, bank account-list PDF (fragile), manual entry.
- Open banking (the Consumer Data Right) needs an accredited server or a middleman such as Basiq, which breaks the local-only rule. Leave it out, or offer it as an explicit opt-in in a paid version.
- To generalise for other users, replace the user-specific categorising with editable rules seeded with common Australian merchants, turn the partner fields into household members, and remove NAB-specific wording.
