import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { HTTPError } from "ky";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export async function getErrorMsg(e: unknown): Promise<string> {
  if (e instanceof Response) {
    const text = await e.text().catch(() => "");
    try { return JSON.parse(text).error ?? text; } catch { return text || "Request failed"; }
  }
  const kyErr = e as HTTPError;
  if (kyErr?.response) {
    try {
      const text = await kyErr.response.clone().text();
      try { return JSON.parse(text).error ?? text; } catch { return text || kyErr.message; }
    } catch {}
  }
  return (e as Error)?.message ?? "Unknown error";
}

export function appUrl(path = ""): string {
  const base = typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_APP_URL || window.location.origin)
    : (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
  return `${base}${path}`;
}
