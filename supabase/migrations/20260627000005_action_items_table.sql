CREATE TABLE IF NOT EXISTS action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outcome_id uuid REFERENCES outcomes(id) ON DELETE CASCADE,
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  text text NOT NULL,
  assignee_email text,
  due_date date,
  done boolean DEFAULT false,
  team_id uuid NOT NULL REFERENCES teams(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_items_outcome_id ON action_items(outcome_id);
CREATE INDEX IF NOT EXISTS idx_action_items_meeting_id ON action_items(meeting_id);
CREATE INDEX IF NOT EXISTS idx_action_items_assignee_email ON action_items(assignee_email);
