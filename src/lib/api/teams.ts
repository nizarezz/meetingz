import { api } from "./client";
import type { Team } from "@/lib/types";

export const teamsApi = {
  get: () => api().get("teams").json<Team>(),
  update: (input: { name: string }) => api().patch("teams", { json: input }).json<Team>(),
};
