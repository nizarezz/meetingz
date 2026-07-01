-- Migration: add room/hall booking
--
-- Adds an org-scoped room inventory and ties meetings to a room, with a
-- database-level guarantee that a room can only host one active meeting
-- at a time. The N rooms -> N concurrent meetings cap falls out of this
-- automatically; no separate counter is needed.
--
-- room_id is nullable: roomless / fully-remote meetings are allowed. If
-- every meeting must have a room in the future, enforce NOT NULL at the
-- application layer rather than here, since flipping it later requires
-- backfilling every existing row first.

CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  CONSTRAINT rooms_pkey PRIMARY KEY (id),
  CONSTRAINT rooms_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id)
);

-- Index for team-scoped lookups (listing rooms for a team)
CREATE INDEX IF NOT EXISTS idx_rooms_team_id ON public.rooms(team_id);

-- Unique name per team (soft-delete aware)
CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_name_per_team
  ON public.rooms (team_id, name)
  WHERE deleted_at IS NULL;

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS room_id uuid,
  ADD CONSTRAINT meetings_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id);

-- Enforces "one active meeting per room" at the database level rather than
-- relying solely on application logic — closes the race condition where two
-- requests both try to start a meeting in the same room at the same instant.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_meeting_per_room
  ON public.meetings (room_id)
  WHERE status = 'active' AND room_id IS NOT NULL;
