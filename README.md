# TaskBoard — Project Management App

A Next.js 15 fullstack application for managing projects, tasks, and team members. TypeScript + Prisma + PostgreSQL on the server, React 19 + TanStack Query on the client.

## Quick Setup (Docker — Recommended)

```bash
# Clone and enter the repo
git clone <repo-url> && cd taskboard

# Start the app and database
docker-compose up --build

# In a separate terminal, set up the database
docker-compose exec web npm run db:seed

# Run the test suite
docker-compose exec web npm test

# The app is now running at http://localhost:3000
```

## Manual Setup (without Docker)

Requires: Node.js 20+, PostgreSQL 15+

```bash
# Run the setup script (installs deps, sets up DB, configures git hooks)
chmod +x bin/setup
./bin/setup

# Or do it manually:
npm install
git config core.hooksPath .git-hooks
cp .env.example .env   # then edit DATABASE_URL if your local Postgres differs
npx prisma migrate deploy
npx prisma generate
npm run db:seed
npm test
npm run dev
```

## AI Tool Conversation Tracking

**This repository is configured to automatically capture your AI coding tool conversation history with each git commit.** This includes conversations from Claude Code, Cursor, Aider, Continue.dev, Cody, Cline, and Windsurf.

This is part of the Ajackus evaluation process. We evaluate how you collaborate with AI tools — your prompting strategy, how you break down problems, and how you review AI suggestions. The captured conversations help us understand your workflow.

**How it works:**
- A pre-commit git hook runs automatically before each commit
- It copies conversation files from AI tool directories (e.g., `.claude/`, `.cursor/`) into `.ai-conversations/`
- These files are staged and included in your commit
- You don't need to do anything — it happens automatically

**What's captured:** Only AI tool conversation logs stored in the project directory. No system files, browsing history, or anything outside this repository.

**If you prefer a tool that doesn't store local conversations** (like browser-based ChatGPT), the screen recording will capture your interactions instead. No additional action needed from you.

## Seed Data

The seed file creates:
- 5 users across 3 projects with different roles (admin / member / viewer)
- 3 projects with realistic task distributions
- 12 tasks spanning all four statuses (`todo`, `in_progress`, `review`, `done`)

All user passwords are: `password123`

| Email | Role on which project |
|-------|----------------------|
| meera@taskboard.dev | admin on Q3 Launch & Internal Tools, member on Onboarding |
| arjun@taskboard.dev | admin on Onboarding, member on Q3 Launch |
| kavya@example.com | member on Q3 Launch |
| dev@example.com | viewer on Q3 Launch |
| lina@example.com | member on Onboarding |

## Authentication

Register or login to get a JWT token:

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"meera@taskboard.dev","password":"password123"}'

# Use the returned token
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/projects
```

## API Endpoints

### Auth
- `POST /api/auth/register` — Create account
- `POST /api/auth/login` — Sign in, get JWT
- `GET /api/users/me` — Current user (authenticated)

### Projects
- `GET /api/projects` — List projects you're a member of (authenticated)
- `POST /api/projects` — Create a project (authenticated; creator becomes admin)
- `GET /api/projects/:id` — Project detail with tasks and members (authenticated)
- `PATCH /api/projects/:id` — Update project (authenticated)
- `DELETE /api/projects/:id` — Delete project (authenticated)

### Tasks
- `GET /api/projects/:id/tasks` — List tasks in a project (authenticated)
- `POST /api/projects/:id/tasks` — Create a task (authenticated)
- `PATCH /api/tasks/:id` — Update a task (authenticated)
- `DELETE /api/tasks/:id` — Delete a task (authenticated)

### Comments (Part 3a)
- `GET /api/tasks/:id/comments` — List a task's comments, chronological (members only)
- `POST /api/tasks/:id/comments` — Add a comment, append-only (admins/members; viewers cannot)

### Activity feed (Part 3b)
- `GET /api/projects/:id/activity` — Project audit feed, most-recent-first (members only)

### Airtable export (Part 3c)
- `POST /api/projects/:id/export` — Export all of a project's tasks to Airtable (admins/members)

## Airtable export (Part 3c)

Exports every task in a project to a real Airtable base. Trigger it from the
**"export to Airtable"** button on the project detail page (visible to admins and
members), or via the API directly.

**One table per project.** On first export the app creates a dedicated Airtable
table for the project (named `"<project name> [<id>]"`) with the right columns,
records its id, and reuses it on later exports — so tasks from different projects
never share a table, and you never have to create columns by hand.

### Configuration

Create a `.env` file beside `docker-compose.yml` (compose passes these through to
the container — re-run `docker compose up -d web` after changing them):

```bash
AIRTABLE_API_KEY="pat..."          # personal access token
AIRTABLE_BASE_ID="app..."          # base id
AIRTABLE_TABLE_NAME="Tasks"        # fallback name only; per-project tables are auto-created
```

The personal access token must be granted access to the target base and have all
four scopes:

- **`data.records:read`**, **`data.records:write`** — read/write task rows
- **`schema.bases:read`**, **`schema.bases:write`** — list and create the per-project table

(A token missing base access or these scopes returns `403 NOT_AUTHORIZED`.)

### Table columns (created automatically)

Each per-project table is created with these fields — `Task ID` is the primary
field and the idempotency key:

| Field | Type |
|-------|------|
| `Task ID` | Single line text — **used to de-duplicate** |
| `Title` | Single line text |
| `Description` | Long text |
| `Status` | Single line text |
| `Assignee` | Single line text |
| `Position` | Number |
| `Created At` | Single line text (ISO 8601) |

### Behavior

- **Idempotent.** Each row is keyed by `Task ID`. Re-running the export *updates*
  existing rows instead of creating duplicates (see the response `created` vs
  `updated` counts).
- **Resilient to transient errors.** `429` (rate limit), `5xx`, and network errors
  are retried with exponential back-off; `429` honours a 30s minimum wait. Permanent
  `4xx` errors (e.g. `422`) are not retried.
- **Partial-failure tolerant.** A single record that fails (after retries) is
  reported in `failures[]` and does **not** abort the rest of the export.
- **Rate-limit aware.** Writes are paced to stay under Airtable's 5 req/s-per-base limit.

Example response:

```json
{ "summary": { "total": 7, "created": 7, "updated": 0, "failures": [] } }
```

## Tech Stack

- Node.js 20 (runtime)
- Next.js 15 (App Router) / React 19
- TypeScript 5 (strict mode)
- Prisma 6 + PostgreSQL 16
- TanStack Query 5 (client data)
- Zod 3 (schema validation)
- Tailwind CSS 3
- bcryptjs + jsonwebtoken
- Vitest 2 (testing)
