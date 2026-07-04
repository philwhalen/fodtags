import { PendingReviewBanner } from "./PendingReviewBanner";
import { StaleBadge } from "./StaleBadge";
import { UpdatedStamp } from "./UpdatedStamp";

/** Freshness + data-quality treatments grouped for every standings view. */
export function FreshnessHeader({
  updatedAt,
  stale,
  pendingReview,
}: {
  updatedAt: string;
  stale: boolean;
  pendingReview: number;
}) {
  return (
    <header className="freshness-header">
      <div className="freshness-header-primary">
        <UpdatedStamp updatedAt={updatedAt} />
        {stale ? <StaleBadge /> : null}
      </div>
      <PendingReviewBanner count={pendingReview} />
    </header>
  );
}
