import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Gates `/admin/*` pages and `/api/admin/*` route handlers behind the
 * director allowlist (CLAUDE.md "Auth via Auth.js Google OAuth against a
 * `directors` email allowlist"; specs/12-Architecture.md §12.8;
 * plans/scaffold/08-auth-admin.md).
 *
 * Deliberately does NOT import `@server/auth` (or anything under
 * `@server/db`): Next.js middleware runs in the Edge runtime sandbox, which
 * cannot load `better-sqlite3` (a native Node addon) — see
 * `src/server/db/client.ts`. Instead this decodes the signed session JWT
 * directly via `next-auth/jwt#getToken` (edge-safe, no DB call) and checks
 * the `isDirector` flag that `src/server/auth/index.ts`'s `jwt` callback
 * stamps onto the token at sign-in time — *after* the real, DB-backed
 * `isDirector()` check already ran (in the Node-runtime auth route
 * handler) as part of the `signIn` callback. `AUTH_SECRET` is read straight
 * from `process.env` (mirroring `src/server/logging/index.ts`) rather than
 * via `@server/config`, to avoid pulling that module's `node:path` use into
 * the Edge bundle.
 *
 * The matcher below intentionally covers only `/admin/:path*` and
 * `/api/admin/:path*` — public routes (`/`, `/2026/...`), `/api/health`
 * (sub-plan 09), and the NextAuth routes themselves (`/api/auth/...`, which
 * must stay reachable while signed out — that's how sign-in happens) are
 * never matched, so they run untouched by this middleware.
 */
export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
  });

  if (token?.isDirector === true) {
    return NextResponse.next();
  }

  // API routes get a plain 401 rather than a redirect — there's no browser
  // navigation to send to a sign-in page for a POST/fetch caller.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const signInUrl = new URL("/api/auth/signin", request.url);
  signInUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
