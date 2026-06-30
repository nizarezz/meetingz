"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { Menu } from "lucide-react";

export function TopNav({ onMenuToggle }: { onMenuToggle: () => void }) {
  const { user } = useAuth();
  const initial = (user?.user_metadata?.name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase();

  return (
    <header className="flex items-center gap-3 border-b border-border bg-background/70 px-6 py-3 backdrop-blur md:px-10">
      <button
        onClick={onMenuToggle}
        className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary-container lg:hidden"
        aria-label="Toggle menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="ml-auto flex items-center gap-2">
        <div
          title={user?.email ?? ""}
          className="h-9 w-9 overflow-hidden rounded-full bg-primary ring-1 ring-border"
        >
          <div className="grid h-full w-full place-items-center text-sm font-medium text-primary-foreground">
            {initial}
          </div>
        </div>
      </div>
    </header>
  );
}
