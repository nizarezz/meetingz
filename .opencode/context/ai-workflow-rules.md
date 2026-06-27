# AI Workflow Rules

## Approach

Build this project incrementally using a spec-driven workflow. The six context files (`project-overview.md`, `architecture.md`, `code-standards.md`, `ui-context.md`, `progress-tracker.md`, and this file) define what to build, how to build it, and the current state of progress. Always implement against these specs — do not infer or invent behavior from scratch. When a user request is ambiguous, clarify it in the context files before writing code.

## Scoping Rules

- Work on one feature unit at a time — one page, one edge function change, one component extraction.
- Prefer small, verifiable increments over large speculative changes. A single unit should be testable with a quick `npm run build` or a manual flow.
- Do not combine unrelated system boundaries in a single implementation step (e.g., don't change an edge function and a page layout in the same commit).

## When to Split Work

Split an implementation step if it combines:

- UI changes **and** backend/edge function changes
- Multiple unrelated route pages (e.g., Profile page + Analytics page)
- Behavior not clearly defined in the context files — resolve the ambiguity first in `project-overview.md` before proceeding
- Changes that affect the data model **and** existing migration files

If a change cannot be verified end to end quickly (within a single `npm run build` cycle), the scope is too broad — split it.

## Handling Missing Requirements

- Do not invent product behavior not defined in the context files. If a user request implies a feature not documented, add it as a section in `project-overview.md` before implementing.
- If a requirement is ambiguous, resolve it by asking the user or adding an open question in `progress-tracker.md` before continuing.
- When a user request conflicts with an invariant in `architecture.md`, flag the conflict and ask before proceeding.

## Protected Files

Do not modify the following unless explicitly instructed:

- `src/components/ui/*` — shadcn/ui generated primitives. Use `npx shadcn add` to add new ones.
- `node_modules/*` — never modify.
- `.next/*` — build output.
- `.env.local` — contains secrets; do not read or expose values beyond what is needed for the task.
- `supabase/.temp/*` — local Supabase runtime metadata.

## Keeping Docs in Sync

Update the relevant context file whenever implementation changes:

- System architecture or system boundaries → update `architecture.md`
- Data model additions → update `architecture.md` (Storage Model section) and `project-overview.md` (Features)
- Color tokens, typography, or layout patterns → update `ui-context.md`
- Code conventions or standards → update `code-standards.md`
- Feature scope, success criteria, or user flow → update `project-overview.md`
- Completed work, decisions, open questions → update `progress-tracker.md`

## Before Moving to the Next Unit

1. The current unit works end to end within its defined scope (manual check or build pass).
2. No invariant defined in `architecture.md` was violated.
3. `progress-tracker.md` reflects the completed work (mark items, add decisions, update goal).
4. `npm run build` passes with zero errors and zero warnings.
