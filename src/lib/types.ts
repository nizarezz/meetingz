export type MeetingStatus = "planned" | "active" | "completed" | "logged";

export const MEETING_STATUS_BADGE: Record<MeetingStatus, "secondary" | "default" | "outline"> = {
  planned: "secondary",
  active: "default",
  completed: "outline",
  logged: "outline",
};
export type ParticipantRole = "organizer" | "presenter" | "attendee";
export type PrimaryOutcome = "Decision Made" | "Action Items Assigned" | "Postponed";
export type UserRole = "super_admin" | "dept_admin" | "member";
export const ADMIN_ROLES: UserRole[] = ["super_admin", "dept_admin"];
export const SUPER_ADMIN_ROLES: UserRole[] = ["super_admin"];

export interface AgendaItem {
  title: string;
  duration: number;
  assignee_email?: string;
  presenter?: string;
  notes?: string;
}

export interface LiveMeeting {
  id: string;
  title: string;
  state: "active" | "starting_soon" | "upcoming" | "ended";
  scheduled_at: string | null;
  department?: string;
  meeting_type?: string;
  agenda_items?: AgendaItem[];
  active_item_index?: number;
  is_timer_running?: boolean;
  timer_started_at?: string | null;
  timer_item_started_at?: string | null;
  timer_base_total?: number;
  timer_base_item?: number;
  paused_at?: string | null;
}

export interface ApiUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  department: string | null;
  is_approved: boolean;
  created_at: string;
  team_id?: string;
  deleted_at?: string | null;
  fcm_token?: string | null;
}

export interface Participant {
  id: string;
  meeting_id: string;
  user_id: string;
  role: ParticipantRole;
  department?: string | null;
  team_id?: string;
  users?: Partial<ApiUser>;
  created_at?: string;
  notified_at?: string | null;
}

export interface ActionItem {
  id?: string;
  meeting_id?: string;
  text: string;
  assignee_email?: string;
  assignee_id?: string;
  due_date?: string;
  done?: boolean;
}

export interface Comment {
  id: string;
  meeting_id: string;
  user_id: string;
  text: string;
  created_at: string;
  users?: { name: string; role: string };
}

export interface Outcome {
  id?: string;
  meeting_id: string;
  primary_outcome: PrimaryOutcome;
  action_items: ActionItem[];
  notes?: string;
  logged_by?: string;
  team_id?: string;
  created_at?: string;
}

export interface ReportSnapshot {
  outcomes: Array<{ id: string; primary_outcome: string; notes?: string; created_at: string }>;
  notes: Array<{ text: string; sort_order: number; source: string; created_at: string; created_by_user?: { name: string } }>;
  action_items: Array<{ id: string; text: string; status: string; priority: string; assignee_id?: string; assignee_email?: string; due_date?: string; created_at: string }>;
  pulled_comments: Array<{ id: string; user_id: string; text: string; created_at: string; users?: { name: string } }>;
  comment_thread: Array<{ id: string; user_id: string; text: string; created_at: string; users?: { name: string } }>;
  logged_at: string;
  logged_by: string;
}

export interface Meeting {
  id: string;
  title: string;
  description?: string | null;
  department: string;
  meeting_type: string;
  vibe?: string | null;
  scheduled_duration: number;
  scheduled_at?: string | null;
  facilitator_id?: string | null;
  status: MeetingStatus;
  agenda_items: AgendaItem[];
  actual_duration?: number;
  active_item_index?: number;
  is_timer_running?: boolean;
  timer_started_at?: string | null;
  timer_item_started_at?: string | null;
  timer_base_total?: number;
  timer_base_item?: number;
  paused_at?: string | null;
  created_by?: string;
  created_at?: string;
  team_id?: string;
  participants?: Participant[];
  outcomes?: Outcome | Outcome[];
  share_token?: string;
  deleted_at?: string | null;
  logged_at?: string | null;
  logged_by?: string | null;
  report_snapshot?: ReportSnapshot | null;
}

export interface TimerState {
  is_running: boolean;
  elapsed_total: number;
  remaining_total: number;
  over_budget: boolean;
  elapsed_item: number;
  remaining_item: number;
  active_item_index: number;
  active_item: AgendaItem | null;
  paused_at: string | null;
  timer_started_at: string | null;
  timer_item_started_at: string | null;
  timer_base_total: number;
  timer_base_item: number;
}

export interface NotificationPreferences {
  user_id?: string;
  meeting_reminder_email: boolean;
  outcome_prompt_email: boolean;
}

export interface Team {
  id: string;
  name: string;
  created_at: string;
  deleted_at?: string | null;
}

export interface Template {
  id: string;
  name: string;
  description?: string;
  department?: string;
  meeting_type?: string;
  agenda_items: AgendaItem[];
  created_by?: string;
  team_id?: string;
  created_at?: string;
  deleted_at?: string | null;
}

export interface CreateMeetingInput {
  title: string;
  description?: string;
  department: string;
  meeting_type: string;
  scheduled_duration: number;
  scheduled_at?: string;
  facilitator_id?: string;
  vibe?: string;
  agenda_items?: AgendaItem[];
  participants?: { user_id: string; role?: ParticipantRole }[];
}

export interface CreateTemplateInput {
  name: string;
  description?: string;
  department?: string;
  meeting_type?: string;
  agenda_items: AgendaItem[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface Department {
  name: string;
}
