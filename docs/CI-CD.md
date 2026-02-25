# CI/CD & Deployment

Complete guide for deploying the Squash Payment Bot to production using Docker, Nginx, SSL, and GitHub Actions.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Initial Server Setup](#initial-server-setup)
- [SSL Certificate Setup](#ssl-certificate-setup)
- [GitHub Configuration](#github-configuration)
- [First Deployment](#first-deployment)
- [Monitoring and Maintenance](#monitoring-and-maintenance)
- [Troubleshooting](#troubleshooting)
- [Rollback Procedures](#rollback-procedures)
- [Backup and Restore](#backup-and-restore)

## Pipeline Overview

```
GitHub (push to master)
  │
  ├── test job       typecheck, lint, unit/integration tests
  │                  (PostgreSQL service container)
  │
  ├── e2e job        Playwright container + PostgreSQL service
  │                  bot runs directly via tsx (no docker-compose)
  │                  continue-on-error: true
  │
  └── build-and-push job
        │  docker build → ghcr.io/pmyagkov/squash-bot:latest
        │                 ghcr.io/pmyagkov/squash-bot:sha-<commit>
        └── deploy job
              SSH → server: docker compose pull && up -d
```

## CI Jobs

Defined in `.github/workflows/ci-cd.yml`. Triggers on push/PR to `master`.

### 1. test

Runs on `ubuntu-latest` with PostgreSQL as a GHA service container.

- `npm ci` (cached via `actions/setup-node`)
- `npm run typecheck`
- `npm run lint`
- `npm test` (Vitest — unit + integration)

### 2. e2e

Runs inside `mcr.microsoft.com/playwright:v1.57.0-noble` container — Chromium and system dependencies are pre-installed, no browser download needed.

PostgreSQL runs as a GHA service (accessible as `postgres:5432` from the container).

Steps:
1. `npm ci` — install project dependencies
2. Restore Telegram auth state from `TELEGRAM_AUTH_STATE` secret
3. Copy `.env.ci` to `.env.test` — CI-specific bot token and chat IDs
4. Run migrations and seed directly: `npx tsx src/storage/db/migrate.ts && npx tsx src/storage/db/seed.ts`
5. Start bot as background process: `npx tsx src/index.ts &`
6. Wait for `/health` endpoint (up to 2 min)
7. Run Playwright tests

The bot loads `.env.test` (copied from `.env.ci` with CI bot credentials). `DATABASE_URL` is overridden via step env to point at the GHA postgres service.

**Version sync**: the Playwright container image version (`v1.57.0`) must match `@playwright/test` in `package.json`. Update both together.

### 3. build-and-push

Only on push to `master` (not PRs). Builds production Docker image and pushes to ghcr.io with two tags:
- `latest` — always the newest build
- `sha-<full-commit-hash>` — for rollback

Uses GitHub Actions Docker layer cache (`cache-from/to: type=gha`).

### 4. deploy

SSHs to server, pulls new image, runs `docker compose up -d`, verifies health via `docker inspect`.

Uses `environment: production` — create it in repo Settings > Environments if needed.

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `SSH_PRIVATE_KEY` | Private SSH key for server access |
| `SERVER_HOST` | Server hostname or IP |
| `SSH_USER` | SSH username on server |
| `CODECOV_TOKEN` | Codecov upload token (optional) |
| `TELEGRAM_AUTH_STATE` | Telegram auth state JSON for E2E tests |

`GITHUB_TOKEN` is auto-provided and used to authenticate with ghcr.io.

## Local Development (Docker)

`docker-compose.dev.yml` — PostgreSQL + db-init + bot for local development and E2E tests.

### Images

Bot and db-init services use `Dockerfile.dev` — a pre-built image with production dependencies:

```dockerfile
FROM node:22-alpine
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
```

Source code is mounted as a volume at runtime. An anonymous volume (`/app/node_modules`) prevents the host mount from overriding pre-installed dependencies.

`tsx` is in `dependencies` (not devDependencies) so it's available with `--omit=dev`.

### Commands

```bash
# Start services
docker compose -f docker-compose.dev.yml up -d

# Rebuild after package.json changes
docker compose -f docker-compose.dev.yml build

# Run E2E tests (starts services automatically)
npm run test:e2e

# Stop
docker compose -f docker-compose.dev.yml down
```

### Services

| Service | Image | Purpose |
|---------|-------|---------|
| `postgres` | `postgres:16-alpine` | Test database on port 5433 |
| `db-init` | `Dockerfile.dev` | Runs migrations + seed, then exits |
| `bot` | `Dockerfile.dev` | App with `tsx watch` (hot reload) |

## Production Architecture

- **Bot Application** - Node.js app running the Telegram bot and API server
- **PostgreSQL 16** - Database for storing scaffolds, events, participants, and payments
- **Nginx** - Reverse proxy with SSL termination (Let's Encrypt)
- **nginx** — host systemd service, terminates SSL, proxies to `127.0.0.1:3010`
- **postgres** — PostgreSQL 16 Alpine, data in a named Docker volume
- **db-init** — runs `node dist/storage/db/migrate.js` on startup, then exits
- **bot** — starts after db-init completes successfully
- Port 3010 bound to `127.0.0.1` only — not exposed externally
- Docker image stored in GitHub Container Registry (ghcr.io)

On the server:
- `docker` - Container runtime
- `docker compose` - Multi-container orchestration

## Initial Server Setup

### 1. Provision Server

Create a new Ubuntu 22.04 droplet on Digital Ocean (or your preferred provider):

- **Size**: Basic - $12/month (2GB RAM, 1 CPU)
- **Region**: Choose closest to your users
- **SSH keys**: Add your public SSH key during creation

### 2. Connect to Server

```bash
ssh root@YOUR_SERVER_IP
```

### 3. Install Docker and Docker Compose

```bash
# Update package index
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose plugin
apt install docker-compose-plugin -y

# Verify installation
docker --version
docker compose version

# Enable Docker to start on boot
systemctl enable docker
```

Expected output:
```
Docker version 24.0.x
Docker Compose version v2.x.x
```

### 4. Create Application Directory

```bash
# Create directory structure
mkdir -p /opt/squash-bot/{nginx/conf.d,scripts}
cd /opt/squash-bot

# Verify structure
tree /opt/squash-bot
```

Expected output:
```
/opt/squash-bot/
├── nginx/
│   └── conf.d/
└── scripts/
```

### 5. Create Non-Root User (Recommended)

```bash
# Create deploy user
useradd -m -s /bin/bash deploy

# Add to docker group
usermod -aG docker deploy

# Set ownership
chown -R deploy:deploy /opt/squash-bot

# Test docker access
su - deploy
docker ps
exit
```

### 6. Configure Firewall

```bash
# Allow SSH
ufw allow 22/tcp

# Allow HTTP and HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Enable firewall
ufw --force enable

# Verify rules
ufw status
```

### 7. Setup SSH Key for GitHub Actions

On your **local machine**:

```bash
# Generate deployment key
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/squash-bot-deploy

# Copy public key to server
ssh-copy-id -i ~/.ssh/squash-bot-deploy.pub deploy@YOUR_SERVER_IP

# Test connection
ssh -i ~/.ssh/squash-bot-deploy deploy@YOUR_SERVER_IP
```

**Important**: Save the private key (`~/.ssh/squash-bot-deploy`) - you'll add it to GitHub Secrets later.

### 8. Create Production Environment File

On the **server**, create `.env.prod`:

```bash
cd /opt/squash-bot
nano .env.prod
```

Add the following configuration (replace with your actual values):

```bash
# Environment
ENVIRONMENT=production
NODE_ENV=production

# Database
POSTGRES_DB=squash_bot
POSTGRES_USER=postgres
POSTGRES_PASSWORD=CHANGE_THIS_TO_SECURE_PASSWORD

# Telegram
TELEGRAM_BOT_TOKEN=your-bot-token-from-botfather
TELEGRAM_MAIN_CHAT_ID=-1001234567890
TELEGRAM_LOG_CHAT_ID=-1001234567890
ADMIN_TELEGRAM_ID=123456789

# API
API_KEY=CHANGE_THIS_TO_SECURE_API_KEY
PORT=3010

# Application
TIMEZONE=Europe/Belgrade
```

Save and secure the file:

```bash
# Set restrictive permissions
chmod 600 .env.prod

# Verify
ls -la .env.prod
```

## SSL Certificate Setup

### 1. Update Nginx Configuration with Your Domain

Before obtaining SSL certificate, update the Nginx configuration:

```bash
cd /opt/squash-bot/nginx/conf.d
nano squash-bot.conf
```

Replace `DOMAIN` with your actual domain name in the SSL certificate paths.

### 2. Obtain SSL Certificate

```bash
docker run --rm \
  -v /opt/squash-bot/certbot-certs:/etc/letsencrypt \
  -v /opt/squash-bot/certbot-webroot:/var/www/certbot \
  certbot/certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email \
  -d yourdomain.com
```

### 3. Setup Automatic Certificate Renewal

```bash
chmod +x /opt/squash-bot/scripts/renew-certs.sh

sudo tee /etc/cron.d/certbot-renew << 'EOF'
0 0,12 * * * root /opt/squash-bot/scripts/renew-certs.sh
EOF

sudo systemctl restart cron
```

## GitHub Configuration

### Add GitHub Secrets

Go to repository **Settings** → **Secrets and variables** → **Actions** and add the required secrets listed above.

## First Deployment

### Automatic Deployment via GitHub Actions (Recommended)

```bash
git push origin master
```

This triggers the CI/CD pipeline: tests → build → push → deploy → health check.

### Manual Deployment

```bash
# On the server
cd /opt/squash-bot
docker compose pull bot
docker compose up -d
docker compose ps
```

## Rollback Procedures

### Option 1: Revert Git Commit (Recommended)

```bash
git log --oneline -5
git revert HEAD
git push origin master
```

### Option 2: Manual Rollback to Previous Image

```bash
# On the server
cd /opt/squash-bot
docker images | grep squash-bot
# Edit docker-compose.yml to use previous sha-<commit> tag
docker compose pull bot
docker compose up -d --no-deps bot
```

## Backup and Restore

### Database Backup

```bash
docker exec squash-bot-postgres pg_dump -U postgres squash_bot > backup.sql
```

### Database Restore

```bash
cat backup.sql | docker exec -i squash-bot-postgres psql -U postgres squash_bot
docker compose restart bot
```

## Quick Reference

| Location | Description |
|----------|-------------|
| `.github/workflows/ci-cd.yml` | CI/CD pipeline |
| `Dockerfile` | Production multi-stage build |
| `Dockerfile.dev` | Dev image with pre-installed production deps |
| `docker-compose.yml` | Production compose config |
| `docker-compose.dev.yml` | Dev/E2E compose config |
| `scripts/docker-entrypoint.sh` | Production container entrypoint |
| `scripts/setup-env.sh` | Interactive env file generator |
| `scripts/renew-certs.sh` | SSL certificate renewal |
| `nginx/` | Nginx config templates |
| `/opt/squash-bot/.env` | Production env variables (server only) |
| `/opt/squash-bot/docker-compose.yml` | Production compose config (server only) |
