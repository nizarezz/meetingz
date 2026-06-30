"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useToast } from "@/lib/toast-store";

export function useNotificationToasts(userId: string | undefined) {
  const router = useRouter();
  const { addToast } = useToast();

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel("meeting-started-toasts")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "meetings", filter: `status=eq.active` },
        (payload) => {
          const old = payload.old as { status?: string };
          if (old.status === "active") return;

          const meeting = payload.new as { id: string; title: string; department: string; meeting_type: string };

          addToast({
            title: `Meeting started: ${meeting.title}`,
            description: `${meeting.department} · ${meeting.meeting_type}`,
            duration: 8000,
            action: { label: "View", onClick: () => router.push(`/meetings/${meeting.id}`) },
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, addToast, router]);
}
