// Auth.js (NextAuth v5) route handler — Google OAuth sign-in/callback/
// sign-out endpoints. All config (provider, allowlist gate, secrets) lives
// in src/server/auth/index.ts; this file only re-exports the generated
// GET/POST handlers. See specs/12-Architecture.md §12.8.
import { handlers } from "@server/auth";

export const { GET, POST } = handlers;
