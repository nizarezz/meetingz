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
  if (e instanceof Response) return (await e.json().catch(() => ({}))).error ?? "Request failed";
  const kyErr = e as HTTPError;
  if (kyErr?.response) {
    try { const body = await kyErr.response.clone().json(); return body.error ?? kyErr.message; } catch {}
  }
  return (e as Error)?.message ?? "Unknown error";
}
