#!/usr/bin/env bash

set -e

# Configuration
APP_DIR="${APP_DIR:-/opt/squash-bot}"
BACKUP_DIR="${BACKUP_DIR:-/opt/squash-bot-backups}"
DEPLOYMENT_ARCHIVE="${DEPLOYMENT_ARCHIVE:-/tmp/deployment.tar.gz}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "Starting deployment to $APP_DIR..."

# Create backup of current deployment
if [ -d "$APP_DIR/dist" ]; then
  echo "Creating backup of current deployment..."
  mkdir -p "$BACKUP_DIR"
  tar -czf "$BACKUP_DIR/backup_$TIMESTAMP.tar.gz" -C "$APP_DIR" dist package.json package-lock.json || true

  # Keep only last 5 backups
  cd "$BACKUP_DIR"
  ls -t backup_*.tar.gz | tail -n +6 | xargs -r rm
fi

# Extract new deployment
echo "Extracting new deployment..."
mkdir -p "$APP_DIR"
cd "$APP_DIR"
tar -xzf "$DEPLOYMENT_ARCHIVE"
rm "$DEPLOYMENT_ARCHIVE"

# Install production dependencies
echo "Installing production dependencies..."
npm ci --omit=dev

# Run database migrations
echo "Running database migrations..."
npx drizzle-kit migrate

# Restart the application
echo "Restarting application..."
sudo systemctl restart squash-bot

# Verify service is running
sleep 5
if sudo systemctl is-active --quiet squash-bot; then
  echo "Deployment successful! Service is running."
else
  echo "ERROR: Service failed to start!"
  echo "Rolling back to previous version..."

  # Rollback
  if [ -f "$BACKUP_DIR/backup_$TIMESTAMP.tar.gz" ]; then
    cd "$APP_DIR"
    tar -xzf "$BACKUP_DIR/backup_$TIMESTAMP.tar.gz"
    npm ci --omit=dev
    sudo systemctl restart squash-bot
    echo "Rolled back to previous version"
  fi

  exit 1
fi
