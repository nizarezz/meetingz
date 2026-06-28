import { api } from "./client";

export const departmentsApi = {
  list: () => api().get("departments").json<string[]>(),
};
