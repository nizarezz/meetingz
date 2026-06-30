# Business Rules Matrix

Every feature, endpoint, and button answers: **Who? What? State?**

---

## Meeting Lifecycle

| Feature | Allowed States | Who | Notes |
|---|---|---|---|
| Create meeting | — | admin, super_admin | Sets status='draft', creator becomes facilitator |
| Edit title/type/scheduled_at | draft, planned | facilitator, admin, super_admin | Locked once in_progress |
| Edit vibe/description | draft, planned | facilitator, admin, super_admin | |
| Delete (soft) | draft, planned, cancelled | super_admin only | Sets deleted_at. Not allowed on in_progress/completed |
| Restore | any (deleted) | super_admin only | Clears deleted_at |
| Change facilitator | draft, planned, in_progress | admin, super_admin | Cannot self-promote into facilitator seat. Reassigning self when already facilitator is a no-op |
| Add participant | draft, planned | facilitator, admin, super_admin | Not after meeting starts |
| Remove participant | draft, planned, in_progress | admin, super_admin | Cannot remove facilitator. Participant's comments/outcomes/action items remain |
| View meeting detail | any | participant, facilitator, admin, super_admin | RLS: team-scoped. Non-participants see only if admin |
| View dashboard list | any | all team members | Filters by team_id. Admins see all, members see their own |
| Start meeting | planned | facilitator, admin, super_admin | Transitions to in_progress. Creates timer state |
| End meeting | in_progress | facilitator, admin, super_admin | Transitions to completed. Stops timer. NO auto-log (see Logging) |
| Cancel meeting | draft, planned, in_progress | admin, super_admin | Transitions to cancelled. Soft-delete preferred for draft/planned |
| Reopen meeting | completed, cancelled | admin, super_admin | Goes back to planned. Used for corrections |
| View report | completed, logged | facilitator, admin, super_admin | Shows report_snapshot captured at log time |

---

## States

| State | Meaning | Editable? | Timer? | Actions Allowed |
|---|---|---|---|---|
| draft | Being set up, not ready to publish | Everything | No | Edit, delete, add participants |
| planned | Scheduled and announced | Title/type/scheduled_at locked | No | Start, edit vibe, manage participants |
| in_progress | Live meeting | Agenda items only (reorder), comments | Running | All live actions (comments, outcomes, action items, timer control) |
| completed | Meeting over | Nothing (unless reopened) | Stopped | View only. Report available |
| cancelled | Abandoned | Nothing | Stopped | View only, delete |

---

## Agenda Items

| Feature | Allowed States | Who | Notes |
|---|---|---|---|
| Add item | draft, planned, in_progress | facilitator, admin, super_admin | |
| Edit item (title, duration, notes) | draft, planned, in_progress | facilitator, admin, super_admin | |
| Reorder items | draft, planned, in_progress | facilitator, admin, super_admin | Bulk sort_order update |
| Remove item | draft, planned, in_progress | facilitator, admin, super_admin | |
| Advance to next item | in_progress | facilitator only | Updates timer active_item_index |
| Set presenter | draft, planned | facilitator, admin, super_admin | |

---

## Timer

| Feature | Allowed States | Who | Notes |
|---|---|---|---|
| Start timer | in_progress | facilitator only | Begins counting for current agenda item |
| Pause timer | in_progress | facilitator only | Pauses elapsed count |
| Resume timer | in_progress | facilitator only | Resumes from paused |
| Stop timer | in_progress | facilitator only | Stops when meeting ends |
| Advance agenda | in_progress | facilitator only | Moves timer to next item |

---

## Comments

| Feature | Allowed States | Who | Notes |
|---|---|---|---|
| Add comment | in_progress | any participant | Real-time via subscription |
| Edit own comment | in_progress | comment author | Within session. Completed meeting = read-only |
| Delete own comment | in_progress, completed | comment author | Soft-delete or flag as deleted |
| Delete any comment | in_progress, completed | facilitator, admin, super_admin | Moderation |
| Pull to outcome | in_progress | facilitator, admin, super_admin | Creates outcome_note linked to comment source |

---

## Outcomes

| Feature | Allowed States | Who | Notes |
|---|---|---|---|
| Create outcome | in_progress | facilitator, admin, super_admin | |
| Edit outcome text | in_progress | facilitator (own), admin, super_admin | |
| Delete outcome | in_progress, completed | admin, super_admin | Cascades to outcome_notes and action_items |
| View outcomes | any | any meeting participant | Completed meetings show read-only |

---

## Outcome Notes

| Feature | Allowed States | Who | Notes |
|---|---|---|---|
| Add note | in_progress | facilitator, admin, super_admin | Can be manual or pulled from comment |
| Edit own note | in_progress | facilitator (own), admin, super_admin | |
| Delete note | in_progress, completed | admin, super_admin | |

---

## Action Items

| Feature | Allowed States | Who | Notes |
|---|---|---|---|
| Create action item | in_progress | facilitator, admin, super_admin | | Assign to user (by id or email) | in_progress | facilitator, admin, super_admin | Cross-dept allowed, triggers notification |
| Edit item text | any (not done) | assigned_by, admin, super_admin | |
| Reassign | any (not done) | admin, super_admin | Changes assignee_id |
| Edit due date | any (not done) | assigned_by, admin, super_admin | |
| Mark done | any | assignee only | Sets status='done'. Triggers notification to assigned_by |
| Mark blocked | any | admin, super_admin | Sets status='blocked'. Triggers notification to assignee + assigned_by |
| Delete | any | assigned_by, admin, super_admin | Hard delete cascading from meeting delete is OK |
| View all team assignments | — | admin, super_admin | Full list with filters |
| View my tasks (inbox) | — | any user | Items assigned to me (member sees own; admin sees all with filter) |
| View my delegation | — | any user | Items I assigned (member sees own; admin sees all with filter) |

---

## Participants

| Feature | Allowed States | Who | Notes |
|---|---|---|---|
| Join meeting | in_progress | any team member | Self-join during live meeting |
| Leave meeting | in_progress | participant | Cannot leave if facilitator (must transfer first) |
| Add participant | draft, planned | facilitator, admin, super_admin | |
| Remove participant | draft, planned, in_progress | admin, super_admin | Cannot remove facilitator |
| Change participant role | draft, planned | admin, super_admin | Meeting-role (observer vs participant) |
| View participant list | any | facilitator, admin, super_admin | |

---

## Templates

| Feature | Allowed States | Who | Notes |
|---|---|---|---|
| Create template | — | admin, super_admin | |
| Edit template | — | creator, admin, super_admin | |
| Delete template | — | admin, super_admin | Soft delete (deleted_at). Does not affect existing meetings |
| Apply template to meeting | draft, planned | facilitator, admin, super_admin | Merges: appends template items after existing items. No overwrite |
| View templates | — | all team members | |

---

## Notifications

| Feature | Allowed States | Who | Notes |
|---|---|---|---|
| List my notifications | — | any user | Own only (user_id = me) |
| Mark single read | — | any user | Own only |
| Mark all read | — | any user | Own only |
| Update preferences | — | any user | Own only |
| Receive notification on: | | | |
|  - Cross-dept assignment | — | dept_admin, super_admin | |
|  - Assignment marked done | — | assigned_by | |
|  - Assignment blocked | — | assignee + assigned_by | |
|  - Assignment overdue | — | assignee | Automated cron |
|  - Daily digest | — | any user | Scheduled email |

---

## Teams & Users

| Feature | Allowed States | Who | Notes |
|---|---|---|---|
| View team members | — | all team members | |
| Approve member | — | admin, super_admin | Sets is_approved=true |
| Reject member | — | admin, super_admin | Hard delete from users table |
| Change member role | — | super_admin only | member ↔ admin |
| Remove member | — | admin, super_admin | Cannot remove self if sole admin |
| Transfer ownership | — | super_admin only | Changes team creator |
| Deferred: temporary admin grant will be spec'd when needed |
| View audit log | — | super_admin only | |

---

## AI (future)

| Feature | Allowed States | Who | Notes |
|---|---|---|---|
| Request summary | completed | facilitator, admin, super_admin | Queues ai_job |
| Request agenda suggestions | draft, planned | facilitator, admin, super_admin | |
| View AI output | — | meeting participants | By meeting_id |
| Cancel AI job | — | requester, admin | Only if status != completed |

---

## Job Queue

| Feature | Allowed States | Who | Notes |
|---|---|---|---|
| Enqueue job | — | system (edge functions) | Not exposed via API |
| Retry failed job | — | system (cron) | Increments attempts |
| Clear completed jobs | — | system (cron) | Older than 30 days |

---

## Audit Log

| Feature | Allowed States | Who | Notes |
|---|---|---|---|
| Write entry | — | system (edge functions) | Every mutation writes one row |
| View audit log | — | super_admin only | Filterable by entity, actor, action, time |

---

## Feature Eligibility by Role (summary)

| Action | member | facilitator | admin | super_admin |
|---|---|---|---|---|
| View meeting I'm in | ✓ | ✓ | ✓ | ✓ |
| View any team meeting | | | ✓ | ✓ |
| Add comment during meeting | ✓ | ✓ | ✓ | ✓ |
| Pull comment to outcome | | ✓ | ✓ | ✓ |
| Create outcome | | ✓ | ✓ | ✓ |
| Create action item | | ✓ | ✓ | ✓ |
| Complete own action item | ✓ | ✓ | ✓ | ✓ |
| Block any action item | | | ✓ | ✓ |
| Start/end meeting | | ✓ | ✓ | ✓ |
| Control timer | | ✓ | | |
| Edit meeting details | | ✓ | ✓ | ✓ |
| Delete meeting | | | ✓ | ✓ |
| Manage participants | | ✓ | ✓ | ✓ |
| Approve members | | | ✓ | ✓ |
| Change roles | | | | ✓ |
| View audit log | | | | ✓ |
| Manage templates | | | ✓ | ✓ |
