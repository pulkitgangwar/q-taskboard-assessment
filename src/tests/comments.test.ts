import { describe, it, expect } from "vitest";
import { createCommentSchema } from "@/schemas/comment";
import { canPostComment, canReadComments } from "@/lib/auth";

describe("createCommentSchema", () => {
  it("accepts a non-empty body and trims surrounding whitespace", () => {
    const parsed = createCommentSchema.safeParse({ body: "  looks good to me  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.body).toBe("looks good to me");
  });

  it("rejects an empty or whitespace-only body", () => {
    expect(createCommentSchema.safeParse({ body: "" }).success).toBe(false);
    expect(createCommentSchema.safeParse({ body: "   " }).success).toBe(false);
  });

  it("rejects a missing body", () => {
    expect(createCommentSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a body over the length limit", () => {
    expect(createCommentSchema.safeParse({ body: "x".repeat(5001) }).success).toBe(false);
  });
});

describe("comment authorization", () => {
  it("lets admins and members post, but not viewers or non-members", () => {
    expect(canPostComment("admin")).toBe(true);
    expect(canPostComment("member")).toBe(true);
    expect(canPostComment("viewer")).toBe(false);
    expect(canPostComment(null)).toBe(false);
    expect(canPostComment(undefined)).toBe(false);
  });

  it("lets any project member (including viewers) read, but not non-members", () => {
    expect(canReadComments("admin")).toBe(true);
    expect(canReadComments("member")).toBe(true);
    expect(canReadComments("viewer")).toBe(true);
    expect(canReadComments(null)).toBe(false);
    expect(canReadComments(undefined)).toBe(false);
  });
});
