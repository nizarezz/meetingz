-- Production setup: enable extensions, configure cron for production project ref

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Remove any existing overdue-check cron (e.g. from staging)
SELECT cron.unschedule('overdue-check');

-- 3. Schedule overdue-check for production
SELECT cron.schedule(
  'overdue-check',
  '0 0 * * *',
  $$
  SELECT net.http_post(
    url:='https://cxvpnvlicdnghvlzprhf.supabase.co/functions/v1/overdue-check',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_cron_secret_for_overdue()
    )
  )::text
  $$
);
