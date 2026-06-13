"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { ApiActivity } from "@/types";
import { describeActivity } from "@/lib/activity-format";

type Props = {
  projectId: string;
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActivityFeed({ projectId }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["activity", projectId],
    queryFn: () => apiFetch<{ activities: ApiActivity[] }>(`/api/projects/${projectId}/activity`),
  });

  const activities = data?.activities ?? [];

  return (
    <section className="mt-10">
      <h2 className="text-sm font-medium mb-3">recent activity</h2>

      <div className="bg-surface border border-border rounded-lg p-4">
        {isLoading && <p className="text-xs text-muted">loading activity…</p>}
        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error instanceof Error ? error.message : "failed to load activity"}
          </p>
        )}
        {!isLoading && !error && activities.length === 0 && (
          <p className="text-xs text-muted">no activity yet.</p>
        )}

        <ul className="space-y-3">
          {activities.map((a) => (
            <li key={a.id} className="flex items-start gap-3 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <div className="min-w-0">
                <p className="break-words">
                  <span className="font-medium">{a.actor.name}</span>{" "}
                  <span className="text-muted">{describeActivity(a)}</span>
                </p>
                <p className="text-xs text-muted">{formatWhen(a.createdAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
