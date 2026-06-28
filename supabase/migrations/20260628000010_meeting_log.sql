-- Phase 5: Meeting log — report snapshot columns
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS report_snapshot jsonb;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS logged_at timestamptz;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS logged_by uuid REFERENCES users(id);
