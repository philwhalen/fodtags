import { formatEt } from "@/lib";

/** "Updated {time} ET" freshness stamp (Spec 04 §4.4 / Spec 11 §11.1). */
export function UpdatedStamp({ updatedAt }: { updatedAt: string }) {
  const label = formatEt(updatedAt);
  return (
    <p className="freshness-updated">
      <time dateTime={updatedAt}>Updated {label}</time>
    </p>
  );
}
