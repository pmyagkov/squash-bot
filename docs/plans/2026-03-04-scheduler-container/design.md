# Scheduler Container — Replace n8n

## Problem

n8n quota exhausted. The bot relies on n8n as an external cron scheduler to trigger three HTTP endpoints. Need a self-hosted replacement with zero external dependencies.

## Solution

Lightweight Alpine container with supercronic + curl that replaces n8n entirely. Schedules are configurable via environment variables, supporting seconds granularity for testing.

### Architecture

```
scheduler (alpine + supercronic + curl)
    ├── GET  bot:3010/health        HEALTH_SCHEDULE (default: */5 * * * *)
    ├── POST bot:3010/check-events  CHECK_EVENTS_SCHEDULE (default: */15 * * * *)
    └── POST bot:3010/check-payments CHECK_PAYMENTS_SCHEDULE (default: 0 12 * * *)

    On failure → curl Telegram Bot API → alert to admin
```

### Structure

```
scheduler/
├── Dockerfile        # Alpine 3.20 + supercronic + curl
├── entrypoint.sh     # Generates crontab from env vars, runs supercronic
└── scripts/
    ├── health-check.sh
    ├── check-events.sh
    └── check-payments.sh
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BOT_URL` | `http://bot:3010` | Bot API base URL (Docker internal) |
| `API_KEY` | — | For `X-API-Key` header |
| `TELEGRAM_BOT_TOKEN` | — | For alert messages |
| `TELEGRAM_LOG_CHAT_ID` | — | Telegram chat ID for alerts (reuses existing env var) |
| `HEALTH_SCHEDULE` | `*/5 * * * *` | Health check cron (every 5 min) |
| `CHECK_EVENTS_SCHEDULE` | `*/15 * * * *` | Event check cron (every 15 min) |
| `CHECK_PAYMENTS_SCHEDULE` | `0 12 * * *` | Payment check cron (daily noon) |

supercronic supports 6-field cron (with seconds): `*/15 * * * * *` = every 15 seconds.

### Alert Messages

- Health: `🔴 Squash Bot health check failed! Status: <code>. Time: <ISO>`
- Events: `🔴 check-events failed! Error: <msg>. Time: <ISO>`
- Payments: `🔴 check-payments failed! Error: <msg>. Time: <ISO>`

### Docker Compose

**Production:** Uses pre-built image from ghcr.io (built in CI/CD pipeline).

**Dev:** Uses `build: ./scheduler` with faster schedules from `.env.test`.

### CI/CD

Scheduler image is built and pushed to `ghcr.io/<repo>-scheduler:latest` alongside the bot image.

## Decisions

- **Why supercronic over crond?** Supports seconds in cron expressions for fast testing (15s, 30s). Docker-friendly (runs in foreground, no PID 1 issues).
- **Why separate container, not embedded cron?** Clean separation of concerns. Bot stays focused on business logic. Scheduler is replaceable.
- **Why configurable schedules?** Fast iteration in dev/test (15s health, 30s events), standard intervals in production.
- **Why keep HTTP endpoints?** Manual triggering, debugging, future integrations.
