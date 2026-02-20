# Docker Deployment Migration

**Date:** 2026-02-20
**Status:** Approved

## Context

Production deployment currently uses `scp` + `systemctl` — the CI builds a `deployment.tar.gz`, copies it to the server via SSH, and `deploy-to-server.sh` extracts it, runs `npm ci`, migrates the DB, and restarts a systemd service. Docker infrastructure exists (Dockerfile, docker-compose.yml, nginx configs) but is unused in production.

## Goal

Migrate production deployment from systemd to Docker Compose, using GitHub Container Registry (ghcr.io) for image storage.

## Architecture

### Production Stack

- **Bot + Postgres** run as Docker containers via `docker compose`
- **Nginx** stays on the host as a systemd service (reverse proxy to `127.0.0.1:3010`)
- **Docker image** stored in ghcr.io, built in CI

### CI/CD Pipeline

```
test ──┐
       ├── build-and-push (docker build + push to ghcr.io) ── deploy (ssh: pull + up)
e2e ───┘
```

**build-and-push job** (replaces current `build` job):
- `docker/login-action` — authenticate to ghcr.io using `GITHUB_TOKEN`
- `docker/build-push-action` — build multi-stage Dockerfile and push
- Tags: `latest` + `sha-<short-commit-hash>` (for rollback)

**deploy job** (simplified):
- SSH to server
- `cd /opt/squash-bot && docker compose pull && docker compose up -d`
- Wait for health check
- On failure: rollback to previous image by SHA tag

### Docker Compose (Production)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    env_file: .env
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  db-init:
    image: ghcr.io/OWNER/squash-bot:latest
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
    command: node dist/storage/db/migrate.js
    restart: "no"

  bot:
    image: ghcr.io/OWNER/squash-bot:latest
    restart: unless-stopped
    env_file: .env
    ports:
      - "127.0.0.1:3010:3010"
    depends_on:
      db-init: { condition: service_completed_successfully }
    healthcheck:
      test: ["CMD-SHELL", "node -e \"require('http').get('http://localhost:3010/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));\""]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  postgres-data:
```

Key decisions:
- Port 3010 binds to `127.0.0.1` only — accessible through host nginx, not externally
- `db-init` runs migrations only (no seed in production)
- `env_file: .env` — single env file on server, created manually once
- No nginx container — nginx runs on host

### Environment File

`.env` is created manually on the server once (contains secrets):

```bash
# /opt/squash-bot/.env
BOT_TOKEN=...
POSTGRES_DB=squash_bot
POSTGRES_USER=squash
POSTGRES_PASSWORD=...
DATABASE_URL=postgresql://squash:...@postgres:5432/squash_bot
ENVIRONMENT=production
```

Not managed by CI. Changes require SSH access to server.

### Dockerfile

Current Dockerfile is already production-ready (multi-stage, non-root user, dumb-init, healthcheck). No significant changes needed.

## File Changes

| File | Action |
|------|--------|
| `scripts/deploy-to-server.sh` | Delete — replaced by `docker compose pull && up` |
| `docker-compose.yml` | Rewrite — remove nginx, simplify |
| `.github/workflows/ci-cd.yml` | Rewrite `build` and `deploy` jobs |
| `nginx/` | Keep in repo as reference, removed from compose |

**Not changed:**
- `Dockerfile` — minimal or no changes
- `docker-compose.dev.yml` — dev/e2e stays as-is
- `scripts/docker-entrypoint.sh` — works as-is

## Server Setup (One-time)

Before first Docker deployment:
1. Install Docker and Docker Compose on server
2. Authenticate to ghcr.io: `docker login ghcr.io`
3. Create `/opt/squash-bot/.env` with production secrets
4. Copy `docker-compose.yml` to `/opt/squash-bot/`
5. Stop and disable systemd service: `systemctl stop squash-bot && systemctl disable squash-bot`