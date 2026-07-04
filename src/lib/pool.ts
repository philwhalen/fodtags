/**
 * Pool assignment: Pool B is for players <900 rated at first entry; they
 * earn Pool B points only while <920 (specs/00-Master-Spec.md glossary).
 * Lives in its own module (rather than only inline in `src/lib/index.ts`)
 * so the season-snapshot/season-results contracts (`src/lib/season-*.ts`)
 * can import it without a circular re-import through the `src/lib` barrel.
 */
export type Pool = "A" | "B";
