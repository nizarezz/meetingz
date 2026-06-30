-- Schema cleanup: drop dead columns, add missing indexes, add CHECK constraints

-- 1. Drop columns that are definitively unused
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS daily_digest_email;
ALTER TABLE users DROP COLUMN IF EXISTS fcm_token;
ALTER TABLE meeting_participants DROP COLUMN IF EXISTS notified_at;
ALTER TABLE meetings DROP COLUMN IF EXISTS schedule_delay_seconds;
ALTER TABLE meetings DROP COLUMN IF EXISTS overrun_seconds;

-- Notification preferences: drop columns with zero code references
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS meeting_reminder_push;
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS outcome_prompt_push;
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS assignment_assigned;
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS assignment_completed;
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS assignment_due_soon;
-- email_digest was never read in code; daily_digest_email (the boolean) already dropped above
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS email_digest;

-- 2. Add missing indexes on foreign keys
CREATE INDEX IF NOT EXISTS idx_comments_meeting_id ON comments(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_meeting_id ON meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_meeting_id ON outcomes(meeting_id);

-- 3. Add CHECK constraints for existing enums that were only enforced in code
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'chk_action_items_priority') THEN
    ALTER TABLE action_items ADD CONSTRAINT chk_action_items_priority CHECK (priority IN ('low', 'medium', 'high'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'chk_action_items_status') THEN
    ALTER TABLE action_items ADD CONSTRAINT chk_action_items_status CHECK (status IN ('pending', 'done', 'blocked', 'overdue'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'chk_outcomes_primary_outcome') THEN
    ALTER TABLE outcomes ADD CONSTRAINT chk_outcomes_primary_outcome CHECK (primary_outcome IN ('Decision Made', 'Action Items Assigned', 'Postponed'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'chk_meetings_status') THEN
    ALTER TABLE meetings ADD CONSTRAINT chk_meetings_status CHECK (status IN ('planned', 'active', 'completed', 'logged'));
  END IF;
END $$;

-- 4. Add updated_at trigger to tables that are missing it
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'action_items_updated_at') THEN
    DROP TRIGGER IF EXISTS action_items_updated_at ON action_items CASCADE;
    CREATE TRIGGER action_items_updated_at
      BEFORE UPDATE ON action_items
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'comments_updated_at') THEN
    DROP TRIGGER IF EXISTS comments_updated_at ON comments CASCADE;
    CREATE TRIGGER comments_updated_at
      BEFORE UPDATE ON comments
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'agenda_items_updated_at') THEN
    DROP TRIGGER IF EXISTS agenda_items_updated_at ON agenda_items CASCADE;
    CREATE TRIGGER agenda_items_updated_at
      BEFORE UPDATE ON agenda_items
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- 5. Expose timer state ONLY via RLS — remove meetings, outcomes, action_items from public Realtime
--    (keeping meeting_timer_state for authenticated users only)
-- Note: supabase_realtime publication tables must be managed carefully.
-- This DROP is safe because the publication is just a broadcast filter;
-- RLS still applies on the tables themselves.
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS meetings;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS outcomes;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS action_items;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS action_item_activity;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS action_item_reminders;

-- 6. Drop action_items.done — fully replaced by action_items.status
DROP TRIGGER IF EXISTS action_items_sync_done_status ON action_items CASCADE;
DROP TRIGGER IF EXISTS action_items_sync_done ON action_items CASCADE;
DROP FUNCTION IF EXISTS sync_action_item_done_status;
ALTER TABLE action_items DROP COLUMN IF EXISTS done;

-- 7. Fix blocked_by: add missing foreign key reference to users(id)
--    Also drop+recreate old done-dependent indexes with status equivalents
ALTER TABLE action_items ADD CONSTRAINT fk_action_items_blocked_by
  FOREIGN KEY (blocked_by) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED;

DROP INDEX IF EXISTS idx_action_items_team_id_assignee_id_done;
DROP INDEX IF EXISTS idx_action_items_due_date;
DROP INDEX IF EXISTS idx_action_items_team_id_done;

CREATE INDEX IF NOT EXISTS idx_action_items_team_id_assignee_id_status
  ON action_items(team_id, assignee_id, status)
  WHERE assignee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_action_items_due_date_pending
  ON action_items(due_date)
  WHERE due_date IS NOT NULL AND status <> 'done';

CREATE INDEX IF NOT EXISTS idx_action_items_team_id_status
  ON action_items(team_id, status);

-- 8. Department: single source of truth
--    Keep on: users (user's department), meetings (meeting ownership/filtering)
--    Drop from: meeting_participants (always derivable via users.id join)
ALTER TABLE meeting_participants DROP COLUMN IF EXISTS department;
