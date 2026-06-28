CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id),
  user_id uuid NOT NULL REFERENCES users(id),
  text text NOT NULL,
  created_at timestamptz DEFAULT now(),
  team_id uuid NOT NULL REFERENCES teams(id)
);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'comments' AND policyname = 'Team members can read comments') THEN
    CREATE POLICY "Team members can read comments"
      ON comments FOR SELECT
      USING (team_id IN (SELECT team_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'comments' AND policyname = 'Team members can insert comments') THEN
    CREATE POLICY "Team members can insert comments"
      ON comments FOR INSERT
      WITH CHECK (team_id IN (SELECT team_id FROM users WHERE id = auth.uid()));
  END IF;
END $$;
