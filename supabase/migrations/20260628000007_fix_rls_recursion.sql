-- Fix infinite recursion in RLS policies
-- The helper functions public.user_team_id() and public.user_role() query the
-- public.users table, which has RLS enabled with a policy that calls user_team_id().
-- Without SECURITY DEFINER, this causes infinite recursion (stack depth limit exceeded).
-- 
-- By running as SECURITY DEFINER, the functions execute with the privileges of
-- their owner (postgres), bypassing RLS on the users table.

CREATE OR REPLACE FUNCTION public.user_team_id() RETURNS uuid AS $$
  SELECT team_id FROM public.users WHERE id = auth.uid() AND deleted_at IS NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.user_role() RETURNS text AS $$
  SELECT role FROM public.users WHERE id = auth.uid() AND deleted_at IS NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
