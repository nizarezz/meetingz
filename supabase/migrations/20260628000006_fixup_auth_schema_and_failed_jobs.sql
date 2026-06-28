-- Fixup: apply corrections from modified migrations 00001 and 00002
-- 1. Fix failed_jobs view: updated_at → COALESCE(completed_at, created_at)
-- 2. Create public.user_team_id() and public.user_role() helpers
--    (originally in auth schema, but CLI cannot write to auth schema)

-- ============================================================
-- 1. Fix failed_jobs view (updated_at does not exist on job_queue)
-- ============================================================
CREATE OR REPLACE VIEW failed_jobs AS
SELECT
  id,
  type,
  payload,
  attempts,
  max_attempts,
  error,
  created_at,
  COALESCE(completed_at, created_at) AS last_attempt
FROM job_queue
WHERE status = 'failed'
ORDER BY last_attempt DESC;

-- ============================================================
-- 2. Create public helper functions (duplicates of auth schema ones
--    from migration 00002, created here so CLI-based migrations can
--    reference them without auth schema write permissions)
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_team_id() RETURNS uuid AS $$
  SELECT team_id FROM public.users WHERE id = auth.uid() AND deleted_at IS NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.user_role() RETURNS text AS $$
  SELECT role FROM public.users WHERE id = auth.uid() AND deleted_at IS NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
