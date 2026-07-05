# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state: specs only, no code yet

This repo currently contains **only the specifications** under `specs/`. There is no `src/`, no `package.json`, no build tooling — the application has not been scaffolded. The first coding task is the **walking skeleton** defined in [`specs/12-Architecture.md` §12.13](./specs/12-Architecture.md). Read the relevant spec before writing code; the specs are the source of truth and should be kept in sync when decisions change.

## What this project is

The **FOD Tags Aggregator** is a read-only web app for a season-long, tag-holder disc golf league (Field of Dreams Club Championship). It replaces a hand-maintained Google Sheet with a **computation engine**: it ingests raw round data scraped from PDGA Live, applies the league's published scoring rules, and serves always-current standings, ratings, OLP pot leaders, and financials on a mobile-first public site. A Google-auth-gated admin console supplies the data PDGA can't (roster, tag numbers, pots, adjustments) and triggers refreshes.

Key framing: **the app computes results; it does not mirror the Sheet.** Public reads serve a precomputed, atomically-published read model and never touch PDGA or recompute on the fly.

## How you author features in this project

This project follows a STRICT spec-driven development workflow. Always follow it. Ask the user if you think you should deviate — never deviate on your own.

**When this applies.** The full workflow is required for **any change to user-visible product behavior** — new features, changes to existing features, and bug fixes whose correct resolution changes documented behavior. Work that does **not** change product behavior is done **directly, without this workflow**: bug fixes that restore already-specified behavior, refactors and cleanup, tooling/CI/dependency changes, and the initial **walking-skeleton scaffold** ([`specs/12-Architecture.md` §12.13](./specs/12-Architecture.md)). When unsure whether a change is behavioral, ask.

The four stages, each with a **hard stop** for review:

1. **Specify.** Act as a product-requirements expert. Amend the existing numbered `specs/` files **in place** (git shows the diff — do not create parallel "change" docs) to comprehensively define the feature in light of the existing product definition. Ask lots of questions about product intent, and surface any interactions between the new and existing spec content. **Then write the spec changes, post a summary, and STOP** — wait for the user's explicit "proceed" before planning.

2. **Plan.** Act as a senior architect turning the spec changes into an implementation plan. Use a **master-checklist-with-sub-plans** structure: `plans/<feature>/00-master.md` (the checklist) plus `plans/<feature>/NN-*.md` sub-plans, broken into small, independently testable chunks. These chunks describe modular, self-contained units of work — **implement them inline yourself; do not spawn subagents unless the user explicitly asks.** The master plan should always attempt to **track token usage/cost for its own execution** — record per-chunk (and total) token/cost figures in the master plan as implementation proceeds, so each feature carries an accounting of what it cost to build. Ask lots of questions about how product intent should translate to technical implementation. If planning uncovers details that warrant product changes, **return to stage 1** and update the specs first. **Then write the plan files, post a summary, and STOP** — wait for the user's explicit "proceed" before implementing.

3. **Implement & test.** Execute the master plan, writing and running tests per its checklist. Keep the master plan updated with progress notes as you go — especially any deviations or on-the-fly adjustments from the approved plan.

   **Model selection for sub-plan implementation.** Sub-plans are deliberately small, self-contained, and well-specified — so **prefer a cheaper model to implement them**: in Claude Code, spawn **Sonnet** sub-agents (one per sub-plan); in Cursor, use **Composer 2.5**. Reserve the more expensive orchestrating model (Opus) for planning, cross-chunk judgment, verification between chunks, and reconciling deviations. Still **only spawn sub-agents when the user has asked for it** (per stage 2); when spawning is authorized, default to the cheaper model, **test and verify between each sub-plan** at the orchestrating level, and **record the model/cost basis** used for each chunk in the master plan's token/cost accounting.

4. **User acceptance.** The user tests the feature and either iterates or accepts. **On acceptance:** **archive the master plan** — move `plans/<feature>/00-master.md` (with its token/cost accounting intact) into `plans/completed/` — then **delete the feature's sub-plans** (the ephemeral `plans/<feature>/NN-*.md` files and the now-empty `plans/<feature>/` directory), and commit the feature. Do not commit before acceptance.

## The specs (read these first)

Start at [`specs/00-Master-Spec.md`](./specs/00-Master-Spec.md) — the entry point, with the "constitution" of cross-cutting decisions in §5. Then, by task:

- [`specs/02-Domain-Model-and-Scoring.md`](./specs/02-Domain-Model-and-Scoring.md) — **the computation contract.** Pools/eligibility, points tables, top-N caps, tie-breakers, OLP formula, cancellations. Implement faithfully; it is independently testable.
- [`specs/03-Data-Ingestion-and-PDGA.md`](./specs/03-Data-Ingestion-and-PDGA.md) — scraping, event registration, player↔holder matching, refresh cadence, resilience.
- [`specs/12-Architecture.md`](./specs/12-Architecture.md) — **the technical plan.** Runtime, layering, data layer, jobs, project structure, and the walking-skeleton checklist.
- `specs/04`–`09` — the four core features (leaderboards, rounds & ratings, OLP pot, score sheets), plus player profiles and financials.
- [`specs/10-Admin-Console.md`](./specs/10-Admin-Console.md), [`specs/11-UX-and-Nonfunctional.md`](./specs/11-UX-and-Nonfunctional.md) — admin surface; UX/performance/accessibility.

## Architecture (as decided in spec 12 — not yet built)

Single full-stack **Next.js (App Router)** app, TypeScript strict, one Node process on a Google Cloud VM behind existing nginx. **SQLite** (WAL mode, single file under `DATA_DIR`) via **Drizzle ORM** + `better-sqlite3`. In-process timezone-aware scheduler (`croner`). Auth via **Auth.js** Google OAuth against a `directors` email allowlist. Vitest for tests. `output: 'standalone'` build.

Data flows **one way** through layered modules under `src/server/`:

```
PDGA ──► ingestion (I/O) ──► db/normalized store (Drizzle) ──► engine (PURE) ──► readmodel (published) ──► app/ (SSR)
                                      ▲
                            admin inputs (roster, financials, overrides)
```

Non-negotiable boundary rules to preserve when implementing:

- **The engine is pure.** `src/server/engine/` (scoring, OLP, financial math) is plain-inputs → plain-outputs: **no I/O, no clock, no DB, no `fetch`, no Next.js imports.** This is what makes the hand-calculation acceptance criteria testable.
- **Public reads never recompute or touch PDGA.** `app/(public)` reads only from `readmodel`. A refresh runs normalize → engine → write a **new read-model version** → flip the current-version pointer in a **single SQLite transaction**, so readers never see a partial/failed refresh.
- **Server-only means server-only.** PDGA access, secrets, and the DB live under `src/server/` and never reach the client bundle (enforce with `import 'server-only'`).
- **Season-scoped from day one.** Every domain table carries `seasonYear` (2026 at launch); model so past seasons can be added later without reshaping the schema.
- **Manual "Refresh now" and the scheduled refresh call the *same* pipeline function** with a single-flight guard; each run recorded in `refresh_runs`.

## Testing priorities (once code exists)

Vitest. The **engine unit tests are the priority** — fixture in → expected out, reproducing hand calculations. Two OLP worked examples must compute exactly: `85.3 + 5 − 7 − 2 = 81.3` and `93.7 − 3.3 − 6 − 3 = 81.4` (see spec 02 §2.8). Plus a pipeline integration test: stub PDGA source → run → published read model → page renders empty roster. CI runs typecheck → lint → test → `next build`.

## Model pricing reference (public API list prices, per 1M tokens)

For the master-plan token/cost accounting each feature carries. Sourced from
[Cursor Models & Pricing](https://cursor.com/docs/models-and-pricing) (recorded 2026-07-05; verify before relying on it).

| Model | Input | Cache read | Output |
|-------|-------|-----------|--------|
| **Composer 2.5** (standard) | $0.50 | $0.20 | $2.50 |
| **Composer 2.5 Fast** | $3.00 | — | $15.00 |
| Composer 2 (standard) | $0.50 | $0.20 | $2.50 |
| Composer 2 Fast | $1.50 | $0.35 | $7.50 |
| Composer 1.5 | $3.50 | $0.35 | $17.50 |
| Composer 1 | $1.25 | $0.125 | $10.00 |

Note: Composer is Cursor-only (no standalone external API); "public pricing" = Cursor's
per-token API rate charged against the usage pool. When a feature is implemented by
Composer sub-agents, record the cost basis (which Composer variant) in that feature's
master plan.

## Domain glossary (minimum to read the specs)

- **Tag holder** — a league member who bought a numbered tag; low tag number breaks ties.
- **Pool A / Pool B** — Pool B is for players <900 rated at first entry; they earn Pool B points only while <920. **All finishes are ranked per-pool** — Pool A and Pool B each have their own 1st place at every event.
- **Sub-league** — Early / Mid / Late; each is a **separate PDGA event ID** and a run of League Nights ending in a Podium bonus.
- **Event types** — LeagueNight, Podium, Tournament, FODOpen; each has its own points column (spec 02 Table 2.1) and top-N cap.
- **Championship total** — best-N sums across event types (best 15 League Nights, etc.), **not** a raw sum of all results.
- **OLP** (Overall League Performance) — a separate lower-is-better competition per sub-league; formula in spec 02 §2.8; requires PDGA membership and ≥4 rounds.
- **Read model** — precomputed, versioned, view-shaped rows that public pages read; published atomically.
- **Eligibility uses official monthly PDGA ratings** (published 2nd Tuesday); live per-round ratings are shown but labeled unofficial and never gate eligibility.
