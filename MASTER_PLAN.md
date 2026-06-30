# Meeting Timer Pro — Complete Master Plan
# The single document that governs every decision in this codebase.

═══════════════════════════════════════════════════════════════
PART 1: THE MENTAL MODEL
═══════════════════════════════════════════════════════════════

Before touching any code, burn this into your head:

  EVERY feature, endpoint, and UI element answers 3 questions:
    1. Who are you?        (identity — your role in this team)
    2. What is this?       (resource — meeting, action item, etc.)
    3. What state is it?   (lifecycle — planned, live, completed)

  If a button exists that can't answer all 3 → it should not exist.

  Example: "Start Meeting" button
    1. Who: facilitator or admin (not member)
    2. What: this meeting
    3. State: must be 'planned' (can't start a completed meeting)
  → Show only if: user is facilitator/admin AND meeting.status = 'planned'

  This 3-question rule eliminates every "why does this button exist"
  problem in your entire app.


═══════════════════════════════════════════════════════════════
PART 2: ROLES AND WHAT THEY MEAN
═══════════════════════════════════════════════════════════════

  super_admin
  ├── Everything admin can do
  ├── Approve/reject admins
  ├── Delete the team
  └── See all audit logs

  admin
  ├── Everything member can do
  ├── Create / edit / cancel / delete meetings
  ├── Approve / reject members
  ├── [Deferred: temporary admin grant — not yet spec'd]
  ├── Remove participants
  ├── Create / edit / delete templates
  ├── Pull comments to outcomes
  └── Edit or reassign any action item

  member
  ├── View meetings they are a participant of
  ├── Add comments during live meetings they attend
  ├── Edit their own comments only
  ├── Complete action items assigned TO them (status only)
  └── View outcomes and action items of meetings they attended

  facilitator  ← NOT a team role, it's a per-meeting role
  ├── Assigned when meeting is created (facilitator_id on meetings)
  ├── Gets admin-level permissions FOR THAT MEETING ONLY
  ├── Start / pause / stop timer
  ├── Advance agenda items
  ├── Pull comments to outcomes
  ├── Create outcomes and outcome notes
  ├── Create and assign action items
  └── Cannot approve users or touch team settings


  EFFECTIVE ROLE CHECK (use this everywhere):
  ─────────────────────────────────────────
  isFacilitator  = meeting.facilitator_id === currentUser.id
  isMeetingAdmin = teamRole === 'admin' || teamRole === 'super_admin'
  canManageMeeting = isFacilitator || isMeetingAdmin


═══════════════════════════════════════════════════════════════
PART 3: THE STATE MACHINE
═══════════════════════════════════════════════════════════════

  Meeting states — only these transitions are legal:

  planned ──────► in_progress ──────► completed
     │                                    ▲
     └──────────────────────────────► cancelled

  planned:     can edit everything. cannot start timer.
  in_progress: cannot edit title/type/scheduled_at.
               can reorder agenda live.
               timer runs.
  completed:   read-only. outcomes + action items locked for editing
               by non-admins.
  cancelled:   read-only. no outcomes logged.

  ENFORCE THIS IN TWO PLACES:
  1. Database: Postgres trigger rejects illegal transitions
  2. App: check state before rendering any action button

  SQL trigger (add to migration):
  ────────────────────────────────
  CREATE OR REPLACE FUNCTION enforce_meeting_state_machine()
  RETURNS TRIGGER AS $$
  BEGIN
    IF OLD.status = 'completed' AND NEW.status != 'completed' THEN
      RAISE EXCEPTION 'Cannot change status of a completed meeting';
    END IF;
    IF OLD.status = 'cancelled' AND NEW.status != 'cancelled' THEN
      RAISE EXCEPTION 'Cannot change status of a cancelled meeting';
    END IF;
    IF OLD.status = 'in_progress' AND NEW.status = 'planned' THEN
      RAISE EXCEPTION 'Cannot go back from in_progress to planned';
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER meeting_state_machine
    BEFORE UPDATE OF status ON meetings
    FOR EACH ROW EXECUTE FUNCTION enforce_meeting_state_machine();


═══════════════════════════════════════════════════════════════
PART 4: DATABASE — SMART QUERIES (no redundancy, no N+1)
═══════════════════════════════════════════════════════════════

  RULE: Every query returns exactly what the UI needs.
  No second trips. No loops. No guessing.

  ── MEETINGS LIST (dashboard) ──────────────────────────────
  SELECT
    m.id, m.title, m.status, m.scheduled_at,
    m.scheduled_duration, m.health_score, m.meeting_type,
    -- facilitator
    u.id   AS facilitator_id,
    u.name AS facilitator_name,
    u.avatar_url AS facilitator_avatar,
    -- participant count (aggregate, not full list)
    COUNT(mp.user_id) AS participant_count,
    -- my role in this meeting
    my_mp.role AS my_meeting_role,
    -- open action items count
    (SELECT COUNT(*) FROM action_items ai
     WHERE ai.meeting_id = m.id
     AND ai.status NOT IN ('done')) AS open_action_items
  FROM meetings m
  LEFT JOIN users u ON u.id = m.facilitator_id
  LEFT JOIN meeting_participants mp ON mp.meeting_id = m.id
  LEFT JOIN meeting_participants my_mp
    ON my_mp.meeting_id = m.id AND my_mp.user_id = $currentUserId
  WHERE m.team_id = $teamId
    AND m.deleted_at IS NULL
  GROUP BY m.id, u.id, u.name, u.avatar_url, my_mp.role
  ORDER BY m.scheduled_at DESC;

  ── MEETING DETAIL (single meeting page) ────────────────────
  -- One query. Returns everything the meeting page needs.
  SELECT
    m.*,
    -- facilitator
    f.name AS facilitator_name, f.avatar_url AS facilitator_avatar,
    -- creator
    c.name AS creator_name,
    -- current user's role in this meeting
    my_mp.role AS my_meeting_role,
    -- is current user the facilitator?
    (m.facilitator_id = $currentUserId) AS i_am_facilitator
  FROM meetings m
  LEFT JOIN users f  ON f.id = m.facilitator_id
  LEFT JOIN users c  ON c.id = m.created_by
  LEFT JOIN meeting_participants my_mp
    ON my_mp.meeting_id = m.id AND my_mp.user_id = $currentUserId
  WHERE m.id = $meetingId;

  ── ACTION ITEMS — THREE VIEWS ──────────────────────────────

  -- View 1: All action items in a meeting (for post-meeting page)
  SELECT
    ai.*,
    -- who assigned it
    ab.name       AS assigned_by_name,
    ab.avatar_url AS assigned_by_avatar,
    -- who it's assigned to
    ae.name       AS assignee_name,
    ae.avatar_url AS assignee_avatar,
    -- which outcome it belongs to
    o.primary_outcome AS outcome_title,
    -- computed: done
    (ai.status = 'done') AS done
  FROM action_items ai
  LEFT JOIN users ab ON ab.id = ai.assigned_by
  LEFT JOIN users ae ON ae.id = ai.assignee_id
  LEFT JOIN outcomes o ON o.id = ai.outcome_id
  WHERE ai.meeting_id = $meetingId
  ORDER BY ai.priority DESC, ai.due_date ASC;

  -- View 2: Action items assigned TO me (my task inbox)
  SELECT
    ai.*,
    ab.name       AS assigned_by_name,   -- "who gave me this"
    ab.avatar_url AS assigned_by_avatar,
    m.title       AS meeting_title,
    m.scheduled_at AS meeting_date,
    (ai.status = 'done') AS done
  FROM action_items ai
  JOIN meetings m ON m.id = ai.meeting_id
  LEFT JOIN users ab ON ab.id = ai.assigned_by
  WHERE ai.assignee_id = $currentUserId
    AND ai.status NOT IN ('done')
    AND m.team_id = $teamId
  ORDER BY ai.due_date ASC NULLS LAST, ai.priority DESC;

  -- View 3: Action items assigned BY me (what I delegated)
  SELECT
    ai.*,
    ae.name       AS assignee_name,      -- "who I gave it to"
    ae.avatar_url AS assignee_avatar,
    m.title       AS meeting_title,
    (ai.status = 'done') AS done
  FROM action_items ai
  JOIN meetings m ON m.id = ai.meeting_id
  LEFT JOIN users ae ON ae.id = ai.assignee_id
  WHERE ai.assigned_by = $currentUserId
    AND m.team_id = $teamId
  ORDER BY ai.created_at DESC;

  ── COMMENTS WITH PULL STATUS ───────────────────────────────
  SELECT
    c.id, c.text, c.created_at, c.updated_at,
    u.name AS author_name, u.avatar_url AS author_avatar,
    -- was this pulled to an outcome?
    (on2.id IS NOT NULL)  AS pulled_to_outcome,
    on2.outcome_id        AS pulled_to_outcome_id,
    on2.created_at        AS pulled_at
  FROM comments c
  JOIN users u ON u.id = c.user_id
  LEFT JOIN outcome_notes on2 ON on2.source_comment_id = c.id
  WHERE c.meeting_id = $meetingId
  ORDER BY c.created_at ASC;


═══════════════════════════════════════════════════════════════
PART 5: API DESIGN — CLEAN RESOURCE HIERARCHY
═══════════════════════════════════════════════════════════════

  BASE: /api/v1

  Every request has: Authorization: Bearer <supabase_jwt>
  Team context:      X-Team-Id: <teamId>  (or from URL param)

  ── AUTH ────────────────────────────────────────────────────
  POST   /auth/signup
  POST   /auth/login
  POST   /auth/logout
  GET    /auth/me                    → current user + team role + active grants

  ── TEAM ────────────────────────────────────────────────────
  GET    /team                       → team info + my role
  GET    /team/members               → all members + roles
  PATCH  /team/members/:userId       → approve / change role  [admin+]
  DELETE /team/members/:userId       → remove member          [admin+]
  POST   /team/members/:userId/grant → temp admin grant       [admin+]
  DELETE /team/members/:userId/grant → revoke grant           [admin+]

  ── MEETINGS ────────────────────────────────────────────────
  GET    /meetings                   → list (dashboard)
  POST   /meetings                   → create               [admin+]
  GET    /meetings/:id               → detail + my role in it
  PATCH  /meetings/:id               → edit                 [facilitator | admin+]
  DELETE /meetings/:id               → soft delete          [admin+]

  POST   /meetings/:id/start         → planned→in_progress  [facilitator | admin+]
  POST   /meetings/:id/end           → in_progress→completed [facilitator | admin+]
  POST   /meetings/:id/cancel        → →cancelled           [admin+]

  ── PARTICIPANTS ─────────────────────────────────────────────
  GET    /meetings/:id/participants
  POST   /meetings/:id/participants  → add                  [facilitator | admin+]
  DELETE /meetings/:id/participants/:userId → remove        [admin+]

  ── AGENDA ──────────────────────────────────────────────────
  GET    /meetings/:id/agenda
  POST   /meetings/:id/agenda        → add item             [facilitator | admin+]
  PATCH  /meetings/:id/agenda/:itemId
  DELETE /meetings/:id/agenda/:itemId
  POST   /meetings/:id/agenda/reorder → bulk sort_order update [facilitator | admin+]

  ── TIMER ───────────────────────────────────────────────────
  GET    /meetings/:id/timer         → current state
  POST   /meetings/:id/timer/start   [facilitator only]
  POST   /meetings/:id/timer/pause   [facilitator only]
  POST   /meetings/:id/timer/resume  [facilitator only]
  POST   /meetings/:id/timer/next    → advance agenda item  [facilitator only]

  ── COMMENTS ────────────────────────────────────────────────
  GET    /meetings/:id/comments
  POST   /meetings/:id/comments      → any participant
  PATCH  /meetings/:id/comments/:commentId  → own only
  DELETE /meetings/:id/comments/:commentId  → own | facilitator | admin+
  POST   /meetings/:id/comments/:commentId/pull → to outcome [facilitator | admin+]

  ── OUTCOMES ────────────────────────────────────────────────
  GET    /meetings/:id/outcomes
  POST   /meetings/:id/outcomes      [facilitator | admin+]
  PATCH  /meetings/:id/outcomes/:outcomeId [logged_by | admin+]
  DELETE /meetings/:id/outcomes/:outcomeId [admin+]

  GET    /meetings/:id/outcomes/:outcomeId/notes
  POST   /meetings/:id/outcomes/:outcomeId/notes   [facilitator | admin+]
  PATCH  /meetings/:id/outcomes/:outcomeId/notes/:noteId
  DELETE /meetings/:id/outcomes/:outcomeId/notes/:noteId

  ── ACTION ITEMS ─────────────────────────────────────────────
  -- In a meeting context:
  GET    /meetings/:id/action-items  → all items in this meeting

  -- Cross-meeting (my personal inbox):
  GET    /action-items/assigned-to-me   → my task inbox
  GET    /action-items/assigned-by-me   → what I delegated

  -- Item operations:
  POST   /meetings/:id/action-items          [facilitator | admin+]
  PATCH  /meetings/:id/action-items/:itemId  → full edit [assigned_by | admin+]
  PATCH  /meetings/:id/action-items/:itemId/status → status only [assignee]
  DELETE /meetings/:id/action-items/:itemId  [assigned_by | admin+]

  ── AI ──────────────────────────────────────────────────────
  POST   /meetings/:id/ai/summarize  → queues job, returns jobId [facilitator | admin+]
  GET    /meetings/:id/ai/summary    → latest summary or status
  POST   /meetings/:id/ai/agenda     → AI agenda suggestions    [facilitator | admin+]

  ── TEMPLATES ────────────────────────────────────────────────
  GET    /templates
  POST   /templates                  [admin+]
  GET    /templates/:id
  PATCH  /templates/:id              [created_by | admin+]
  DELETE /templates/:id              [admin+]

  ── ME (current user) ────────────────────────────────────────
  GET    /me/notifications
  POST   /me/notifications/read-all
  PATCH  /me/notifications/:id/read
  GET    /me/preferences
  PATCH  /me/preferences
  GET    /me/push-subscriptions
  POST   /me/push-subscriptions      → register device
  DELETE /me/push-subscriptions/:id  → unregister device


═══════════════════════════════════════════════════════════════
PART 6: AUTHORIZATION LAYER — WHERE IT LIVES
═══════════════════════════════════════════════════════════════

  THREE LAYERS. All three must pass. Never skip any.

  LAYER 1: Supabase RLS (database level)
  ───────────────────────────────────────
  Enforces team isolation. A user cannot even READ data from
  another team regardless of what the app does.
  Think of it as: the outer wall.

  Key policies already in schema:
  - meetings: team_id IN (my teams)
  - notifications: user_id = me
  - push_subscriptions: user_id = me

  LAYER 2: Middleware (request level)
  ────────────────────────────────────
  Runs on every request before the handler.
  Attaches context. Rejects early if basic auth fails.

  // Every protected route gets this:
  async function withAuth(req, res, next) {
    const user = await supabase.auth.getUser(token)
    const membership = await getTeamMembership(user.id, teamId)
    const activeGrant = await getActiveGrant(user.id, teamId)

    req.ctx = {
      userId:        user.id,
      teamId:        teamId,
      teamRole:      membership.role,        // 'member' | 'admin' | 'super_admin'
      isApproved:    membership.is_approved
    }

    if (!req.ctx.isApproved) return res.status(403).json({
      error: 'Your account is pending approval'
    })

    next()
  }

  // Role helpers (use these everywhere):
  const can = {
    manageMeeting: (ctx, meeting) =>
      ctx.teamRole !== 'member' ||
      meeting.facilitator_id === ctx.userId,

    editOwnComment: (ctx, comment) =>
      comment.user_id === ctx.userId,

    deleteComment: (ctx, comment, meeting) =>
      comment.user_id === ctx.userId ||
      meeting.facilitator_id === ctx.userId ||
      ctx.teamRole !== 'member',

    completeActionItem: (ctx, item) =>
      item.assignee_id === ctx.userId,

    editActionItem: (ctx, item) =>
      item.assigned_by === ctx.userId ||
      ctx.teamRole !== 'member',

    controlTimer: (ctx, meeting) =>
      meeting.facilitator_id === ctx.userId,   // facilitator ONLY

    isAdmin: (ctx) =>
      ['admin', 'super_admin'].includes(ctx.teamRole),
  }

  LAYER 3: Business logic (handler level)
  ────────────────────────────────────────
  State machine checks. Data integrity checks.
  Things that aren't about who you are, but whether the
  operation makes sense right now.

  // Example: start a meeting
  async function startMeeting(req, res) {
    const meeting = await getMeeting(req.params.id)

    // Layer 3 checks:
    if (meeting.status !== 'planned')
      return res.status(409).json({ error: 'Meeting is not in planned state' })

    if (!can.manageMeeting(req.ctx, meeting))
      return res.status(403).json({ error: 'Only the facilitator or admin can start a meeting' })

    await updateMeeting(meeting.id, { status: 'in_progress' })
    await createTimerState(meeting.id)
    // emit realtime event
    res.json({ success: true })
  }


═══════════════════════════════════════════════════════════════
PART 7: THE MIGRATION PLAN — ZERO DOWNTIME, ZERO BREAKAGE
═══════════════════════════════════════════════════════════════

  PHASE 0: BEFORE TOUCHING ANYTHING
  ───────────────────────────────────
  □ Run your full E2E suite. Capture the baseline — it must be green.
  □ Run these grep commands to find every affected file:

    grep -r "\.done"               src/ --include="*.ts" -l
    grep -r "assignee_email"       src/ --include="*.ts" -l
    grep -r "pulled_to_outcome"    src/ --include="*.ts" -l
    grep -r "overrun_seconds"      src/ --include="*.ts" -l
    grep -r "schedule_delay"       src/ --include="*.ts" -l
    grep -r "action_item_reminders" src/ --include="*.ts" -l
    grep -r "action_item_activity"  src/ --include="*.ts" -l
    grep -r "timer_base"           src/ --include="*.ts" -l
    grep -r "participants.*\.id"   src/ --include="*.ts" -l

  □ Make a list of every file the grep returns. Those are your targets.

  PHASE 1: ADD (nothing removed yet — E2E stays green)
  ──────────────────────────────────────────────────────
  □ Create compatibility views (v_action_items, v_meetings, v_comments,
    v_meeting_participants, v_outcome_notes)
  □ Add team_members table, migrate data from users.team_id
  □ Add role_grants table
  □ Add push_subscriptions table
  □ Add speaker_stats table
  □ Add ai_outputs table
  □ Add health_score column to meetings
  □ Add state machine trigger to meetings
  □ Add all missing indexes
  □ Add all missing CHECK constraints
  □ Run E2E → must still be green

  PHASE 2: SWITCH (update code to use views + new tables)
  ────────────────────────────────────────────────────────
  □ Update every endpoint to use views:
      FROM action_items        → FROM v_action_items
      FROM meetings            → FROM v_meetings
      FROM comments            → FROM v_comments
      FROM meeting_participants → FROM v_meeting_participants
      FROM outcome_notes       → FROM v_outcome_notes
  □ Add assigned_by JOIN to all action item queries
  □ Add /action-items/assigned-to-me endpoint
  □ Add /action-items/assigned-by-me endpoint
  □ Add middleware: withAuth, can.* (teamRole, no effectiveRole/grant)
  □ Add state machine checks to all meeting state transitions
  □ Add facilitator-only guard to timer endpoints
  □ Migrate action_item_reminders → job_queue
  □ Migrate action_item_activity  → audit_log
  □ Run E2E → must still be green (views serve same shape)

  PHASE 3: REMOVE (clean up — safe because views shield endpoints)
  ─────────────────────────────────────────────────────────────────
  One column at a time. After each drop, run E2E immediately.

  □ DROP action_items.done
  □ DROP action_items.assignee_email
  □ DROP meeting_participants.team_id
  □ DROP meeting_participants.department
  □ DROP meeting_participants surrogate id → composite PK
  □ DROP outcome_notes.team_id
  □ DROP outcome_notes.meeting_id
  □ DROP comments.team_id
  □ DROP comments.pulled_to_outcome / pulled_at / pulled_by
  □ DROP outcomes.team_id
  □ DROP outcomes.notes → migrate to outcome_notes first
  □ DROP action_items.team_id
  □ DROP meetings.overrun_seconds → replace with GENERATED
  □ DROP meetings.schedule_delay_seconds
  □ Rename timer columns (timer_base_total → elapsed_total_secs etc.)
  □ DROP action_item_reminders table
  □ DROP action_i
