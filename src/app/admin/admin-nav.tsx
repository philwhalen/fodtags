import type { Route } from "next";
import Link from "next/link";

import { SEASON_YEAR } from "@server/admin/context";
import { countPending } from "@server/db/repositories/playerMatches";

export async function AdminNav() {
  const pendingCount = countPending(SEASON_YEAR);

  const links = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/roster", label: "Roster" },
    { href: "/admin/matches", label: `Matches (${pendingCount})` },
    { href: "/admin/events", label: "Event sources" },
    { href: "/admin/entry-counts", label: "Entry counts" },
    { href: "/admin/adjustments", label: "Adjustments" },
  ];

  return (
    <nav aria-label="Admin">
      <ul style={{ display: "flex", gap: "1rem", listStyle: "none", padding: 0 }}>
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href as Route}>{link.label}</Link>
          </li>
        ))}
      </ul>
      <p>
        Season: <strong>{SEASON_YEAR}</strong>
      </p>
    </nav>
  );
}
