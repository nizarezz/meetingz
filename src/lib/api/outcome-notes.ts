import { api } from "./client";

export interface OutcomeNote {
  id: string;
  meeting_id: string;
  outcome_id: string;
  text: string;
  sort_order: number;
  source: "manual" | "comment";
  source_comment_id?: string;
  created_by: string;
  team_id: string;
  created_at: string;
  created_by_user?: { name: string };
}

export interface CreateOutcomeNoteInput {
  meeting_id: string;
  outcome_id: string;
  text: string;
  sort_order: number;
  source: "manual" | "comment";
  source_comment_id?: string;
}

export const outcomeNotesApi = {
  list: (outcomeId: string) =>
    api().get("outcome-notes", { searchParams: { outcome_id: outcomeId } }).json<OutcomeNote[]>(),

  create: (input: CreateOutcomeNoteInput) =>
    api().post("outcome-notes", { json: input }).json<OutcomeNote>(),

  update: (id: string, text: string) =>
    api().patch(`outcome-notes/${id}`, { json: { text } }).json<OutcomeNote>(),

  remove: (id: string) =>
    api().delete(`outcome-notes/${id}`).json<{ deleted: boolean }>(),
};
