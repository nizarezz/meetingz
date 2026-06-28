-- RLS + audit log migration
-- 1. Enable RLS on all tables and add team-isolated, role-aware policies
-- 2. Create audit_log table for privilege-sensitive actions

-- ============================================================
-- Helper: team_id for the requesting user
-- Created in public schema (auth schema not writable via CLI).
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_team_id() RETURNS uuid AS $$
  SELECT team_id FROM public.users WHERE id = auth.uid() AND deleted_at IS NULL;
$$ LANGUAGE sql STABLE;

-- ============================================================
-- Helper: role for the requesting user
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_role() RETURNS text AS $$
  SELECT role FROM public.users WHERE id = auth.uid() AND deleted_at IS NULL;
$$ LANGUAGE sql STABLE;

-- ============================================================
-- 1. departments
-- ============================================================
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'departments' AND policyname = 'Authenticated users can read departments') THEN
    CREATE POLICY "Authenticated users can read departments"
      ON departments FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ============================================================
-- 2. teams
-- ============================================================
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'teams' AND policyname = 'Team members can read own team') THEN
    CREATE POLICY "Team members can read own team"
      ON teams FOR SELECT USING (id = public.user_team_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'teams' AND policyname = 'Only super_admin can update team') THEN
    CREATE POLICY "Only super_admin can update team"
      ON teams FOR UPDATE USING (public.user_role() = 'super_admin');
  END IF;
END $$;

-- ============================================================
-- 3. users
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Team members can read users in team') THEN
    CREATE POLICY "Team members can read users in team"
      ON users FOR SELECT USING (team_id = public.user_team_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Users can update own profile') THEN
    CREATE POLICY "Users can update own profile"
      ON users FOR UPDATE USING (id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Admins can update users in team') THEN
    CREATE POLICY "Admins can update users in team"
      ON users FOR UPDATE USING (
        team_id = public.user_team_id()
        AND public.user_role() IN ('super_admin', 'dept_admin')
      );
  END IF;
END $$;

-- ============================================================
-- 4. meetings
-- ============================================================
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meetings' AND policyname = 'Team members can read meetings') THEN
    CREATE POLICY "Team members can read meetings"
      ON meetings FOR SELECT USING (team_id = public.user_team_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meetings' AND policyname = 'Admins can insert meetings') THEN
    CREATE POLICY "Admins can insert meetings"
      ON meetings FOR INSERT WITH CHECK (
        team_id = public.user_team_id()
        AND public.user_role() IN ('super_admin', 'dept_admin')
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meetings' AND policyname = 'Admins or creator can update meetings') THEN
    CREATE POLICY "Admins or creator can update meetings"
      ON meetings FOR UPDATE USING (
        team_id = public.user_team_id()
        AND (public.user_role() IN ('super_admin', 'dept_admin') OR created_by = auth.uid())
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meetings' AND policyname = 'Only super_admin can delete meetings') THEN
    CREATE POLICY "Only super_admin can delete meetings"
      ON meetings FOR DELETE USING (
        team_id = public.user_team_id()
        AND public.user_role() = 'super_admin'
      );
  END IF;
END $$;

-- ============================================================
-- 5. meeting_participants
-- ============================================================
ALTER TABLE meeting_participants ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meeting_participants' AND policyname = 'Team members can read participants') THEN
    CREATE POLICY "Team members can read participants"
      ON meeting_participants FOR SELECT USING (team_id = public.user_team_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meeting_participants' AND policyname = 'Admins can manage participants') THEN
    CREATE POLICY "Admins can manage participants"
      ON meeting_participants FOR INSERT WITH CHECK (
        team_id = public.user_team_id()
        AND public.user_role() IN ('super_admin', 'dept_admin')
      );
  END IF;

  -- Reuse same check for UPDATE and DELETE
  CREATE POLICY "Admins can update participants"
    ON meeting_participants FOR UPDATE USING (
      team_id = public.user_team_id()
      AND public.user_role() IN ('super_admin', 'dept_admin')
    );

  CREATE POLICY "Admins can delete participants"
    ON meeting_participants FOR DELETE USING (
      team_id = public.user_team_id()
      AND public.user_role() IN ('super_admin', 'dept_admin')
    );
END $$;

-- ============================================================
-- 6. outcomes
-- ============================================================
ALTER TABLE outcomes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'outcomes' AND policyname = 'Team members can read outcomes') THEN
    CREATE POLICY "Team members can read outcomes"
      ON outcomes FOR SELECT USING (team_id = public.user_team_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'outcomes' AND policyname = 'Admins can insert outcomes') THEN
    CREATE POLICY "Admins can insert outcomes"
      ON outcomes FOR INSERT WITH CHECK (
        team_id = public.user_team_id()
        AND public.user_role() IN ('super_admin', 'dept_admin')
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'outcomes' AND policyname = 'Admins can update outcomes') THEN
    CREATE POLICY "Admins can update outcomes"
      ON outcomes FOR UPDATE USING (
        team_id = public.user_team_id()
        AND public.user_role() IN ('super_admin', 'dept_admin')
      );
  END IF;
END $$;

-- ============================================================
-- 7. action_items
-- ============================================================
ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'action_items' AND policyname = 'Team members can read action items') THEN
    CREATE POLICY "Team members can read action items"
      ON action_items FOR SELECT USING (team_id = public.user_team_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'action_items' AND policyname = 'Admins or assignee can update action items') THEN
    CREATE POLICY "Admins or assignee can update action items"
      ON action_items FOR UPDATE USING (
        team_id = public.user_team_id()
        AND (public.user_role() IN ('super_admin', 'dept_admin') OR assignee_id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 8. templates
-- ============================================================
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'templates' AND policyname = 'Team members can read templates') THEN
    CREATE POLICY "Team members can read templates"
      ON templates FOR SELECT USING (team_id = public.user_team_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'templates' AND policyname = 'Admins can insert templates') THEN
    CREATE POLICY "Admins can insert templates"
      ON templates FOR INSERT WITH CHECK (
        team_id = public.user_team_id()
        AND public.user_role() IN ('super_admin', 'dept_admin')
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'templates' AND policyname = 'Admins can update templates') THEN
    CREATE POLICY "Admins can update templates"
      ON templates FOR UPDATE USING (
        team_id = public.user_team_id()
        AND public.user_role() IN ('super_admin', 'dept_admin')
      );
  END IF;
END $$;

-- ============================================================
-- 9. notification_preferences
-- ============================================================
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notification_preferences' AND policyname = 'Users can read own preferences') THEN
    CREATE POLICY "Users can read own preferences"
      ON notification_preferences FOR SELECT USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notification_preferences' AND policyname = 'Users can upsert own preferences') THEN
    CREATE POLICY "Users can upsert own preferences"
      ON notification_preferences FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notification_preferences' AND policyname = 'Users can update own preferences') THEN
    CREATE POLICY "Users can update own preferences"
      ON notification_preferences FOR UPDATE USING (user_id = auth.uid());
  END IF;
END $$;

-- ============================================================
-- 10. agenda_items
-- ============================================================
ALTER TABLE agenda_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agenda_items' AND policyname = 'Team members can read agenda items') THEN
    CREATE POLICY "Team members can read agenda items"
      ON agenda_items FOR SELECT USING (team_id = public.user_team_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agenda_items' AND policyname = 'Admins can manage agenda items') THEN
    CREATE POLICY "Admins can manage agenda items"
      ON agenda_items FOR INSERT WITH CHECK (
        team_id = public.user_team_id()
        AND public.user_role() IN ('super_admin', 'dept_admin')
      );
  END IF;

  CREATE POLICY "Admins can update agenda items"
    ON agenda_items FOR UPDATE USING (
      team_id = public.user_team_id()
      AND public.user_role() IN ('super_admin', 'dept_admin')
    );

  CREATE POLICY "Admins can delete agenda items"
    ON agenda_items FOR DELETE USING (
      team_id = public.user_team_id()
      AND public.user_role() IN ('super_admin', 'dept_admin')
    );
END $$;

-- ============================================================
-- 11. meeting_timer_state
-- ============================================================
ALTER TABLE meeting_timer_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meeting_timer_state' AND policyname = 'Team members can read timer state') THEN
    CREATE POLICY "Team members can read timer state"
      ON meeting_timer_state FOR SELECT
      USING (meeting_id IN (SELECT id FROM meetings WHERE team_id = public.user_team_id()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meeting_timer_state' AND policyname = 'Admins can manage timer state') THEN
    CREATE POLICY "Admins can manage timer state"
      ON meeting_timer_state FOR INSERT WITH CHECK (
        meeting_id IN (SELECT id FROM meetings WHERE team_id = public.user_team_id())
        AND public.user_role() IN ('super_admin', 'dept_admin')
      );
  END IF;

  CREATE POLICY "Admins can update timer state"
    ON meeting_timer_state FOR UPDATE USING (
      meeting_id IN (SELECT id FROM meetings WHERE team_id = public.user_team_id())
      AND public.user_role() IN ('super_admin', 'dept_admin')
    );
END $$;

-- ============================================================
-- 12. audit_log table
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  actor_id uuid NOT NULL REFERENCES users(id),
  team_id uuid NOT NULL REFERENCES teams(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_team_id ON audit_log(team_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_log' AND policyname = 'Team members can read audit log') THEN
    CREATE POLICY "Team members can read audit log"
      ON audit_log FOR SELECT USING (team_id = public.user_team_id());
  END IF;
END $$;

-- ============================================================
-- 13. comments (existing policies remain; add missing ones)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'comments' AND policyname = 'Team members can update own comments') THEN
    CREATE POLICY "Team members can update own comments"
      ON comments FOR UPDATE USING (user_id = auth.uid());
  END IF;
END $$;
