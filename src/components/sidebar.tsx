"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Calendar, ClipboardList, BarChart3,
  Building2, User, Plus, HelpCircle, LifeBuoy, LogOut, Leaf,
} from "lucide-react";

const sideNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/meetings", label: "Meetings", icon: Calendar },
  { href: "/assignments", label: "Assignments", icon: ClipboardList },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/organization", label: "Organization", icon: Building2 },
  { href: "/profile", label: "My Profile", icon: User },
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
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar px-5 py-7 transition-transform lg:static lg:flex",
          open ? "flex" : "hidden lg:flex",
        )}
      >
        <Link href="/dashboard" onClick={onClose} className="mb-8 px-1">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground">
              <Leaf className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display text-lg font-bold text-primary">Terra Meetings</p>
              <p className="text-xs text-muted-foreground">Rooted Productivity</p>
            </div>
          </div>
        </Link>

        <nav className="flex flex-1 flex-col gap-1">
          {sideNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-primary-container font-semibold text-on-primary-container"
                    : "text-muted-foreground hover:bg-secondary-container hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Link
          href="/meetings/new"
          onClick={onClose}
          className="mx-1 mb-6 flex items-center justify-center gap-2 rounded-xl bg-primary py-3 font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Meeting
        </Link>

        <div className="flex flex-col gap-1 border-t border-sidebar-border pt-4">
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary-container hover:text-foreground"
          >
            <HelpCircle className="h-4 w-4" />
            Help
          </a>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary-container hover:text-foreground"
          >
            <LifeBuoy className="h-4 w-4" />
            Support
          </a>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary-container hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
