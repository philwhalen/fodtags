# 11 — UX & Non-Functional Requirements

← [Master Spec](./00-Master-Spec.md)

## Purpose

Cross-cutting experience and quality requirements, plus a recommended technical shape and the consolidated open-questions list.

## 11.1 UX requirements

Selected launch priorities ([Master §5](./00-Master-Spec.md#5-cross-cutting-decisions-the-constitution)): **mobile-first, player detail pages, shareable deep links, PDGA-style live look.**

- **Mobile-first:** every view is designed for a phone at the course first; tables collapse gracefully; primary actions reachable one-handed.
- **PDGA-style leaderboards:** familiar ranked-table styling so PDGA Live users feel at home.
- **Deep links:** stable, human-readable URLs for season/scope/pool/sub-league/player (see each feature spec's "Deep links" section). Shared links restore exact state.
- **Navigation:** clear top-level nav across the four core features — Leaderboards, Rounds & Ratings, OLP, Score Sheets — plus Financials, and **Players** (roster index linking to profiles — [Spec 08 §8.3](./08-Feature-Player-Profiles.md#83-players-roster-index)).
- **Admin auth control (top-right of the header):** an **"Admin login"** button for signed-out visitors, replaced by **"Admin panel"** + **"Logout"** once a director is signed in ([Spec 10 §10.1.1](./10-Admin-Console.md#1011-public-entry-point--session-controls)). It sits apart from the feature nav and follows the same mobile-first, one-handed placement rules as the rest of the header.
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

> Stack specifics are deliberately left open here — this section is the non-binding PRD view; the concrete architecture is settled in [Spec 12](./12-Architecture.md).

← Prev: [10 — Admin Console](./10-Admin-Console.md) · [Master Spec](./00-Master-Spec.md)
