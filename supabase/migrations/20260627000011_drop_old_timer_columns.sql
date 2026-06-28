-- Timer state is now in meeting_timer_state table.
-- These columns on meetings are stale and must be removed.
ALTER TABLE meetings DROP COLUMN IF EXISTS is_timer_running;
ALTER TABLE meetings DROP COLUMN IF EXISTS timer_started_at;
ALTER TABLE meetings DROP COLUMN IF EXISTS timer_item_started_at;
ALTER TABLE meetings DROP COLUMN IF EXISTS timer_base_total;
ALTER TABLE meetings DROP COLUMN IF EXISTS timer_base_item;
ALTER TABLE meetings DROP COLUMN IF EXISTS active_item_index;
ALTER TABLE meetings DROP COLUMN IF EXISTS paused_at;
