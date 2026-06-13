"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch, getStoredUser } from "@/lib/api-client";
import type { ApiProjectMember } from "@/types";

type ExportSummary = {
  total: number;
  created: number;
  updated: number;
  failures: { externalId: string; error: string }[];
};

type Props = {
  projectId: string;
  members: ApiProjectMember[];
};

export function ExportButton({ projectId, members }: Props) {
  // Only admins and members may export — mirror the server-side check.
  const currentUser = getStoredUser();
  const myRole = members.find((m) => m.user.id === currentUser?.id)?.role;
  const canExport = myRole === "admin" || myRole === "member";

  const exportTasks = useMutation({
    mutationFn: () =>
      apiFetch<{ summary: ExportSummary }>(`/api/projects/${projectId}/export`, {
        method: "POST",
      }),
  });

  if (!canExport) return null;

  const summary = exportTasks.data?.summary;

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={() => exportTasks.mutate()}
        disabled={exportTasks.isPending}
        className="text-sm px-4 py-2 rounded-md bg-accent text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {exportTasks.isPending ? "exporting…" : "export to Airtable"}
      </button>

      {summary && (
        <div className="text-xs text-right text-muted max-w-xs">
          <p className="text-white">
            exported {summary.total} {summary.total === 1 ? "task" : "tasks"}
          </p>
          <p>
            {summary.created} created · {summary.updated} updated
            {summary.failures.length > 0 && (
              <span className="text-red-400"> · {summary.failures.length} failed</span>
            )}
          </p>
        </div>
      )}

      {exportTasks.error && (
        <p className="text-xs text-red-400 text-right max-w-xs" role="alert">
          {exportTasks.error instanceof Error ? exportTasks.error.message : "export failed"}
        </p>
      )}
    </div>
  );
}
