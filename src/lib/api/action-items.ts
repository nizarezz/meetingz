import { api } from "./client";
import type { ActionItem, PaginatedResponse } from "@/lib/types";

export const actionItemsApi = {
  list: (params?: { assignee_email?: string; assignee_id?: string; page?: number; perPage?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.assignee_id) searchParams.set("assignee_id", params.assignee_id);
    if (params?.assignee_email) searchParams.set("assignee_email", params.assignee_email);
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.perPage) searchParams.set("per_page", String(params.perPage));
    return api().get("action_items", { searchParams }).json<PaginatedResponse<ActionItem & { meetings: { title: string; scheduled_at: string | null } }>>();
  },
  update: (id: string, patch: Partial<Pick<ActionItem, "done">>) =>
    api().patch(`action_items/${id}`, { json: patch }).json<ActionItem & { meetings: { title: string; scheduled_at: string | null } }>(),
};
