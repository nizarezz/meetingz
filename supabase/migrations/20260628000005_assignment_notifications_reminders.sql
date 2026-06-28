-- Phase 1c: Assignment system — consolidate notification preferences & reminder scheduling
-- 1. Add assignment-specific columns to existing notification_preferences table
-- 2. No new user_notification_preferences table — consolidate on the existing one
-- 3. action_item_reminders table for scheduled due-date reminders
-- 4. Trigger: schedule reminders when an action item is assigned with a due_date

-- ============================================================
-- 1. Extend existing notification_preferences with assignment toggles
--    instead of creating a duplicate table.
-- ============================================================
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS assignment_assigned boolean DEFAULT true;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS assignment_completed boolean DEFAULT true;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS assignment_due_soon boolean DEFAULT true;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS email_digest text DEFAULT 'realtime'
  CHECK (email_digest IN ('realtime', 'daily', 'weekly', 'never'));
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- ============================================================
-- 2. action_item_reminders: scheduled due-date notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS action_item_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_item_id uuid NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
  remind_at timestamptz NOT NULL,
  sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_item_reminders_pending
  ON action_item_reminders(remind_at, sent)
  WHERE sent = false;

ALTER TABLE action_item_reminders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'action_item_reminders' AND policyname = 'Team members can read reminders') THEN
    CREATE POLICY "Team members can read reminders"
      ON action_item_reminders FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM action_items a
          WHERE a.id = action_item_id
            AND a.team_id = auth.user_team_id()
        )
      );
  END IF;
END $$;

-- ============================================================
-- 3. Trigger: schedule reminder rows for assigned items with due_date
--    Removes any unsent reminders for the item first, then inserts
--    new ones at 24h and 1h before the due_date.
-- ============================================================
CREATE OR REPLACE FUNCTION schedule_action_item_reminder()
RETURNS trigger AS $$
DECLARE
  reminder_time timestamptz;
BEGIN
  -- Remove old unsent reminders for this item
  DELETE FROM action_item_reminders
  WHERE action_item_id = NEW.id AND sent = false;

  -- Only schedule if assigned and has due_date and not done
  IF NEW.assignee_id IS NOT NULL AND NEW.due_date IS NOT NULL AND NOT NEW.done THEN
    -- 24 hours before
    reminder_time := NEW.due_date::timestamptz - interval '24 hours';
    IF reminder_time > now() THEN
      INSERT INTO action_item_reminders (action_item_id, remind_at)
      VALUES (NEW.id, reminder_time);
    END IF;

    -- 1 hour before
    reminder_time := NEW.due_date::timestamptz - interval '1 hour';
    IF reminder_time > now() THEN
      INSERT INTO action_item_reminders (action_item_id, remind_at)
      VALUES (NEW.id, reminder_time);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS action_items_schedule_reminder ON action_items CASCADE;
CREATE TRIGGER action_items_schedule_reminder
  AFTER INSERT OR UPDATE OF assignee_id, due_date, done ON action_items
  FOR EACH ROW EXECUTE FUNCTION schedule_action_item_reminder();

-- ============================================================
-- 4. Enable realtime for action_item_reminders
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE action_item_reminders;
