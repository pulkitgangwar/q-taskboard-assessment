import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getCurrentUser,
  unauthorized,
  forbidden,
  getProjectMembership,
  canEditTasks,
} from "@/lib/auth";
import { AirtableClient, ensureProjectTable, getAirtableConfig } from "@/lib/airtable";
import { exportRecords, messageOf, type ExportRecord } from "@/lib/airtable-export";
import { STATUS_LABELS } from "@/types";

type Params = { params: Promise<{ id: string }> };

// POST /api/projects/:id/export — push all of a project's tasks to Airtable.
// Only project admins/members may trigger it. Idempotent: re-running updates
// existing rows (matched on the "Task ID" field) instead of duplicating them.
export async function POST(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const { id: projectId } = await params;

  const membership = await getProjectMembership(user.id, projectId);
  if (!membership) return forbidden("you are not a member of this project");
  if (!canEditTasks(membership.role)) {
    return forbidden("only admins and members can export tasks");
  }

  const config = getAirtableConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Airtable is not configured. Set AIRTABLE_API_KEY and AIRTABLE_BASE_ID." },
      { status: 503 },
    );
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, airtableTableId: true },
  });
  if (!project) return forbidden("you are not a member of this project");

  const tasks = await prisma.task.findMany({
    where: { projectId },
    include: { assignee: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { position: "asc" }],
  });

  const records: ExportRecord[] = tasks.map((t) => ({
    externalId: t.id,
    fields: {
      Title: t.title,
      Description: t.description ?? "",
      Status: STATUS_LABELS[t.status],
      Assignee: t.assignee?.name ?? "",
      Position: t.position,
      "Created At": t.createdAt.toISOString(),
    },
  }));

  try {
    // Provision (or reuse) a dedicated table for this project, then export into
    // it by id so tasks from different projects never share a table.
    const { tableId } = await ensureProjectTable(config, project);
    if (tableId !== project.airtableTableId) {
      await prisma.project.update({
        where: { id: projectId },
        data: { airtableTableId: tableId },
      });
    }

    const client = new AirtableClient({ ...config, tableName: tableId });
    const summary = await exportRecords(client, records, { keyField: "Task ID" });
    return NextResponse.json({ summary });
  } catch (err) {
    // Reaching here means the initial list call failed after retries — we
    // cannot guarantee idempotency, so we do not attempt blind creates.
    return NextResponse.json(
      { error: `Airtable export failed: ${messageOf(err)}` },
      { status: 502 },
    );
  }
}
