#!/bin/bash

# Interactive script to create .env.prod file for production deployment
# Prompts user for all required environment variables

set -e

echo "========================================"
echo "Squash Payment Bot - Production Environment Setup"
echo "========================================"
echo ""
echo "This script will help you create a .env.prod file with all required variables."
echo ""

# Target file
ENV_FILE=".env.prod"

# Check if .env.prod already exists
if [ -f "$ENV_FILE" ]; then
  echo "WARNING: $ENV_FILE already exists!"
  read -p "Do you want to overwrite it? (y/N): " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
  echo ""
fi

# Helper function to prompt for input
prompt_for_value() {
  local var_name=$1
  local description=$2
  local is_secret=$3
  local default_value=$4
  local value

  echo "----------------------------------------"
  echo "$description"

  if [ -n "$default_value" ]; then
    if [ "$is_secret" = "true" ]; then
      read -s -p "$var_name (default: $default_value): " value
    else
      read -p "$var_name (default: $default_value): " value
    fi
    echo ""
    value=${value:-$default_value}
  else
    if [ "$is_secret" = "true" ]; then
      read -s -p "$var_name (required): " value
    else
      read -p "$var_name (required): " value
    fi
    echo ""

    # Validate required fields
    while [ -z "$value" ]; do
      echo "ERROR: This field is required!"
      if [ "$is_secret" = "true" ]; then
        read -s -p "$var_name (required): " value
      else
        read -p "$var_name (required): " value
      fi
      echo ""
    done
  fi

  echo "$value"
}

# Collect all variables
echo "DATABASE CONFIGURATION"
echo "========================================"
POSTGRES_DB=$(prompt_for_value "POSTGRES_DB" "PostgreSQL database name" false "squash_bot")
POSTGRES_USER=$(prompt_for_value "POSTGRES_USER" "PostgreSQL username" false "postgres")
POSTGRES_PASSWORD=$(prompt_for_value "POSTGRES_PASSWORD" "PostgreSQL password (keep it secret!)" true "")

# Construct DATABASE_URL
DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@postgres:5432/$POSTGRES_DB"

echo ""
echo "TELEGRAM CONFIGURATION"
echo "========================================"
TELEGRAM_BOT_TOKEN=$(prompt_for_value "TELEGRAM_BOT_TOKEN" "Telegram bot token from @BotFather" true "")
TELEGRAM_MAIN_CHAT_ID=$(prompt_for_value "TELEGRAM_MAIN_CHAT_ID" "Main chat ID for the bot" false "")
TELEGRAM_LOG_CHAT_ID=$(prompt_for_value "TELEGRAM_LOG_CHAT_ID" "Log chat ID for error notifications" false "")
ADMIN_TELEGRAM_ID=$(prompt_for_value "ADMIN_TELEGRAM_ID" "Admin user Telegram ID" false "")

echo ""
echo "API CONFIGURATION"
echo "========================================"
API_KEY=$(prompt_for_value "API_KEY" "API key for n8n webhooks (generate a random string)" true "")
PORT=$(prompt_for_value "PORT" "Server port" false "3010")

echo ""
echo "OTHER CONFIGURATION"
echo "========================================"
TIMEZONE=$(prompt_for_value "TIMEZONE" "Timezone (e.g., Europe/Belgrade)" false "Europe/Belgrade")

# Create .env.prod file
echo ""
echo "Creating $ENV_FILE..."
cat > "$ENV_FILE" << EOF
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
TELEGRAM_MAIN_CHAT_ID=$TELEGRAM_MAIN_CHAT_ID
TELEGRAM_LOG_CHAT_ID=$TELEGRAM_LOG_CHAT_ID
ADMIN_TELEGRAM_ID=$ADMIN_TELEGRAM_ID

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

echo ""
echo "========================================"
echo "SUCCESS! $ENV_FILE created successfully"
echo "========================================"
echo ""
echo "File permissions set to 600 (owner read/write only)"
echo ""
echo "IMPORTANT SECURITY NOTES:"
echo "- Never commit this file to git"
echo "- Never share this file or its contents"
echo "- Keep backups in a secure location"
echo ""
echo "You can now start the application with:"
echo "  docker compose up -d"
echo ""
