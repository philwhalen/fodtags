"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = {
  href: string;
  label: string;
  badge?: number;
};

/**
 * Client renderer for the admin nav — uses `usePathname` to mark the active tab.
 * The nav data (and the pending-match badge count) come from the server
 * `AdminNav` wrapper.
 */
export function AdminNavLinks({
  links,
  seasonYear,
}: {
  links: NavLink[];
  seasonYear: number;
}) {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav className="admin-nav" aria-label="Admin sections">
      <ul className="admin-nav-list">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href as Route}
              className="admin-nav-link"
              data-active={isActive(link.href) ? "" : undefined}
              aria-current={isActive(link.href) ? "page" : undefined}
            >
              {link.label}
              {link.badge ? <span className="admin-nav-badge">{link.badge}</span> : null}
            </Link>
          </li>
        ))}
        <li className="admin-season">
          Season <strong>{seasonYear}</strong>
        </li>
      </ul>
    </nav>
  );
}
