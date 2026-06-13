import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getCurrentUser,
  unauthorized,
  forbidden,
  notFound,
  badRequest,
  getProjectMembership,
  canReadComments,
  canPostComment,
} from "@/lib/auth";
import { createCommentSchema } from "@/schemas/comment";
import { recordActivity } from "@/lib/activity";

type Params = { params: Promise<{ id: string }> };

const authorPublic = { select: { id: true, name: true, email: true } } as const;

// GET /api/tasks/:id/comments — chronological thread, readable by any project member.
export async function GET(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const { id: taskId } = await params;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true },
  });
  if (!task) return notFound("task not found");

  const membership = await getProjectMembership(user.id, task.projectId);
  if (!membership || !canReadComments(membership.role)) {
    return forbidden("you are not a member of this project");
  }

  const comments = await prisma.comment.findMany({
    where: { taskId },
    include: { author: authorPublic },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ comments });
}

// POST /api/tasks/:id/comments — append-only; admins and members may post, viewers cannot.
export async function POST(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const { id: taskId } = await params;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true, title: true },
  });
  if (!task) return notFound("task not found");

  const membership = await getProjectMembership(user.id, task.projectId);
  if (!membership) return forbidden("you are not a member of this project");
  if (!canPostComment(membership.role)) {
    return forbidden("viewers cannot post comments");
  }

  const body = await req.json().catch(() => null);
  const parsed = createCommentSchema.safeParse(body);
  if (!parsed.success) return badRequest("invalid input", parsed.error.flatten());

  // Post the comment and its audit record atomically.
  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: {
        taskId,
        authorId: user.id,
        body: parsed.data.body,
      },
      include: { author: authorPublic },
    });

    await recordActivity(tx, {
      projectId: task.projectId,
      actorId: user.id,
      taskId,
      type: "comment_added",
      metadata: { taskTitle: task.title },
    });

    return created;
  });

  return NextResponse.json({ comment }, { status: 201 });
}
