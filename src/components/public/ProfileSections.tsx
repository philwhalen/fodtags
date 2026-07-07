import type { Route } from "next";
import Link from "next/link";

import { formatCents, formatTagNumber } from "@/lib";
import type { ProfileView } from "@/lib";

export function ProfileHeader({ view }: { view: ProfileView["header"] }) {
  return (
    <header className="profile-header">
      <h1 className="profile-name">{view.name}</h1>
      <dl className="profile-meta">
        <div>
          <dt>Tag #</dt>
          <dd>{formatTagNumber(view.tagNumber)}</dd>
        </div>
        <div>
          <dt>Pool</dt>
          <dd>{view.poolLabel}</dd>
        </div>
        <div>
          <dt>Present rating</dt>
          <dd>{view.presentRating ?? "— (Unrated)"}</dd>
        </div>
        <div>
          <dt>PDGA #</dt>
          <dd>
            {view.pdgaProfileUrl ? (
              <a href={view.pdgaProfileUrl} target="_blank" rel="noreferrer">
                {view.pdgaNumber}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>
      <ul className="profile-flags" aria-label="Eligibility">
        {view.provisional ? (
          <li className="profile-flag" role="status">
            Pending confirmation
          </li>
        ) : null}
        {view.poolBAccrual ? (
          <li className="profile-flag">Pool B accrual: {view.poolBAccrual}</li>
        ) : null}
        <li className="profile-flag">
          OLP eligible: {view.olpEligible ? "yes" : "no"}
          {!view.olpEligible && view.olpIneligibleReason
            ? ` (${view.olpIneligibleReason})`
            : ""}
        </li>
        <li className="profile-flag">
          Skins qualified: {view.skinsQualified ? "yes" : "no"}
          {!view.skinsQualified && view.skinsIneligibilityReason
            ? ` (${view.skinsIneligibilityReason})`
            : ""}
        </li>
      </ul>
    </header>
  );
}

function SectionLink({ href, label }: { href: string; label: string }) {
  return (
    <p className="profile-section-link-wrap">
      <Link href={href as Route} className="profile-section-link">
        {label}
      </Link>
    </p>
  );
}

export function ProfileChampionshipSection({
  section,
}: {
  section: ProfileView["championship"];
}) {
  return (
    <section className="profile-section" aria-labelledby="profile-championship-heading">
      <h2 id="profile-championship-heading">Championship position</h2>
      <p>
        Overall: rank {section.overall.rank}, {section.overall.points} points
      </p>
      <p>
        {section.currentSubLeagueLabel}: rank {section.currentSubLeague.rank},{" "}
        {section.currentSubLeague.points} points
      </p>
      {section.podiumNotFinalized ? (
        <p className="profile-note" role="status">
          Podium bonus not yet finalized for this sub-league.
        </p>
      ) : null}
      <SectionLink href={section.viewFullHref} label="View full standings" />
      <SectionLink href={section.viewFullSubLeagueHref} label="View sub-league standings" />
    </section>
  );
}

export function ProfilePointsSection({ section }: { section: ProfileView["points"] }) {
  return (
    <section className="profile-section" aria-labelledby="profile-points-heading">
      <h2 id="profile-points-heading">Points breakdown</h2>
      <dl className="profile-points-grid">
        <div>
          <dt>League Nights</dt>
          <dd>{section.leagueNight}</dd>
        </div>
        <div>
          <dt>Podium</dt>
          <dd>{section.podium}</dd>
        </div>
        <div>
          <dt>Tournaments</dt>
          <dd>{section.tournament}</dd>
        </div>
        <div>
          <dt>FOD Open</dt>
          <dd>{section.fodOpen}</dd>
        </div>
      </dl>
      <p>
        {section.countedCount} counted · {section.droppedCount} dropped
      </p>
      <SectionLink href={section.viewFullHref} label="View full score sheet" />
    </section>
  );
}

export function ProfileRoundsSection({ section }: { section: ProfileView["rounds"] }) {
  return (
    <section className="profile-section" aria-labelledby="profile-rounds-heading">
      <h2 id="profile-rounds-heading">Rounds & ratings</h2>
      <p>Present rating: {section.presentRating ?? "— (Unrated)"}</p>
      {section.trend.length >= 2 ? (
        <p className="profile-sparkline-summary" aria-label={`Rating trend across ${section.trend.length} rounds`}>
          Trend: {section.trend[0]} → {section.trend[section.trend.length - 1]} ({section.trend.length} rounds)
        </p>
      ) : null}
      {section.recentRounds.length > 0 ? (
        <table className="standings-table profile-recent-rounds">
          <caption className="standings-table-caption">Recent rounds</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Event</th>
              <th scope="col">Score</th>
              <th scope="col">Rating</th>
            </tr>
          </thead>
          <tbody>
            {section.recentRounds.map((round) => (
              <tr key={round.eventId} className="standings-row">
                <td data-label="Date">{round.date}</td>
                <td data-label="Event">{round.eventLabel}</td>
                <td data-label="Score">
                  {round.scoreToPar > 0 ? `+${round.scoreToPar}` : round.scoreToPar}
                </td>
                <td data-label="Rating">{round.roundRating ?? "pending"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="profile-note" role="status">
          No rounds in this sub-league yet.
        </p>
      )}
      <SectionLink href={section.viewFullHref} label="View full rounds" />
    </section>
  );
}

export function ProfileOlpSection({ section }: { section: ProfileView["olp"] }) {
  return (
    <section className="profile-section" aria-labelledby="profile-olp-heading">
      <h2 id="profile-olp-heading">OLP</h2>
      {section.active.eligible ? (
        <p>
          Rank {section.active.rank}, score {section.active.score}
          {section.active.payout !== null
            ? ` · payout $${section.active.payout} ${section.active.projected ? "(projected)" : "(final)"}`
            : ""}
        </p>
      ) : (
        <p>
          Not yet eligible
          {section.active.ineligibleReason ? `: ${section.active.ineligibleReason}` : ""}
        </p>
      )}
      <ul className="profile-olp-summary">
        {section.summary.map((row) => (
          <li key={row.subLeague}>
            {row.label}:{" "}
            {row.eligible
              ? `rank ${row.rank}, ${row.score}${row.payout !== null ? ` · $${row.payout}` : ""}`
              : row.ineligibleReason ?? "not eligible"}
          </li>
        ))}
      </ul>
      <SectionLink href={section.viewFullHref} label="View full OLP" />
    </section>
  );
}

export function ProfileMoneySection({ section }: { section: ProfileView["money"] }) {
  return (
    <section className="profile-section" aria-labelledby="profile-money-heading">
      <h2 id="profile-money-heading">Money</h2>
      <p>
        Skins match: {section.skins.qualified ? "qualified" : "not qualified"}
        {section.skins.projectedPayoutCents !== null
          ? ` · projected ${formatCents(section.skins.projectedPayoutCents)} ${section.skins.projected ? "(projected)" : "(final)"}`
          : ""}
      </p>
      <ul className="profile-money-olp">
        {section.olp.map((row) => (
          <li key={row.subLeague}>
            {row.subLeague} OLP: {row.payout !== null ? `$${row.payout}` : "—"}{" "}
            {row.projected ? "(projected)" : "(final)"}
          </li>
        ))}
      </ul>
      <SectionLink href={section.viewFullSkinsHref} label="View skins purse detail" />
      <SectionLink href={section.viewFullOlpHref} label="View OLP pot detail" />
    </section>
  );
}
