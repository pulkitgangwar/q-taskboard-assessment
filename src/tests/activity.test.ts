import { describe, it, expect } from "vitest";
import { describeActivity } from "@/lib/activity-format";
import type { ApiActivity, ActivityType } from "@/types";

function makeActivity(
  type: ActivityType,
  metadata: Record<string, unknown> | null,
): ApiActivity {
  return {
    id: "a1",
    type,
    taskId: "t1",
    metadata,
    createdAt: "2026-06-13T06:00:00.000Z",
    actor: { id: "u1", name: "Meera Iyer", email: "meera@taskboard.dev" },
  };
}

describe("describeActivity", () => {
  it("describes a created task", () => {
    expect(describeActivity(makeActivity("task_created", { taskTitle: "Ship v2" }))).toBe(
      "created task “Ship v2”",
    );
  });

  it("describes a status change using friendly status labels", () => {
    expect(
      describeActivity(
        makeActivity("task_status_changed", { taskTitle: "Ship v2", from: "todo", to: "in_progress" }),
      ),
    ).toBe("moved “Ship v2” from To do to In progress");
  });

  it("describes an assignment", () => {
    expect(
      describeActivity(
        makeActivity("task_assignee_changed", { taskTitle: "Ship v2", fromName: null, toName: "Arjun Rao" }),
      ),
    ).toBe("assigned “Ship v2” to Arjun Rao");
  });

  it("describes an unassignment when there is no new assignee", () => {
    expect(
      describeActivity(
        makeActivity("task_assignee_changed", { taskTitle: "Ship v2", fromName: "Arjun Rao", toName: null }),
      ),
    ).toBe("unassigned “Ship v2”");
  });

  it("describes a comment", () => {
    expect(describeActivity(makeActivity("comment_added", { taskTitle: "Ship v2" }))).toBe(
      "commented on “Ship v2”",
    );
  });

  it("falls back gracefully when metadata is missing", () => {
    expect(describeActivity(makeActivity("task_created", null))).toBe("created task “a task”");
  });
});
