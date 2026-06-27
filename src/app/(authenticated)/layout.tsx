"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Sidebar } from "@/components/sidebar";
import { TopNav } from "@/components/topnav";
import { Skeleton } from "@/components/ui/skeleton";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen bg-background text-foreground">
        <div className="hidden lg:flex lg:w-64 flex-col border-r border-border p-4 space-y-4">
          <Skeleton className="h-8 w-32" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        </div>
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border px-6 py-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
          <div className="flex-1 p-6">
            <div className="space-y-4">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-80" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full rounded-xl" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav onMenuToggle={() => setSidebarOpen((v) => !v)} />
        <main className="min-w-0 flex-1 px-6 py-8 md:px-10 md:py-10">
          {children}
        </main>
        <footer className="border-t border-border bg-sidebar/60 px-6 py-4 text-xs text-muted-foreground md:px-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>&copy; {new Date().getFullYear()} Terra Meetings &middot; Rooted in Efficiency</span>
            <div className="flex items-center gap-5">
              <span className="hover:text-foreground cursor-default">Privacy</span>
              <span className="hover:text-foreground cursor-default">Terms</span>
              <span className="hover:text-foreground cursor-default">Support</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
