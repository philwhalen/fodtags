// Server-only: see src/server/db/index.ts for the convention this follows.
import "server-only";

/**
 * The in-process croner scheduler: Thu 21:00 ET full refresh + monthly
 * 2nd-Tue ratings pull, both wired to the shared `runRefresh` pipeline. See
 * src/server/jobs/scheduler.ts and plans/scaffold/07-scheduler-jobs.md.
 */
export { registerJobs, __resetSchedulerForTests } from "@server/jobs/scheduler";
