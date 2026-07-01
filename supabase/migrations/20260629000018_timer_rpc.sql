-- Atomic timer RPC + optimistic locking
-- Replaces the dual-UPDATE race-prone edge function logic

-- 1. Add version column for optimistic locking
ALTER TABLE meeting_timer_state DROP COLUMN IF EXISTS version;
ALTER TABLE meeting_timer_state ADD COLUMN version integer NOT NULL DEFAULT 1;
-- Ensure the existing trigger doesn't bump version on every heartbeat (none exists for this table)

-- 2. The single atomic timer RPC
CREATE OR REPLACE FUNCTION public.timer_action(
  p_meeting_id uuid,
  p_action text,
  p_extra_seconds integer DEFAULT 0,
  p_expected_version integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_timer meeting_timer_state%ROWTYPE;
  v_meeting meetings%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_elapsed_total integer;
  v_elapsed_item integer;
  v_next_index integer;
  v_agenda_count integer;
  v_state jsonb;
  v_items jsonb;
BEGIN
  -- Lock timer row
  SELECT * INTO v_timer FROM meeting_timer_state WHERE meeting_id = p_meeting_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO meeting_timer_state (meeting_id, version, updated_at)
    VALUES (p_meeting_id, 1, v_now)
    RETURNING * INTO v_timer;
  END IF;

  -- Optimistic lock check
  IF v_timer.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'Timer conflict: expected version %, got %', p_expected_version, v_timer.version
      USING ERRCODE = '40001';
  END IF;

  -- Load meeting
  SELECT * INTO v_meeting FROM meetings WHERE id = p_meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting not found' USING ERRCODE = 'P0002';
  END IF;

  -- Count agenda items
  SELECT count(*) INTO v_agenda_count FROM agenda_items WHERE meeting_id = p_meeting_id;

  -- Compute elapsed from persisted timestamps (same logic as current computeElapsedTotal/Item)
  v_elapsed_total := COALESCE(v_timer.timer_base_total, 0);
  IF v_timer.is_timer_running AND v_timer.timer_started_at IS NOT NULL THEN
    v_elapsed_total := v_elapsed_total + floor(extract(epoch FROM (v_now - v_timer.timer_started_at)));
  END IF;

  v_elapsed_item := COALESCE(v_timer.timer_base_item, 0);
  IF v_timer.is_timer_running AND v_timer.timer_item_started_at IS NOT NULL THEN
    v_elapsed_item := v_elapsed_item + floor(extract(epoch FROM (v_now - v_timer.timer_item_started_at)));
  END IF;

  -- Execute action
  CASE p_action
    WHEN 'start' THEN
      IF v_timer.is_timer_running THEN
        RAISE EXCEPTION 'Timer is already running' USING ERRCODE = 'P0003';
      END IF;
      IF v_meeting.status NOT IN ('planned', 'active') THEN
        RAISE EXCEPTION 'Can only start a planned or active meeting';
      END IF;

      UPDATE meeting_timer_state SET
        is_timer_running      = true,
        timer_started_at      = v_now,
        timer_item_started_at = v_now,
        timer_base_total      = 0,
        timer_base_item       = 0,
        active_item_index     = 0,
        paused_at             = null,
        version               = version + 1,
        updated_at            = v_now
      WHERE meeting_id = p_meeting_id;

      UPDATE meetings SET status = 'active' WHERE id = p_meeting_id AND status = 'planned';

    WHEN 'pause' THEN
      IF NOT v_timer.is_timer_running THEN
        RAISE EXCEPTION 'Timer is not running' USING ERRCODE = 'P0003';
      END IF;

      UPDATE meeting_timer_state SET
        is_timer_running      = false,
        paused_at             = v_now,
        timer_base_total      = v_elapsed_total,
        timer_base_item       = v_elapsed_item,
        timer_started_at      = null,
        timer_item_started_at = null,
        version               = version + 1,
        updated_at            = v_now
      WHERE meeting_id = p_meeting_id;

    WHEN 'resume' THEN
      IF v_timer.is_timer_running THEN
        RAISE EXCEPTION 'Timer is already running' USING ERRCODE = 'P0003';
      END IF;
      IF v_meeting.status <> 'active' THEN
        RAISE EXCEPTION 'Meeting is not active';
      END IF;

      UPDATE meeting_timer_state SET
        is_timer_running      = true,
        timer_started_at      = v_now,
        timer_item_started_at = v_now,
        paused_at             = null,
        version               = version + 1,
        updated_at            = v_now
      WHERE meeting_id = p_meeting_id;

    WHEN 'next-item' THEN
      IF NOT v_timer.is_timer_running THEN
        RAISE EXCEPTION 'Timer is not running' USING ERRCODE = 'P0003';
      END IF;

      v_next_index := COALESCE(v_timer.active_item_index, 0) + 1;
      IF v_next_index >= v_agenda_count THEN
        RAISE EXCEPTION 'Already on the last agenda item';
      END IF;

      UPDATE meeting_timer_state SET
        active_item_index     = v_next_index,
        timer_item_started_at = v_now,
        timer_base_item       = 0,
        timer_started_at      = v_now,
        timer_base_total      = v_elapsed_total,
        version               = version + 1,
        updated_at            = v_now
      WHERE meeting_id = p_meeting_id;

    WHEN 'reset' THEN
      UPDATE meeting_timer_state SET
        is_timer_running      = false,
        timer_started_at      = null,
        timer_item_started_at = null,
        timer_base_total      = 0,
        timer_base_item       = 0,
        active_item_index     = 0,
        paused_at             = null,
        version               = version + 1,
        updated_at            = v_now
      WHERE meeting_id = p_meeting_id;

      UPDATE meetings SET actual_duration = 0 WHERE id = p_meeting_id;

    WHEN 'end' THEN
      UPDATE meeting_timer_state SET
        is_timer_running      = false,
        timer_started_at      = null,
        timer_item_started_at = null,
        paused_at             = null,
        timer_base_total      = v_elapsed_total,
        version               = version + 1,
        updated_at            = v_now
      WHERE meeting_id = p_meeting_id;

      UPDATE meetings SET
        status          = 'completed',
        actual_duration = floor(v_elapsed_total)
      WHERE id = p_meeting_id;

    WHEN 'add-time' THEN
      IF p_extra_seconds < 1 OR p_extra_seconds > 60 THEN
        RAISE EXCEPTION 'extra_seconds must be between 1 and 60';
      END IF;

      UPDATE meeting_timer_state SET
        timer_base_item = v_elapsed_item + p_extra_seconds,
        version         = version + 1,
        updated_at      = v_now
      WHERE meeting_id = p_meeting_id;

    ELSE
      RAISE EXCEPTION 'Unknown timer action: %', p_action;
  END CASE;

  -- Read back final state
  SELECT * INTO v_timer FROM meeting_timer_state WHERE meeting_id = p_meeting_id;

  -- Compute final elapsed after action
  v_elapsed_total := COALESCE(v_timer.timer_base_total, 0);
  IF v_timer.is_timer_running AND v_timer.timer_started_at IS NOT NULL THEN
    v_elapsed_total := v_elapsed_total + floor(extract(epoch FROM (now() - v_timer.timer_started_at)));
  END IF;

  v_elapsed_item := COALESCE(v_timer.timer_base_item, 0);
  IF v_timer.is_timer_running AND v_timer.timer_item_started_at IS NOT NULL THEN
    v_elapsed_item := v_elapsed_item + floor(extract(epoch FROM (now() - v_timer.timer_item_started_at)));
  END IF;

  -- Load agenda items for the response
  SELECT COALESCE(jsonb_agg(jsonb_build_object('title', title, 'duration', duration) ORDER BY sort_order), '[]'::jsonb)
  INTO v_items
  FROM agenda_items
  WHERE meeting_id = p_meeting_id;

  -- Build response
  v_state := jsonb_build_object(
    'is_running',           v_timer.is_timer_running,
    'elapsed_total',        v_elapsed_total,
    'remaining_total',      GREATEST(0, COALESCE(v_meeting.scheduled_duration, 0) - v_elapsed_total),
    'over_budget',          v_elapsed_total > COALESCE(v_meeting.scheduled_duration, 0),
    'elapsed_item',         v_elapsed_item,
    'remaining_item',       NULL,
    'active_item_index',    v_timer.active_item_index,
    'active_item',          NULL,
    'paused_at',            v_timer.paused_at,
    'timer_started_at',     v_timer.timer_started_at,
    'timer_item_started_at',v_timer.timer_item_started_at,
    'timer_base_total',     v_timer.timer_base_total,
    'timer_base_item',      v_timer.timer_base_item,
    'version',              v_timer.version
  );

  -- Enrich with current item info if agenda exists
  IF jsonb_array_length(v_items) > 0 AND v_timer.active_item_index IS NOT NULL AND v_timer.active_item_index < jsonb_array_length(v_items) THEN
    v_state := jsonb_set(v_state, '{active_item}', v_items -> v_timer.active_item_index);
    v_state := jsonb_set(v_state, '{remaining_item}', to_jsonb(
      GREATEST(0, COALESCE((v_items -> v_timer.active_item_index -> 'duration')::text::integer, 0) - v_elapsed_item)
    ));
  END IF;

  RETURN v_state;
END;
$$;

-- Grant execute to the anon and authenticated roles (edge function calls as service role)
GRANT EXECUTE ON FUNCTION public.timer_action TO anon, authenticated, service_role;
