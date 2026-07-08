/**
 * Pure, client-safe model for the header auth control
 * (Spec 10 §10.1.1; Spec 11 §11.1).
 *
 * The state decision lives here — not inside the React component — so it can be
 * unit-tested without a renderer (this repo runs vitest under the `react-server`
 * condition, which blocks `react-dom/server`; see
 * `src/components/public/public-shell.test.ts`). The `AuthControl` server
 * component is a thin render of this model.
 *
 * No server imports: safe for the client bundle if ever needed.
 */

/**
 * Sign-in entry point. Routes through the built-in Auth.js sign-in page with a
 * `callbackUrl` of `/admin`, so an allowlisted director lands directly in the
 * admin console after Google sign-in (Spec 10 §10.1.1 "Post-login landing").
 */
export const ADMIN_LOGIN_HREF = "/api/auth/signin?callbackUrl=/admin";

/** The admin console (the "Admin panel" button target on the public site). */
export const ADMIN_PANEL_HREF = "/admin";

/**
 * The public default view (the "Return to main view" button target inside the
 * admin area). `/` root-redirects to the current season's default, so pointing
 * here stays correct as default-season logic evolves.
 */
export const RETURN_TO_MAIN_HREF = "/";

/** Which shell the auth control is rendered in — see {@link authControlModel}. */
export type AuthControlSurface = "public" | "admin";

export type AuthControlModel =
  | { mode: "signed-out"; loginLabel: "Admin login"; loginHref: string }
  | {
      mode: "director";
      panelLabel: "Admin panel" | "Return to main view";
      panelHref: string;
      logoutLabel: "Logout";
    };

/**
 * Decide what the header auth control shows for a resolved session.
 *
 * Only an allowlisted director ever has a session — the `signIn` allowlist gate
 * in `@server/auth` rejects everyone else before a session exists — so
 * `isDirector === true` is the signed-in branch. Anything else (no session, or
 * a session missing the flag) falls back to the signed-out control, so admin
 * affordances never appear without a confirmed director.
 *
 * The director's navigation control is **surface-aware** (Spec 10 §10.1.1): on
 * the public site it is "Admin panel" (→ `/admin`); inside the admin area —
 * where that would be a no-op link to the current page — it is "Return to main
 * view" (→ `/`). "Logout" is identical in both surfaces. Signed-out state does
 * not depend on the surface.
 */
export function authControlModel(
  session: { user?: { isDirector?: boolean } } | null | undefined,
  surface: AuthControlSurface = "public",
): AuthControlModel {
  if (session?.user?.isDirector === true) {
    return {
      mode: "director",
      ...(surface === "admin"
        ? { panelLabel: "Return to main view", panelHref: RETURN_TO_MAIN_HREF }
        : { panelLabel: "Admin panel", panelHref: ADMIN_PANEL_HREF }),
      logoutLabel: "Logout",
    };
  }
  return {
    mode: "signed-out",
    loginLabel: "Admin login",
    loginHref: ADMIN_LOGIN_HREF,
  };
}
