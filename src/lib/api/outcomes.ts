import { api } from "./client";
import type { Outcome, PrimaryOutcome, ActionItem } from "@/lib/types";

export const outcomesApi = {
  get: (meetingId: string) => api().get(`outcomes/${meetingId}`).json<Outcome | null>(),
  create: (meetingId: string, input: { primary_outcome: PrimaryOutcome; action_items?: ActionItem[]; notes?: string }) =>
    api().post(`outcomes/${meetingId}`, { json: input }).json<Outcome>(),
  update: (meetingId: string, input: Partial<{ primary_outcome: PrimaryOutcome; action_items: ActionItem[]; notes: string }>) =>
    api().patch(`outcomes/${meetingId}`, { json: input }).json<Outcome>(),
};
