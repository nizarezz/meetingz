import ky, { HTTPError } from "ky";
import { supabase, FUNCTIONS_BASE } from "@/lib/supabase/client";

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

const UNAUTHORIZED = new Set([401]);

export function api() {
  const prefix = `${FUNCTIONS_BASE}/`;
  return ky.create({
    prefix,
    hooks: {
      beforeRequest: [
        async ({ request }) => {
          const token = await getToken();
          if (token) {
            request.headers.set("Authorization", `Bearer ${token}`);
          }
        },
      ],
      beforeError: [
        async ({ error }) => {
          if (error instanceof HTTPError) {
            const text = await error.response.clone().text().catch(() => "");
            try { error.message = JSON.parse(text).error ?? text; } catch { error.message = text || error.message; }
          }
          return error;
        },
      ],
      afterResponse: [
        async ({ request, response }) => {
          if (!UNAUTHORIZED.has(response.status)) return response;
          const { data } = await supabase.auth.refreshSession();
          if (!data.session) {
            await supabase.auth.signOut();
            if (typeof window !== "undefined") {
              window.location.href = "/login";
            }
            return response;
          }
          const retry = request.clone();
          retry.headers.set("Authorization", `Bearer ${data.session.access_token}`);
          return fetch(retry);
        },
      ],
    },
  });
}

export { FUNCTIONS_BASE };
export { ky };
