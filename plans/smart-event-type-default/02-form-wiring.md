# 02 — Wire form default + remount

## Goal

Compute the default on the server page and feed it to the client form as the `<select>`'s
initial value, remounting the form after each registration so the default advances.

## Changes

### `src/app/admin/events/page.tsx`

- Import `defaultEventSourceType` from `@server/admin/default-event-type`.
- After `const sources = listSources(SEASON_YEAR);`:
  ```ts
  const defaultType = defaultEventSourceType(sources.map((s) => s.type));
  ```
- Render:
  ```tsx
  <RegisterSourceForm key={sources.length} defaultType={defaultType} />
  ```
  - `key={sources.length}` remounts the form on every successful registration (one row
    added → count changes → fresh mount picks up the newly-advanced `defaultType` and clears
    prior field entries). See master-plan decision on uncontrolled `defaultValue`.

`sources[].type` is `EventSourceType`, so `.map((s) => s.type)` matches the helper's param
type with no cast.

### `src/app/admin/events/event-forms.tsx`

- `RegisterSourceForm` signature: `export function RegisterSourceForm({ defaultType }: { defaultType: string })`.
- Change the Type `<select>`:
  ```tsx
  <select name="type" defaultValue={defaultType} className="admin-select">
  ```
  (was `defaultValue="TOURNAMENT"`). Option list unchanged.

`defaultType` is typed `string` (not `EventSourceType`) in the client component to avoid a
type-only import from the server schema into a `"use client"` module; the value is always a
valid option.

## Out of scope

- No change to `registerSourceAction` / `SourceRow` / the edit form.

## Done when

- `npm run typecheck` + `npm run lint` clean.
- Live drive: load `/admin/events` on the current dev DB (Early + Mid registered) → Type
  defaults to **LATE**. Register a throwaway then confirm default advances / reverts as
  expected, or rely on unit tests for the other slot states.
