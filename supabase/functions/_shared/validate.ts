import { z } from "npm:zod";

export function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Response(
      JSON.stringify({ error: first?.message ?? "Validation failed" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  return result.data;
}

export const createMeetingSchema = z.object({
  title: z.string().min(1, "title is required"),
  department: z.string().min(1, "department is required"),
  meeting_type: z.string().min(1, "meeting_type is required"),
  scheduled_duration: z.number().int().positive("scheduled_duration must be positive"),
  vibe: z.string().optional(),
  agenda_items: z.array(z.object({
    title: z.string().min(1),
    duration: z.number().int().min(0).default(0),
    assignee_email: z.string().email().optional().nullable(),
    presenter: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  })).default([]),
  scheduled_at: z.string().optional(),
  facilitator_id: z.string().uuid().optional(),
  participants: z.array(z.object({
    user_id: z.string().uuid(),
    role: z.string().optional(),
    department: z.string().optional(),
  })).default([]),
});

export const updateMeetingSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.string().optional(),
  department: z.string().optional(),
  meeting_type: z.string().optional(),
  vibe: z.string().optional(),
  scheduled_duration: z.number().int().positive().optional(),
  scheduled_at: z.string().optional(),
  agenda_items: z.array(z.object({
    title: z.string().min(1),
    duration: z.number().int().min(0).default(0),
    assignee_email: z.string().email().optional().nullable(),
    presenter: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  })).optional(),
});

export const createCommentSchema = z.object({
  meeting_id: z.string().uuid("meeting_id is required"),
  text: z.string().min(1, "text is required"),
});

export const createParticipantSchema = z.object({
  meeting_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: z.string().default("attendee"),
  department: z.string().optional(),
});

export const updateParticipantSchema = z.object({
  role: z.string(),
});

export const createOutcomeSchema = z.object({
  primary_outcome: z.string().min(1),
  action_items: z.array(z.object({
    text: z.string().min(1),
    assignee_id: z.string().uuid().optional(),
    assignee_email: z.string().email().optional(),
    due_date: z.string().optional(),
  })).default([]),
  notes: z.string().optional(),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1, "name is required"),
  description: z.string().optional(),
  department: z.string().min(1, "department is required"),
  meeting_type: z.string().min(1, "meeting_type is required"),
  agenda_items: z.array(z.object({
    title: z.string().min(1),
    duration: z.number().int().min(0).default(0),
    assignee_email: z.string().email().optional().nullable(),
    presenter: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  })).default([]),
});

export const inviteUserSchema = z.object({
  email: z.string().email("valid email is required"),
  name: z.string().optional(),
  department: z.string().optional(),
  role: z.string().optional(),
});

export const updateTeamSchema = z.object({
  name: z.string().min(1, "name is required"),
});

export const updateProfileSchema = z.object({
  name: z.string().optional(),
  department: z.string().optional(),
  fcm_token: z.string().optional(),
});

export const updatePreferencesSchema = z.object({
  meeting_reminder_email: z.boolean().optional(),
  outcome_prompt_email: z.boolean().optional(),
});

export const createNotificationPrefsSchema = z.object({
  meeting_reminder_email: z.boolean().optional(),
  outcome_prompt_email: z.boolean().optional(),
});

export const createActionItemSchema = z.object({
  meeting_id: z.string().uuid("meeting_id is required"),
  text: z.string().min(1, "text is required"),
  assignee_id: z.string().uuid().optional(),
  assignee_email: z.string().email().optional(),
  due_date: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
});

export const updateActionItemSchema = z.object({
  done: z.boolean().optional(),
  status: z.enum(["done", "blocked"]).optional(),
  text: z.string().optional(),
  due_date: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
});
