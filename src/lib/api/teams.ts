import { api } from "./client";
import type { Team } from "@/lib/types";

export const teamsApi = {
  get: () => api().get("teams").json<Team>(),
  update: (input: { name: string }) => api().patch("teams", { json: input }).json<Team>(),
};

export const departmentsApi = {
  list: () => api().get("departments").json<string[]>(),
};

export const setupApi = {
  create: () => api().post("setup").json<{ team_id: string; user_id: string; already_setup: boolean }>(),
};
