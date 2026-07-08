# 10 — Admin Console

← [Master Spec](./00-Master-Spec.md)

## Purpose

The private, authenticated area where league directors supply the data PDGA can't, control ingestion, and correct results. Everything the public site shows is derived from PDGA data + the inputs recorded here. Access is restricted to directors ([Master §5](./00-Master-Spec.md#5-cross-cutting-decisions-the-constitution)).

## 10.1 Access & audit

- **Google sign-in gated by a director email allowlist** (small number of directors). No public writes anywhere. Because auth carries a verified identity, every change is attributable to a named director.
- **Every admin change is audited** (who, what, when, before/after). Since the app "computes everything," an override must be attributable and reversible. This applies in full to **financial writes** (entry counts, ace counts, tag sales, opening balances, payouts, expenses, balance overrides).
- A read-only **audit-log view** lets directors browse and filter this history — the reversibility record for computed overrides.
- Admin changes trigger (or are picked up by the next) recompute.

### 10.1.1 Public entry point & session controls

The admin console has no public link today; a director must know the `/admin` URL. This section makes admin access reachable — and the sign-in state legible — from the **public site header**, without adding any public write surface.

- **Auth control in the header (top-right).** The public shell header ([Spec 11 §11.1](./11-UX-and-Nonfunctional.md#111-ux-requirements)) carries a small auth control in its top-right, on every public page:
  - **Signed out (the default for all visitors):** a single **"Admin login"** button. It is intentionally visible to everyone — the private area is gated by auth, not by hiding the door.
  - **Signed in as a director:** the button is replaced by two controls — **"Admin panel"** (navigates to the existing admin console at `/admin`) and **"Logout"** (ends the session and returns to the public site).
- **Login flow.** "Admin login" sends the visitor to Google sign-in (the built-in Auth.js sign-in page). On success the director lands **directly in the admin console (`/admin`)** — i.e. the sign-in `callbackUrl` is `/admin`, not the page they came from. The existing `directors` **allowlist gate is unchanged**: it is the same `signIn` check that already rejects non-directors before any session exists.
- **Rejection.** A Google account **not** on the director allowlist is denied at the allowlist gate and sees the **standard Auth.js "AccessDenied" error page**. There is no "signed-in non-director" state — a rejected user simply remains a public visitor.
- **One unified auth control.** The admin area uses the **same** header auth control as the public site (showing "Admin panel"/"Logout" for the signed-in director) rather than a separate, differently-styled "Sign out" button. Sign-in state and the logout action look and behave identically everywhere in the app.
- **No new authorization surface.** This is a discoverability/affordance change only. Middleware still gates `/admin/*` and `/api/admin/*`; the button merely exposes the sign-in entry point and reflects session state. A director who is already signed in and visits `/admin` directly is unaffected.

## 10.2 Roster & tag management

- CRUD tag holders: name, **initial tag number**, **pool**, **entry date**, **PDGA number**, **rating at entry**, active flag, PDGA-membership flag, **confirmed flag**.
- Enforce eligibility rules on input ([Spec 02 §2.2](./02-Domain-Model-and-Scoring.md#22-pools--eligibility)): warn if assigning Pool B to a ≥900-rated player; support director placement of unrated players.
- **Pool switches**: recorded with effective date; forfeits pre-switch points (engine honors this) and is flagged as director-approved.
- **Provisional (auto-added) holders** ([Spec 03 §3.5](./03-Data-Ingestion-and-PDGA.md#35-player-matching--auto-add-app-bootstraps-admin-confirms)) appear in the roster as `confirmed = false` with **no tag number**; they are resolved through the player review & confirmation queue (§10.4), which is the primary place a director confirms/edits them.
- **Initial vs current tag.** Because tags are **reassigned every League Night** ([Spec 02 §2.10](./02-Domain-Model-and-Scoring.md#210-tag-numbers--nightly-reassignment)), the roster field a director **edits** is the **initial tag** (the number as bought in). The holder's **current tag** — their latest tag-out — is **derived** from the tag history and shown **read-only** beside it. Nightly changes are managed in [§10.9](#109-tag-assignments--history), not here.
- Initial tag number is **optional** (a provisional holder has none until assigned) but must be **unique when present** — tags drive tie-breaks ([Spec 02 §2.6](./02-Domain-Model-and-Scoring.md#26-tie-breakers)). A holder holding no tag sorts last in tie-breaks.

## 10.3 PDGA event configuration

- Register the Season's **event sources** ([Spec 03 §3.4](./03-Data-Ingestion-and-PDGA.md#34-event-registration-model)): `pdgaEventId`, `type` (Early/Mid/Late/Tournament/FOD Open), divisions, active flag, label.
  - **Smart `type` default.** The registration form pre-selects the `type` most likely to be correct, so a director doesn't silently mis-file a sub-league event — e.g. registering the Early league as a `Tournament`, which attributes none of its rounds to the Early sub-league and leaves the Early leaderboard empty ([Spec 03 §3.4](./03-Data-Ingestion-and-PDGA.md#34-event-registration-model): attribution keys off the source `type`). The default is the **earliest unfilled sub-league slot** — the first of **Early → Mid → Late** for which **no source of that type yet exists this Season** (counting sources **active *or* inactive**: a slot, once registered, stays filled even if that source is later deactivated). Once **all three** sub-league slots are filled, the default becomes **Tournament**. **FOD Open is never auto-selected** — it is always an explicit manual choice. The default is only the form's initial selection and is **fully overridable**: the director may register any `type` regardless of the default.
- For **sub-leagues** (Early/Mid/Late): set the **start and end dates** that bound the sub-league window (they drive current-sub-league selection and the OLP "last day" rating), plus a **"Mark complete"** action that **finalizes** the sub-league — folding in the computed Podium bonus ([Spec 02 §2.4.1](./02-Domain-Model-and-Scoring.md#241-league-podium--computed-bonus)) and flipping OLP payouts from projected to final ([Spec 06 §6.4](./06-Feature-OLP-Pot.md#64-freshness--correctness)).
- Add tournaments / the FOD Open as they're scheduled.
- Set the **tournament count** context that drives the best-2 vs best-3 cap (or derive from registered tournament events).

## 10.4 Player review & confirmation queue

This queue has two kinds of entries, both keyed by PDGA number and both surfaced from ingestion ([Spec 03 §3.5](./03-Data-Ingestion-and-PDGA.md#35-player-matching--auto-add-app-bootstraps-admin-confirms)). Exact-PDGA-number and unique-normalized-name entrants auto-link and never appear here.

**A. Provisional holders awaiting confirmation** — new entrants (PDGA # present, zero holder matches) that the app **auto-added** as provisional holders. They already score, flagged pending. The queue is a **streamlined confirmation screen**, not a data-entry form: it shows the scrape-seeded record (name, PDGA #, entry date, seeded rating, PDGA-membership, round count so far) and offers three actions:
  - **Confirm** — accept the record and set the two things the scrape can't supply: **pool** (defaulted A; the <900-at-entry Pool B warning from §10.2 applies) and **tag number** (optional — leave blank if the physical tag isn't bought yet; unique when set). The director may also correct name / entry date / rating in the same step. Sets `confirmed = true` and clears the pending marker.
  - **Merge into existing holder** — the entrant is actually an existing holder (name changed, PDGA # not previously on file). Links the PDGA # to the chosen holder, **re-points the provisional record's results** to that holder, and removes the provisional record. (This is the "link" action for a mistakenly-auto-added record.)
  - **Exclude (mark as non-holder)** — the entrant is a guest, not a league member. Removes the provisional record from scoring, reverts its results to a minimal non-holder record, and records a sticky "non-holder" decision so it doesn't re-add next week.

**B. Entrants needing a link decision** — **ambiguous** (2+ name matches) and **PDGA-less** entrants, which are **not** auto-added. Admin actions as before: **link** to an existing holder, **create** a holder, or **mark as non-holder**.

- **All resolutions are sticky** across future refreshes (keyed by PDGA number) — including auto-add, confirm, merge, link, and non-holder — so nothing re-queues or re-adds every week.
- A count of pending items (provisional-to-confirm + link-decisions) is visible and feeds the public data-quality banners ([Spec 04 §4.4](./04-Feature-Leaderboards.md#44-states)).

## 10.5 Manual adjustments & overrides

- **Cancel** a League Night / event ([Spec 02 §2.7](./02-Domain-Model-and-Scoring.md#27-cancellations--partial-events)) → zero points.
- **Tag-not-present** flag on a specific result → excluded from points.
- **Point/result overrides** with a required reason (rare; audited; visible provenance).
- Corrections should be **as-of-dated** where timing matters (ratings, tag numbers, pool).

## 10.6 Financial inputs

Per [Spec 09 §9.2](./09-Financials.md#92-whats-computed-vs-entered) — the director records real-world cash facts; the app computes the splits and balances:
- Per-League-Night **paid entry count** (the cash source of truth, not derived from PDGA presence).
- Per-League-Night **ace-pot entry count** — the number of $1 ace buy-ins that night, entered **separately** from paid entries.
- **Tag sales** as dated batches (count + date) → $20 each into Expense Reserves.
- **2026 opening balances**: carried-over **Ace pot** and **Expense Reserves**.
- **Actual payouts**: OLP paid (per sub-league), the **season-end skins payout** (per pool, whole purse then zeroed), and **ace-pot wins**. On an ace win the console enforces the rules — **non-holder wins capped at $50** and **no win before the recipient's tag purchase** ([Spec 09 §9.1](./09-Financials.md#91-money-model-from-the-rules-doc)).
- **Expenses** against Expense Reserves as line items: amount, date, category (PDGA fees / trophies / CTP / contingency / other), description.
- **Override** any derived balance with a required reason (audited).

## 10.7 Ingestion control

- **"Refresh now"** button → runs the full pipeline on demand ([Spec 03 §3.6](./03-Data-Ingestion-and-PDGA.md#36-refresh-cadence)).
- View **refresh run history**: per-source success/failure, counts, new unmatched players, errors.
- Confirmation that the scheduled **Thursday 9 PM ET** job ran; alerting on failure.
- Ability to mark a source active/inactive or stale.

## 10.8 Recompute & publish

- Recompute is **idempotent** and produces an atomically published snapshot ([Spec 03 §3.7](./03-Data-Ingestion-and-PDGA.md#37-ingestion-pipeline)).
- **Default: edits auto-publish** — a refresh or admin change recomputes and atomically publishes the new snapshot (audited, and reversible via the audit trail). A **preview-before-publish** step is a post-launch nice-to-have, not required for launch.

## 10.9 Tag assignments & history

The workspace for the nightly tag reassignment ([Spec 02 §2.10](./02-Domain-Model-and-Scoring.md#210-tag-numbers--nightly-reassignment)). By default the engine **computes** each League Night's handout from that night's scores + tag-ins; this section is where a director **reviews** those computed assignments and **records what physically happened** when it differed — including **seeding the real historical tag→holder record** the league already has on paper (the reconciliation goal).

- **Per-night view.** For a selected League Night, a table of the participating holders showing **tag-in → tag-out**, the holder's finish among the combined field, and whether each tag-out is **computed** or an **override**. Non-participants (absent / tag-not-present) are listed as unchanged.
- **Override entry.** A director can set the night's tag-outs to the observed values. Overrides are validated as a **permutation** of that night's tag-ins (each returned tag assigned exactly once) and **rejected otherwise**, with a clear error. An override for a night **propagates forward**: it changes the tag-in of every affected holder's next night, which recompute re-resolves.
- **Season timeline.** A per-holder history (every night's tag-in/tag-out) and the derived **current tag**, so a director can trace how any holder's number moved.
- **Audited.** Every override is written to the audit log (who / what / when / before-after — §10.1) and triggers recompute (§10.8). Editing a holder's **initial tag** (§10.2) is the way to correct the *start* of their sequence; overrides correct individual nights.
- **Cancelled nights** (§2.7 / §10.5) perform no reassignment by default; the per-night view reflects this, and a director may still override if a reshuffle actually occurred.

## Acceptance criteria

- A director can register 3 sub-league events + tournaments, build the roster with initial tag numbers/pools/PDGA#s, resolve unmatched players, and see correct public standings after a refresh.
- The roster edits a holder's **initial tag** and shows their **current tag** (latest tag-out) read-only; initial tags are unique when present.
- For a League Night, the tag-assignment view shows each holder's **tag-in → tag-out** and marks computed vs overridden; entering an override that is **not** a valid permutation of that night's tag-ins is rejected, and a valid override wins over the computed handout, is audited, and re-flows to later nights on recompute.
- A brand-new PDGA entrant (PDGA # present, no holder match) is **auto-added as a provisional holder** on refresh, scores from its first round with a "pending confirmation" marker, and appears in the review queue; **confirming** it (setting pool + optional tag number) clears the marker, while **merge** or **exclude** removes the provisional record and re-points/reverts its results. All four outcomes are sticky.
- Cancelling a League Night zeroes its points everywhere including OLP counts.
- A pool switch forfeits prior points and is reflected after recompute.
- Recording a night's paid + ace entry counts, tag sales, opening balances, payouts, and expenses produces the correct fund balances and ledger ([Spec 09](./09-Financials.md)); an ace win that violates the $50 non-holder cap or predates the recipient's tag purchase is rejected.
- Every override is audited, browsable in the audit-log view, and shows provenance on the public side where relevant.
- "Refresh now" and the scheduled job produce identical results.
- From any public page, a signed-out visitor sees an **"Admin login"** button top-right; clicking it and signing in with an allowlisted Google account lands directly in `/admin`, after which every page shows **"Admin panel"** + **"Logout"** instead. A non-allowlisted Google account is denied at the allowlist gate (standard AccessDenied), and **"Logout"** returns to the public site as a signed-out visitor.

← Prev: [09 — Financials](./09-Financials.md) · Next: [11 — UX & Non-Functional](./11-UX-and-Nonfunctional.md)
