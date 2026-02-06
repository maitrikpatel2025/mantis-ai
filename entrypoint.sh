#!/bin/bash
set -e

# Extract job ID from branch name (job/uuid -> uuid), fallback to random UUID
if [[ "$BRANCH" == job/* ]]; then
    JOB_ID="${BRANCH#job/}"
else
    JOB_ID=$(cat /proc/sys/kernel/random/uuid)
fi
echo "Job ID: ${JOB_ID}"

# Start Chrome (using Puppeteer's chromium from pi-skills browser-tools)
CHROME_BIN=$(find /root/.cache/puppeteer -name "chrome" -type f | head -1)
$CHROME_BIN --headless --no-sandbox --disable-gpu --remote-debugging-port=9222 2>/dev/null &
CHROME_PID=$!
sleep 2

# Export SECRETS (base64 JSON) as flat env vars (GH_TOKEN, ANTHROPIC_API_KEY, etc.)
# These are filtered from LLM's bash subprocess by env-sanitizer extension
if [ -n "$SECRETS" ]; then
    SECRETS_JSON=$(echo "$SECRETS" | base64 -d)
    eval $(echo "$SECRETS_JSON" | jq -r 'to_entries | .[] | "export \(.key)=\"\(.value)\""')
    export SECRETS="$SECRETS_JSON"  # Keep decoded for extension to parse
fi

# Export LLM_SECRETS (base64 JSON) as flat env vars
# These are NOT filtered - LLM can access these (browser logins, skill API keys, etc.)
if [ -n "$LLM_SECRETS" ]; then
    LLM_SECRETS_JSON=$(echo "$LLM_SECRETS" | base64 -d)
    eval $(echo "$LLM_SECRETS_JSON" | jq -r 'to_entries | .[] | "export \(.key)=\"\(.value)\""')
fi

# Git setup - derive identity from GitHub token
gh auth setup-git
GH_USER_JSON=$(gh api user -q '{name: .name, login: .login, email: .email, id: .id}')
GH_USER_NAME=$(echo "$GH_USER_JSON" | jq -r '.name // .login')
GH_USER_EMAIL=$(echo "$GH_USER_JSON" | jq -r '.email // "\(.id)+\(.login)@users.noreply.github.com"')
git config --global user.name "$GH_USER_NAME"
git config --global user.email "$GH_USER_EMAIL"

# Clone branch
if [ -n "$REPO_URL" ]; then
    git clone --single-branch --branch "$BRANCH" --depth 1 "$REPO_URL" /job
else
    echo "No REPO_URL provided"
fi

cd /job

# Clean workspace/tmp
rm -rf ./workspace/tmp/*

# Setup logs
LOG_DIR="/job/workspace/logs/${JOB_ID}"
mkdir -p "${LOG_DIR}"

# 1. Run job (SOUL.md provides personality, job.md provides the task)
PROMPT="You're Alive!

# Your Soul

$(cat /job/operating_system/SOUL.md)

---

# Your Job

$(cat /job/workspace/job.md)"

pi -p "$PROMPT" --session-dir "${LOG_DIR}"

# 2. Commit changes + logs
git add -A
git add -f "${LOG_DIR}"
git commit -m "thepopebot: job ${JOB_ID}" || true
git push origin

# 3. Merge (pi has memory of job via session)
#if [ -n "$REPO_URL" ] && [ -f "/job/MERGE_JOB.md" ]; then
#    echo "MERGED"
#    pi -p "$(cat /job/MERGE_JOB.md)" --session-dir "${LOG_DIR}" --continue
#fi

# 5. Create PR (auto-merge handled by GitHub Actions workflow)
gh pr create --title "thepopebot: job ${JOB_ID}" --body "Automated job" --base main || true

# Cleanup
kill $CHROME_PID 2>/dev/null || true
echo "Done. Job ID: ${JOB_ID}"
