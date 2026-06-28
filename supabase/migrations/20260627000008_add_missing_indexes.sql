-- Add missing DB indexes based on query patterns observed in edge functions

-- meetings: list queries filter by team_id + deleted_at, ordered by scheduled_at
CREATE INDEX IF NOT EXISTS idx_meetings_team_id_deleted_at_scheduled_at
  ON meetings(team_id, deleted_at, scheduled_at DESC);

-- meetings: guest live view by share_token
CREATE INDEX IF NOT EXISTS idx_meetings_share_token
  ON meetings(share_token)
  WHERE deleted_at IS NULL;

-- meetings: reminders cron filters by status + scheduled_at range
CREATE INDEX IF NOT EXISTS idx_meetings_status_scheduled_at
  ON meetings(status, scheduled_at)
  WHERE deleted_at IS NULL;

-- outcomes: all queries filter by meeting_id
CREATE INDEX IF NOT EXISTS idx_outcomes_meeting_id
  ON outcomes(meeting_id);

-- comments: all queries filter by meeting_id + team_id, ordered by created_at
CREATE INDEX IF NOT EXISTS idx_comments_meeting_id_team_id_created_at
  ON comments(meeting_id, team_id, created_at ASC);

-- meeting_participants: looking up a user's meetings
CREATE INDEX IF NOT EXISTS idx_meeting_participants_user_id
  ON meeting_participants(user_id);

-- users: list queries filter by team_id + deleted_at, ordered by created_at
CREATE INDEX IF NOT EXISTS idx_users_team_id_deleted_at_created_at
  ON users(team_id, deleted_at, created_at ASC);

-- users: invite/login lookup by email
CREATE INDEX IF NOT EXISTS idx_users_email
  ON users(email)
  WHERE deleted_at IS NULL;

-- templates: list queries filter by team_id + deleted_at, ordered by created_at
CREATE INDEX IF NOT EXISTS idx_templates_team_id_deleted_at_created_at
  ON templates(team_id, deleted_at, created_at DESC);

-- action_items: list by assignee_email scoped to team
CREATE INDEX IF NOT EXISTS idx_action_items_team_id_assignee_email
  ON action_items(team_id, assignee_email)
  WHERE assignee_email IS NOT NULL;
