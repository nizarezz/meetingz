-- Phase 1a: Assignment system — columns, indexes, RLS
-- 1. Add tracking columns to action_items (assigned_by, assigned_at, priority, status)
-- 2. Add tracking columns to outcomes (updated_at, updated_by)
-- 3. Add performance indexes
-- 4. Add missing RLS policies
-- 5. Auto-update updated_at triggers

-- ============================================================
-- 1. action_items: add tracking columns
-- ============================================================

-- assigned_by tracks who created/assigned the item
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES users(id);

-- assigned_at is when the assignment was made
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS assigned_at timestamptz DEFAULT now();

-- priority for triage, defaulting to medium
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium'
  CHECK (priority IN ('low', 'medium', 'high'));

-- status replaces a simple done boolean with a richer state machine
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'
  CHECK (status IN ('pending', 'in_progress', 'blocked', 'done'));

-- Sync existing done=true rows to status='done'
UPDATE action_items SET status = 'done' WHERE done = true AND status = 'pending';

-- ============================================================
-- 2. outcomes: add tracking columns
-- ============================================================
ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id);

-- ============================================================
-- 3. Auto-update updated_at triggers
-- ============================================================
DROP TRIGGER IF EXISTS action_items_updated_at ON action_items CASCADE;
CREATE TRIGGER action_items_updated_at
  BEFORE UPDATE ON action_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS outcomes_updated_at ON outcomes CASCADE;
CREATE TRIGGER outcomes_updated_at
  BEFORE UPDATE ON outcomes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 4. Add missing indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_action_items_team_id_assignee_id_done
  ON action_items(team_id, assignee_id, done)
  WHERE assignee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_action_items_due_date
  ON action_items(due_date)
  WHERE due_date IS NOT NULL AND done = false;

CREATE INDEX IF NOT EXISTS idx_action_items_team_id_done
  ON action_items(team_id, done);

CREATE INDEX IF NOT EXISTS idx_outcomes_team_id_meeting_id
  ON outcomes(team_id, meeting_id);

-- ============================================================
-- 5. Add missing RLS policies
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'action_items' AND policyname = 'Admins can insert action items') THEN
    CREATE POLICY "Admins can insert action items"
      ON action_items FOR INSERT WITH CHECK (
        team_id = public.user_team_id()
        AND public.user_role() IN ('super_admin', 'dept_admin')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'action_items' AND policyname = 'Admins can delete action items') THEN
    CREATE POLICY "Admins can delete action items"
      ON action_items FOR DELETE USING (
        team_id = public.user_team_id()
        AND public.user_role() IN ('super_admin', 'dept_admin')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'outcomes' AND policyname = 'Admins can delete outcomes') THEN
    CREATE POLICY "Admins can delete outcomes"
      ON outcomes FOR DELETE USING (
        team_id = public.user_team_id()
        AND public.user_role() IN ('super_admin', 'dept_admin')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'action_items' AND policyname = 'Assignee by email can update action items') THEN
    CREATE POLICY "Assignee by email can update action items"
      ON action_items FOR UPDATE USING (
        team_id = public.user_team_id()
        AND (
          assignee_id = auth.uid()
          OR assignee_email = (SELECT email FROM users WHERE id = auth.uid() AND deleted_at IS NULL)
        )
      );
  END IF;
END $$;
