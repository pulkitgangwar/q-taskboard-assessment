import type { ApiActivity, TaskStatus } from "@/types";
import { STATUS_LABELS } from "@/types";

function meta(a: ApiActivity, key: string): string | null {
  const v = a.metadata?.[key];
  return typeof v === "string" ? v : null;
}

function statusLabel(value: string | null): string {
  if (value && value in STATUS_LABELS) return STATUS_LABELS[value as TaskStatus];
  return value ?? "—";
}

// Human-readable summary of an audit record, e.g. `created task "Ship v2"`.
export function describeActivity(a: ApiActivity): string {
  const title = meta(a, "taskTitle") ?? "a task";
  switch (a.type) {
    case "task_created":
      return `created task “${title}”`;
    case "task_status_changed":
      return `moved “${title}” from ${statusLabel(meta(a, "from"))} to ${statusLabel(meta(a, "to"))}`;
    case "task_assignee_changed": {
      const to = meta(a, "toName");
      return to ? `assigned “${title}” to ${to}` : `unassigned “${title}”`;
    }
    case "comment_added":
      return `commented on “${title}”`;
    default:
      return "made a change";
  }
}
