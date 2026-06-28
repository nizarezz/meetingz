import { api } from "./client";
import type { ApiUser, UserRole, PaginatedResponse } from "@/lib/types";

export const usersApi = {
  list: (params?: { department?: string; role?: UserRole; page?: number; perPage?: number; search?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.department) searchParams.set("department", params.department);
    if (params?.role) searchParams.set("role", params.role);
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.perPage) searchParams.set("per_page", String(params.perPage));
    if (params?.search) searchParams.set("search", params.search);
    return api().get("users", { searchParams }).json<PaginatedResponse<ApiUser>>();
  },
  get: (id: string) => api().get(`users/${id}`).json<ApiUser>(),
  update: (id: string, patch: Partial<Pick<ApiUser, "name" | "department"> & { fcm_token: string }>) =>
    api().patch(`users/${id}`, { json: patch }).json<ApiUser>(),
  approve: (id: string) => api().patch(`users/${id}/approve`).json<ApiUser>(),
  deactivate: (id: string) => api().patch(`users/${id}/deactivate`).json<ApiUser>(),
  invite: (input: { email: string; name?: string; department?: string; role?: UserRole }) =>
    api().post("users/invite", { json: input }).json<ApiUser>(),
};
