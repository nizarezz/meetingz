import { api } from "./client";
import type { ActionItem, PaginatedResponse } from "@/lib/types";

export interface ActionItemWithMeeting extends ActionItem {
  meetings: { title: string; scheduled_at: string | null; status?: string };
  status?: string;
  priority?: string;
  assigned_by?: string;
  assigned_at?: string;
  blocked_by?: string;
  blocked_at?: string;
  cross_dept?: boolean;
}

export interface CreateActionItemInput {
  meeting_id: string;
  text: string;
  assignee_id?: string;
  assignee_email?: string;
  due_date?: string;
  priority?: "low" | "medium" | "high";
}

export interface CreateActionItemResponse {
  data: ActionItemWithMeeting;
  warn: boolean;
}

export const actionItemsApi = {
  list: (params?: { assignee_email?: string; assignee_id?: string; page?: number; perPage?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.assignee_id) searchParams.set("assignee_id", params.assignee_id);
    if (params?.assignee_email) searchParams.set("assignee_email", params.assignee_email);
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.perPage) searchParams.set("per_page", String(params.perPage));
    return api().get("action-items", { searchParams }).json<PaginatedResponse<ActionItemWithMeeting>>();
  },

  create: (input: CreateActionItemInput) =>
    api().post("action-items", { json: input }).json<CreateActionItemResponse>(),

  markDone: (id: string) =>
    api().patch(`action-items/${id}?action=done`).json<ActionItemWithMeeting>(),

  block: (id: string) =>
    api().patch(`action-items/${id}?action=block`).json<ActionItemWithMeeting>(),

  update: (id: string, patch: Partial<Pick<ActionItem, "done">>) =>
    api().patch(`action-items/${id}`, { json: patch }).json<ActionItemWithMeeting>(),

  remove: (id: string) =>
    api().delete(`action-items/${id}`).json<{ deleted: boolean }>(),
};
