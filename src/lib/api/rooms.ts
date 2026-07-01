import { api } from "./client";
import type { Room, RoomConflict } from "@/lib/types";

export const roomsApi = {
  list: () => api().get("rooms").json<Room[]>(),
  get: (id: string) => api().get(`rooms/${id}`).json<Room>(),
  create: (name: string) => api().post("rooms", { json: { name } }).json<Room>(),
  update: (id: string, patch: { name?: string; is_active?: boolean }) =>
    api().patch(`rooms/${id}`, { json: patch }).json<Room>(),
  remove: (id: string) => api().delete(`rooms/${id}`).json<{ deleted: true }>(),
  checkConflict: ({
    roomId,
    scheduledAt,
    scheduledDuration,
    excludeMeetingId,
  }: {
    roomId: string;
    scheduledAt: string;
    scheduledDuration: number;
    excludeMeetingId?: string;
  }) =>
    api()
      .get(
        `rooms/check-conflict?room_id=${roomId}&scheduled_at=${scheduledAt}&scheduled_duration=${scheduledDuration}${
          excludeMeetingId ? `&exclude_meeting_id=${excludeMeetingId}` : ""
        }`,
      )
      .json<RoomConflict[]>(),
};
