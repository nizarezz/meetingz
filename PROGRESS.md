# Progress

## Goal
- Make comments live with their own table, add real-time subscriptions across all pages, build guest live view with share tokens, normalize action_items into a table, and rotate leaked service role key.

## Constraints & Preferences
- Comments should be real-time via Supabase Realtime, not polling
- Guest live view accessible only within 5 min before start or during active meeting
- Guest access controlled via unguessable UUID share_token
- Action items must be normalized from JSONB into a proper table to enable assignments and notifications
- Service role key leaked in git — must be rotated immediately

## Done
- **Comments moved to own table** — `comments` table created with FK to meetings, users, teams. Edge function `GET /comments?meeting_id=` and `POST /comments`. Old `comments jsonb` column dropped from outcomes.
- **Realtime subscriptions enabled** — `comments`, `meetings`, `outcomes`, `action_items` added to `supabase_realtime` publication. Created `useRealtimeInvalidation` hook used on dashboard, meetings list, meeting detail pages.
- **Timer polling removed** — 5-second `refetchInterval` removed from `useTimer`. Timer updates now come via Realtime (meetings table).
- **Guest live view built** — `share_token uuid` column added to meetings (auto-generated). Public edge function `GET /meetings/public/{share_token}` returns title + timer + agenda for active/starting_soon meetings. `GET /live/[share_token]` page shows upcoming/active/ended states based on time gate (5 min before scheduled start, active, or ended).
- **Service role key rotated** — Old leaked key no longer in use. New key stored as `APP_SERVICE_ROLE_KEY` secret. Shared supabase client updated to use it with fallback. All 11 edge functions redeployed.
- **Action items normalized** — `action_items` table created with FK to outcomes and meetings. Existing JSONB action items migrated. Outcomes edge function updated to read/write from new table. Edge function `GET /action_items?assignee_email=` and `PATCH /action_items/:id` created for the assignments page.
- **Assignments page built** — `/assignments` page with email filter (defaults to current user), sections for overdue/pending/done, checkbox to toggle completion, links to meetings, due date display.
- **Engineering audit completed** — Full audit saved to `ENGINEERING_AUDIT.md`. Overall grade C+. Critical issues found: leaked key, no tests, JSONB action_items ceiling, no Sentry, no CI/CD.
- **All deployed** — Edge functions and Vercel frontend deployed with all changes.

## Key Decisions
- **Comments as own table** vs JSONB — Separate table enables proper Realtime subscriptions, FK constraints, future features (reactions, editing, attachments).
- **Custom secret name `APP_SERVICE_ROLE_KEY`** — Supabase blocks overriding `SUPABASE_*` env vars, so new key stored under custom name with fallback to auto-injected key.
- **Action items table** — Normalizes the JSONB blob into queryable rows. Migrates existing data. Frontend still receives `action_items` array from outcomes GET but now backed by the table.
- **Guest live view poll at 2s** vs Realtime — Realtime requires auth. Public page uses polling, acceptable trade-off.

## Next Steps
- Add email notifications for action item assignments via Brevo
- Add Sentry error monitoring
- Add GitHub Actions CI (lint → typecheck → deploy)
- Add missing DB indexes
- Add empty/loading/error states to all pages

## Critical Context
- Supabase project: `cxvpnvlicdnghvlzprhf`. Old service role key leaked — **must revoke old key in dashboard**.
- New service role key stored as `APP_SERVICE_ROLE_KEY` in edge function secrets.
- Current branch: `new-feature` (based on `guest-live-view`).
- Edge functions deployed: action_items, comments, departments, meetings, notifications, outcomes, participants, reminders, setup, teams, templates, timer, users.
- `resend` npm package unused (switched to Brevo) — should be removed from dependencies.
- Vercel production URL: `https://meetingz-next.vercel.app`.

## Relevant Files
- `supabase/functions/action_items/index.ts` — Lists action items by assignee_email, PATCH to toggle done.
- `supabase/functions/_shared/supabase.ts` — Reads `APP_SERVICE_ROLE_KEY` with fallback.
- `supabase/functions/outcomes/index.ts` — Reads/writes action_items from new table.
- `supabase/functions/comments/index.ts` — Comments CRUD.
- `supabase/functions/meetings/index.ts` — Public share endpoint.
- `supabase/migrations/20260627000002_comments_table.sql` — Comments table schema.
- `supabase/migrations/20260627000003_enable_realtime.sql` — Tables added to Realtime publication.
- `supabase/migrations/20260627000004_share_token.sql` — share_token on meetings.
- `supabase/migrations/20260627000005_action_items_table.sql` — Action items table.
- `supabase/migrations/20260627000006_action_items_realtime.sql` — Action items in Realtime.
- `src/lib/hooks/use-realtime.ts` — Reusable Realtime subscription hook.
- `src/app/live/[share_token]/page.tsx` — Guest live view.
- `src/app/(authenticated)/assignments/page.tsx` — Assignments page with filter + toggle.
- `src/lib/api.ts` — All API clients including actionItemsApi, commentsApi, publicMeetingsApi.
- `src/lib/types.ts` — All shared types.
- `ENGINEERING_AUDIT.md` — Full audit with top-20 ROI fixes.
