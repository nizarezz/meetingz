-- Phase 6: Overdue check — daily cron to mark past-due action items

-- 1. Add 'overdue' to the allowed status values
ALTER TABLE action_items DROP CONSTRAINT IF EXISTS action_items_status_check;
ALTER TABLE action_items ADD CONSTRAINT action_items_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'blocked'::text, 'done'::text, 'overdue'::text]));

-- 2. Create index for the overdue query (status=pending, due_date not null)
CREATE INDEX IF NOT EXISTS idx_action_items_overdue_check
  ON action_items(due_date)
  WHERE status = 'pending' AND due_date IS NOT NULL;

-- 3. Create a helper function in public schema to retrieve the cron secret
CREATE OR REPLACE FUNCTION get_cron_secret_for_overdue()
RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER
AS $$ SELECT '1b0ff2d9-83ef-41ad-9682-61a3b78edb53'::text $$;

-- 4. Schedule overdue-check to run daily at midnight
SELECT cron.schedule(
  'overdue-check',
  '0 0 * * *',
  $$
  SELECT net.http_post(
    url:='https://rmsejtpykbozirahynrd.supabase.co/functions/v1/overdue-check',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_cron_secret_for_overdue()
    )
  )::text
  $$
);
