#!/bin/sh

# Docker entrypoint script for Squash Payment Bot
# Runs database migrations and starts the application

set -e

echo "[Entrypoint] Starting Squash Payment Bot..."

# Check if required environment variables are set
if [ -z "$DATABASE_URL" ]; then
  echo "[Entrypoint] ERROR: DATABASE_URL is not set"
  exit 1
fi

echo "[Entrypoint] Environment variables loaded"

# Wait for PostgreSQL to be ready
echo "[Entrypoint] Waiting for PostgreSQL to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0
WAIT_TIME=2

# Parse DATABASE_URL to extract host and port
# Format: postgresql://user:password@host:port/database
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')

# Default to standard PostgreSQL port if not found
DB_HOST=${DB_HOST:-postgres}
DB_PORT=${DB_PORT:-5432}

echo "[Entrypoint] Checking PostgreSQL at $DB_HOST:$DB_PORT..."

# Use Node.js to check if PostgreSQL port is open
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if node -e "
    const net = require('net');
    const client = new net.Socket();
    client.setTimeout(1000);
    client.on('connect', () => { client.destroy(); process.exit(0); });
    client.on('timeout', () => { client.destroy(); process.exit(1); });
    client.on('error', () => { process.exit(1); });
    client.connect($DB_PORT, '$DB_HOST');
  " 2>/dev/null; then
    echo "[Entrypoint] PostgreSQL is ready"
    break
  fi

  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "[Entrypoint] ERROR: PostgreSQL is not ready after $MAX_RETRIES attempts"
    exit 1
  fi
  echo "[Entrypoint] PostgreSQL is not ready yet (attempt $RETRY_COUNT/$MAX_RETRIES)..."
  sleep $WAIT_TIME
done

# Run database migrations
echo "[Entrypoint] Running database migrations..."
if npx drizzle-kit migrate; then
  echo "[Entrypoint] Database migrations completed successfully"
else
  echo "[Entrypoint] ERROR: Database migrations failed"
  exit 1
fi

# Seed database settings
echo "[Entrypoint] Seeding database settings..."
if node dist/storage/db/seed.js; then
  echo "[Entrypoint] Database seeding completed successfully"
else
  echo "[Entrypoint] ERROR: Database seeding failed"
  exit 1
fi

# Start the application
echo "[Entrypoint] Starting application..."
exec node dist/index.js
