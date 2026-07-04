import type { Route } from "next";
import Link from "next/link";

import { publicNavItems } from "@/lib/public-routes";

/** Top-level feature nav (Spec 11 §11.1). */
export function PublicNav({ seasonYear }: { seasonYear: number }) {
  const items = publicNavItems(seasonYear);

  return (
    <nav className="public-nav" aria-label="Main">
      <ul className="public-nav-list">
        {items.map((item) => (
          <li key={item.href} className="public-nav-item">
            <Link href={item.href as Route} className="public-nav-link">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
