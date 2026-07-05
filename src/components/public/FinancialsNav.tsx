const SECTIONS = [
  { id: "summary", label: "Summary" },
  { id: "pots", label: "Pots" },
  { id: "ledger", label: "Ledger" },
] as const;

/** Compact in-page jump nav for the single scrolling `/{season}/financials`
 * page (Spec 09 §9.3): plain same-page anchors, not `next/link` routes. */
export function FinancialsNav() {
  return (
    <nav className="financials-nav" aria-label="Financials sections">
      <ul className="financials-nav-list">
        {SECTIONS.map((section) => (
          <li key={section.id} className="financials-nav-item">
            <a href={`#${section.id}`} className="financials-nav-link">
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
