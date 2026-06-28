import { api } from "./client";
import type { NotificationPreferences } from "@/lib/types";

export const notificationsApi = {
  get: () => api().get("notifications/preferences").json<NotificationPreferences>(),
  update: (patch: Partial<Omit<NotificationPreferences, "user_id">>) =>
    api().patch("notifications/preferences", { json: patch }).json<NotificationPreferences>(),
};
