// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { auth } from "@server/auth";

import { AdminError } from "@server/admin/context";

/** Defense-in-depth director check (Spec 10 §10.1). */
export async function requireDirectorEmail(): Promise<string> {
  const session = await auth();
  if (!session?.user?.isDirector || !session.user.email) {
    throw new AdminError("Unauthorized", "unauthorized");
  }
  return session.user.email;
}
