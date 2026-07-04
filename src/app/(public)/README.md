# `app/(public)/`

Public, unauthenticated pages: `[season]/championship/[pool]`, rounds &
ratings, OLP pot, score sheets, player profiles, financials.

Reads **only** from `src/server/readmodel/` — never recomputes, never
touches PDGA directly. See specs/12-Architecture.md §12.3/§12.4.

First route lands in sub-plan 09 (`plans/scaffold/09-public-and-health.md`):
`/2026/championship/pool-a`, the pre-season empty roster.
