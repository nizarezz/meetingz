"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "@/lib/api";
import { Bell, Menu, CheckCheck, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import Link from "next/link";

export function TopNav({ onMenuToggle }: { onMenuToggle: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initial = (user?.user_metadata?.name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase();

  const { data: unreadCount } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => notificationsApi.unreadCount(),
    refetchInterval: 30000,
  });

  const { data: notifications } = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => notificationsApi.list(10),
    refetchInterval: 30000,
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleMarkAllRead() {
    await notificationsApi.markAllRead();
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  async function handleMarkRead(id: string) {
    await notificationsApi.markRead(id);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <header className="flex items-center gap-3 border-b border-border bg-background/70 px-6 py-3 backdrop-blur md:px-10">
      <button
        onClick={onMenuToggle}
        className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary-container lg:hidden"
        aria-label="Toggle menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="ml-auto flex items-center gap-2" ref={ref}>
        <div className="relative">
          <button
            className="relative grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary-container"
            aria-label="Notifications"
            onClick={() => setOpen(!open)}
          >
            <Bell className="h-4 w-4" />
            {unreadCount && unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-border bg-card shadow-lg z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold">Notifications</p>
                {unreadCount && unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <CheckCheck className="h-3 w-3" />
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto">
                {notifications && notifications.length > 0 ? (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleMarkRead(n.id)}
                      className={cn(
                        "w-full text-left px-4 py-3 transition-colors hover:bg-accent/50 border-b border-border/50 last:border-0",
                        !n.read && "bg-accent/20"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn("text-sm", !n.read && "font-medium")}>{n.title}</p>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {format(new Date(n.created_at), "MMM d")}
                        </span>
                      </div>
                      {n.body && (
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.body}</p>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="flex flex-col items-center gap-2 py-12 text-center">
                    <Bell className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground">No notifications</p>
                  </div>
                )}
              </div>

              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-1 border-t border-border px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                Notification settings
              </Link>
            </div>
          )}
        </div>

        <div
          title={user?.email ?? ""}
          className="ml-1 h-9 w-9 overflow-hidden rounded-full bg-primary ring-1 ring-border"
        >
          <div className="grid h-full w-full place-items-center text-sm font-medium text-primary-foreground">
            {initial}
          </div>
        </div>
      </div>
    </header>
  );
}
