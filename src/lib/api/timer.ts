import { api } from "./client";
import type { TimerState } from "@/lib/types";

export const timerApi = {
  get: (id: string) => api().get(`timer/${id}`).json<TimerState>(),
  start: (id: string) => api().post(`timer/${id}/start`).json<TimerState>(),
  pause: (id: string) => api().post(`timer/${id}/pause`).json<TimerState>(),
  resume: (id: string) => api().post(`timer/${id}/resume`).json<TimerState>(),
  next: (id: string) => api().post(`timer/${id}/next-item`).json<TimerState>(),
  reset: (id: string) => api().post(`timer/${id}/reset`).json<TimerState>(),
  end: (id: string) => api().post(`timer/${id}/end`).json<TimerState>(),
  addTime: (id: string, seconds: number) => api().post(`timer/${id}/add-time`, { json: { seconds } }).json<TimerState>(),
};
