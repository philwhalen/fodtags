/** Non-alarming unmatched-results banner (Spec 04 §4.4). */
export function PendingReviewBanner({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }

  const label =
    count === 1 ? "1 result pending review" : `${count} results pending review`;

  return (
    <div className="banner-pending-review" role="status" aria-live="polite">
      <span className="banner-pending-review-icon" aria-hidden="true">
        ℹ
      </span>
      <span>{label}</span>
    </div>
  );
}
