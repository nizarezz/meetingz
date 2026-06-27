-- Initial schema as of 2026-06-27
-- Generated from live database

CREATE TABLE IF NOT EXISTS departments (
  name text PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  department text,
  is_approved boolean DEFAULT false,
  team_id uuid NOT NULL REFERENCES teams(id),
  fcm_token text,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  department text NOT NULL,
  meeting_type text NOT NULL,
  vibe text,
  scheduled_duration integer NOT NULL,
  actual_duration integer,
  status text DEFAULT 'planned',
  agenda_items jsonb NOT NULL DEFAULT '[]',
  team_id uuid NOT NULL REFERENCES teams(id),
  created_by uuid REFERENCES users(id),
  facilitator_id uuid REFERENCES users(id),
  scheduled_at timestamptz,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz,
  timer_started_at timestamptz,
  timer_item_started_at timestamptz,
  timer_base_total integer DEFAULT 0,
  timer_base_item integer DEFAULT 0,
  active_item_index integer DEFAULT 0,
  is_timer_running boolean DEFAULT false,
  paused_at timestamptz
);

CREATE TABLE IF NOT EXISTS meeting_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL DEFAULT 'attendee',
  department text,
  notified_at timestamptz,
  team_id uuid NOT NULL REFERENCES teams(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (meeting_id, user_id)
);

CREATE TABLE IF NOT EXISTS outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id),
  primary_outcome text NOT NULL,
  action_items jsonb NOT NULL DEFAULT '[]',
  notes text,
  logged_by uuid REFERENCES users(id),
  team_id uuid NOT NULL REFERENCES teams(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  department text NOT NULL,
  meeting_type text NOT NULL,
  agenda_items jsonb NOT NULL DEFAULT '[]',
  team_id uuid NOT NULL REFERENCES teams(id),
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  meeting_reminder_email boolean NOT NULL DEFAULT false,
  meeting_reminder_push boolean NOT NULL DEFAULT false,
  outcome_prompt_email boolean NOT NULL DEFAULT false,
  outcome_prompt_push boolean NOT NULL DEFAULT false,
  daily_digest_email boolean NOT NULL DEFAULT false,
  updated_at timestamptz DEFAULT now()
);
