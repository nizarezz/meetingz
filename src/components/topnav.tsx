"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { cn } from "@/lib/utils";
import { Bell, HelpCircle, LogOut, Menu } from "lucide-react";

const topNav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/meetings", label: "Meetings" },
] as const;

export function TopNav({ onMenuToggle }: { onMenuToggle: () => void }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const initial = (user?.user_metadata?.name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase();

  return (
    <header className="flex items-center gap-4 border-b border-border bg-background/70 px-6 py-4 backdrop-blur md:px-10">
      <button
        onClick={onMenuToggle}
        className="grid h-9 w-9 place-items-center rounded-full text-foreground/70 transition hover:bg-accent/60 md:hidden"
        aria-label="Toggle menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <p className="font-display text-2xl tracking-tight text-primary">Meeting Timer Pro</p>

      <nav className="ml-8 hidden items-center gap-6 md:flex">
        {topNav.map((item) => {
          const active = item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative pb-1 text-sm transition",
                active
                  ? "font-medium text-primary"
                  : "text-foreground/70 hover:text-foreground",
              )}
            >
              {item.label}
              {active && (
                <span className="absolute inset-x-0 -bottom-0.5 h-px bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <button
          className="grid h-9 w-9 place-items-center rounded-full text-foreground/70 transition hover:bg-accent/60"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>
        <button
          className="grid h-9 w-9 place-items-center rounded-full text-foreground/70 transition hover:bg-accent/60"
          aria-label="Help"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
        <div
          title={user?.email ?? ""}
          className="h-9 w-9 overflow-hidden rounded-full bg-accent ring-1 ring-border"
        >
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-[oklch(0.68_0.08_50)] to-[oklch(0.45_0.08_30)] text-sm font-medium text-white">
            {initial}
          </div>
        </div>
        <button
          onClick={() => signOut().then(() => window.location.reload())}
          className="grid h-9 w-9 place-items-center rounded-full text-foreground/70 transition hover:bg-accent/60"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
