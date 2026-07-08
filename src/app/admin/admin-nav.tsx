import { SEASON_YEAR } from "@server/admin/context";
import { countPending } from "@server/db/repositories/playerMatches";

import { AdminNavLinks } from "./admin-nav-links";

/**
 * Admin section nav (rendered once by the admin layout).
 *
 * Server component: reads the pending-match count so the "Matches" tab can show
 * a live badge. The active-tab highlighting needs the current pathname, so the
 * link rendering is delegated to the `AdminNavLinks` client component.
 */
export async function AdminNav() {
  const pendingCount = countPending(SEASON_YEAR);

  const links = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/roster", label: "Roster" },
    { href: "/admin/matches", label: "Matches", badge: pendingCount },
    { href: "/admin/events", label: "Event sources" },
    { href: "/admin/entry-counts", label: "Entry counts" },
    { href: "/admin/tags", label: "Tags" },
    { href: "/admin/financials", label: "Financials" },
    { href: "/admin/adjustments", label: "Adjustments" },
    { href: "/admin/audit", label: "Audit" },
  ];

  return <AdminNavLinks links={links} seasonYear={SEASON_YEAR} />;
}
