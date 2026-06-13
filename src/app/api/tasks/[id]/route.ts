import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getCurrentUser,
  unauthorized,
  forbidden,
  notFound,
  badRequest,
  getProjectMembership,
  canEditTasks,
} from "@/lib/auth";
import { updateTaskSchema } from "@/schemas/task";
import { recordActivity } from "@/lib/activity";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) return badRequest("invalid input", parsed.error.flatten());

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return notFound("task not found");

  const membership = await getProjectMembership(user.id, existing.projectId);
  if (!membership) return forbidden("you are not a member of this project");
  if (!canEditTasks(membership.role)) {
    return forbidden("viewers cannot edit tasks");
  }

  // Detect the meaningful changes so we can record matching audit entries.
  const statusChanged =
    parsed.data.status !== undefined && parsed.data.status !== existing.status;
  const nextAssigneeId =
    parsed.data.assigneeId === undefined ? existing.assigneeId : parsed.data.assigneeId;
  const assigneeChanged =
    parsed.data.assigneeId !== undefined && nextAssigneeId !== existing.assigneeId;

  // Update the task and its audit records atomically.
  const task = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id },
      data: parsed.data,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
      },
    });

    if (statusChanged) {
      await recordActivity(tx, {
        projectId: existing.projectId,
        actorId: user.id,
        taskId: id,
        type: "task_status_changed",
        metadata: { taskTitle: updated.title, from: existing.status, to: updated.status },
      });
    }

    if (assigneeChanged) {
      const fromName = existing.assigneeId
        ? (await tx.user.findUnique({
            where: { id: existing.assigneeId },
            select: { name: true },
          }))?.name ?? null
        : null;
      await recordActivity(tx, {
        projectId: existing.projectId,
        actorId: user.id,
        taskId: id,
        type: "task_assignee_changed",
        metadata: { taskTitle: updated.title, fromName, toName: updated.assignee?.name ?? null },
      });
    }

    return updated;
  });

  return NextResponse.json({ task });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const { id } = await params;

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return notFound("task not found");

  const membership = await getProjectMembership(user.id, existing.projectId);
  if (!membership) return forbidden("you are not a member of this project");
  if (!canEditTasks(membership.role)) {
    return forbidden("viewers cannot delete tasks");
  }

  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
