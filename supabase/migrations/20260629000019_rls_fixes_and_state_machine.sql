-- RLS missing policies + meeting state machine trigger

-- ============================================================
-- 1. Missing DELETE / UPDATE RLS policies
-- ============================================================

-- Templates: add DELETE
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'templates' AND policyname = 'Admins can delete templates') THEN
    CREATE POLICY "Admins can delete templates"
      ON templates FOR DELETE USING (
        team_id = public.user_team_id()
        AND public.user_role() IN ('super_admin', 'dept_admin')
      );
  END IF;
END $$;

-- Meeting timer state: add DELETE
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meeting_timer_state' AND policyname = 'Admins can delete timer state') THEN
    CREATE POLICY "Admins can delete timer state"
      ON meeting_timer_state FOR DELETE USING (
        meeting_id IN (SELECT id FROM meetings WHERE team_id = public.user_team_id())
        AND public.user_role() IN ('super_admin', 'dept_admin')
      );
  END IF;
END $$;

-- Comments: add DELETE (own comment, or facilitator of the meeting, or admin)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'comments' AND policyname = 'Owners or admins can delete comments') THEN
    CREATE POLICY "Owners or admins can delete comments"
      ON comments FOR DELETE USING (
        user_id = auth.uid()
        OR public.user_role() IN ('super_admin', 'dept_admin')
        OR meeting_id IN (
          SELECT id FROM meetings
          WHERE facilitator_id = auth.uid() AND team_id = public.user_team_id()
        )
      );
  END IF;
END $$;

-- Outcome notes: add UPDATE + DELETE
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'outcome_notes' AND policyname = 'Hosts or admins can update outcome notes') THEN
    CREATE POLICY "Hosts or admins can update outcome notes"
      ON outcome_notes FOR UPDATE USING (
        team_id = public.user_team_id()
        AND (
          public.user_role() IN ('super_admin', 'dept_admin')
          OR EXISTS (
            SELECT 1 FROM meetings m
            WHERE m.id = meeting_id AND (m.created_by = auth.uid() OR m.facilitator_id = auth.uid())
          )
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'outcome_notes' AND policyname = 'Hosts or admins can delete outcome notes') THEN
    CREATE POLICY "Hosts or admins can delete outcome notes"
      ON outcome_notes FOR DELETE USING (
        team_id = public.user_team_id()
        AND (
          public.user_role() IN ('super_admin', 'dept_admin')
          OR EXISTS (
            SELECT 1 FROM meetings m
            WHERE m.id = meeting_id AND (m.created_by = auth.uid() OR m.facilitator_id = auth.uid())
          )
        )
      );
  END IF;
END $$;

-- ============================================================
-- 2. Meeting state machine trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_meeting_state_machine()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'completed' AND NEW.status != 'completed' THEN
    RAISE EXCEPTION 'Cannot change status of a completed meeting';
  END IF;
  IF OLD.status = 'logged' AND NEW.status != 'logged' THEN
    RAISE EXCEPTION 'Cannot change status of a logged meeting';
  END IF;
  IF OLD.status = 'active' AND NEW.status = 'planned' THEN
    RAISE EXCEPTION 'Cannot go back from active to planned';
  END IF;
  IF OLD.status = 'active' AND NEW.status = 'logged' THEN
    RAISE EXCEPTION 'Cannot go from active to logged (must complete first)';
  END IF;
  IF OLD.status = 'planned' AND NEW.status = 'completed' THEN
    RAISE EXCEPTION 'Cannot skip from planned to completed (must be active first)';
  END IF;
  IF OLD.status = 'planned' AND NEW.status = 'logged' THEN
    RAISE EXCEPTION 'Cannot skip from planned to logged (must be active then completed)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS meeting_state_machine ON meetings CASCADE;
CREATE TRIGGER meeting_state_machine
  BEFORE UPDATE OF status ON meetings
  FOR EACH ROW EXECUTE FUNCTION enforce_meeting_state_machine();
