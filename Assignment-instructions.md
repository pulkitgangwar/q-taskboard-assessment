# **Senior Software Assignment — Fullstack (AI-Assisted)**

# **Overview**

| What | Details |
| :---- | :---- |
| Time | 90–100 minutes. Set up the app, find bugs, fix one, build the Airtable integration (Part 3c, required), and complete at least one of Part 3a or 3b.  |
| Submit within | 24 hours after receiving this assignment |
| AI tools | Encouraged. Claude Code, Cursor, Aider, Cline, or similar.  |
| Prerequisites | Docker, Node.js 20+ and PostgreSQL 15+. An Airtable account with a personal access token and a base ready to receive records (or equivalent credentials). Set this up before your session starts. |

# **Getting started**

1. Read each and every word of this document carefully before you start.  
2. Set up the project from  [https://github.com/ajackus/q-taskboard-assessment](https://github.com/ajackus/q-taskboard-assessment).  
3. Open http://localhost:3000 and sign in with \`meera@taskboard.dev\` / \`password123\`   
4. Do not modify the seed data. Do not squash commits. We read your commit history.

# **About the TaskBoard Application**

TaskBoard is a project management tool — think of a simplified Jira, Trello, or Linear. The existing app already has authentication, project CRUD, task CRUD, and a Kanban-style UI. Your job is to find issues in it, fix one, and add three new features on top of it.

# **What already exists in the Taskboard app** 

* User — email \+ password account, JWT-based sessions  
* Project — has a name, description, and an owner  
* Membership — links a user to a project with a role: admin, member, or viewer  
* Task (Card) — belongs to a project; has a title, description, status (todo / in\_progress / review / done), an optional assignee, and a position within its column

# **Your tasks**

## **Part 1 — Code review**

Create a \`REVIEW.md\` listing the top 4 issues you find, prioritized by business impact. For each issue, include: file and line reference, category (Security / Performance / Architecture / Data Integrity / Testing), severity, a 2–3 sentence description, and a recommended fix. For at least 1 issue, include a \`curl\` command and the response showing the bug in action.

## **Part 2 — Fix the \#1 critical issue** 

Pick your highest-priority issue and fix it. Submit the fix as a commit, tests that prove it works, and a \`curl\` command showing the bug before, alongside the same \`curl\` showing the fix.

## **Parts 3a and 3b — Complete at least one (completing both earns bonus credit)**

## **Part 3a — Build Task comments** 

Tasks can have a chronological comment thread where project members discuss the work. (This is intentional — the team treats comments as part of the engagement audit trail.)  
**Must work:**

* Comments are listed chronologically, showing author, body, and when posted  
* Project members can post; viewers can read but not post  
* Comments are append-only — once posted, they cannot be edited or deleted.  
* Authorization must be enforced correctly

## **Part 3b — Build the Activity Feed**

Every meaningful change to a project (task created, status changed, assignee changed, comment added) leaves an audit record. The project detail page shows a chronological feed of recent activity.  
**Must work:**

* The feed shows who did what, when, scoped to one project  
* Only project members can read; Recent activity is shown most recently first


If the activity write fails, should the original change roll back? Pick an approach, implement it, and explain your reasoning in 2–3 sentences in your commit or \`DESIGN\_NOTES.md\`. Your reasoning matters more than the choice itself.

## **Part 3c — Bulk export tasks to Airtable (Mandatory)**

Build a feature that exports all tasks for a project to a real Airtable base — at the end of the export, open your Airtable base and the tasks must be visible there. Use the official \`airtable\` npm package for the API calls.  
**Must work:**

* A trigger from the project detail page that initiates the export  
* Only project members (admin or member) can trigger the export  
*  A server-side endpoint that fetches all tasks and pushes them to Airtable using real API calls  
* The export must handle being run more than once gracefully  
* Handle Airtable client errors gracefully: retry transient failures, do not retry permanent failures, do not fail the entire export if a single record fails

**Notes:**

* Assume up to \~1,000 tasks; synchronous is fine (async earns bonus); \`src/lib/airtable-mock.ts\` is a test double for unit tests, not a substitute for the real integration.

If you'd rather integrate with Trello, Notion, or Linear instead of Airtable, that's fine — pick one, make real API calls, and write a test double for unit tests.

# **What to submit**

* Your repository URL (created from the template, full commit history, do not squash)  
* \`REVIEW.md\` — short code review with bug proof from the running app  
* \`TERMINAL\_LOG.md\` — in order: setup output, initial test run, bug curl proof, fix curl proof, Part 3c export demo (Airtable screenshot or share link \+ second run to show uniqueness), 3a/3b demos whichever is attempted, final test run. Tip: \`script \-a terminal\_log.txt\` captures your session automatically.  
* Part 3c with passing tests (required)  
* At least one of Part 3a or Part 3b with passing tests; both are a bonus  
* **Screen recording: record your entire session with Loom or similar, narrate your thinking, keep your terminal visible throughout, and include the link in \`README.md\` or \`RECORDING.md\`. Submissions without a recording will not be evaluated.**

