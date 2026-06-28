-- Add updated_at to meetings
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Auto-update updated_at on changes
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS meetings_updated_at ON meetings CASCADE;
CREATE TRIGGER meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Separate timer state table
CREATE TABLE IF NOT EXISTS meeting_timer_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE UNIQUE,
  is_timer_running boolean DEFAULT false,
  timer_started_at timestamptz,
  timer_item_started_at timestamptz,
  timer_base_total integer DEFAULT 0,
  timer_base_item integer DEFAULT 0,
  active_item_index integer DEFAULT 0,
  paused_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_timer_state_meeting_id ON meeting_timer_state(meeting_id);

-- Backfill timer state from existing meetings
INSERT INTO meeting_timer_state (meeting_id, is_timer_running, timer_started_at, timer_item_started_at, timer_base_total, timer_base_item, active_item_index, paused_at)
SELECT id, is_timer_running, timer_started_at, timer_item_started_at, timer_base_total, timer_base_item, active_item_index, paused_at
FROM meetings
ON CONFLICT (meeting_id) DO NOTHING;

-- Enable realtime for timer state table
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'meeting_timer_state'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE meeting_timer_state;
  END IF;
END $$;
