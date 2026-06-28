-- Phase 1c: Assignment system — notification preferences & reminder scheduling
-- 1. user_notification_preferences table
-- 2. assignment_reminders queue table
-- 3. Trigger: schedule reminder when action item is assigned with due_date
-- 4. Default preferences for all existing users

-- ============================================================
-- 1. user_notification_preferences
-- ============================================================
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  assignment_assigned boolean DEFAULT true,
  assignment_completed boolean DEFAULT true,
  assignment_due_soon boolean DEFAULT true,
  outcome_prompt boolean DEFAULT true,
  meeting_reminder boolean DEFAULT true,
  email_digest text DEFAULT 'realtime' CHECK (email_digest IN ('realtime', 'daily', 'weekly', 'never')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_notification_preferences' AND policyname = 'Users can read own preferences') THEN
    CREATE POLICY "Users can read own preferences"
      ON user_notification_preferences FOR SELECT USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_notification_preferences' AND policyname = 'Users can insert own preferences') THEN
    CREATE POLICY "Users can insert own preferences"
      ON user_notification_preferences FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_notification_preferences' AND policyname = 'Users can update own preferences') THEN
    CREATE POLICY "Users can update own preferences"
      ON user_notification_preferences FOR UPDATE USING (user_id = auth.uid());
  END IF;
END $$;

-- Auto-create preferences row on user signup via trigger
CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS trigger AS $$
BEGIN
  INSERT INTO user_notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_create_notification_prefs ON users CASCADE;
CREATE TRIGGER users_create_notification_prefs
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION create_default_notification_preferences();

-- Backfill preferences for existing users
INSERT INTO user_notification_preferences (user_id)
SELECT id FROM users u
WHERE NOT EXISTS (SELECT 1 FROM user_notification_preferences p WHERE p.user_id = u.id);

-- ============================================================
-- 2. Create subscription table for push/due-date reminders
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
-- 3. Trigger: schedule reminder for assigned items with due_date
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
    -- Remind 24 hours before due_date
    reminder_time := NEW.due_date::timestamptz - interval '24 hours';
    IF reminder_time > now() THEN
      INSERT INTO action_item_reminders (action_item_id, remind_at)
      VALUES (NEW.id, reminder_time);
    END IF;

    -- Also remind 1 hour before
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
-- 4. Enable realtime for new tables
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE action_item_reminders;
