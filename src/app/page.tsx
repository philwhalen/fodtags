import { redirect } from "next/navigation";

/**
 * Root route: redirects to the current season's default view
 * (specs/04-Feature-Leaderboards.md §4.1 "Championship — default";
 * plans/scaffold/09-public-and-health.md). Now that
 * `app/(public)/[season]/championship/[pool]` exists, `typedRoutes` can
 * verify this literal target.
 */
export default function Home() {
  redirect("/2026/championship/pool-a");
}
