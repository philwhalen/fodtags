# 10 — Admin Console

← [Master Spec](./00-Master-Spec.md)

## Purpose

The private, authenticated area where league directors supply the data PDGA can't, control ingestion, and correct results. Everything the public site shows is derived from PDGA data + the inputs recorded here. Access is restricted to directors ([Master §5](./00-Master-Spec.md#5-cross-cutting-decisions-the-constitution)).

## 10.1 Access & audit

- **Google sign-in gated by a director email allowlist** (small number of directors). No public writes anywhere. Because auth carries a verified identity, every change is attributable to a named director.
- **Every admin change is audited** (who, what, when, before/after). Since the app "computes everything," an override must be attributable and reversible.
- Admin changes trigger (or are picked up by the next) recompute.

## 10.2 Roster & tag management

- CRUD tag holders: name, **tag number**, **pool**, **entry date**, **PDGA number**, **rating at entry**, active flag, PDGA-membership flag.
- Enforce eligibility rules on input ([Spec 02 §2.2](./02-Domain-Model-and-Scoring.md#22-pools--eligibility)): warn if assigning Pool B to a ≥900-rated player; support director placement of unrated players.
- **Pool switches**: recorded with effective date; forfeits pre-switch points (engine honors this) and is flagged as director-approved.
- Tag numbers must be unique (they drive tie-breaks).

## 10.3 PDGA event configuration

- Register the Season's **event sources** ([Spec 03 §3.4](./03-Data-Ingestion-and-PDGA.md#34-event-registration-model)): `pdgaEventId`, `type` (Early/Mid/Late/Tournament/FOD Open), divisions, active flag, label.
- Add tournaments / the FOD Open as they're scheduled.
- Set the **tournament count** context that drives the best-2 vs best-3 cap (or derive from registered tournament events).

## 10.4 Player matching review queue

- Surfaces PDGA entrants that didn't confidently auto-match to a holder ([Spec 03 §3.5](./03-Data-Ingestion-and-PDGA.md#35-player-matching-admin-maps-app-assists)).
- Admin actions: **link** to an existing holder, **create** a holder, or **mark as non-holder** (excluded from points).
- Confirmed links are sticky across future refreshes.
- A count of pending matches is visible and feeds the public data-quality banners.

## 10.5 Manual adjustments & overrides

- **Cancel** a League Night / event ([Spec 02 §2.7](./02-Domain-Model-and-Scoring.md#27-cancellations--partial-events)) → zero points.
- **Tag-not-present** flag on a specific result → excluded from points.
- **Point/result overrides** with a required reason (rare; audited; visible provenance).
- Corrections should be **as-of-dated** where timing matters (ratings, tag numbers, pool).

## 10.6 Financial inputs

Per [Spec 09 §9.2](./09-Financials.md#92-whats-computed-vs-entered):
- Per-League-Night **entry counts** (recorded each night — the cash source of truth, not derived from PDGA), tag sales, opening balances (carried ace pot / reserves).
- Record **actual payouts** (skins claimed, OLP paid), ace-pot wins, skins carried.
- Override any derived balance with a reason.

## 10.7 Ingestion control

- **"Refresh now"** button → runs the full pipeline on demand ([Spec 03 §3.6](./03-Data-Ingestion-and-PDGA.md#36-refresh-cadence)).
- View **refresh run history**: per-source success/failure, counts, new unmatched players, errors.
- Confirmation that the scheduled **Thursday 9 PM ET** job ran; alerting on failure.
- Ability to mark a source active/inactive or stale.

## 10.8 Recompute & publish

- Recompute is **idempotent** and produces an atomically published snapshot ([Spec 03 §3.7](./03-Data-Ingestion-and-PDGA.md#37-ingestion-pipeline)).
- **Default: edits auto-publish** — a refresh or admin change recomputes and atomically publishes the new snapshot (audited, and reversible via the audit trail). A **preview-before-publish** step is a post-launch nice-to-have, not required for launch.

## Acceptance criteria

- A director can register 3 sub-league events + tournaments, build the roster with tag numbers/pools/PDGA#s, resolve unmatched players, and see correct public standings after a refresh.
- Cancelling a League Night zeroes its points everywhere including OLP counts.
- A pool switch forfeits prior points and is reflected after recompute.
- Every override is audited and shows provenance on the public side where relevant.
- "Refresh now" and the scheduled job produce identical results.

← Prev: [09 — Financials](./09-Financials.md) · Next: [11 — UX & Non-Functional](./11-UX-and-Nonfunctional.md)
