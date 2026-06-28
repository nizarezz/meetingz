ALTER TABLE meetings ADD COLUMN IF NOT EXISTS schedule_delay_seconds integer;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS overrun_seconds integer;
