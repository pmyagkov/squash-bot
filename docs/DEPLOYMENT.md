# Deployment Guide

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

## Overview

### Architecture

The deployment uses a multi-container Docker Compose setup:

- **Bot Application** - Node.js app running the Telegram bot and API server
- **PostgreSQL 16** - Database for storing scaffolds, events, participants, and payments
- **Nginx** - Reverse proxy with SSL termination (Let's Encrypt)

### Deployment Flow

1. Developer pushes to `main` or `master` branch
2. GitHub Actions runs tests (typecheck, lint, unit tests)
3. Docker image is built and pushed to GitHub Container Registry (ghcr.io)
4. Image is pulled to production server and deployed via Docker Compose
5. Health check verifies deployment success

### Key Features

- **Zero-downtime deployments** - Rolling updates with health checks
- **Automatic SSL renewal** - Let's Encrypt certificates with cron job
- **Database migrations** - Automatic on container startup
- **Rollback support** - Quick rollback to previous version
- **Health monitoring** - Built-in health check endpoint

## Prerequisites

### Required Resources

1. **Server** - Ubuntu 22.04+ (recommended: Digital Ocean droplet, 2GB RAM minimum)
2. **Domain name** - Must point to server IP address
3. **GitHub account** - With repository access and container registry permissions
4. **Telegram bot** - Created via @BotFather with bot token

### Required Tools

On your local machine:
- `git` - For repository access
- `ssh` - For server access
- `gh` CLI (optional) - For GitHub operations

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

Expected output:
```
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
80/tcp                     ALLOW       Anywhere
443/tcp                     ALLOW       Anywhere
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

**How to get values:**

- **POSTGRES_PASSWORD**: Generate with `openssl rand -base64 32`
- **API_KEY**: Generate with `openssl rand -hex 32`
- **TELEGRAM_BOT_TOKEN**: Get from @BotFather on Telegram
- **TELEGRAM_MAIN_CHAT_ID**: Add bot to group, send message, use bot API or `/getchatid` command
- **TELEGRAM_LOG_CHAT_ID**: Chat for error logs (can be same as main chat)
- **ADMIN_TELEGRAM_ID**: Your Telegram user ID (message @userinfobot)

Save and secure the file:

```bash
# Set restrictive permissions
chmod 600 .env.prod

# Verify
ls -la .env.prod
```

Expected output: `-rw------- 1 deploy deploy`

## SSL Certificate Setup

### 1. Update Nginx Configuration with Your Domain

Before obtaining SSL certificate, update the Nginx configuration:

```bash
cd /opt/squash-bot/nginx/conf.d
nano squash-bot.conf
```

Replace `DOMAIN` with your actual domain name in the SSL certificate paths:

```nginx
# Change this:
ssl_certificate /etc/letsencrypt/live/DOMAIN/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/DOMAIN/privkey.pem;
ssl_trusted_certificate /etc/letsencrypt/live/DOMAIN/chain.pem;

# To (example with yourdomain.com):
ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
ssl_trusted_certificate /etc/letsencrypt/live/yourdomain.com/chain.pem;
```

### 2. Verify DNS Configuration

Before obtaining SSL certificate, verify your domain points to the server:

```bash
# Check DNS resolution
nslookup yourdomain.com

# Or using dig
dig +short yourdomain.com
```

Expected output should show your server's IP address.

### 3. Start Nginx (HTTP Only)

Initially start Nginx to handle Let's Encrypt challenge:

```bash
cd /opt/squash-bot

# Temporarily start nginx (will fail on HTTPS but that's ok)
docker compose up -d nginx

# Check logs (you'll see SSL errors - this is expected)
docker compose logs nginx
```

### 4. Obtain SSL Certificate

```bash
# Run certbot to obtain certificate
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

**Important**: Replace `your-email@example.com` and `yourdomain.com` with your actual values.

Expected output:
```
Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/yourdomain.com/fullchain.pem
Key is saved at:         /etc/letsencrypt/live/yourdomain.com/privkey.pem
```

### 5. Restart Nginx with SSL

```bash
cd /opt/squash-bot

# Restart nginx to load SSL certificates
docker compose restart nginx

# Verify nginx is running
docker compose ps nginx
```

Expected output: nginx should be in "Up" state

### 6. Test SSL Configuration

```bash
# Test from server
curl -I https://yourdomain.com/health

# Or from your local machine
curl -I https://yourdomain.com/health
```

Expected output: `HTTP/2 200` (or `HTTP/1.1 503` if bot isn't running yet - that's ok)

### 7. Setup Automatic Certificate Renewal

Create cron job for certificate renewal:

```bash
# Make renewal script executable
chmod +x /opt/squash-bot/scripts/renew-certs.sh

# Create cron job (runs twice daily at midnight and noon)
sudo tee /etc/cron.d/certbot-renew << 'EOF'
# Renew SSL certificates twice daily
# Certbot will only renew if certificate is within 30 days of expiry
0 0,12 * * * root /opt/squash-bot/scripts/renew-certs.sh
EOF

# Restart cron service
sudo systemctl restart cron

# Verify cron job
sudo crontab -l
```

Test the renewal script manually:

```bash
sudo /opt/squash-bot/scripts/renew-certs.sh
cat /var/log/certbot-renew.log
```

## GitHub Configuration

### 1. Add GitHub Secrets

Go to your repository on GitHub:
1. Navigate to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**

Add the following secrets:

#### For E2E Tests (optional but recommended)

| Secret Name | Description | Example Value |
|-------------|-------------|---------------|
| `TELEGRAM_BOT_TOKEN_TEST` | Test bot token from @BotFather | `123456:ABC-DEF...` |
| `TELEGRAM_TEST_CHAT_ID` | Test chat ID | `-1001234567890` |
| `ADMIN_TELEGRAM_ID` | Your Telegram user ID | `123456789` |

#### For Deployment (required)

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `DROPLET_IP` | Server IP address | Digital Ocean dashboard |
| `DROPLET_USER` | SSH user (e.g., `deploy`) | The user you created |
| `DROPLET_SSH_KEY` | Private SSH key | Content of `~/.ssh/squash-bot-deploy` |

**To add SSH key**:

```bash
# On your local machine, copy private key content
cat ~/.ssh/squash-bot-deploy

# Copy the entire output (including BEGIN and END lines)
# Paste into DROPLET_SSH_KEY secret in GitHub
```

### 2. Update GitHub Actions Workflow

If needed, update `.github/workflows/ci-cd.yml` to use your username:

```bash
# On server, check your GitHub username will work
cd /opt/squash-bot
nano docker-compose.yml
```

Verify the image line matches your GitHub username:
```yaml
image: ghcr.io/YOUR_GITHUB_USERNAME/squash-bot:latest
```

### 3. Enable GitHub Container Registry

Ensure GitHub Container Registry is enabled:
1. Go to your repository **Settings** → **Packages**
2. Ensure packages are allowed to be published

## First Deployment

### Option 1: Automatic Deployment via GitHub Actions (Recommended)

```bash
# On your local machine, in the repository
git push origin main
```

This triggers the CI/CD pipeline:
1. ✅ Tests run (typecheck, lint, unit tests)
2. ✅ Docker image built
3. ✅ Image pushed to ghcr.io
4. ✅ Configuration files synced to server
5. ✅ Application deployed
6. ✅ Health check verified

Monitor the deployment:
- Go to **Actions** tab in GitHub
- Click on the latest workflow run
- Watch the progress

### Option 2: Manual Deployment

If you need to deploy manually:

```bash
# On the server
cd /opt/squash-bot

# Login to GitHub Container Registry
echo "YOUR_GITHUB_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# Pull latest image
docker compose pull bot

# Start all services
docker compose up -d

# Check status
docker compose ps
```

### Verify Deployment

1. **Check container status:**

```bash
docker compose ps
```

Expected output: All containers should be "Up" with healthy status

2. **Check logs:**

```bash
# All services
docker compose logs

# Bot only
docker compose logs bot

# Last 50 lines
docker compose logs --tail=50 bot
```

3. **Test health endpoint:**

```bash
curl https://yourdomain.com/health
```

Expected output: `{"status":"ok"}`

4. **Test Telegram bot:**

Open Telegram and send a message in the configured chat to verify bot responds.

## Monitoring and Maintenance

### Viewing Logs

```bash
# All services, follow mode
docker compose logs -f

# Bot only, last 100 lines
docker compose logs --tail=100 bot

# Postgres logs
docker compose logs postgres

# Nginx logs
docker compose logs nginx

# Specific time range
docker compose logs --since 2024-01-01T00:00:00 --until 2024-01-01T23:59:59 bot
```

### Container Status

```bash
# Check all containers
docker compose ps

# Detailed status with health
docker compose ps --format json | jq

# Resource usage
docker stats
```

### Health Checks

```bash
# Application health
curl https://yourdomain.com/health

# Database health
docker exec squash-bot-postgres pg_isready -U postgres

# Nginx health
docker exec squash-bot-nginx nginx -t

# Container health status
docker inspect squash-bot-app --format='{{.State.Health.Status}}'
```

### Database Access

```bash
# Connect to PostgreSQL
docker exec -it squash-bot-postgres psql -U postgres -d squash_bot

# Common queries
\dt                          # List tables
\d+ events                   # Describe events table
SELECT COUNT(*) FROM events; # Count events
\q                           # Quit
```

### Disk Usage

```bash
# Docker disk usage
docker system df

# Volume sizes
docker volume ls
docker volume inspect squash-bot_postgres-data

# Clean up old images (keeps last 72 hours)
docker image prune -af --filter "until=72h"
```

### Log Rotation

Docker handles log rotation automatically, but you can configure limits:

```bash
# Edit docker daemon config
sudo nano /etc/docker/daemon.json
```

Add:
```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

Restart Docker:
```bash
sudo systemctl restart docker
```

## Troubleshooting

### Container Won't Start

**Symptoms**: Container status shows "Restarting" or "Exited"

**Diagnosis**:
```bash
# Check logs
docker compose logs bot

# Check container status
docker compose ps

# Inspect container
docker inspect squash-bot-app
```

**Common causes and solutions**:

1. **Database connection failed**
   - Check `.env.prod` has correct `DATABASE_URL`
   - Verify postgres container is healthy: `docker compose ps postgres`
   - Check postgres logs: `docker compose logs postgres`

2. **Missing environment variables**
   - Verify `.env.prod` exists and has all required variables
   - Check file permissions: `ls -la .env.prod`

3. **Port already in use**
   - Check if port 3010 is available: `netstat -tlnp | grep 3010`
   - Kill conflicting process or change PORT in `.env.prod`

### Database Connection Issues

**Symptoms**: Bot logs show "Connection refused" or "Connection timed out"

**Diagnosis**:
```bash
# Check postgres is running
docker compose ps postgres

# Check postgres logs
docker compose logs postgres

# Test connection
docker exec squash-bot-postgres pg_isready -U postgres

# Test from bot container
docker exec squash-bot-app ping postgres
```

**Solutions**:

1. **Postgres not ready**: Wait for health check to pass
   ```bash
   docker compose ps postgres
   # Wait until status shows "healthy"
   ```

2. **Wrong credentials**: Verify `.env.prod`
   ```bash
   grep POSTGRES .env.prod
   ```

3. **Database doesn't exist**: Create it manually
   ```bash
   docker exec -it squash-bot-postgres createdb -U postgres squash_bot
   ```

### SSL Certificate Problems

**Symptoms**: Browser shows "Not Secure" or certbot errors

**Diagnosis**:
```bash
# Check certificate validity
docker run --rm -v /opt/squash-bot/certbot-certs:/etc/letsencrypt certbot/certbot certificates

# Check nginx SSL config
docker exec squash-bot-nginx nginx -t

# Check certificate files exist
ls -la /opt/squash-bot/certbot-certs/live/yourdomain.com/
```

**Solutions**:

1. **Certificate expired**: Force renewal
   ```bash
   docker run --rm \
     -v /opt/squash-bot/certbot-certs:/etc/letsencrypt \
     -v /opt/squash-bot/certbot-webroot:/var/www/certbot \
     certbot/certbot renew --force-renewal

   docker compose restart nginx
   ```

2. **Wrong domain in config**: Update nginx config
   ```bash
   nano /opt/squash-bot/nginx/conf.d/squash-bot.conf
   # Fix domain name in ssl_certificate paths
   docker compose restart nginx
   ```

3. **Certificate files missing**: Re-obtain certificate
   ```bash
   # Follow steps in SSL Certificate Setup section
   ```

### Application Errors

**Symptoms**: 500 errors, bot not responding, or crashes

**Diagnosis**:
```bash
# Check recent logs
docker compose logs --tail=200 bot

# Check health endpoint
curl https://yourdomain.com/health

# Check container restart count
docker ps -a | grep squash-bot-app
```

**Solutions**:

1. **Check Telegram bot token**: Verify token is valid
   ```bash
   # Test token with Telegram API
   curl https://api.telegram.org/bot<YOUR_TOKEN>/getMe
   ```

2. **Check API key**: Verify n8n webhooks use correct API key

3. **Database migration failed**: Run migrations manually
   ```bash
   docker exec squash-bot-app npm run db:migrate
   ```

4. **Application bug**: Check logs for stack traces
   ```bash
   docker compose logs bot | grep -i error
   ```

### Network Issues

**Symptoms**: Cannot reach application from outside, timeouts

**Diagnosis**:
```bash
# Check firewall
sudo ufw status

# Check nginx is listening
sudo netstat -tlnp | grep :80
sudo netstat -tlnp | grep :443

# Check docker network
docker network inspect squash-bot_squash-bot-network

# Test from inside server
curl http://localhost:80
curl https://localhost:443 -k
```

**Solutions**:

1. **Firewall blocking**: Open ports
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```

2. **Nginx not running**: Restart nginx
   ```bash
   docker compose restart nginx
   ```

3. **DNS not pointing to server**: Check DNS
   ```bash
   nslookup yourdomain.com
   ```

### Deployment Failed in CI/CD

**Symptoms**: GitHub Actions workflow fails

**Diagnosis**: Check GitHub Actions logs in the Actions tab

**Common issues**:

1. **SSH connection failed**: Verify secrets
   - Check `DROPLET_IP` is correct
   - Check `DROPLET_SSH_KEY` contains full private key
   - Verify SSH key is added to server: `ssh deploy@IP`

2. **Docker image pull failed**: Verify permissions
   - Check image name in `docker-compose.yml` matches your username
   - Verify package is public or credentials are configured

3. **Tests failed**: Fix failing tests before deployment
   - Run locally: `npm run typecheck && npm run lint && npm test`

## Rollback Procedures

### Option 1: Revert Git Commit (Recommended)

If the issue is in the code:

```bash
# On your local machine
git log --oneline -5           # Find commit to revert to
git revert HEAD                # Revert last commit
git push origin main           # Trigger new deployment
```

GitHub Actions will automatically deploy the previous version.

### Option 2: Manual Rollback to Previous Image

If you need to rollback immediately:

```bash
# On the server
cd /opt/squash-bot

# List available images
docker images | grep squash-bot

# Find previous image tag (e.g., main-abc1234)
# Edit docker-compose.yml to use previous tag
nano docker-compose.yml
```

Change:
```yaml
# From:
image: ghcr.io/username/squash-bot:main-xyz7890

# To:
image: ghcr.io/username/squash-bot:main-abc1234
```

Deploy:
```bash
docker compose pull bot
docker compose up -d --no-deps bot

# Verify
docker compose ps
docker compose logs --tail=50 bot
curl https://yourdomain.com/health
```

### Option 3: Database Rollback

If database migration failed:

```bash
# Restore from backup (see Backup section)
cat backup-YYYYMMDD.sql | docker exec -i squash-bot-postgres psql -U postgres squash_bot

# Restart application
docker compose restart bot
```

## Backup and Restore

### Database Backup

#### Manual Backup

```bash
# Create backup directory
mkdir -p /opt/squash-bot/backups

# Backup database
docker exec squash-bot-postgres pg_dump -U postgres squash_bot > /opt/squash-bot/backups/backup-$(date +%Y%m%d-%H%M%S).sql

# Compress backup
gzip /opt/squash-bot/backups/backup-*.sql

# List backups
ls -lh /opt/squash-bot/backups/
```

#### Automated Backup (Cron)

```bash
# Create backup script
cat > /opt/squash-bot/scripts/backup-db.sh << 'EOF'
#!/bin/bash
set -e

BACKUP_DIR="/opt/squash-bot/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup-$TIMESTAMP.sql"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
docker exec squash-bot-postgres pg_dump -U postgres squash_bot > $BACKUP_FILE

# Compress
gzip $BACKUP_FILE

# Keep only last 30 backups
cd $BACKUP_DIR
ls -t backup-*.sql.gz | tail -n +31 | xargs -r rm

echo "Backup completed: $BACKUP_FILE.gz"
EOF

# Make executable
chmod +x /opt/squash-bot/scripts/backup-db.sh

# Test
/opt/squash-bot/scripts/backup-db.sh

# Schedule daily backups at 2 AM
sudo tee /etc/cron.d/squash-bot-backup << 'EOF'
0 2 * * * root /opt/squash-bot/scripts/backup-db.sh >> /var/log/squash-bot-backup.log 2>&1
EOF

sudo systemctl restart cron
```

### Database Restore

```bash
# List available backups
ls -lh /opt/squash-bot/backups/

# Restore from backup
gunzip < /opt/squash-bot/backups/backup-20240101-020000.sql.gz | \
  docker exec -i squash-bot-postgres psql -U postgres squash_bot

# Or restore from uncompressed file
cat /opt/squash-bot/backups/backup-20240101-020000.sql | \
  docker exec -i squash-bot-postgres psql -U postgres squash_bot

# Restart application
docker compose restart bot
```

### Volume Backup

Backup Docker volumes for complete system restore:

```bash
# Stop containers (optional, for consistent backup)
docker compose down

# Backup postgres data volume
docker run --rm \
  -v squash-bot_postgres-data:/data \
  -v /opt/squash-bot/backups:/backup \
  alpine tar czf /backup/postgres-volume-$(date +%Y%m%d).tar.gz -C / data

# Backup certificates
docker run --rm \
  -v squash-bot_certbot-certs:/data \
  -v /opt/squash-bot/backups:/backup \
  alpine tar czf /backup/certbot-certs-$(date +%Y%m%d).tar.gz -C / data

# Restart containers
docker compose up -d
```

### Volume Restore

```bash
# Stop containers
docker compose down

# Remove old volume
docker volume rm squash-bot_postgres-data

# Restore volume from backup
docker volume create squash-bot_postgres-data
docker run --rm \
  -v squash-bot_postgres-data:/data \
  -v /opt/squash-bot/backups:/backup \
  alpine tar xzf /backup/postgres-volume-20240101.tar.gz -C /

# Start containers
docker compose up -d
```

### Offsite Backup

For disaster recovery, copy backups to remote location:

```bash
# Using rsync to backup to remote server
rsync -avz --delete \
  /opt/squash-bot/backups/ \
  user@backup-server:/backups/squash-bot/

# Or using rclone to cloud storage (e.g., S3, Google Drive)
rclone sync /opt/squash-bot/backups/ remote:squash-bot-backups
```

---

## Quick Reference

### Common Commands

```bash
# View logs
docker compose logs -f bot

# Restart application
docker compose restart bot

# Stop all services
docker compose down

# Start all services
docker compose up -d

# Update to latest image
docker compose pull bot && docker compose up -d bot

# Check status
docker compose ps

# Health check
curl https://yourdomain.com/health

# Database backup
docker exec squash-bot-postgres pg_dump -U postgres squash_bot > backup.sql

# Database restore
cat backup.sql | docker exec -i squash-bot-postgres psql -U postgres squash_bot
```

### Important Files

| File | Purpose |
|------|---------|
| `/opt/squash-bot/.env.prod` | Production environment variables |
| `/opt/squash-bot/docker-compose.yml` | Container orchestration |
| `/opt/squash-bot/nginx/conf.d/squash-bot.conf` | Nginx site configuration |
| `/opt/squash-bot/scripts/renew-certs.sh` | SSL renewal script |
| `/var/log/certbot-renew.log` | Certificate renewal logs |

### Support

For issues or questions:
1. Check logs: `docker compose logs bot`
2. Review this documentation
3. Check GitHub Issues
4. Refer to design document: `docs/plans/2025-02-09-deployment-implementation.md`

---

**Last updated**: 2025-02-09
