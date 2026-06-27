# Architecture Context

## Stack

| Layer      | Technology                                   | Role                                  |
| ---------- | -------------------------------------------- | ------------------------------------- |
| Framework  | Next.js 16 (App Router, RSC) + TypeScript    | SSR, routing, full-stack app structure |
| UI         | Tailwind v4 + shadcn/ui (base-nova) + Lucide | Component library, styling, icons     |
| State      | TanStack React Query v5                      | Client-side data fetching + cache     |
| HTTP       | Ky                                           | Typed HTTP client to edge functions   |
| Auth       | Supabase SSR (server) + Supabase SSr (client)| Session management, auth guard        |
| Database   | Supabase (PostgreSQL 15)                     | All persistent data                   |
| Backend    | Supabase Edge Functions (Deno)               | Business logic, auth, validation      |
| Email      | React Email + Resend                         | Transactional email rendering + sending|
| Fonts      | next/font/google (Literata, Nunito Sans)     | Display + body typefaces              |

## System Boundaries

- `src/app/` — Next.js App Router pages, layouts, API routes. Page-level composition, no business logic.
- `src/lib/` — Client-side modules: types, API client (ky + edge function URLs), hooks (TanStack Query), Supabase helpers.
- `src/components/` — Shared React components: sidebar, topnav, providers (auth, query), shadcn/ui primitives.
- `src/proxy.ts` — Next.js middleware: auth guard, public vs authenticated route enforcement, cookie-based session.
- `supabase/functions/` — Deno edge functions (11 endpoints): all server-side business logic, database access, auth verification, email dispatch.
- `supabase/migrations/` — Database schema DDL: tables, constraints, defaults.
- `src/emails/` — React Email templates: reminder, outcome-prompt. Rendered via `src/app/api/email/render/route.tsx`.

## Storage Model

- **PostgreSQL (Supabase)**: All data — teams, users, meetings, meeting_participants, outcomes, templates, notification_preferences, departments. Meetings and outcomes store list-like data as JSONB (agenda_items, action_items). Soft-delete via `deleted_at` timestamps on mutable entities.
- **No file or blob storage**: No attachments, media, or generated assets are stored.

## Auth and Access Model

- Authentication via Supabase Auth (email/password + magic link). Session is persisted in cookies via `@supabase/ssr` with storage key `mtp-auth`.
- Next.js middleware (`src/proxy.ts`) guards all non-public routes. Unauthenticated users are redirected to `/login`; authenticated users on public routes are redirected to `/dashboard`.
- The `AuthProvider` React context wraps authenticated pages. It reads the session via `supabase.auth.getSession()` and exposes `user`, `session`, `loading`, `role`, and `signOut`. Role is read from `user.user_metadata.role`.
- On first session detection, the `setup` edge function is called to ensure the user has a team record and their role is synced to `user_metadata`.
- All edge functions use `resolveCaller(req)` which calls `supabase.auth.getUser()` and then reads the user's profile from the `users` table (with role and team_id). This is the universal server-side auth check.
- Role enforcement is per-route within edge functions. `ADMIN_ROLES = ["super_admin", "dept_admin"]` gates mutations. `SUPER_ADMIN_ROLES = ["super_admin"]` gates destructive operations.
- Data is scoped by `team_id` in edge function queries. Every table has a `team_id` column. Server-side code always filters by the caller's `team_id`.

## Invariants

1. Edge functions do not call other edge functions — all orchestration happens within a single handler.
2. All database mutations go through Supabase Edge Functions, not the Next.js API routes (except email rendering which is a pure template renderer).
3. The meetings status state machine is enforced server-side: planned → active → completed → logged. Invalid transitions are rejected.
4. Every mutable entity (meetings, templates, users) uses soft-delete (`deleted_at`), never hard-delete.
5. Service role key is used for write operations that bypass RLS (participant insertion, notification prefs); user-scoped operations use the caller's auth token.
6. The `notification_preferences` table uses `user_id` as the primary key — upsert with `onConflict: "user_id"` is the correct write pattern.
7. Timer state is server-authoritative — client reads and sends timer commands, the edge function computes elapsed/remaining time.
