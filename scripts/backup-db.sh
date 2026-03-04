#!/bin/bash

# Database backup script for Squash Payment Bot
# Creates a pg_dump backup and removes backups older than 7 days
#
# Usage: ./scripts/backup-db.sh [backup_dir]
#   backup_dir: directory to store backups (default: /opt/backups/squash-bot)
#
# Cron example (daily at 3:00 AM):
#   0 3 * * * /opt/squash-bot/scripts/backup-db.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${1:-/opt/backups/squash-bot}"
LOG_FILE="$BACKUP_DIR/backup.log"
RETENTION_DAYS=7

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Load database credentials from .env
if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo "Error: .env file not found at $PROJECT_DIR/.env" >&2
  exit 1
fi

source "$PROJECT_DIR/.env"

if [ -z "${POSTGRES_USER:-}" ] || [ -z "${POSTGRES_DB:-}" ]; then
  echo "Error: POSTGRES_USER or POSTGRES_DB not set in .env" >&2
  exit 1
fi

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_${TIMESTAMP}.dump"

log "Starting backup of $POSTGRES_DB..."

if docker exec squash-bot-postgres pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --format=custom \
  > "$BACKUP_FILE" 2>> "$LOG_FILE"; then

  BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  log "Backup created: $BACKUP_FILE ($BACKUP_SIZE)"
else
  log "ERROR: backup failed"
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Remove old backups
DELETED=$(find "$BACKUP_DIR" -name "backup_*.dump" -mtime +$RETENTION_DAYS -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  log "Removed $DELETED backup(s) older than $RETENTION_DAYS days"
fi

log "Backup complete"
