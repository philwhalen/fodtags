# Live PDGA validation checklist (Common Work B — sub-plan 08)

Manual verification against real PDGA data. **Not run in CI.**

## Prerequisites

- `.env` configured with `PDGA_SOURCE=live` (and valid auth/DB vars).
- Event `104527` registered as an **EARLY** source in `/admin/events` (MA1 division).
- Roster includes a holder whose PDGA# appears in the live MA1 results (e.g. `#211843` Anthony D'Aiuto).

## Steps

1. Start the app with `PDGA_SOURCE=live`.
2. Open `/admin/events` — confirm the 104527 EARLY source is **Active** and not marked stale.
3. Click **Refresh now** on the admin dashboard (or trigger the scheduled path once).
4. Wait for the refresh run to finish (`succeeded` in the run log; note any per-source `runError` if partial).
5. Open the public **Championship → Pool A** standings (and EARLY sub-league if desired).
6. Compare top MA1 finishers and point totals against [pdga.com/live/event/104527](https://www.pdga.com/live/event/104527) — same players matched, plausible points for completed rounds.
7. Optional: temporarily block network to one source (or deactivate a placeholder source) and confirm only that source goes **stale** while last-good data remains published.

## Pass criteria

- Refresh ingests without a `failed` run (unless you intentionally test failure).
- Matched holders appear in published standings with points consistent with ingested rounds.
- Unmatched live entrants surface in `/admin/matches` and are excluded from points until resolved.
- Stale indicator appears on affected views when a source fails; clearing stale or a successful re-fetch clears it.
