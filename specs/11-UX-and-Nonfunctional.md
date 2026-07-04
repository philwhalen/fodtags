# 11 — UX & Non-Functional Requirements

← [Master Spec](./00-Master-Spec.md)

## Purpose

Cross-cutting experience and quality requirements, plus a recommended technical shape and the consolidated open-questions list.

## 11.1 UX requirements

Selected launch priorities ([Master §5](./00-Master-Spec.md#5-cross-cutting-decisions-the-constitution)): **mobile-first, player detail pages, shareable deep links, PDGA-style live look.**

- **Mobile-first:** every view is designed for a phone at the course first; tables collapse gracefully; primary actions reachable one-handed.
- **PDGA-style leaderboards:** familiar ranked-table styling so PDGA Live users feel at home.
- **Deep links:** stable, human-readable URLs for season/scope/pool/sub-league/player (see each feature spec's "Deep links" section). Shared links restore exact state.
- **Navigation:** clear top-level nav across the four core features — Leaderboards, Rounds & Ratings, OLP, Score Sheets — plus Financials, and player search.
- **Explain the number:** consistent access to "how is this calculated" disclosures, honoring the [product principle](./01-Product-Overview-and-Glossary.md#product-principles).
- **Freshness UI:** a consistent "Updated {time} ET", **stale**, and **pending review** treatment across all views ([Spec 04 §4.4](./04-Feature-Leaderboards.md#44-states)).
- **Empty/pre-season states:** show roster at zero rather than errors.

## 11.2 Accessibility

- WCAG AA color contrast; not relying on color alone (e.g., tie/stale markers have text/icon).
- Semantic, screen-reader-friendly tables with proper headers.
- Keyboard navigable; tap targets sized for mobile.

## 11.3 Performance

- Public pages serve **precomputed** snapshots — no PDGA calls or heavy computation on the request path ([Spec 03 §3.7](./03-Data-Ingestion-and-PDGA.md#37-ingestion-pipeline)).
- Fast first paint on mobile networks; leaderboards render quickly with modest payloads.
- Recompute for a full Season completes well within the refresh window.

## 11.4 Reliability & correctness

- **Atomic publish**: a failed/partial refresh never corrupts public views ([Spec 03 §3.8](./03-Data-Ingestion-and-PDGA.md#38-resilience--failure-handling)).
- **Traceability**: every public number traces to source event + round + refresh run.
- **Testable engine**: the scoring/OLP/financial engine ([Spec 02](./02-Domain-Model-and-Scoring.md)) has fixture-based tests reproducing hand calculations (incl. the 81.3 / 81.4 OLP examples).
- **Graceful degradation**: PDGA outage → last good data + stale flags, never wrong numbers.

## 11.5 Security & privacy

- Public site is read-only; all writes require admin auth via **Google sign-in against a director allowlist** ([Spec 10 §10.1](./10-Admin-Console.md#101-access--audit)).
- Server-side-only PDGA access with polite rate limiting ([Spec 03 §3.1](./03-Data-Ingestion-and-PDGA.md#31-known-constraint-pdga-blocks-naive-clients-and-has-no-open-api)).
- Publicly exposing player names / PDGA numbers is **intended and confirmed** (public league; data already public on PDGA).
- Admin actions audited with the acting director's identity.

## 11.6 Data & history

- Model data so **past seasons** can be added later even though launch is 2026-only ([Master §5](./00-Master-Spec.md#5-cross-cutting-decisions-the-constitution)): scope everything by `season/year`, keep raw PDGA snapshots, avoid single-season assumptions in schema.
- Retain refresh-run history and raw PDGA responses for audit/reprocessing.

## 11.7 Recommended technical shape (non-binding)

- **Server-side app** with a scheduled job runner (for the Thursday 9 PM ET refresh + manual trigger) and a persistent store.
- Clear separation: **ingestion** → **normalized store** → **scoring engine (pure, testable)** → **published read model** → **web UI**.
- Headless-browser capability available as a fallback for PDGA's bot protection.
- Hosting/stack TBD with the team; whatever supports scheduled jobs, server-side fetch, and a small admin surface.

> Stack specifics are deliberately left open — this is a PRD, not an architecture doc. Confirm with the build team.

## Decisions log (previously open, now resolved)

Resolved with the league in two clarification rounds. Each sub-spec carries the detail; this is the index.

| Area | Decision |
|---|---|
| Ranking scope ([02](./02-Domain-Model-and-Scoring.md)) | **Per-pool for every event type** (League Night, Podium, Tournament, FOD Open). |
| OLP average ([02](./02-Domain-Model-and-Scoring.md)/[06](./06-Feature-OLP-Pot.md)) | Mean of played rounds; canceled/absent excluded; one decimal. |
| Eligibility ratings ([02](./02-Domain-Model-and-Scoring.md)) | **Official monthly** PDGA ratings gate 900/920; live round ratings shown as unofficial. |
| Tournament cap ([02](./02-Domain-Model-and-Scoring.md)) | Derived from registered tournaments; recomputes across the 3→4 boundary; final at Season end. |
| OLP payout rounding ([02](./02-Domain-Model-and-Scoring.md)/[06](./06-Feature-OLP-Pot.md)) | Largest-remainder so shares sum to the pot. |
| PDGA access ([03](./03-Data-Ingestion-and-PDGA.md)) | No official API at launch; scrape Live + headless fallback; monthly official-rating pull. |
| Round-rating freshness ([03](./03-Data-Ingestion-and-PDGA.md)) | Live/unofficial at Thursday pull; official refreshed monthly (2nd Tue). |
| Event IDs ([03](./03-Data-Ingestion-and-PDGA.md)/[10](./10-Admin-Console.md)) | Admin registers each event ID + type as scheduled. |
| Pools vs divisions ([03](./03-Data-Ingestion-and-PDGA.md)) | Pool is a **league overlay on the roster**, not a PDGA division. |
| Sub-league total ([04](./04-Feature-Leaderboards.md)) | League-Night points + Podium bonus once final. |
| Both-pools view / Δ movement ([04](./04-Feature-Leaderboards.md)) | Not at launch; per-pool only, no delta column. |
| Rounds scope ([05](./05-Feature-Rounds-and-Ratings.md)) | Default League-Night rounds + filter to add Tournament/FOD Open; profiles show all. |
| Non-tag-holders ([05](./05-Feature-Rounds-and-Ratings.md)/[08](./08-Feature-Player-Profiles.md)) | Hidden; no profiles. |
| PDGA membership ([06](./06-Feature-OLP-Pot.md)) | Admin flag on roster. |
| Skins/CTP location ([07](./07-Feature-Pool-Score-Sheets.md)/[09](./09-Financials.md)) | In Financials; score sheet is points-only. |
| Dropped results ([07](./07-Feature-Pool-Score-Sheets.md)) | Collapsed behind "show all" by default. |
| Privacy ([08](./08-Feature-Player-Profiles.md)) | Public full names + PDGA numbers, linking out to PDGA. |
| Financials depth ([09](./09-Financials.md)) | Summary + pot detail **+ full ledger**. |
| Entry counts ([09](./09-Financials.md)/[10](./10-Admin-Console.md)) | Admin-entered per night (cash source of truth). |
| Admin auth ([10](./10-Admin-Console.md)) | Google sign-in against a director allowlist. |
| Publish model ([10](./10-Admin-Console.md)) | Auto-publish with audit; preview deferred. |

## Remaining open questions

Small / deferrable — none blocks starting the build:

- **PDGA scrape signature** ([03](./03-Data-Ingestion-and-PDGA.md)) — the exact request shape that avoids the 403 needs an implementation spike; may need session/cookie priming via the headless path.
- **Mixed-layout par** ([02](./02-Domain-Model-and-Scoring.md)) — confirm "score-to-par" handling if a sub-league mixes layouts within a round set.
- **Ledger granularity** ([09](./09-Financials.md)) — one row per night with sub-splits vs per-pot rows (default: per-night, expandable).
- **Rating-change display** ([05](./05-Feature-Rounds-and-Ratings.md)) — numeric delta vs trend line (default: trend line).
- **Director allowlist** ([10](./10-Admin-Console.md)) — which Google accounts, and the add/remove process.
- **Meta (build-team decisions):** hosting/stack (must support scheduled jobs, server-side fetch, headless fallback, small admin surface); any league branding/visual identity.

← Prev: [10 — Admin Console](./10-Admin-Console.md) · [Master Spec](./00-Master-Spec.md)
