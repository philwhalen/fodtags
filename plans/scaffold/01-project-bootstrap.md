# 01 — Project Bootstrap

**Goal:** A Next.js App Router app that boots, typechecks under `strict`, lints clean, and builds standalone — with the empty layer folders and the `server-only` guard in place.

**Spec refs:** §12.0, §12.4, §12.12. **Depends on:** none.

## Files to create

- `package.json` — deps + scripts (`dev`, `build`, `start`, `lint`, `typecheck`, `test`). Pin Node LTS in `engines`.
- `.nvmrc` — the pinned Node LTS.
- `next.config.ts` — `output: 'standalone'`, `typedRoutes` on if desired.
- `tsconfig.json` — `strict: true`, `noUncheckedIndexedAccess: true`, path aliases (`@/*` → `src/*`, `@server/*` → `src/server/*`).
- ESLint + Prettier config (Next's `eslint-config-next` flat config).
- `.gitignore` — add `data/`, `.next/`, `node_modules/`, `.env*` (keep `.env.example`).
- `src/app/layout.tsx` + a placeholder `src/app/page.tsx` (redirect or link to `/2026/championship/pool-a`).
- The empty layer skeleton (each with an `index.ts` or `README` placeholder so the tree exists and boundaries are visible):
  ```
  src/app/(public)/  src/app/admin/  src/app/api/
  src/server/{ingestion,engine,readmodel,jobs,db,auth,config,logging}/
  src/lib/
  ```
- `src/server/_guard.ts` (or rely on `import 'server-only'` at the top of each server module) — establish the convention; add `server-only` to deps.

## Steps

1. Scaffold with `create-next-app` (TypeScript, App Router, ESLint, `src/` dir, no Tailwind decision — keep minimal; styling is not a skeleton concern).
2. Turn on strict tsconfig options above; fix any resulting errors.
3. Set `output: 'standalone'` in `next.config.ts`.
4. Create the `src/server/**` and `src/lib/` folders; add `import 'server-only'` to the top of a representative server module and document the rule in a short comment.
5. Add `typecheck` script (`tsc --noEmit`); ensure `lint` and `typecheck` both pass.
6. Verify `next build` produces `.next/standalone/`.

## Decision to make here (referenced by 03/07/08)

**Where boot-time work runs.** Choose one and record it in the master plan:
- **`src/instrumentation.ts`** (`register()` hook) — idiomatic for Next standalone; runs once per server process. *(Recommended.)*
- A thin custom server entry.

This owns: migrate → seed → bootstrap director → ensure-published → register scheduler (the master boot sequence).

## Done when

- `npm run dev` serves a page; `npm run typecheck`, `npm run lint`, `npm run build` all pass clean.
- Folder skeleton and `server-only` convention exist.
