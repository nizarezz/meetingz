-- Phase 4: Outcome notes table + comment pull tracking
CREATE TABLE IF NOT EXISTS outcome_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  outcome_id uuid NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
  text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'comment')),
  source_comment_id uuid REFERENCES comments(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  team_id uuid NOT NULL REFERENCES teams(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outcome_notes_meeting_id
  ON outcome_notes(meeting_id, sort_order);

ALTER TABLE outcome_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can read outcome notes"
  ON outcome_notes FOR SELECT
  USING (team_id = public.user_team_id());

CREATE POLICY "Hosts can insert outcome notes"
  ON outcome_notes FOR INSERT WITH CHECK (
    team_id = public.user_team_id()
    AND (
      public.user_role() = 'super_admin'
      OR EXISTS (
        SELECT 1 FROM meetings m
        WHERE m.id = meeting_id AND m.created_by = auth.uid()
      )
    )
  );

ALTER TABLE comments ADD COLUMN IF NOT EXISTS pulled_to_outcome boolean DEFAULT false;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS pulled_at timestamptz;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS pulled_by uuid REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_comments_pulled
  ON comments(pulled_to_outcome)
  WHERE pulled_to_outcome = true;
