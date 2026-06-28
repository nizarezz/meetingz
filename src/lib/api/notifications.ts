import { api } from "./client";
import { supabase } from "@/lib/supabase/client";
import type { NotificationPreferences } from "@/lib/types";

export interface NotificationMessage {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export const notificationsApi = {
  get: () => api().get("notifications/preferences").json<NotificationPreferences>(),
  update: (patch: Partial<Omit<NotificationPreferences, "user_id">>) =>
    api().patch("notifications/preferences", { json: patch }).json<NotificationPreferences>(),

  list: async (limit = 20): Promise<NotificationMessage[]> => {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  },

  unreadCount: async (): Promise<number> => {
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("read", false);
    return count ?? 0;
  },

  markRead: (id: string) =>
    supabase.from("notifications").update({ read: true }).eq("id", id),

  markAllRead: () =>
    supabase.from("notifications").update({ read: true }).eq("read", false),
};
