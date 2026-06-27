import ky from "ky";
import { supabase, FUNCTIONS_BASE } from "./supabase/client";
import type {
  Meeting,
  TimerState,
  Outcome,
  PrimaryOutcome,
  ActionItem,
  ApiUser,
  UserRole,
  Participant,
  ParticipantRole,
  Team,
  Template,
  NotificationPreferences,
  MeetingStatus,
  AgendaItem,
  PaginatedResponse,
} from "./types";

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

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
    },
  });
}

// ---------- Meetings ----------
export const meetingsApi = {
  list: (params?: { status?: MeetingStatus; department?: string; page?: number; perPage?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.department) searchParams.set("department", params.department);
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.perPage) searchParams.set("per_page", String(params.perPage));
    return api()
      .get("meetings", { searchParams })
      .json<PaginatedResponse<Meeting>>();
  },
  get: (id: string) => api().get(`meetings/${id}`).json<Meeting>(),
  create: (input: {
    title: string;
    department: string;
    meeting_type: string;
    scheduled_duration: number;
    scheduled_at?: string;
    facilitator_id?: string;
    vibe?: string;
    agenda_items?: AgendaItem[];
    participants?: { user_id: string; role?: ParticipantRole }[];
  }) => api().post("meetings", { json: input }).json<Meeting>(),
  update: (
    id: string,
    patch: Partial<
      Pick<Meeting, "title" | "status" | "department" | "meeting_type" | "scheduled_at" | "scheduled_duration" | "agenda_items" | "vibe">
    >,
  ) => api().patch(`meetings/${id}`, { json: patch }).json<Meeting>(),
  remove: (id: string) => api().delete(`meetings/${id}`).json<{ deleted: true }>(),
};

// ---------- Timer ----------
export const timerApi = {
  get: (id: string) => api().get(`timer/${id}`).json<TimerState>(),
  start: (id: string) => api().post(`timer/${id}/start`).json<TimerState>(),
  pause: (id: string) => api().post(`timer/${id}/pause`).json<TimerState>(),
  resume: (id: string) => api().post(`timer/${id}/resume`).json<TimerState>(),
  next: (id: string) => api().post(`timer/${id}/next-item`).json<TimerState>(),
  reset: (id: string) => api().post(`timer/${id}/reset`).json<TimerState>(),
};

// ---------- Outcomes ----------
export const outcomesApi = {
  get: (meetingId: string) => api().get(`outcomes/${meetingId}`).json<Outcome | null>(),
  create: (
    meetingId: string,
    input: { primary_outcome: PrimaryOutcome; action_items?: ActionItem[]; notes?: string },
  ) => api().post(`outcomes/${meetingId}`, { json: input }).json<Outcome>(),
  update: (
    meetingId: string,
    input: Partial<{ primary_outcome: PrimaryOutcome; action_items: ActionItem[]; notes: string }>,
  ) => api().patch(`outcomes/${meetingId}`, { json: input }).json<Outcome>(),
};

// ---------- Users ----------
export const usersApi = {
  list: (params?: { department?: string; role?: UserRole; page?: number; perPage?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.department) searchParams.set("department", params.department);
    if (params?.role) searchParams.set("role", params.role);
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.perPage) searchParams.set("per_page", String(params.perPage));
    return api()
      .get("users", { searchParams })
      .json<PaginatedResponse<ApiUser>>();
  },
  get: (id: string) => api().get(`users/${id}`).json<ApiUser>(),
  update: (id: string, patch: Partial<Pick<ApiUser, "name" | "department"> & { fcm_token: string }>) =>
    api().patch(`users/${id}`, { json: patch }).json<ApiUser>(),
  approve: (id: string) => api().patch(`users/${id}/approve`).json<ApiUser>(),
  deactivate: (id: string) => api().patch(`users/${id}/deactivate`).json<ApiUser>(),
  invite: (input: { email: string; name?: string; department?: string; role?: UserRole }) =>
    api().post("users/invite", { json: input }).json<ApiUser>(),
};

// ---------- Teams ----------
export const teamsApi = {
  get: () => api().get("teams").json<Team>(),
  update: (input: { name: string }) => api().patch("teams", { json: input }).json<Team>(),
};

// ---------- Templates ----------
export const templatesApi = {
  list: (params?: { department?: string; meeting_type?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.department) searchParams.set("department", params.department);
    if (params?.meeting_type) searchParams.set("meeting_type", params.meeting_type);
    return api()
      .get("templates", { searchParams })
      .json<Template[]>();
  },
  get: (id: string) => api().get(`templates/${id}`).json<Template>(),
  create: (input: Omit<Template, "id" | "created_at">) =>
    api().post("templates", { json: input }).json<Template>(),
  update: (id: string, patch: Partial<Omit<Template, "id" | "created_at">>) =>
    api().patch(`templates/${id}`, { json: patch }).json<Template>(),
  remove: (id: string) => api().delete(`templates/${id}`).json<{ deleted: true }>(),
};

// ---------- Participants ----------
export const participantsApi = {
  list: (meetingId: string) => {
    const searchParams = new URLSearchParams({ meeting_id: meetingId });
    return api().get("participants", { searchParams }).json<Participant[]>();
  },
  create: (input: { meeting_id: string; user_id: string; role?: ParticipantRole; department?: string }) =>
    api().post("participants", { json: input }).json<Participant>(),
  update: (id: string, patch: { role: ParticipantRole }) =>
    api().patch(`participants/${id}`, { json: patch }).json<Participant>(),
  remove: (id: string) => api().delete(`participants/${id}`).json<{ deleted: true }>(),
};

// ---------- Departments ----------
export const departmentsApi = {
  list: () => api().get("departments").json<string[]>(),
};

// ---------- Setup ----------
export const setupApi = {
  create: () => api().post("setup").json<{ team_id: string; user_id: string; already_setup: boolean }>(),
};

// ---------- Notifications ----------
export const notificationsApi = {
  get: () => api().get("notifications/preferences").json<NotificationPreferences>(),
  update: (patch: Partial<Omit<NotificationPreferences, "user_id">>) =>
    api().patch("notifications/preferences", { json: patch }).json<NotificationPreferences>(),
};
