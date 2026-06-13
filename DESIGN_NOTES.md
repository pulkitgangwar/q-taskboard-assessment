# Design Notes

## Part 3b — Activity Feed: should a failed activity write roll back the change?

**Decision: Yes — the change and its activity record are written together in a single
Prisma transaction (`prisma.$transaction`). If the activity insert fails, the task
create/update or the comment insert rolls back with it.**

**Reasoning.** The feature's stated purpose is an *audit trail*, and an audit trail with
silent gaps is worse than no audit trail — you can't trust a feed that sometimes omits
changes. Both writes target the same PostgreSQL database, so wrapping them in one
transaction is cheap and reliable, with no second system to coordinate. The small cost is
that an activity-logging bug could block a real user action; I accept that trade-off here
because correctness of the record matters more than availability for this team's
engagement-audit use case. (If activity logging were a high-volume, best-effort analytics
stream instead, I'd flip this: write it asynchronously/after-commit and never let it block
the user.)

### Where activity is recorded (all transactional)
| Event | Endpoint | Type |
|-------|----------|------|
| Task created | `POST /api/projects/:id/tasks` | `task_created` |
| Status changed | `PATCH /api/tasks/:id` | `task_status_changed` |
| Assignee changed | `PATCH /api/tasks/:id` | `task_assignee_changed` |
| Comment added | `POST /api/tasks/:id/comments` | `comment_added` |

### Other design choices
- **Audit survives task deletion.** `Activity.taskId` is `ON DELETE SET NULL` (not cascade),
  and each record snapshots a human-readable `taskTitle` (and from/to values) in `metadata`,
  so the feed remains meaningful even after the underlying task is deleted.
- **Read authorization.** `GET /api/projects/:id/activity` requires project membership
  (any role — admin, member, or viewer), scoped to that one project, ordered most-recent-first.
- **Bonus fix.** Recording activity on task edits required knowing the actor's project
  context, which surfaced that `PATCH /api/tasks/:id` previously performed **no**
  authorization check (REVIEW.md issue #3). The membership + `canEditTasks` check is now
  enforced there too, so we never log an unauthorized edit as legitimate activity.
