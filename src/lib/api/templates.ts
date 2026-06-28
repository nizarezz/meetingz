import { api } from "./client";
import type { Template, PaginatedResponse } from "@/lib/types";

export const templatesApi = {
  list: (params?: { department?: string; meeting_type?: string; page?: number; perPage?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.department) searchParams.set("department", params.department);
    if (params?.meeting_type) searchParams.set("meeting_type", params.meeting_type);
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.perPage) searchParams.set("per_page", String(params.perPage));
    return api().get("templates", { searchParams }).json<PaginatedResponse<Template>>();
  },
  get: (id: string) => api().get(`templates/${id}`).json<Template>(),
  create: (input: Omit<Template, "id" | "created_at">) => api().post("templates", { json: input }).json<Template>(),
  update: (id: string, patch: Partial<Omit<Template, "id" | "created_at">>) =>
    api().patch(`templates/${id}`, { json: patch }).json<Template>(),
  remove: (id: string) => api().delete(`templates/${id}`).json<{ deleted: true }>(),
};
