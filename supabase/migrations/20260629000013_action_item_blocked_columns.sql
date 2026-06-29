ALTER TABLE action_items
  ADD COLUMN blocked_by uuid,
  ADD COLUMN blocked_at timestamptz;
