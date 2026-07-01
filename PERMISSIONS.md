# Permission Matrix — Every Action, Every Role

## Roles
| Role | Scope |
|---|---|
| **super_admin** | Full access across the entire team |
| **dept_admin** | Admin within their department |
| **member** | Basic participant |
| **facilitator** | Per-meeting role. Gets host powers for that meeting only (not a team role — set via `facilitator_id` on the meeting). `isHost = facilitator_id === user.id \|\| created_by === user.id` |

---

## Meetings

| Action | super_admin | dept_admin | member | facilitator |
|---|---|---|---|---|
| View list | ✅ All | ✅ All | ✅ All (team-scoped) | ✅ |
| View detail | ✅ | ✅ | ✅ (if participant) | ✅ |
| Create | ✅ | ✅ | ❌ | N/A |
| Edit title/type/schedule | ✅ | ✅ | ❌ | ✅ |
| Delete (soft) | ✅ | ❌ | ❌ | ❌ |
| Change status via PATCH | ✅ | ✅ | ❌ | ✅ |
| Change status via timer (start→active) | ✅ | ✅ | ❌ | ✅ |
| Change status via timer (end→completed) | ✅ | ✅ | ❌ | ✅ |
| Change status via outcomes (→logged) | ✅ | ✅ | ❌ | ❌ (only `logged_by`) |

## Timer

| Action | super_admin | dept_admin | member | facilitator | Notes |
|---|---|---|---|---|---|
| Read state | ✅ | ✅ | ✅ (if participant) | ✅ | |
| Start | ✅* | ✅* | ❌ | ✅ | *Only if `timer_open_to_all=true` |
| Pause | ✅* | ✅* | ❌ | ✅ | *Only if `timer_open_to_all=true` |
| Resume | ✅* | ✅* | ❌ | ✅ | *Only if `timer_open_to_all=true` |
| Next agenda item | ✅* | ✅* | ❌ | ✅ | *Only if `timer_open_to_all=true` |
| End meeting | ✅* | ✅* | ❌ | ✅ | *Only if `timer_open_to_all=true` |
| Add time (+1m/+5m) | ✅* | ✅* | ❌ | ✅ | *Only if `timer_open_to_all=true` |
| Reset | ✅ | ❌ | ❌ | ❌ | Super admin only |

## Outcomes

| Action | super_admin | dept_admin | member | facilitator |
|---|---|---|---|---|
| Read | ✅ | ✅ | ✅ (team-scoped) | ✅ |
| Create | ✅ | ✅ | ❌ | ✅ |
| Update primary_outcome | ✅ | ✅ | ❌ | Only if `logged_by` |
| Update action_items | ✅ | ✅ | ❌ | Only if `logged_by` |
| Delete | ✅ | ✅ | ❌ | ❌ |

## Outcome Notes

| Action | super_admin | dept_admin | member | facilitator |
|---|---|---|---|---|
| Read | ✅ | ✅ | ✅ (team-scoped) | ✅ |
| Create | ✅ | ✅ | ❌ | ✅ |
| Update | ✅ | ❌ | ❌ | ✅ (host only) |
| Delete | ✅ | ❌ | ❌ | ✅ (host only) |
| Pull from comment | ✅ | ❌ | ❌ | ✅ (host only) |

## Action Items

| Action | super_admin | dept_admin | member | facilitator |
|---|---|---|---|---|
| Read list | ✅ All | ✅ All | ✅ Team-scoped | ✅ |
| Read single | ✅ | ✅ | ✅ Own only | ✅ |
| Create | ✅ | ✅ | ❌ | ✅ |
| Mark done (`?action=done`) | ✅ (bypasses assignee check) | ❌ (must be assignee) | ✅ (own only) | ❌ (must be assignee) |
| Block (`?action=block`) | ✅ Any | ✅ Own dept only | ❌ | ❌ |
| Update generic | ✅ | ✅ | ❌ | ❌ |
| Delete | ✅ | ✅ | ❌ | ❌ |

## Comments

| Action | super_admin | dept_admin | member | facilitator |
|---|---|---|---|---|
| Read | ✅ | ✅ | ✅ (team-scoped) | ✅ |
| Create | ✅ | ✅ | ✅ (one per meeting) | ✅ |
| Delete | ✅ | ✅ | ❌ | ✅ (in own meeting) |

## Participants

| Action | super_admin | dept_admin | member | facilitator |
|---|---|---|---|---|
| Read | ✅ | ✅ | ✅ (team-scoped) | ✅ |
| Add | ✅ | ✅ | ❌ | ❌ |
| Update role | ✅ | ✅ | ❌ | ❌ |
| Remove | ✅ | ✅ | ❌ | ❌ |

## Templates

| Action | super_admin | dept_admin | member | facilitator |
|---|---|---|---|---|
| Read list | ✅ | ✅ | ✅ | — |
| Read single | ✅ | ✅ | ✅ | — |
| Create | ✅ | ✅ | ❌ | — |
| Update | ✅ | ✅ | ❌ | — |
| Delete | ✅ | ✅ | ❌ | — |

## Users & Team

| Action | super_admin | dept_admin | member | facilitator |
|---|---|---|---|---|
| List users | ✅ | ✅ | ✅ | — |
| View single | ✅ | ✅ | ✅ | — |
| Update own profile | ✅ | ✅ | ✅ | — |
| Invite user | ✅ | ✅ | ❌ | — |
| Approve user | ✅ | ✅ | ❌ | — |
| Deactivate user | ✅ | ✅ | ❌ | — |
| Change user role | ✅ | ❌ | ❌ | — |
| Edit team name | ✅ | ❌ | ❌ | — |
| View team info | ✅ | ✅ | ✅ | — |

## Departments

| Action | super_admin | dept_admin | member | facilitator |
|---|---|---|---|---|
| Read all | ✅ | ✅ | ✅ | — |
| Create | ✅ | ✅ | ❌ | — |

## Notifications

| Action | super_admin | dept_admin | member | facilitator |
|---|---|---|---|---|
| Read preferences | ✅ (own) | ✅ (own) | ✅ (own) | — |
| Update preferences | ✅ (own) | ✅ (own) | ✅ (own) | — |

## Public (no auth)

| Action | Anyone |
|---|---|
| View live meeting | ✅ With valid `share_token` + meeting is `active` or 5 min before `scheduled_at` |
| Rate limited | ✅ 30 req/min per IP |

---

## Status Transition Map (enforced by trigger)

```
planned ──► active ──► completed ──► logged
```

All other transitions are rejected at DB level.

## RLS Guards (database level)

All tables have at minimum:
- **SELECT**: team-scoped (`team_id = user_team_id()` or user-scoped)
- **INSERT**: admin-only for most tables
- **UPDATE**: admin or owner
- **DELETE**: admin-only (added for all tables)

The RLS is the outer wall; edge functions add business logic on top (host checks, state machine, cross-dept rules).

## Nuances not captured in matrix

| Setting | Effect |
|---|---|
| `timer_open_to_all = true` | Any admin can manage outcome notes (create/update/delete) regardless of host status. When `false`, only the host (`facilitator_id` or `created_by`) can manage notes. |
| Facilitator is per-meeting | `isHost = facilitator_id \|\| created_by`. Not a team role — set per meeting. Host powers only last for that meeting. |
| Cross-dept assignment | Non-super-admin users assigning action items to other departments get a warning flag. dept_admins can assign cross-dept within their department. |
