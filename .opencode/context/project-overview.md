# Terra Meetings

## Overview

A meeting management platform for structured, focused team meetings. Users plan meetings with timed agendas, run them with a live timer, log outcomes and action items, and receive follow-up prompts. Designed for teams that want consistent, well-facilitated meetings without administrative overhead.

## Goals

1. A signed-in user can create, run, and complete a meeting within a single session — from planning through outcome logging.
2. Meeting timer enforces agenda pacing and prevents meetings from running unbounded.
3. Action items from meetings are tracked and surfaced to assignees across sessions.
4. Email reminders reduce missed meetings and ensure outcomes are captured promptly.

## Core User Flow

1. User signs in via Supabase Auth (email/password or magic link)
2. User is redirected to the Dashboard — sees upcoming meetings and summary stats
3. User creates a new meeting — provides title, date/time, department, participants, and a timed agenda
4. The meeting appears in the Meetings workspace under Upcoming or Drafts
5. User opens the meeting and starts the timer — the agenda item timer runs, with automatic transitions
6. When the meeting is complete, the user marks it as completed and logs outcomes (decision, action items, notes)
7. Participants receive an email prompt to review outcomes
8. Action items appear on the user's dashboard and (future) dedicated Assignments view

## Features

### Meeting Lifecycle

- Full CRUD for meetings with soft-delete (deleted_at)
- Status state machine: planned → active → completed → logged (validated server-side)
- Live agenda timer with per-item pacing, pause/resume, over-budget tracking
- Agenda builder: title, presenter, duration, notes per item; total duration summary

### People & Teams

- Role-based access: super_admin, dept_admin, member
- Department system for scoping meetings and users
- Team membership scopes all data — each team is isolated
- User management: invite, approve, deactivate, role assignment

### Templates

- Reusable meeting templates with pre-filled agenda items
- One-click template application when creating a meeting
- Team-scoped, with soft-delete support

### Outcomes & Action Items

- Three primary outcome types: Decision Made, Action Items Assigned, Postponed
- Action items with task text, assignee, due date, and completion status
- Logged on meeting completion; participants notified via email

### Notifications

- Email-based notification system via React Email + Resend
- Meeting reminder emails (scheduled via `reminders` edge function)
- Outcome prompt emails triggered on meeting completion
- Per-user notification preference toggles

## Scope

### In Scope

- Weekly synchronous team meetings with timed agendas
- Meeting timer with agenda item awareness
- Action item tracking per meeting
- Email notification for reminders and outcome prompts
- Team/department isolation of all data
- Role-based access control (super_admin, dept_admin, member)
- Meeting templates for reusable meeting structures

### Out of Scope

- Real-time collaborative editing of meeting notes
- Calendar integration (Google/Outlook sync)
- Video/audio conferencing within the app
- Mobile native applications
- Third-party SSO beyond Supabase Auth
- File attachments or rich media in meetings

## Success Criteria

1. A super_admin can create a meeting with participants, run the timer, and complete it — all without leaving the app.
2. The meeting status follows the planned → active → completed → logged sequence, enforced server-side.
3. Email reminders fire for upcoming meetings; outcome prompts fire on completion — both respecting user preferences.
4. All data is scoped to the user's team; users from different teams cannot see each other's data.
5. `npm run build` passes with zero errors and zero warnings.
