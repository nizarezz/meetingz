-- Add assignee_id foreign key to action_items
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES users(id);

-- Backfill assignee_id from existing email matches
UPDATE action_items ai
SET assignee_id = u.id
FROM users u
WHERE u.email = ai.assignee_email
  AND ai.assignee_id IS NULL;

-- Add updated_at to action_items and comments
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE comments ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Drop legacy jsonb columns from outcomes (now in proper tables)
ALTER TABLE outcomes DROP COLUMN IF EXISTS action_items;
ALTER TABLE outcomes DROP COLUMN IF EXISTS comments;

-- Index on assignee_id
CREATE INDEX IF NOT EXISTS idx_action_items_assignee_id ON action_items(assignee_id);
