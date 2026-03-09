#!/usr/bin/env bash
set -e

COMPOSE_FILE="docker-compose.migration-test.yml"
CONTAINER_NAME="squash-bot-postgres-migration"
DB_NAME="squash_bot_migration"
DB_USER="postgres"
DB_PORT=5434
DUMP_FILE="tests/migration/prod_dump.sql"
SERVER_HOST="${SERVER_HOST:-root@puelle.me}"

# Colors
if [[ -t 1 ]]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  BLUE='\033[0;34m'; MAGENTA='\033[0;35m'; BOLD='\033[1m'; RESET='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; MAGENTA=''; BOLD=''; RESET=''
fi

info()    { echo -e "${BLUE}ℹ${RESET} ${BOLD}$1${RESET}"; }
success() { echo -e "${GREEN}✓${RESET} ${BOLD}$1${RESET}"; }
error()   { echo -e "${RED}✗${RESET} ${BOLD}$1${RESET}"; }
step()    { echo -e "\n${MAGENTA}▶${RESET} ${BOLD}$1${RESET}"; }

# Parse args
STOP_DB=false
for arg in "$@"; do
  case $arg in
    --stop-db) STOP_DB=true ;;
  esac
done

if [[ "$STOP_DB" == "true" ]]; then
  info "Stopping migration test database..."
  docker compose -f "$COMPOSE_FILE" down
  exit 0
fi

# Header
echo ""
echo -e "${BOLD}${MAGENTA}╔═══════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${MAGENTA}║    Migration Test Runner              ║${RESET}"
echo -e "${BOLD}${MAGENTA}╚═══════════════════════════════════════╝${RESET}"
echo ""

# Detect CI
IS_CI=false
if [[ -n "${CI:-}" ]] || [[ -n "${GITHUB_ACTIONS:-}" ]]; then
  IS_CI=true
  info "Environment: CI/CD"
else
  info "Environment: Local Development"
fi

# Step 1: Download production dump
step "Downloading production database dump..."

mkdir -p "$(dirname "$DUMP_FILE")"

if ssh -o ConnectTimeout=10 -o BatchMode=yes "$SERVER_HOST" \
  'source /opt/squash-bot/.env && docker exec squash-bot-postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=plain' \
  > "$DUMP_FILE" 2>/dev/null; then
  success "Dump saved to $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"
else
  error "Failed to download production dump from $SERVER_HOST"
  error "Ensure SSH access is available and squash-bot-postgres container is running"
  rm -f "$DUMP_FILE"
  exit 1
fi

# Step 2: Start postgres
if ! docker ps --format '{{.Names}}' | grep -q "$CONTAINER_NAME"; then
  step "Starting migration test database..."
  docker compose -f "$COMPOSE_FILE" up -d
fi

info "Waiting for PostgreSQL..."
RETRIES=30
until docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  if [[ $RETRIES -le 0 ]]; then
    error "PostgreSQL did not become ready in time"
    exit 1
  fi
  sleep 1
done
success "PostgreSQL is ready"

# Step 3: Run tests
step "Running migration tests..."
TEST_EXIT_CODE=0
MIGRATION_TEST_DATABASE_URL="postgresql://${DB_USER}:test@localhost:${DB_PORT}/${DB_NAME}" \
  npx vitest run --config tests/migration/vitest.config.mjs || TEST_EXIT_CODE=$?

# Summary
echo ""
if [[ $TEST_EXIT_CODE -eq 0 ]]; then
  echo -e "${BOLD}${GREEN}╔═══════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${GREEN}║    ✓ Migration Tests Passed!          ║${RESET}"
  echo -e "${BOLD}${GREEN}╚═══════════════════════════════════════╝${RESET}"
else
  echo -e "${BOLD}${RED}╔═══════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${RED}║    ✗ Migration Tests Failed!          ║${RESET}"
  echo -e "${BOLD}${RED}╚═══════════════════════════════════════╝${RESET}"
fi
echo ""

exit $TEST_EXIT_CODE
