import { Prisma, type ActivityType } from "@prisma/client";

// Any Prisma client — the base singleton or a transaction client. Activity
// writes are meant to run inside the same transaction as the change they
// describe, so the audit trail can never drift from the data (see DESIGN_NOTES.md).
export type ActivityDb = Prisma.TransactionClient;

type RecordActivityInput = {
  projectId: string;
  actorId: string;
  taskId?: string | null;
  type: ActivityType;
  metadata?: Prisma.InputJsonValue;
};

export function recordActivity(db: ActivityDb, input: RecordActivityInput) {
  return db.activity.create({
    data: {
      projectId: input.projectId,
      actorId: input.actorId,
      taskId: input.taskId ?? null,
      type: input.type,
      metadata: input.metadata ?? Prisma.JsonNull,
    },
  });
}
