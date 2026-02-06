# thepopebot - AI Agent Template

This document explains the thepopebot codebase for AI assistants working on this project.

## What is thepopebot?

thepopebot is a **template repository** for creating custom autonomous AI agents. It features a two-layer architecture: an Event Handler for orchestration (webhooks, Telegram chat, cron scheduling) and a Docker Agent for autonomous task execution via the Pi coding agent.

## Two-Layer Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          thepopebot Architecture                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────────┐                                                   │
│   │  Event Handler   │                                                   │
│   │  ┌────────────┐  │         1. create-job                            │
│   │  │  Telegram  │  │ ─────────────────────────►  ┌──────────────────┐ │
│   │  │   Cron     │  │                             │      GitHub      │ │
│   │  │   Chat     │  │ ◄─────────────────────────  │  (job/* branch)  │ │
│   │  └────────────┘  │   5. update-event-handler.yml calls   └────────┬─────────┘ │
│   │                  │      /github/webhook                 │           │
│   └──────────────────┘                                      │           │
│            │                                                │           │
│            │                           2. run-job.yml    │           │
│            ▼                              triggers          │           │
│   ┌──────────────────┐                                      │           │
│   │ Telegram notifies│                                      ▼           │
│   │ user of job done │                         ┌──────────────────────┐ │
│   └──────────────────┘                         │    Docker Agent      │ │
│                                                │  ┌────────────────┐  │ │
│                                                │  │ 1. Clone       │  │ │
│                                                │  │ 2. Run Pi      │  │ │
│                                                │  │ 3. Commit      │  │ │
│                                                │  │ 4. Create PR   │  │ │
│                                                │  └────────────────┘  │ │
│                                                └──────────┬───────────┘ │
│                                                           │             │
│                                                           │ 3. PR opens │
│                                                           ▼             │
│                                                ┌──────────────────────┐ │
│                                                │       GitHub         │ │
│                                                │    (PR opened)       │ │
│                                                │                      │ │
│                                                │ 4. update-event-handler.yml    │ │
│                                                │    triggers          │ │
│                                                └──────────────────────┘ │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
/
├── .github/workflows/
│   ├── run-job.yml          # Runs Docker agent when job/* branch created
│   └── update-event-handler.yml          # Notifies event handler when PR opened
├── .pi/
│   ├── extensions/             # Pi extensions (env-sanitizer for secret filtering)
│   └── skills/                 # Custom skills for the agent
├── docs/                       # Additional documentation
├── event_handler/              # Event Handler orchestration layer
│   ├── server.js               # Express HTTP server (webhooks, Telegram, GitHub)
│   ├── cron.js                 # Cron scheduler (loads CRONS.json)
│   ├── cron/                   # Working directory for command-type cron jobs
│   ├── claude/
│   │   ├── index.js            # Claude API integration for chat
│   │   ├── tools.js            # Tool definitions (create_job, get_job_status)
│   │   └── conversation.js     # Chat history management
│   └── tools/
│       ├── create-job.js       # Job creation via GitHub API
│       ├── github.js           # GitHub REST API helper + job status
│       └── telegram.js         # Telegram bot integration
├── operating_system/
│   ├── SOUL.md                 # Agent identity and personality
│   ├── CHATBOT.md              # Telegram chat system prompt
│   ├── JOB_SUMMARY.md          # Job completion summary prompt
│   ├── HEARTBEAT.md            # Periodic check instructions
│   └── CRONS.json              # Scheduled job definitions
├── setup/                      # Interactive setup wizard
│   ├── setup.mjs               # Main wizard script
│   └── lib/                    # Helper modules
├── workspace/
│   ├── job.md                  # Current task description
│   └── logs/                   # Session logs (UUID.jsonl)
├── Dockerfile                  # Container definition
├── entrypoint.sh               # Container startup script
└── SECURITY.md                 # Security documentation
```

## Key Files

| File | Purpose |
|------|---------|
| `operating_system/SOUL.md` | Agent personality and identity |
| `operating_system/CHATBOT.md` | System prompt for Telegram chat |
| `operating_system/JOB_SUMMARY.md` | Prompt for summarizing completed jobs |
| `workspace/job.md` | The specific task for the agent to execute |
| `Dockerfile` | Builds the agent container (Node.js 22, Playwright, Pi) |
| `entrypoint.sh` | Container startup script - clones repo, runs agent, commits results |
| `.pi/extensions/env-sanitizer/` | Filters secrets from LLM's bash subprocess environment |

## Event Handler Layer

The Event Handler is a Node.js Express server that provides orchestration capabilities:

### Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/webhook` | POST | Generic webhook for job creation (requires API_KEY) |
| `/telegram/webhook` | POST | Telegram bot webhook for conversational interface |
| `/telegram/register` | POST | Register Telegram webhook URL |
| `/github/webhook` | POST | Receives notifications from GitHub Actions (update-event-handler.yml) |
| `/jobs/status` | GET | Check status of a running job |

### Components

- **server.js** - Express HTTP server handling all webhook routes
- **cron.js** - Loads CRONS.json and schedules jobs using node-cron
- **claude/** - Claude API integration for Telegram chat with tool use
- **tools/** - Job creation, GitHub API, and Telegram utilities

### Cron Jobs

Cron jobs are defined in `operating_system/CRONS.json` and loaded by `event_handler/cron.js` at startup using `node-cron`. There are two types:

#### Choosing Between `agent` and `command`

| | `agent` | `command` |
|---|---------|-----------|
| **Uses LLM** | Yes — spins up Pi in a Docker container | No — runs a shell command directly |
| **Thinking** | Can reason, make decisions, write code | No thinking, just executes |
| **Runtime** | Minutes to hours (full agent lifecycle) | Milliseconds to seconds |
| **Cost** | LLM API calls + GitHub Actions minutes | Free (runs on event handler) |

If the task needs to *think*, use `agent`. If it just needs to *do*, use `command`.

#### Type: `agent` (default)

Creates a full Docker Agent job via `createJob()`. This pushes a `job/*` branch to GitHub, which triggers `run-job.yml` to spin up the Docker container with Pi. The `job` string is passed directly as-is to the LLM as its task prompt (written to `workspace/job.md` on the job branch).

```json
{
  "name": "heartbeat",
  "schedule": "*/30 * * * *",
  "type": "agent",
  "job": "Read the file at operating_system/HEARTBEAT.md and complete the tasks described there.",
  "enabled": true
}
```

#### Type: `command`

Runs a shell command directly on the event handler server. No Docker container, no GitHub branch, no LLM. Commands execute with `event_handler/cron/` as the working directory — put any scripts or files needed by cron commands there.

```json
{
  "name": "ping",
  "schedule": "*/1 * * * *",
  "type": "command",
  "command": "echo \"pong!\"",
  "enabled": true
}
```

#### Common Fields

| Field | Description | Required |
|-------|-------------|----------|
| `name` | Display name for logging | Yes |
| `schedule` | Cron expression (e.g., `*/30 * * * *`) | Yes |
| `type` | `agent` (default) or `command` | No |
| `job` | Task description for agent type | For `agent` |
| `command` | Shell command for command type | For `command` |
| `enabled` | Set to `false` to disable without deleting | No |

### Environment Variables (Event Handler)

| Variable | Description | Required |
|----------|-------------|----------|
| `API_KEY` | Authentication key for /webhook endpoint | Yes |
| `GH_TOKEN` | GitHub PAT for creating branches/files | Yes |
| `GH_OWNER` | GitHub repository owner | Yes |
| `GH_REPO` | GitHub repository name | Yes |
| `PORT` | Server port (default: 3000) | No |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from BotFather | For Telegram |
| `TELEGRAM_WEBHOOK_SECRET` | Secret for webhook validation | No |
| `GH_WEBHOOK_TOKEN` | Token for GitHub Actions webhook auth | For notifications |
| `ANTHROPIC_API_KEY` | Claude API key for chat functionality | For chat |
| `EVENT_HANDLER_MODEL` | Claude model for chat (default: claude-sonnet-4) | No |

## Docker Agent Layer

The Dockerfile creates a container with:
- **Node.js 22** (Bookworm slim)
- **Pi coding agent** (`@mariozechner/pi-coding-agent`)
- **Playwright + Chromium** (headless browser automation)
- **Git + GitHub CLI** (for repository operations)

### Runtime Flow (entrypoint.sh)

1. Extract Job ID from branch name (job/uuid → uuid) or generate UUID
2. Start headless Chrome (CDP on port 9222)
3. Decode `SECRETS` from base64, parse JSON, export each key as env var (filtered from LLM's bash)
4. Decode `LLM_SECRETS` from base64, parse JSON, export each key as env var (LLM can access these)
5. Configure Git credentials via `gh auth setup-git` (uses GH_TOKEN from SECRETS)
6. Clone repository branch to `/job`
7. Run Pi with SOUL.md + job.md as prompt
8. Save session log to `workspace/logs/{JOB_ID}/`
9. Commit all changes with message `thepopebot: job {JOB_ID}`
10. Create PR and auto-merge to main with `gh pr create` and `gh pr merge --squash`

### Environment Variables (Docker Agent)

| Variable | Description | Required |
|----------|-------------|----------|
| `REPO_URL` | Git repository URL to clone | Yes |
| `BRANCH` | Branch to clone and work on (e.g., job/uuid) | Yes |
| `SECRETS` | Base64-encoded JSON with protected credentials (GH_TOKEN, ANTHROPIC_API_KEY, etc.) - filtered from LLM | Yes |
| `LLM_SECRETS` | Base64-encoded JSON with credentials the LLM can access (browser logins, skill API keys) | No |

## GitHub Actions

GitHub Actions automate the job lifecycle. No manual webhook configuration needed.

### run-job.yml

Triggers when a `job/*` branch is created. Runs the Docker agent container.

```yaml
on:
  create:
# Only runs if: branch name starts with "job/"
```

### update-event-handler.yml

Triggers when a PR is opened from a `job/*` branch. Sends a notification to the event handler so it can notify Telegram.

```yaml
on:
  pull_request:
    types: [opened]
    branches: [main]
# Only runs if: PR head branch starts with "job/"
```

### GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `SECRETS` | Base64-encoded JSON with protected credentials (GH_TOKEN, ANTHROPIC_API_KEY, etc.) |
| `LLM_SECRETS` | Base64-encoded JSON with LLM-accessible credentials (optional) |
| `GH_WEBHOOK_URL` | Event handler URL (e.g., `https://your-server.com`) |
| `GH_WEBHOOK_TOKEN` | Token to authenticate with event handler |

## How Credentials Work

Credentials are passed via base64-encoded JSON in the `SECRETS` environment variable:

```bash
# Encode credentials
SECRETS=$(echo -n '{"GH_TOKEN":"ghp_xxx","ANTHROPIC_API_KEY":"sk-ant-xxx"}' | base64)
```

At runtime, entrypoint.sh decodes and exports each key as a flat environment variable. The `env-sanitizer` extension filters these from the LLM's bash subprocess, so the agent can't `echo $ANTHROPIC_API_KEY`.

For credentials the LLM needs access to (browser logins, skill API keys), use `LLM_SECRETS` instead - these are NOT filtered.

## Customization Points

To create your own agent:

1. **GitHub Secrets** - Set `SECRETS` and optionally `LLM_SECRETS` with your API keys
2. **operating_system/SOUL.md** - Customize personality and identity
4. **operating_system/CHATBOT.md** - Configure Telegram chat behavior
5. **operating_system/CRONS.json** - Define scheduled jobs
6. **workspace/job.md** - Define the task to execute
7. **.pi/skills/** - Add custom skills for the agent

## The Operating System

These files in `operating_system/` define the agent's character and behavior:

- **SOUL.md** - Personality, identity, and values (who the agent is)
- **CHATBOT.md** - System prompt for Telegram chat
- **JOB_SUMMARY.md** - Prompt for summarizing completed jobs
- **HEARTBEAT.md** - Self-monitoring behavior
- **CRONS.json** - Scheduled job definitions

## Session Logs

Each job creates a session log at `workspace/logs/{JOB_ID}/`. This directory contains the full conversation history and can be resumed for follow-up tasks via the `--session-dir` flag.

## Markdown File Includes

Markdown files in `operating_system/` support a `{{filepath}}` include syntax, powered by `event_handler/utils/render-md.js`.

- **Syntax**: `{{ filepath }}` — double curly braces around a file path
- **Path resolution**: Paths resolve relative to the repository root
- **Recursive**: Included files can themselves contain includes
- **Circular protection**: If a circular include is detected, it is skipped and a warning is logged
- **Missing files**: If a referenced file doesn't exist, the pattern is left as-is

Currently used by the Event Handler to load CHATBOT.md (which includes CLAUDE.md) as the Claude system prompt.
