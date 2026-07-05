import { FinancialsLedger } from "@/components/public/FinancialsLedger";
import { FinancialsNav } from "@/components/public/FinancialsNav";
import { FinancialsSummary } from "@/components/public/FinancialsSummary";
import { FreshnessHeader } from "@/components/public/FreshnessHeader";
import { PotsDetail } from "@/components/public/PotsDetail";
import type { PublicFinancialsPayload } from "@/lib";
import { projectFinancials } from "@/lib";
import { getPublished } from "@server/db/repositories/readModel";

/**
 * Season financials (Spec 09 §9.3): summary → pots → ledger, stacked on one
 * scrolling page. Reads **only** the published `financials` view — never
 * recomputes or reads financial tables directly (CLAUDE.md).
 */
export const dynamic = "force-dynamic";

export default async function FinancialsPage({
  params,
}: {
  params: Promise<{ season: string }>;
}) {
  const { season } = await params;
  const seasonYear = Number(season);
  const title = `${season} Financials`;

  const published = getPublished(seasonYear, "financials");

  if (!published) {
    return (
      <article className="standings-view">
        <header className="standings-view-header">
          <h1 className="standings-view-title">{title}</h1>
          <FinancialsNav />
          <FreshnessHeader
            updatedAt={new Date(0).toISOString()}
            stale={false}
            pendingReview={0}
          />
        </header>
        <div className="standings-empty" role="status">
          <p>Financials will appear once League Nights are recorded.</p>
        </div>
      </article>
    );
  }

  const payload = published.payload as PublicFinancialsPayload;
  const { summary, pots, ledger } = projectFinancials(payload, seasonYear);

  return (
    <article className="standings-view">
      <header className="standings-view-header">
        <h1 className="standings-view-title">{title}</h1>
        <FinancialsNav />
        <FreshnessHeader
          updatedAt={payload.updatedAt}
          stale={payload.stale}
          pendingReview={payload.pendingReview}
        />
      </header>
      <FinancialsSummary summary={summary} />
      <PotsDetail pots={pots} />
      <FinancialsLedger ledger={ledger} />
    </article>
  );
}
