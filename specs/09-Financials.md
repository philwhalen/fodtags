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
- **Skins purse** (per pool): funds the weekly/season skins; each skin has a value (~$40 Pool A, ~$20 Pool B); unclaimed remainder carries.
- **OLP pot** (per sub-league): paid 50/30/20 to top 3 ([Spec 06](./06-Feature-OLP-Pot.md)).
- **Ace pot**: uncapped payout for tag holders (non-holders capped at $50); no payout for aces before the holder's tag purchase; carries over year to year; won only at League Nights.
- **Expense Reserves**: operating fund; leftover carries into next year's budget.
- **CTP**: two $20 CTPs per League Night (one per pool), sponsored by Jersey Discs; **free entry for tag holders**.

## 9.2 What's computed vs entered

- **Admin-entered** ([Spec 10](./10-Admin-Console.md)): the **paid entry count per League Night** (recorded by the director each night — the source of truth for cash, not derived from PDGA presence), tag sales count, **opening balances** for 2026 (carried-over ace pot / reserves), **actual payouts** made, ace-pot wins, and skins claimed/carried.
- **Computed** from those admin inputs × the split rules above: skins purse totals per pool, OLP pot per sub-league, ace-pot contributions, expense-reserve contributions, and running balances.

> Entry-count → dollars is deterministic, so once the director records the night's entry count the app derives every split automatically. The director records only real-world cash facts (entries, sales, payouts, opening balances); the app does the arithmetic.

## 9.3 Public financial views

1. **Season financial summary** — headline balances: total tag sales, total entries, Expense Reserves, Ace pot, OLP pot (per sub-league), Skins purse (per pool). Each with a "how this is calculated" disclosure.
2. **Pots detail**
   - **Skins**: per pool, current purse, skin value, amount paid, remainder carried.
   - **OLP**: per sub-league pot and projected/final 50-30-20 payouts (mirrors [Spec 06](./06-Feature-OLP-Pot.md)).
   - **Ace pot**: current balance, contribution rate, and any wins.
3. **Full ledger** — a chronological, public record of every inflow (tag sales, per-night entry splits, ace contributions) and outflow (OLP/skins payouts, ace wins, expenses) with running balances. This is a launch requirement. Default granularity is **one row per League Night, expandable to its splits**. Each entry links back to its source (a League Night, a tag sale, a recorded payout).

## 9.4 Correctness & display

- All money displayed in whole dollars unless a rule produces cents (splits); show rounding consistently with the rules ("rounded as best as possible").
- Every balance shows its **last-updated** timestamp and whether it's **projected** (season in progress) or **final**.
- Splits must reconcile: `entries × $6 = skins + OLP + reserves` for each period (allow documented rounding).

## Acceptance criteria

- Given N League-Night entries and T tag sales, the app derives skins/OLP/reserve/ace balances matching the rules' splits.
- Pool A/B skins split is 66.67/33.33 of the $2.80 component and reconciles to total entries.
- OLP pot per sub-league equals $1 × entries in that sub-league (± admin adjustments), and matches the payout figures on the OLP page.
- Public summary + pot detail render with provenance and projected/final labels.

← Prev: [08 — Player Profiles](./08-Feature-Player-Profiles.md) · Next: [10 — Admin Console](./10-Admin-Console.md)
