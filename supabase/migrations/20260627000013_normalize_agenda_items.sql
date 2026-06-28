CREATE TABLE IF NOT EXISTS agenda_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid REFERENCES meetings(id) ON DELETE CASCADE,
  template_id uuid REFERENCES templates(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  duration integer NOT NULL DEFAULT 0,
  assignee_email text,
  presenter text,
  notes text,
  team_id uuid NOT NULL REFERENCES teams(id),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT agenda_items_owner_check CHECK (
    (meeting_id IS NOT NULL AND template_id IS NULL)
    OR (meeting_id IS NULL AND template_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_agenda_items_meeting_id ON agenda_items(meeting_id);
CREATE INDEX IF NOT EXISTS idx_agenda_items_template_id ON agenda_items(template_id);

INSERT INTO agenda_items (meeting_id, template_id, sort_order, title, duration, assignee_email, presenter, notes, team_id)
SELECT id, NULL, 0, 'Migrated item', 0, NULL, NULL, NULL, team_id
FROM meetings
WHERE jsonb_array_length(agenda_items) = 0;

INSERT INTO agenda_items (meeting_id, sort_order, title, duration, assignee_email, presenter, notes, team_id)
SELECT
  m.id,
  ordinality - 1,
  item ->> 'title',
  COALESCE((item ->> 'duration')::int, 0),
  item ->> 'assignee_email',
  item ->> 'presenter',
  item ->> 'notes',
  m.team_id
FROM meetings m,
LATERAL jsonb_array_elements(m.agenda_items) WITH ORDINALITY AS items(item, ordinality);

INSERT INTO agenda_items (template_id, sort_order, title, duration, assignee_email, presenter, notes, team_id)
SELECT
  t.id,
  ordinality - 1,
  item ->> 'title',
  COALESCE((item ->> 'duration')::int, 0),
  item ->> 'assignee_email',
  item ->> 'presenter',
  item ->> 'notes',
  t.team_id
FROM templates t,
LATERAL jsonb_array_elements(t.agenda_items) WITH ORDINALITY AS items(item, ordinality);

ALTER TABLE meetings DROP COLUMN IF EXISTS agenda_items;
ALTER TABLE templates DROP COLUMN IF EXISTS agenda_items;
