# Code Standards

## General

- Keep components and hooks single-purpose. Extract shared logic into hooks or utility functions.
- Fix root causes — when fixing a bug, understand why it happened and address the underlying issue, not just the symptom.
- Do not mix unrelated concerns in one component or route. Each page file composes independent pieces.
- Prefer incremental refactoring (one file at a time) over full rewrites.

## TypeScript

- Strict mode is enabled globally via `tsconfig.json`. Do not add `// @ts-nocheck` or `// @ts-expect-error` without explicit justification.
- Avoid `any` — use explicit interfaces, union types, or generics. When interacting with untyped data (e.g., JSONB columns, edge function responses), parse and validate at the boundary.
- Validate unknown external input at system boundaries (edge function request bodies, query params) before trusting it.
- The canonical types are in `src/lib/types.ts`. API responses are typed via these interfaces. When the database schema changes, update types.ts first.
- Shared constants (`ADMIN_ROLES`, `SUPER_ADMIN_ROLES`, `MEETING_STATUS_BADGE`) are defined in types.ts and imported by both frontend and backend code.

## Next.js

- Default to server components unless browser interactivity requires `"use client"`.
- Add `"use client"` only when a component uses React hooks, browser APIs, or event handlers.
- Keep page components thin — they compose hooks and presentational components, not business logic.
- Use the `(authenticated)` route group for pages that require auth. The layout in this group provides the sidebar + topnav wrapper.
- API routes (`src/app/api/`) are reserved for pure server-side computation (e.g., email rendering). All business logic lives in Supabase Edge Functions.

## Styling

- Use CSS custom property tokens from `globals.css` — no hardcoded hex values outside of CSS variables.
- Follow the Terra dark/light color system defined in `ui-context.md`. Use tokens like `bg-surface`, `text-foreground`, `border-border`.
- Use Tailwind utility classes exclusively. Avoid custom CSS unless absolutely necessary.
- Follow the border radius scale: `rounded-lg` (0.75rem) for cards/panels, `rounded-xl` (1rem) for modals/overlays, `rounded-full` for pills/avatars.
- Font classes: `font-display` (Literata) for headings, `font-sans` (Nunito Sans, default) for body text.

## API Routes (Edge Functions)

- Validate and parse request input before any logic runs. Use early returns with `err()` for validation failures.
- Enforce auth at the top of every handler via `resolveCaller(req)`. It returns `{ id, role, team_id }`.
- Enforce role-based access before mutations via `requireRole(caller, ADMIN_ROLES)`.
- Return consistent response shapes: `ok(data)` for success, `err(message, status)` for errors.
- Use `preflight()` for OPTIONS requests. All edge functions handle CORS via the shared `cors.ts` module.

## Data and Storage

- Metadata belongs in the database — every table has a primary key, `team_id`, and `created_at` where applicable.
- Do not store large content directly in the database. Currently no file storage is used; if binary assets are needed in the future, use Supabase Storage.
- JSONB columns (`agenda_items`, `action_items`) are used for bounded, list-shaped data. Keep these small — no more than a few dozen items.
- Soft-delete (`deleted_at` timestamp) is preferred over hard-delete for all mutable entities (users, meetings, templates).

## Hooks and Data Fetching

- All server data is accessed through custom hooks in `src/lib/hooks/`. Each hook wraps `useQuery` or `useMutation` from TanStack Query.
- Hooks call the typed API client in `src/lib/api.ts`, which uses Ky to hit Supabase Edge Functions.
- Query keys follow the pattern: `["entity"]` for lists, `["entity", id]` for singles.
- Mutations invalidate their list queries on success so the UI stays fresh.
- Do not call edge functions directly from components — always go through a hook.

## File Organization

- `src/lib/` — Shared modules: types, API client, Supabase config, hooks, utilities.
- `src/components/` — Shared React components. `src/components/ui/` holds shadcn/ui primitives — do not edit these directly; use the CLI to add or update them.
- `src/components/providers/` — React context providers (auth, query).
- `src/app/` — Page routes and layouts grouped by feature. The `(authenticated)` group contains all pages that require a signed-in session.
- `src/emails/` — React Email template components.
- `supabase/functions/` — One directory per edge function. Shared helpers in `_shared/`.
- `supabase/migrations/` — DDL migration files, named by timestamp.
