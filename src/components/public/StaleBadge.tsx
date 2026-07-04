/** Stale-data indicator — not color-only (Spec 11 §11.2 / Spec 04 §4.4). */
export function StaleBadge() {
  return (
    <span className="freshness-stale" role="status" aria-label="Data may be outdated">
      <span className="freshness-stale-icon" aria-hidden="true">
        ⚠
      </span>
      <span className="freshness-stale-text">Stale data</span>
    </span>
  );
}
