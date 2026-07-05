import type { AceWinView, FundStatus, PotsView } from "@/lib";

/** Plain-text projected/final label — never color-only (Spec 11). */
function StatusBadge({ status }: { status: FundStatus }) {
  return (
    <span className="financials-status" data-status={status}>
      {status}
    </span>
  );
}

function AceWinRow({ win }: { win: AceWinView }) {
  return (
    <li className="financials-ace-win">
      <span className="financials-ace-win-date">{win.date}</span>
      <span className="financials-ace-win-amount">{win.amount}</span>
      {win.note ? <span className="financials-ace-win-note">{win.note}</span> : null}
    </li>
  );
}

/**
 * `#pots` (Spec 09 §9.3.2): the three pot sub-sections, each with its own
 * stable anchor id (`#pots-skins` / `#pots-olp` / `#pots-ace`) so the OLP
 * and score-sheet pages can deep-link straight into the relevant block.
 * Purely presentational over the already-projected `pots` view model.
 */
export function PotsDetail({ pots }: { pots: PotsView }) {
  return (
    <section id="pots" className="financials-pots">
      <h2 className="financials-section-heading">Pots detail</h2>

      <div id="pots-skins" className="financials-pot-block">
        <h3 className="financials-pot-heading">Skins</h3>
        <ul className="financials-pot-list">
          {pots.skins.map((pot) => (
            <li key={pot.pool} className="financials-pot-row">
              <span className="financials-pot-label">{pot.label}</span>
              <span className="financials-pot-amount">{pot.payout ?? pot.purse}</span>
              <StatusBadge status={pot.status} />
              {pot.payout ? (
                <span className="financials-pot-note">Season purse: {pot.purse}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div id="pots-olp" className="financials-pot-block">
        <h3 className="financials-pot-heading">OLP</h3>
        <ul className="financials-pot-list">
          {pots.olp.map((pot) => (
            <li key={pot.subLeague} className="financials-pot-row financials-olp-row">
              <span className="financials-pot-label">{pot.label}</span>
              <span className="financials-pot-amount">{pot.pot}</span>
              <StatusBadge status={pot.status} />
              <span className="financials-olp-payouts">
                1st {pot.payouts[0]} · 2nd {pot.payouts[1]} · 3rd {pot.payouts[2]}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div id="pots-ace" className="financials-pot-block">
        <h3 className="financials-pot-heading">Ace pot</h3>
        <div className="financials-pot-row">
          <span className="financials-pot-label">Balance</span>
          <span className="financials-pot-amount">{pots.ace.balance}</span>
          <StatusBadge status={pots.ace.status} />
        </div>
        <p className="financials-pot-note">
          Opening carryover: {pots.ace.openingCarryover} · Rate: {pots.ace.ratePerEntry} per ace
          entry
        </p>
        {pots.ace.wins.length > 0 ? (
          <ul className="financials-ace-wins">
            {pots.ace.wins.map((win, index) => (
              <AceWinRow key={`${win.date}-${index}`} win={win} />
            ))}
          </ul>
        ) : (
          <p className="financials-ace-wins-empty">No ace-pot wins recorded yet.</p>
        )}
      </div>
    </section>
  );
}
