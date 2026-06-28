import { api } from "./client";
import type { Meeting, AgendaItem, ParticipantRole, MeetingStatus, PaginatedResponse } from "@/lib/types";

export const meetingsApi = {
  list: (params?: { status?: MeetingStatus; department?: string; page?: number; perPage?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.department) searchParams.set("department", params.department);
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.perPage) searchParams.set("per_page", String(params.perPage));
    return api().get("meetings", { searchParams }).json<PaginatedResponse<Meeting>>();
  },
  get: (id: string) => api().get(`meetings/${id}`).json<Meeting>(),
  create: (input: {
    title: string; description?: string; department: string; meeting_type: string;
    scheduled_duration: number; scheduled_at?: string; facilitator_id?: string;
    vibe?: string; agenda_items?: AgendaItem[]; participants?: { user_id: string; role?: ParticipantRole }[];
  }) => api().post("meetings", { json: input }).json<Meeting>(),
  update: (id: string, patch: Partial<Pick<Meeting, "title" | "status" | "department" | "meeting_type" | "scheduled_at" | "scheduled_duration" | "agenda_items" | "vibe">>) =>
    api().patch(`meetings/${id}`, { json: patch }).json<Meeting>(),
  remove: (id: string) => api().delete(`meetings/${id}`).json<{ deleted: true }>(),
};
