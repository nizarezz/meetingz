import { describe, it, expect } from "vitest";
import { z } from "zod";

const schema = z.object({
  title: z.string().min(1),
  duration: z.number().int().min(0).default(0),
});

describe("createMeetingSchema", () => {
  it("accepts valid input", () => {
    const result = schema.safeParse({ title: "Standup", duration: 300 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Standup");
      expect(result.data.duration).toBe(300);
    }
  });

  it("rejects empty title", () => {
    const result = schema.safeParse({ title: "", duration: 300 });
    expect(result.success).toBe(false);
  });

  it("applies default duration", () => {
    const result = schema.safeParse({ title: "Standup" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.duration).toBe(0);
    }
  });

  it("rejects negative duration", () => {
    const result = schema.safeParse({ title: "Standup", duration: -1 });
    expect(result.success).toBe(false);
  });
});
