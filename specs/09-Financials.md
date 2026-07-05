# 09 — Financials & Transparency

← [Master Spec](./00-Master-Spec.md)

## Purpose

The league chose **full financial transparency** ([Master §5](./00-Master-Spec.md#5-cross-cutting-decisions-the-constitution)): every dollar in and out is public. This spec defines the money model, the public financial views, and how balances are computed from entry counts + admin inputs. Financial figures cross-link from the OLP ([Spec 06](./06-Feature-OLP-Pot.md)) and score-sheet ([Spec 07](./07-Feature-Pool-Score-Sheets.md)) pages.

## 9.1 Money model (from the rules doc)

**Inflows**
- **Tag purchase: $20** → 100% to **Expense Reserves**.
- **League Night entry: $6**, split:
  - **$2.80 → Skins purse**, split **66.67% Pool A / 33.33% Pool B**.
  - **$1.00 → OLP pot.**
  - **$2.20 → Expense Reserves** (remainder; covers PDGA fees, trophies, CTPs, contingencies).
- **League Night Ace pot: $1** → 100% to **Ace pot** (+ backup).

**Pots & funds**
- **Skins purse** (per pool): accumulates the $2.80-per-entry skins component **all season** — no weekly payouts and no mid-season carrying. The **season-end skins match** ([Spec 02 §2.9](./02-Domain-Model-and-Scoring.md#29-skins-match-qualification): 10/3, top-4 point earners per pool) pays out the **entire pool purse**, after which the purse is **zeroed for the year** (nothing carries into next season).
- **OLP pot** (per sub-league): paid 50/30/20 to top 3 ([Spec 06](./06-Feature-OLP-Pot.md)).
- **Ace pot**: funded by a **separate $1 ace-pot buy-in per participating entrant each League Night**, counted **independently** of the $6 paid-entry count (see [§9.2](#92-whats-computed-vs-entered)). Uncapped payout for tag holders (non-holders capped at $50); no payout for aces before the holder's tag purchase; **carries over year to year** (a 2026 opening balance seeds it); won only at League Nights.
- **Expense Reserves**: operating fund; leftover carries into next year's budget (a 2026 opening balance seeds it).
- **CTP**: two $20 CTPs per League Night (one per pool), sponsored by Jersey Discs; **free entry for tag holders**. CTPs are **sponsor-funded and pass through no league cash**, so they are **not part of the financial ledger or fund balances** (noted here only for completeness).

## 9.2 What's computed vs entered

**Admin-entered** ([Spec 10 §10.6](./10-Admin-Console.md#106-financial-inputs)) — real-world cash facts only:
- **Paid entry count per League Night** — recorded by the director each night; the source of truth for cash, **not** derived from PDGA presence.
- **Ace-pot entry count per League Night** — the number of $1 ace buy-ins that night, recorded **separately** from the paid entry count (participation differs).
- **Tag sales** — recorded as dated batches (count + date); each batch is $20 × count → Expense Reserves. Entered directly (not derived from roster size) so it stays the cash source of truth; roster size is only an informal cross-check.
- **2026 opening balances** — carried-over **Ace pot** and **Expense Reserves** only. (OLP pots start at $0 each sub-league; skins purses start at $0 and are zeroed each year, so neither carries an opening balance.)
- **Actual payouts** — OLP paid (per sub-league), the **season-end skins payout** (per pool), and **ace-pot wins** (recipient, amount, date). The director enforces the ace rules on entry (non-holder $50 cap; no win before the recipient's tag purchase).
- **Expenses** — free-form line items against Expense Reserves: amount, date, **category** (PDGA fees / trophies / CTP / contingency / other), and description.

**Computed** from those inputs × the split rules ([§9.1](#91-money-model-from-the-rules-doc)):
- Per-night $6 split: **$2.80 skins** (66.67 % Pool A / 33.33 % Pool B), **$1.00 OLP pot**, **$2.20 Expense Reserves**.
- Per-night ace contributions ($1 × ace entries) and tag-sale contributions ($20 × count).
- Fund balances (below), running balances, and the ledger.

> Entry-count → dollars is deterministic, so once the director records a night's counts the app derives every split automatically. The director records only real-world cash facts (entry counts, ace-entry counts, tag sales, opening balances, payouts, expenses); the app does the arithmetic.

### 9.2.1 Funds

The season's money lives in these funds; **total club cash = the sum of all fund balances**:

| Fund | Opening | Inflow | Outflow |
|---|---|---|---|
| **Expense Reserves** (one) | 2026 carryover | $2.20 × paid entries + $20 × tag sales | expense line items |
| **Ace pot** (one) | 2026 carryover | $1.00 × ace entries | ace-pot wins |
| **OLP pot** (per sub-league) | $0 | $1.00 × paid entries in that sub-league | OLP payouts (50/30/20 to top 3) |
| **Skins purse** (per pool A/B) | $0 | $2.80 × paid entries, split 66.67 / 33.33 | season-end skins payout (whole purse, then zeroed) |

### 9.2.2 Rounding

All money is held in **integer cents**. Every $6 component is a whole number of cents **per entry** (skins 280¢, OLP 100¢, reserves 220¢), and ace ($1 = 100¢) and tag sales ($20 = 2000¢) are exact — so the **only** rounding anywhere is the Pool A / Pool B skins split. That split is computed **per night** by largest-remainder on the night's skins total (280¢ × entries) so that **Pool A + Pool B exactly equals the night's skins pool**, with no drift across the season.

## 9.3 Public financial views

1. **Season financial summary** — the headline **fund balances** plus **total club cash**: Expense Reserves, Ace pot, OLP pot (per sub-league), Skins purse (per pool), and totals for tag sales and paid entries. Each balance is labeled **projected** (season in progress) or **final**, shows a **last-updated** timestamp, and offers a "how this is calculated" disclosure.
2. **Pots detail**
   - **Skins**: per pool — current accumulated purse and (once played) the season-end payout; before then the purse shows as projected.
   - **OLP**: per sub-league pot and projected/final 50-30-20 payouts (mirrors [Spec 06](./06-Feature-OLP-Pot.md)).
   - **Ace pot**: current balance, opening carryover, the $1-per-ace-entry contribution rate, and any recorded wins.
3. **Full ledger** — a chronological, public record of every inflow (tag sales, per-night entry splits, per-night ace contributions) and outflow (OLP payouts, the season-end skins payout, ace wins, expenses), each with a **running total-club-cash balance**. This is a launch requirement. Default granularity is **one row per League Night, expandable to its splits** (skins A, skins B, OLP, reserves, ace contribution). Opening balances appear as the first dated rows. Each entry links back to its source (a League Night, a tag-sale batch, or a recorded payout/expense).

## 9.4 Correctness & display

- Money is stored in **cents** and displayed in dollars; the only rounding is the per-night Pool A/B skins split ([§9.2.2](#922-rounding)), shown consistently.
- Every balance shows its **last-updated** timestamp and whether it's **projected** (season in progress) or **final**. OLP per sub-league goes **final** when that sub-league is marked complete ([Spec 10 §10.3](./10-Admin-Console.md#103-pdga-event-configuration)); skins go final when the season-end payout is recorded.
- Splits must reconcile every night: `paid entries × $6 = skins A + skins B + OLP + reserves` (exact in cents). Ace and tag-sale inflows reconcile separately. **Total club cash = sum of all fund balances** at every point in the ledger.

## Acceptance criteria

- Given N paid League-Night entries, A ace entries, and T tag sales, the app derives skins/OLP/reserve/ace balances matching the rules' splits, in cents.
- The Pool A/B skins split is 66.67/33.33 of the $2.80 component, computed per night so A + B equals the night's skins total exactly (no drift across the season).
- OLP pot per sub-league equals $1 × paid entries in that sub-league (± admin adjustments) and matches the payout figures on the OLP page ([Spec 06](./06-Feature-OLP-Pot.md)).
- Ace pot = opening balance + $1 × total ace entries − recorded ace wins; a win before the recipient's tag purchase, and a non-holder win over $50, are rejected on entry.
- The season-end skins match pays out the entire per-pool purse and zeroes it; nothing carries into the next year.
- The public summary + pot detail + ledger render with provenance, running total-cash balance, and projected/final labels; total club cash equals the sum of fund balances.

← Prev: [08 — Player Profiles](./08-Feature-Player-Profiles.md) · Next: [10 — Admin Console](./10-Admin-Console.md)
