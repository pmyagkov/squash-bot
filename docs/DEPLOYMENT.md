# Deployment

## Quick Reference

All commands run on the server unless noted otherwise.

| Action | Command |
|--------|---------|
| SSH to server | `ssh root@puelle.me` |
| Container status | `cd /opt/squash-bot && docker compose ps` |
| Bot logs | `docker logs squash-bot-app --tail 100 -f` |
| DB logs | `docker logs squash-bot-postgres --tail 50` |
| Restart bot | `cd /opt/squash-bot && docker compose restart bot` |
| Manual deploy | `cd /opt/squash-bot && docker compose pull && docker compose up -d` |
| Health check | `curl http://localhost:3010/health` |
| DB console | `docker exec -it squash-bot-postgres psql -U postgres -d squash_bot` |
| DB backup | `scripts/backup-db.sh` |
| DB restore | `scripts/restore-db.sh <file.dump>` |

## Architecture

```
GitHub (push to master)
  │
  ├── test job       (typecheck, lint, unit tests)
  ├── e2e job        (Playwright + Telegram test server)
  │
  └── build-and-push job
        │  docker build → ghcr.io/pmyagkov/squash-bot:latest
        │                 ghcr.io/pmyagkov/squash-bot:sha-<commit>
        └── deploy job
              SSH → server: docker compose pull && up -d
```

On the server (`/opt/squash-bot/`):

```
┌──────────────────────────────────────────────┐
│  Host                                        │
│                                              │
│  nginx (systemd) ── reverse proxy ──┐        │
│                                     ▼        │
│  ┌─── Docker Compose ────────────────────┐   │
│  │                                       │   │
│  │  postgres:16  ◄── db-init (migrate)   │   │
│  │       ▲                               │   │
│  │       └────── bot (:3010)             │   │
│  │                                       │   │
│  └───────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

Key points:
- **nginx** runs on the host as a systemd service, terminates SSL, proxies to `127.0.0.1:3010`
- **postgres** — PostgreSQL 16 Alpine, data persisted in a named Docker volume
- **db-init** — runs `node dist/storage/db/migrate.js` on startup, then exits
- **bot** — starts after db-init completes successfully
- Port 3010 is bound to `127.0.0.1` only — not exposed externally
- Docker image is stored in GitHub Container Registry (ghcr.io)

## CI/CD Pipeline

Defined in `.github/workflows/ci-cd.yml`. Triggers on push to `master`.

### Jobs

1. **test** — typecheck + lint + unit tests (with PostgreSQL service container)
2. **e2e** — bot in Docker via `docker-compose.dev.yml`, Playwright tests. `continue-on-error: true` — does not block deploy
3. **build-and-push** — builds Docker image, pushes to ghcr.io with two tags:
   - `latest` — always the newest build
   - `sha-<full-commit-hash>` — for rollback to specific version
4. **deploy** — SSHs to server, pulls new image, runs `docker compose up -d`, verifies health via `docker inspect`

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `SSH_PRIVATE_KEY` | Private SSH key for server access |
| `SERVER_HOST` | Server hostname or IP |
| `SSH_USER` | SSH username on server |
| `CODECOV_TOKEN` | Codecov upload token (optional) |
| `TELEGRAM_AUTH_STATE` | Telegram auth state JSON for E2E tests |

`GITHUB_TOKEN` is auto-provided and used to authenticate with ghcr.io.

The deploy job uses `environment: production` — create it in repo Settings > Environments if needed.

## Environment Variables

The `.env` file lives on the server at `/opt/squash-bot/.env` with `chmod 600`. Not managed by CI — edit manually via SSH.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | yes | — | Bot token from @BotFather |
| `TELEGRAM_LOG_CHAT_ID` | yes | — | Chat ID for error notifications |
| `API_KEY` | yes | — | API key for n8n webhook authentication |
| `POSTGRES_DB` | no | `squash_bot` | PostgreSQL database name |
| `POSTGRES_USER` | no | `postgres` | PostgreSQL username |
| `POSTGRES_PASSWORD` | yes | — | PostgreSQL password |
| `DATABASE_URL` | auto | — | `postgresql://<user>:<pass>@postgres:5432/<db>` |
| `PORT` | no | `3010` | Fastify server port |
| `TIMEZONE` | no | `Europe/Belgrade` | Timezone for date/time formatting |

Helper scripts for generating the file:
- `scripts/setup-env.sh` — interactive (prompts for each value)
- `scripts/setup-env-automated.sh` — non-interactive (reads from env vars)

## Server Setup (from scratch)

### Prerequisites

- Linux server with SSH access
- Domain with DNS pointing to the server
- nginx installed on host (for SSL termination)

### 1. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable docker
```

### 2. Authenticate to ghcr.io

```bash
echo "<GITHUB_PAT>" | docker login ghcr.io -u <github-username> --password-stdin
```

The PAT needs `read:packages` scope.

### 3. Create deployment directory

```bash
mkdir -p /opt/squash-bot
cd /opt/squash-bot
```

### 4. Create `.env` file

Either run the interactive script:

```bash
# Copy scripts/setup-env.sh from the repo and run it
bash setup-env.sh
```

Or create manually:

```bash
cat > .env << 'EOF'
TELEGRAM_BOT_TOKEN=...
TELEGRAM_LOG_CHAT_ID=...
API_KEY=...
POSTGRES_DB=squash_bot
POSTGRES_USER=postgres
POSTGRES_PASSWORD=...
DATABASE_URL=postgresql://postgres:...@postgres:5432/squash_bot
PORT=3010
TIMEZONE=Europe/Belgrade
EOF

chmod 600 .env
```

Generate secure values: `openssl rand -base64 32` (password), `openssl rand -hex 32` (API key).

### 5. Copy `docker-compose.yml`

Copy `docker-compose.yml` from the repo root to `/opt/squash-bot/`.

### 6. Start

```bash
docker compose pull
docker compose up -d
docker compose ps
curl http://localhost:3010/health
```

### Nginx

Nginx runs on the host (not in Docker) as a reverse proxy with SSL termination.

- Config templates: `nginx/nginx.conf`, `nginx/conf.d/squash-bot.conf` in the repo
- Replace `DOMAIN` placeholders in `squash-bot.conf` with actual domain
- SSL certificates via Let's Encrypt
- Renewal script: `scripts/renew-certs.sh`
- Cron: `0 0,12 * * * root /opt/squash-bot/scripts/renew-certs.sh`

## Manual Operations

### Deploy

```bash
cd /opt/squash-bot
docker compose pull
docker compose up -d
```

### Rollback to specific version

Each CI build tags the image with `sha-<commit>`. To rollback:

```bash
cd /opt/squash-bot

# Pull specific version
docker pull ghcr.io/pmyagkov/squash-bot:sha-<full-commit-hash>
docker tag ghcr.io/pmyagkov/squash-bot:sha-<full-commit-hash> ghcr.io/pmyagkov/squash-bot:latest

# Restart
docker compose up -d
```

### Update environment variables

```bash
cd /opt/squash-bot
nano .env
docker compose restart bot
```

Changes to `POSTGRES_*` may require recreating the postgres container: `docker compose down && docker compose up -d`.

### Run migrations manually

Migrations run automatically on every deploy via the `db-init` service. To run manually:

```bash
cd /opt/squash-bot
docker compose run --rm db-init
```

### Database Backups

Backups use `scripts/backup-db.sh` — creates `pg_dump` in custom format, logs to `backup.log`, rotates files older than 7 days.

```bash
# Manual backup (default dir: /opt/backups/squash-bot/)
/opt/squash-bot/scripts/backup-db.sh

# Custom backup directory
/opt/squash-bot/scripts/backup-db.sh /path/to/backups
```

**Cron setup** (daily at 3:00 AM):

```bash
mkdir -p /opt/backups/squash-bot

# Add to crontab
crontab -e
0 3 * * * /opt/squash-bot/scripts/backup-db.sh
```

**Restore** from backup (stops bot, restores, restarts bot):

```bash
# List available backups
ls -lh /opt/backups/squash-bot/

# Restore
/opt/squash-bot/scripts/restore-db.sh /opt/backups/squash-bot/backup_20260304_030000.dump
```

## Troubleshooting

### Bot won't start

```bash
docker compose ps -a
docker logs squash-bot-app --tail 100
docker logs squash-bot-db-init
```

Common causes:
- **db-init failed** — bad `DATABASE_URL` or postgres not ready yet
- **Invalid bot token** — check `TELEGRAM_BOT_TOKEN` in `.env`
- **Port conflict** — port 3010 already in use: `ss -tlnp | grep 3010`

### Database connection issues

```bash
# Check postgres health
docker inspect squash-bot-postgres --format='{{.State.Health.Status}}'

# Check logs
docker logs squash-bot-postgres --tail 50
```

### Container in restart loop

```bash
# Check restart count and exit code
docker inspect squash-bot-app --format='{{.RestartCount}} restarts, exit {{.State.ExitCode}}'

# Stop to investigate
docker compose stop bot
docker logs squash-bot-app --tail 200
```

### Health check failing

```bash
curl -v http://localhost:3010/health
```

Expected response: `{"status":"ok","timestamp":"..."}`.

### Disk space

```bash
df -h
docker system df
docker image prune -a --filter "until=168h"
```

## Key Files

| Location | Description |
|----------|-------------|
| `/opt/squash-bot/.env` | Production environment variables (server) |
| `/opt/squash-bot/docker-compose.yml` | Production compose config (server) |
| `Dockerfile` | Multi-stage Docker build (repo) |
| `docker-compose.yml` | Production compose config (repo) |
| `docker-compose.dev.yml` | Dev/E2E compose config (repo) |
| `.github/workflows/ci-cd.yml` | CI/CD pipeline (repo) |
| `nginx/` | Nginx config templates (repo) |
| `scripts/docker-entrypoint.sh` | Container entrypoint (repo) |
| `scripts/setup-env.sh` | Interactive env file generator (repo) |
| `scripts/renew-certs.sh` | SSL certificate renewal (repo) |
| `scripts/backup-db.sh` | Database backup with rotation (repo) |
| `scripts/restore-db.sh` | Database restore from backup (repo) |
| `/opt/backups/squash-bot/` | Backup files and log (server) |