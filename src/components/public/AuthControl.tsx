import type { Route } from "next";
import Link from "next/link";

import { auth, signOut } from "@server/auth";
import { authControlModel, type AuthControlSurface } from "@/lib/auth-control";

/**
 * Header auth control (Spec 10 §10.1.1; Spec 11 §11.1).
 *
 * A server component: it awaits `auth()` to read the signed-in director's
 * session, then renders from the pure `authControlModel` (unit-tested in
 * `src/lib/auth-control.test.ts`). No client JS — "Admin login" is a plain link
 * to the built-in Auth.js sign-in page, and "Logout" is an inline server action
 * (the same `signOut({ redirectTo: "/" })` pattern the admin dashboard uses).
 *
 * `surface` selects the director's navigation affordance (Spec 10 §10.1.1):
 * `"public"` (default) shows "Admin panel" → `/admin`; `"admin"` shows "Return
 * to main view" → `/`. The admin shell passes `surface="admin"`.
 *
 * This is affordance only — `src/middleware.ts` remains the real gate on
 * `/admin/*`; the button just exposes the entry point and reflects session
 * state.
 */
export async function AuthControl({
  surface = "public",
}: {
  surface?: AuthControlSurface;
} = {}) {
  const model = authControlModel(await auth(), surface);

  if (model.mode === "director") {
    return (
      <div className="auth-control">
        <Link href={model.panelHref as Route} className="auth-control-link">
          {model.panelLabel}
        </Link>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button type="submit" className="auth-control-button">
            {model.logoutLabel}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="auth-control">
      {/* Plain anchor: the Auth.js sign-in page is an API route, outside the
          typed-route graph, so `next/link`'s typed href would reject it. */}
      <a href={model.loginHref} className="auth-control-link">
        {model.loginLabel}
      </a>
    </div>
  );
}
