# Docker Deployment Migration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate production deployment from systemd + scp to Docker Compose + ghcr.io

**Architecture:** CI builds Docker image and pushes to ghcr.io. Deploy job SSHs to server and runs `docker compose pull && up -d`. Nginx stays on host. See `docs/plans/2026-02-20-docker-deployment-design.md` for full design.

**Tech Stack:** Docker, Docker Compose, GitHub Actions, ghcr.io, SSH

---

### Task 1: Rewrite docker-compose.yml

**Files:**
- Modify: `docker-compose.yml`

**Step 1: Rewrite docker-compose.yml**

Replace entire file with production compose config. Remove nginx service, certbot volumes, custom network. Use `env_file: .env`, bind port to localhost only.

```yaml
# Production Docker Compose for Squash Payment Bot
# Server setup: docs/plans/2026-02-20-docker-deployment-design.md#server-setup
# Nginx runs on the host as a systemd service, not in Docker

services:
  postgres:
    image: postgres:16-alpine
    container_name: squash-bot-postgres
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
    image: ghcr.io/pmyagkov/squash-bot:latest
    container_name: squash-bot-db-init
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
    command: node dist/storage/db/migrate.js
    restart: "no"

  bot:
    image: ghcr.io/pmyagkov/squash-bot:latest
    container_name: squash-bot-app
    restart: unless-stopped
    env_file: .env
    ports:
      - "127.0.0.1:3010:3010"
    depends_on:
      db-init:
        condition: service_completed_successfully
    healthcheck:
      test: ["CMD-SHELL", "node -e \"require('http').get('http://localhost:3010/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));\""]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  postgres-data:
```

**Step 2: Verify compose file syntax**

Run: `docker compose -f docker-compose.yml config --quiet`
Expected: No output (valid syntax)

**Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: rewrite docker-compose.yml for Docker deployment

Remove nginx container (runs on host), remove custom network,
switch to env_file, bind port 3010 to localhost only."
```

---

### Task 2: Rewrite CI/CD build job

**Files:**
- Modify: `.github/workflows/ci-cd.yml` (lines 139–172, the `build` job)

**Step 1: Replace the `build` job with `build-and-push`**

Replace the entire `build` job (lines 139–172) with:

```yaml
  build-and-push:
    name: Build & Push Image
    runs-on: ubuntu-latest
    needs: test
    if: github.event_name == 'push' && (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/master')
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push Docker image
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:latest
            ghcr.io/${{ github.repository }}:sha-${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

Note: `github.repository` = `pmyagkov/squash-bot` (lowercase automatically by ghcr.io).

**Step 2: Commit**

```bash
git add .github/workflows/ci-cd.yml
git commit -m "ci: replace build job with Docker build-and-push to ghcr.io

Uses docker/build-push-action with GitHub Actions cache.
Tags: latest + sha-<commit> for rollback support."
```

---

### Task 3: Rewrite CI/CD deploy job

**Files:**
- Modify: `.github/workflows/ci-cd.yml` (lines 174–226, the `deploy` job)

**Step 1: Replace the `deploy` job**

Replace the entire `deploy` job (lines 174–226) with:

```yaml
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: build-and-push
    if: github.event_name == 'push' && (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/master')
    environment:
      name: production
      url: https://puelle.me

    steps:
      - name: Setup SSH key
        uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: ${{ secrets.SSH_PRIVATE_KEY }}

      - name: Add server to known hosts
        run: |
          mkdir -p ~/.ssh
          ssh-keyscan -H ${{ secrets.SERVER_HOST }} >> ~/.ssh/known_hosts

      - name: Deploy to server
        run: |
          ssh ${{ secrets.SSH_USER }}@${{ secrets.SERVER_HOST }} << 'ENDSSH'
            cd /opt/squash-bot
            docker compose pull
            docker compose up -d
          ENDSSH

      - name: Verify deployment
        run: |
          ssh ${{ secrets.SSH_USER }}@${{ secrets.SERVER_HOST }} << 'ENDSSH'
            echo "Waiting for bot to become healthy..."
            for i in $(seq 1 30); do
              status=$(docker inspect --format='{{.State.Health.Status}}' squash-bot-app 2>/dev/null || echo "not_found")
              if [ "$status" = "healthy" ]; then
                echo "Bot is healthy!"
                docker compose -f /opt/squash-bot/docker-compose.yml logs bot --tail 5
                exit 0
              fi
              echo "  Attempt $i/30: status=$status"
              sleep 5
            done
            echo "ERROR: Bot failed to become healthy!"
            docker compose -f /opt/squash-bot/docker-compose.yml logs bot --tail 30
            exit 1
          ENDSSH
```

Key changes from current deploy:
- No `scp` of artifacts — just `docker compose pull`
- No `checkout` step — nothing from repo needed on deploy runner
- No `download-artifact` step
- Health check via `docker inspect` instead of `systemctl`
- No rollback logic in CI (can be added later — just `docker compose pull` a specific SHA tag)

**Step 2: Commit**

```bash
git add .github/workflows/ci-cd.yml
git commit -m "ci: rewrite deploy job for Docker Compose

SSH to server, pull new image, docker compose up -d.
Verify via container health check instead of systemctl."
```

---

### Task 4: Delete deploy-to-server.sh

**Files:**
- Delete: `scripts/deploy-to-server.sh`

**Step 1: Delete the script**

```bash
rm scripts/deploy-to-server.sh
```

**Step 2: Commit**

```bash
git add scripts/deploy-to-server.sh
git commit -m "chore: remove deploy-to-server.sh

No longer needed — deployment handled by docker compose pull && up
directly from CI via SSH."
```

---

### Task 5: Verify everything locally

**Step 1: Validate compose files**

Run: `docker compose -f docker-compose.yml config --quiet`
Expected: No output (valid)

Run: `docker compose -f docker-compose.dev.yml config --quiet`
Expected: No output (still valid, unchanged)

**Step 2: Validate CI workflow syntax**

Run: `npx yaml-lint .github/workflows/ci-cd.yml || echo "Install: npx yaml-lint"`
Expected: Valid YAML

**Step 3: Run existing tests to confirm nothing broken**

Run: `npm run typecheck && npm run lint && npm test`
Expected: All pass (no source code changed)

**Step 4: Commit (if any fixes needed)**

Only if previous steps revealed issues.