import { api } from "./client";
import type { Participant, ParticipantRole, PaginatedResponse } from "@/lib/types";

export const participantsApi = {
  list: (meetingId: string, params?: { page?: number; perPage?: number }) => {
    const searchParams = new URLSearchParams({ meeting_id: meetingId });
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.perPage) searchParams.set("per_page", String(params.perPage));
    return api().get("participants", { searchParams }).json<PaginatedResponse<Participant>>();
  },
  create: (input: { meeting_id: string; user_id: string; role?: ParticipantRole; department?: string }) =>
    api().post("participants", { json: input }).json<Participant>(),
  update: (id: string, patch: { role: ParticipantRole }) =>
    api().patch(`participants/${id}`, { json: patch }).json<Participant>(),
  remove: (id: string) => api().delete(`participants/${id}`).json<{ deleted: true }>(),
};
