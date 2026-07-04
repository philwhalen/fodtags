// Server-only: see src/server/db/index.ts for the convention this follows.
import "server-only";

import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";

import { config } from "@server/config";
import { isDirector } from "@server/db/repositories/directors";
import { logger } from "@server/logging";

/**
 * Module augmentation: the session/JWT carry an `isDirector` flag alongside
 * the default `email`/`name`/`image` so:
 *   - server components (the admin dashboard) can read `session.user.isDirector`
 *     without a second DB round trip, and
 *   - `src/middleware.ts` (which runs on Next's Edge runtime and therefore
 *     cannot import `better-sqlite3`/the DB — see that file) can gate
 *     `/admin/*` by decoding the signed JWT instead of re-querying
 *     `directors`.
 */
declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & { isDirector?: boolean };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    isDirector?: boolean;
  }
}

/**
 * Auth.js (NextAuth v5) wired to the `directors` allowlist (CLAUDE.md "Auth
 * via Auth.js Google OAuth against a `directors` email allowlist";
 * specs/12-Architecture.md §12.8; specs/10-Admin-Console.md §10.1).
 *
 * `trustHost: true` — this app runs as a single Node process behind
 * existing nginx on a Google Cloud VM (CLAUDE.md "Architecture"), not
 * Vercel, so Auth.js can't infer its own canonical origin the way it would
 * on a platform it recognizes. Trusting the forwarded `Host`/`X-Forwarded-*`
 * headers (as nginx sets them) is required for callback/redirect URLs to
 * resolve correctly. Equivalent to setting `AUTH_TRUST_HOST=true`; it's set
 * here instead so the decision lives next to the rest of the auth config
 * rather than only in `.env`.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: config.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    /**
     * THE allowlist gate (specs/12-Architecture.md §12.8; Spec 10 §10.1):
     * a verified Google email that isn't an active director is rejected
     * here, before any session/JWT is ever created for it.
     */
    async signIn({ user }) {
      if (!user.email) {
        return false;
      }
      const allowed = isDirector(user.email);
      if (!allowed) {
        logger.warn(
          { event: "auth.signInRejected", email: user.email },
          "sign-in rejected — not an active director",
        );
      }
      return allowed;
    },

    /**
     * Only ever called with `user` populated immediately after a `signIn`
     * that returned `true` — so by the time this runs, `isDirector` is
     * already known good. Stamping that onto the token is what lets
     * edge-runtime middleware gate `/admin/*` without touching the DB.
     */
    async jwt({ token, user }) {
      if (user) {
        token.isDirector = true;
      }
      return token;
    },

    /** Surface the flag on `session.user` for server components that want
     * it without decoding the raw JWT themselves (e.g. the admin dashboard). */
    async session({ session, token }) {
      if (session.user) {
        session.user.isDirector = token.isDirector === true;
      }
      return session;
    },
  },
});
