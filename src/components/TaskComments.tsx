"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getStoredUser } from "@/lib/api-client";
import type { ApiComment, ApiProjectMember } from "@/types";

type Props = {
  taskId: string;
  members: ApiProjectMember[];
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TaskComments({ taskId, members }: Props) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Viewers may read but not post — mirror the server-side authorization.
  const currentUser = getStoredUser();
  const myRole = members.find((m) => m.user.id === currentUser?.id)?.role;
  const canPost = myRole === "admin" || myRole === "member";

  const commentsKey = ["comments", taskId];

  const {
    data,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: commentsKey,
    queryFn: () =>
      apiFetch<{ comments: ApiComment[] }>(`/api/tasks/${taskId}/comments`),
  });

  const postComment = useMutation({
    mutationFn: (input: { body: string }) =>
      apiFetch<{ comment: ApiComment }>(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: commentsKey });
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "could not post comment"),
  });

  const comments = data?.comments ?? [];

  return (
    <div className="mt-6 border-t border-border pt-4">
      <h3 className="text-sm font-medium mb-3">
        comments{" "}
        {comments.length > 0 && (
          <span className="text-muted">({comments.length})</span>
        )}
      </h3>

      {isLoading && <p className="text-xs text-muted">loading comments…</p>}
      {queryError && (
        <p className="text-sm text-red-400" role="alert">
          {queryError instanceof Error
            ? queryError.message
            : "failed to load comments"}
        </p>
      )}

      {!isLoading && !queryError && comments.length === 0 && (
        <p className="text-xs text-muted">no comments yet.</p>
      )}

      <ul className="space-y-3 max-h-64 overflow-y-auto">
        {comments.map((c) => (
          <li
            key={c.id}
            className="rounded-md bg-bg border border-border px-3 py-2"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{c.author.name}</span>
              <span className="text-xs text-muted">
                {formatWhen(c.createdAt)}
              </span>
            </div>
            <p className="text-sm text-muted mt-1 whitespace-pre-wrap break-words">
              {c.body}
            </p>
          </li>
        ))}
      </ul>

      {canPost ? (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = body.trim();
            if (!trimmed) return;
            setError(null);
            postComment.mutate({ body: trimmed });
          }}
        >
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="add a comment…"
            className="block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
          {error && (
            <p className="text-sm text-red-400 mt-2" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end mt-2">
            <button
              type="submit"
              disabled={postComment.isPending || !body.trim()}
              className="text-sm px-4 py-2 rounded-md bg-accent text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {postComment.isPending ? "posting…" : "post"}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-xs text-muted mt-4">
          viewers can read comments but cannot post.
        </p>
      )}
    </div>
  );
}
