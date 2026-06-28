-- Phase 1b: Assignment system — normalize assignee, activity log
-- 1. Backfill assignee_id from assignee_email for existing rows
-- 2. Add trigger to auto-set assignee_id when assignee_email matches a known user
-- 3. Sync done=true → status='done' for backward compatibility
-- 4. Add action_item_activity table for change tracking
-- 5. Trigger: log status changes (assigned, done, blocked, priority, due_date, reassigned)

-- ============================================================
-- 1. Backfill assignee_id from assignee_email
--    NOTE: Only rows where the email matches an existing user
--    in the users table will be resolved. Rows with no matching
--    user stay as assignee_email only — this is expected for
--    external/invited participants who haven't signed up yet.
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
-- 3. Bidirectional done ↔ status sync
--    Old clients send { done: true } → auto-sets status='done'
--    New clients send { status: 'done' } → auto-sets done=true
--    Keeps both columns consistent regardless of which one is written.
-- ============================================================
CREATE OR REPLACE FUNCTION sync_action_item_done_status()
RETURNS trigger AS $$
BEGIN
  IF NEW.done IS DISTINCT FROM OLD.done THEN
    -- done was explicitly toggled; sync status
    NEW.status := CASE WHEN NEW.done THEN 'done' ELSE 'pending' END;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    -- status was explicitly changed; sync done
    NEW.done := NEW.status = 'done';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS action_items_sync_done_status ON action_items CASCADE;
CREATE TRIGGER action_items_sync_done_status
  BEFORE UPDATE OF done, status ON action_items
  FOR EACH ROW EXECUTE FUNCTION sync_action_item_done_status();

-- ============================================================
-- 4. action_item_activity: immutable log of status changes
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
            AND a.team_id = public.user_team_id()
        )
      );
  END IF;
END $$;

-- ============================================================
-- 5. Trigger: log state transitions to activity table
--    Fires on INSERT and on any UPDATE that changes a tracked field.
--    Tracks: created, assigned, done, blocked, in_progress,
--    priority, due_date, reassigned.
-- ============================================================
CREATE OR REPLACE FUNCTION log_action_item_activity()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO action_item_activity (action_item_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, NEW.assigned_by, 'created', NULL, NEW.text);
    IF NEW.assignee_id IS NOT NULL THEN
      INSERT INTO action_item_activity (action_item_id, actor_id, field, old_value, new_value)
      VALUES (NEW.id, NEW.assigned_by, 'assigned', NULL, (SELECT email FROM users WHERE id = NEW.assignee_id));
    END IF;
    RETURN NEW;
  END IF;

  -- status transitions (done, blocked, in_progress, pending)
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO action_item_activity (action_item_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'status', OLD.status, NEW.status);
  END IF;

  -- reassigned
  IF OLD.assignee_id IS DISTINCT FROM NEW.assignee_id THEN
    INSERT INTO action_item_activity (action_item_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, NEW.assigned_by, 'reassigned',
      (SELECT email FROM users WHERE id = OLD.assignee_id),
      (SELECT email FROM users WHERE id = NEW.assignee_id));
  END IF;

  -- priority change
  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO action_item_activity (action_item_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'priority', OLD.priority, NEW.priority);
  END IF;

  -- due_date change
  IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
    INSERT INTO action_item_activity (action_item_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'due_date', OLD.due_date::text, NEW.due_date::text);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS action_items_log_activity ON action_items CASCADE;
CREATE TRIGGER action_items_log_activity
  AFTER INSERT OR UPDATE OF status, assignee_id, priority, due_date ON action_items
  FOR EACH ROW EXECUTE FUNCTION log_action_item_activity();

-- ============================================================
-- 6. Enable realtime for action_item_activity
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE action_item_activity;
