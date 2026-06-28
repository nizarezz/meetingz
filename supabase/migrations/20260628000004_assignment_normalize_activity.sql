-- Phase 1b: Assignment system — normalize assignee, activity log
-- 1. Backfill assignee_id from assignee_email for existing rows
-- 2. Add trigger to auto-set assignee_id when assignee_email matches a known user
-- 3. Add action_item_activity table for change tracking

-- ============================================================
-- 1. Backfill assignee_id from assignee_email
-- ============================================================
UPDATE action_items a
SET assignee_id = u.id
FROM users u
WHERE a.assignee_email IS NOT NULL
  AND a.assignee_id IS NULL
  AND u.email = a.assignee_email
  AND u.deleted_at IS NULL;

-- ============================================================
-- 2. Trigger: auto-set assignee_id when assignee_email matches
-- ============================================================
CREATE OR REPLACE FUNCTION resolve_assignee_id()
RETURNS trigger AS $$
BEGIN
  IF NEW.assignee_email IS NOT NULL AND NEW.assignee_id IS NULL THEN
    SELECT id INTO NEW.assignee_id
    FROM users
    WHERE email = NEW.assignee_email AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS action_items_resolve_assignee_id ON action_items CASCADE;
CREATE TRIGGER action_items_resolve_assignee_id
  BEFORE INSERT OR UPDATE OF assignee_email ON action_items
  FOR EACH ROW EXECUTE FUNCTION resolve_assignee_id();

-- ============================================================
-- 3. action_item_activity: immutable log of status changes
-- ============================================================
CREATE TABLE IF NOT EXISTS action_item_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_item_id uuid NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id),
  field text NOT NULL,
  old_value text,
  new_value text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_item_activity_item_id
  ON action_item_activity(action_item_id, created_at DESC);

ALTER TABLE action_item_activity ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'action_item_activity' AND policyname = 'Team members can read action item activity') THEN
    CREATE POLICY "Team members can read action item activity"
      ON action_item_activity FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM action_items a
          WHERE a.id = action_item_id
            AND a.team_id = auth.user_team_id()
        )
      );
  END IF;
END $$;

-- ============================================================
-- 4. Trigger: log priority changes to activity table
-- ============================================================
CREATE OR REPLACE FUNCTION log_action_item_activity()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO action_item_activity (action_item_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, NEW.assigned_by, 'created', NULL, NEW.title);
    IF NEW.assignee_id IS NOT NULL THEN
      INSERT INTO action_item_activity (action_item_id, actor_id, field, old_value, new_value)
      VALUES (NEW.id, NEW.assigned_by, 'assigned', NULL, (SELECT email FROM users WHERE id = NEW.assignee_id));
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.done IS DISTINCT FROM NEW.done THEN
    INSERT INTO action_item_activity (action_item_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, NEW.completed_by, 'done', OLD.done::text, NEW.done::text);
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.assignee_id IS DISTINCT FROM NEW.assignee_id THEN
    INSERT INTO action_item_activity (action_item_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, NEW.assigned_by, 'reassigned',
      (SELECT email FROM users WHERE id = OLD.assignee_id),
      (SELECT email FROM users WHERE id = NEW.assignee_id));
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO action_item_activity (action_item_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'priority', OLD.priority, NEW.priority);
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.due_date IS DISTINCT FROM NEW.due_date THEN
    INSERT INTO action_item_activity (action_item_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'due_date', OLD.due_date::text, NEW.due_date::text);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS action_items_log_activity ON action_items CASCADE;
CREATE TRIGGER action_items_log_activity
  AFTER INSERT OR UPDATE OF done, assignee_id, priority, due_date ON action_items
  FOR EACH ROW EXECUTE FUNCTION log_action_item_activity();

-- ============================================================
-- 5. Enable realtime for action_item_activity
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE action_item_activity;
