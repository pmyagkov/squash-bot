#!/bin/bash

# Database restore script for Squash Payment Bot
# Restores a pg_dump backup into the running PostgreSQL container
#
# Usage: ./scripts/restore-db.sh <backup_file>
#   backup_file: path to .dump file created by backup-db.sh

set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: $0 <backup_file>" >&2
  echo "Example: $0 /opt/backups/squash-bot/backup_20260304_030000.dump" >&2
  exit 1
fi

BACKUP_FILE="$1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

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

echo "WARNING: This will overwrite the current database '$POSTGRES_DB'."
read -p "Continue? [y/N] " -r
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

echo "Stopping bot container..."
docker stop squash-bot-app 2>/dev/null || true

echo "Restoring from $BACKUP_FILE..."
docker exec -i squash-bot-postgres pg_restore \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --clean \
  --if-exists \
  < "$BACKUP_FILE"

echo "Starting bot container..."
docker start squash-bot-app

echo "Restore complete"
