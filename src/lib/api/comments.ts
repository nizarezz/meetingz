import { api } from "./client";
import type { Comment, PaginatedResponse } from "@/lib/types";

export const commentsApi = {
  list: (meetingId: string, params?: { page?: number; perPage?: number }) => {
    const searchParams = new URLSearchParams({ meeting_id: meetingId });
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.perPage) searchParams.set("per_page", String(params.perPage));
    return api().get("comments", { searchParams }).json<PaginatedResponse<Comment>>();
  },
  add: (meetingId: string, text: string) =>
    api().post("comments", { json: { meeting_id: meetingId, text } }).json<Comment>(),
};
