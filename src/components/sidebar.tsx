"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  CalendarPlus,
  Timer,
  Users,
  FileText,
  Settings,
  LogOut,
  Leaf,
} from "lucide-react";

const sideNav = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/meetings/new", label: "New Meeting", icon: CalendarPlus },
  { href: "/meetings", label: "Meetings", icon: Timer },
  { href: "/teams", label: "Teams", icon: Users },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();
  const qc = useQueryClient();

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await signOut();
    router.push("/login");
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col justify-between border-r border-sidebar-border bg-sidebar px-5 py-7 transition-transform lg:relative lg:flex",
          open ? "flex" : "hidden lg:flex",
        )}
      >
      <div className="space-y-8">
        <Link href="/dashboard" className="flex items-center gap-3" onClick={onClose}>
          <span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-primary ring-1 ring-border">
            <Leaf className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <p className="font-display text-lg text-primary">Workspace</p>
            <p className="text-xs text-muted-foreground">Productivity Focus</p>
          </div>
        </Link>

        <nav className="space-y-1">
          {sideNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-sidebar-foreground/80 hover:bg-accent/40",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className={active ? "font-medium" : ""}>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div>
        <Link
          href="/settings"
          onClick={onClose}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/80 transition hover:bg-accent/40",
            pathname.startsWith("/settings") && "bg-accent/60 text-sidebar-foreground",
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
        <button
          onClick={handleSignOut}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/80 transition hover:bg-accent/40"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
    </>
  );
}
