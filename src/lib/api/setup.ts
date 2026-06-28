import { api } from "./client";

export const setupApi = {
  create: () => api().post("setup").json<{ team_id: string; user_id: string; already_setup: boolean }>(),
};
