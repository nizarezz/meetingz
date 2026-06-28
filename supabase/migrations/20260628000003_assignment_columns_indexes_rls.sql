-- Phase 1a: Assignment system — columns, indexes, RLS
-- 1. Add missing columns to action_items and outcomes
-- 2. Add performance indexes
-- 3. Add missing RLS policies
-- 4. Auto-update updated_at triggers

-- ============================================================
-- 1. action_items: add tracking columns
-- ============================================================
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES users(id);
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS assigned_at timestamptz DEFAULT now();
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES users(id);
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium'
  CHECK (priority IN ('low', 'medium', 'high'));

-- Copy text into title for existing rows where title is null
UPDATE action_items SET title = text WHERE title IS NULL;

-- Make title NOT NULL after backfill
ALTER TABLE action_items ALTER COLUMN title SET NOT NULL;

-- ============================================================
-- 2. outcomes: add tracking columns
-- ============================================================
ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id);

-- ============================================================
-- 3. Add auto-updated_at triggers for action_items and outcomes
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
        team_id = auth.user_team_id()
        AND auth.user_role() IN ('super_admin', 'dept_admin')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'action_items' AND policyname = 'Admins can delete action items') THEN
    CREATE POLICY "Admins can delete action items"
      ON action_items FOR DELETE USING (
        team_id = auth.user_team_id()
        AND auth.user_role() IN ('super_admin', 'dept_admin')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'outcomes' AND policyname = 'Admins can delete outcomes') THEN
    CREATE POLICY "Admins can delete outcomes"
      ON outcomes FOR DELETE USING (
        team_id = auth.user_team_id()
        AND auth.user_role() IN ('super_admin', 'dept_admin')
      );
  END IF;
END $$;

-- Allow assignee by email to update their own action items
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'action_items' AND policyname = 'Assignee by email can update action items') THEN
    CREATE POLICY "Assignee by email can update action items"
      ON action_items FOR UPDATE USING (
        team_id = auth.user_team_id()
        AND (
          assignee_id = auth.uid()
          OR assignee_email = (SELECT email FROM users WHERE id = auth.uid() AND deleted_at IS NULL)
        )
      );
  END IF;
END $$;
