#!/bin/bash

# Automated script to create .env.prod from environment variables
# Used in CI/CD pipeline with GitHub Secrets

set -e

echo "[Setup] Creating .env.prod from environment variables..."

# Target file
ENV_FILE=".env.prod"

# Validate required environment variables
REQUIRED_VARS=(
  "TELEGRAM_BOT_TOKEN"
  "TELEGRAM_MAIN_CHAT_ID"
  "TELEGRAM_LOG_CHAT_ID"
  "ADMIN_TELEGRAM_ID"
  "NOTION_API_KEY"
  "NOTION_DATABASE_SCAFFOLDS"
  "NOTION_DATABASE_EVENTS"
  "NOTION_DATABASE_PARTICIPANTS"
  "NOTION_DATABASE_EVENT_PARTICIPANTS"
  "NOTION_DATABASE_PAYMENTS"
  "NOTION_DATABASE_SETTINGS"
  "API_KEY"
  "POSTGRES_PASSWORD"
)

echo "[Setup] Validating required environment variables..."
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    MISSING_VARS+=("$var")
  fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  echo "[Setup] ERROR: Missing required environment variables:"
  for var in "${MISSING_VARS[@]}"; do
    echo "  - $var"
  done
  exit 1
fi

echo "[Setup] All required environment variables are set"

# Set default values for optional variables
POSTGRES_DB=${POSTGRES_DB:-squash_bot}
POSTGRES_USER=${POSTGRES_USER:-postgres}
PORT=${PORT:-3010}
TIMEZONE=${TIMEZONE:-Europe/Belgrade}

# Construct DATABASE_URL
DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@postgres:5432/$POSTGRES_DB"

# Create .env.prod file
echo "[Setup] Writing $ENV_FILE..."
cat > "$ENV_FILE" << EOF
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
TELEGRAM_MAIN_CHAT_ID=$TELEGRAM_MAIN_CHAT_ID
TELEGRAM_LOG_CHAT_ID=$TELEGRAM_LOG_CHAT_ID
ADMIN_TELEGRAM_ID=$ADMIN_TELEGRAM_ID

# Notion API Configuration
NOTION_API_KEY=$NOTION_API_KEY

# Notion Database IDs
NOTION_DATABASE_SCAFFOLDS=$NOTION_DATABASE_SCAFFOLDS
NOTION_DATABASE_EVENTS=$NOTION_DATABASE_EVENTS
NOTION_DATABASE_PARTICIPANTS=$NOTION_DATABASE_PARTICIPANTS
NOTION_DATABASE_EVENT_PARTICIPANTS=$NOTION_DATABASE_EVENT_PARTICIPANTS
NOTION_DATABASE_PAYMENTS=$NOTION_DATABASE_PAYMENTS
NOTION_DATABASE_SETTINGS=$NOTION_DATABASE_SETTINGS

# Server Configuration
PORT=$PORT
API_KEY=$API_KEY

# Timezone
TIMEZONE=$TIMEZONE

# PostgreSQL Database
POSTGRES_DB=$POSTGRES_DB
POSTGRES_USER=$POSTGRES_USER
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
DATABASE_URL=$DATABASE_URL
EOF

# Set proper permissions (owner read/write only)
chmod 600 "$ENV_FILE"

echo "[Setup] $ENV_FILE created successfully with permissions 600"
echo "[Setup] Configuration ready for deployment"
