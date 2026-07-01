-- Schema hardening: add missing CHECK constraints and notification toggle

-- 1. users.role CHECK constraint (was missing — every other enum-like column has one)
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role = ANY (ARRAY['super_admin'::text, 'dept_admin'::text, 'member'::text]));

-- 2. Add action_item_due_email toggle to notification_preferences
--    (meeting_reminder_email and outcome_prompt_email exist; this completes the set)
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS action_item_due_email boolean NOT NULL DEFAULT true;
