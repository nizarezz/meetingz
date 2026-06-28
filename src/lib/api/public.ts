import { api, FUNCTIONS_BASE, ky } from "./client";

export const publicMeetingsApi = {
  getByShareToken: (shareToken: string) =>
    ky.get(`${FUNCTIONS_BASE}/meetings/public/${shareToken}`).json<import("@/lib/types").LiveMeeting>(),
};
