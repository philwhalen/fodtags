import type { Route } from "next";
import Link from "next/link";

import { AuthControl } from "@/components/public/AuthControl";
import "@/components/public/public-shell.css";

/**
 * Admin shell (Spec 10 §10.1.1 "One unified auth control").
 *
 * Wraps every `/admin/*` page with the same header auth control the public site
 * uses, so sign-in state and the logout action look and behave identically
 * everywhere. Reachability is already enforced by `src/middleware.ts`, so this
 * only ever renders for an authenticated director — the `AuthControl` therefore
 * shows "Admin panel" + "Logout".
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-shell">
      <header className="public-shell-header">
        <div className="public-shell-brand">
          <Link href={"/admin" as Route} className="public-shell-brand-link">
            FOD Tags Admin
          </Link>
          <AuthControl />
        </div>
      </header>
      <main className="public-shell-main">{children}</main>
    </div>
  );
}
