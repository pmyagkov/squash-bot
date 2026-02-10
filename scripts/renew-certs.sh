#!/bin/bash

# SSL certificate renewal script for Let's Encrypt
# Run via cron: 0 0,12 * * * root /opt/squash-bot/scripts/renew-certs.sh

set -e

# Configuration
LOG_FILE="/var/log/certbot-renew.log"
DEPLOYMENT_DIR="/opt/squash-bot"
CERTBOT_CERTS_VOLUME="$DEPLOYMENT_DIR/certbot-certs"
CERTBOT_WEBROOT_VOLUME="$DEPLOYMENT_DIR/certbot-webroot"
NGINX_CONTAINER="squash-bot-nginx"

# Log function
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting certificate renewal process..."

# Check if volumes exist
if [ ! -d "$CERTBOT_CERTS_VOLUME" ]; then
  log "ERROR: Certbot certs volume not found: $CERTBOT_CERTS_VOLUME"
  exit 1
fi

if [ ! -d "$CERTBOT_WEBROOT_VOLUME" ]; then
  log "ERROR: Certbot webroot volume not found: $CERTBOT_WEBROOT_VOLUME"
  exit 1
fi

# Run certbot renew
log "Running certbot renew..."
if docker run --rm \
  -v "$CERTBOT_CERTS_VOLUME:/etc/letsencrypt" \
  -v "$CERTBOT_WEBROOT_VOLUME:/var/www/certbot" \
  certbot/certbot renew >> "$LOG_FILE" 2>&1; then
  log "Certbot renew completed successfully"
  RENEWAL_SUCCESS=true
else
  log "ERROR: Certbot renew failed"
  RENEWAL_SUCCESS=false
fi

# Reload nginx if renewal was successful
if [ "$RENEWAL_SUCCESS" = true ]; then
  log "Checking if nginx container is running..."

  if docker ps --format '{{.Names}}' | grep -q "^$NGINX_CONTAINER$"; then
    log "Reloading nginx configuration..."

    if docker exec "$NGINX_CONTAINER" nginx -s reload >> "$LOG_FILE" 2>&1; then
      log "Nginx reloaded successfully"
    else
      log "WARNING: Failed to reload nginx, but certificates were renewed"
    fi
  else
    log "WARNING: Nginx container not found or not running, skipping reload"
  fi
fi

# Check certificate expiry dates
log "Checking certificate expiry dates..."
docker run --rm \
  -v "$CERTBOT_CERTS_VOLUME:/etc/letsencrypt" \
  certbot/certbot certificates >> "$LOG_FILE" 2>&1

log "Certificate renewal process completed"
log "----------------------------------------"
