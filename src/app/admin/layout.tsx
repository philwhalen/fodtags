import type { Route } from "next";
import Link from "next/link";

import { AuthControl } from "@/components/public/AuthControl";
import "@/components/public/public-shell.css";

import { AdminNav } from "./admin-nav";
import "./admin.css";

/**
 * Admin shell (Spec 10 §10.1.1 "One unified auth control").
 *
 * Wraps every `/admin/*` page with the same header auth control the public site
 * uses, so sign-in state and the logout action look and behave identically
 * everywhere. Reachability is already enforced by `src/middleware.ts`, so this
 * only ever renders for an authenticated director. It passes `surface="admin"`
 * so the navigation control reads "Return to main view" (→ `/`) instead of the
 * public "Admin panel" — which would be a no-op link to the current area — and
 * therefore shows "Return to main view" + "Logout".
 *
 * The `.admin-shell` class layers the admin design tokens (`admin.css`) over the
 * public shell, adds the "Admin" badge signal, and renders the section nav once
 * here so it appears consistently on every admin page.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-shell admin-shell">
      <header className="public-shell-header">
        <div className="public-shell-brand">
          <Link href={"/admin" as Route} className="public-shell-brand-link">
            FOD Tags Admin
          </Link>
          <span className="admin-badge">Admin</span>
          <AuthControl surface="admin" />
        </div>
      </header>
      <AdminNav />
      <main className="public-shell-main">
        <div className="admin-page">{children}</div>
      </main>
    </div>
  );
}
