#!/usr/bin/env bash

# ==============================================================================
# E2E Test Runner Script
# ==============================================================================
# Comprehensive script for running E2E tests locally and in CI/CD
#
# Features:
# - Auto-detects CI vs local environment
# - Manages PostgreSQL database lifecycle (local only)
# - Runs database migrations
# - Executes E2E tests with proper configuration
# - Colorful output with clear status messages
#
# Usage:
#   ./scripts/run-e2e-tests.sh              # Run tests (keep DB running locally)
#   ./scripts/run-e2e-tests.sh --stop-db    # Run tests and stop DB after
#   ./scripts/run-e2e-tests.sh --watch      # Run tests in watch mode
#   ./scripts/run-e2e-tests.sh --help       # Show help
#
# GitHub Actions Example:
#   - name: Run E2E tests
#     run: ./scripts/run-e2e-tests.sh
#     env:
#       CI: true
# ==============================================================================

set -e  # Exit on error

# ==============================================================================
# Colors and Formatting
# ==============================================================================
if [[ -t 1 ]]; then
  # Terminal supports colors
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  MAGENTA='\033[0;35m'
  CYAN='\033[0;36m'
  BOLD='\033[1m'
  RESET='\033[0m'
else
  # No color support
  RED=''
  GREEN=''
  YELLOW=''
  BLUE=''
  MAGENTA=''
  CYAN=''
  BOLD=''
  RESET=''
fi

# ==============================================================================
# Helper Functions
# ==============================================================================

# Print colored status message
info() {
  echo -e "${BLUE}ℹ${RESET} ${BOLD}$1${RESET}"
}

success() {
  echo -e "${GREEN}✓${RESET} ${BOLD}$1${RESET}"
}

warning() {
  echo -e "${YELLOW}⚠${RESET} ${BOLD}$1${RESET}"
}

error() {
  echo -e "${RED}✗${RESET} ${BOLD}$1${RESET}"
}

step() {
  echo -e "\n${CYAN}▶${RESET} ${BOLD}$1${RESET}"
}

# Show help message
show_help() {
  cat <<EOF
${BOLD}E2E Test Runner${RESET}

${BOLD}USAGE:${RESET}
  ./scripts/run-e2e-tests.sh [OPTIONS]

${BOLD}OPTIONS:${RESET}
  --watch       Run tests in watch mode (interactive)
  --stop-db     Stop PostgreSQL database after tests (local only)
  --help        Show this help message

${BOLD}EXAMPLES:${RESET}
  ./scripts/run-e2e-tests.sh              # Run tests once
  ./scripts/run-e2e-tests.sh --watch      # Run tests in watch mode
  ./scripts/run-e2e-tests.sh --stop-db    # Run tests and cleanup database

${BOLD}ENVIRONMENT:${RESET}
  Local:  Manages PostgreSQL via docker-compose.dev.yml
  CI:     Uses existing PostgreSQL service container
EOF
}

# Check if running in CI environment
is_ci() {
  [[ -n "${CI:-}" ]] || [[ -n "${GITHUB_ACTIONS:-}" ]]
}

# Check if Docker is running
is_docker_running() {
  docker info >/dev/null 2>&1
}

# Check if PostgreSQL container is running
is_postgres_running() {
  docker compose -f docker-compose.dev.yml ps postgres 2>/dev/null | grep -q "Up"
}

# Wait for PostgreSQL to be ready
wait_for_postgres() {
  local max_attempts=30
  local attempt=1
  local sleep_time=1

  info "Waiting for PostgreSQL to be ready..."

  while [[ $attempt -le $max_attempts ]]; do
    if docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U postgres -d squash_bot_test >/dev/null 2>&1; then
      success "PostgreSQL is ready!"
      return 0
    fi

    echo -n "."
    sleep $sleep_time
    ((attempt++))
  done

  echo ""
  error "PostgreSQL failed to become ready after ${max_attempts} seconds"
  return 1
}

# Start PostgreSQL container
start_postgres() {
  step "Starting PostgreSQL database..."

  if ! is_docker_running; then
    error "Docker is not running. Please start Docker and try again."
    exit 1
  fi

  docker compose -f docker-compose.dev.yml up -d postgres

  if [[ $? -eq 0 ]]; then
    success "PostgreSQL container started"
    wait_for_postgres
  else
    error "Failed to start PostgreSQL container"
    exit 1
  fi
}

# Stop PostgreSQL container
stop_postgres() {
  step "Stopping PostgreSQL database..."

  docker compose -f docker-compose.dev.yml down

  if [[ $? -eq 0 ]]; then
    success "PostgreSQL container stopped"
  else
    error "Failed to stop PostgreSQL container"
    exit 1
  fi
}

# Run database migrations
run_migrations() {
  step "Running database migrations..."

  npx drizzle-kit push

  if [[ $? -eq 0 ]]; then
    success "Database migrations completed"
  else
    error "Database migrations failed"
    exit 1
  fi
}

# Run E2E tests
run_tests() {
  local watch_mode=$1

  step "Running E2E tests..."

  if [[ "$watch_mode" == "true" ]]; then
    info "Starting tests in UI mode (press Ctrl+C to exit)..."
    ENVIRONMENT=test npx playwright test tests/e2e --config=playwright.mjs --ui
  else
    ENVIRONMENT=test npx playwright test tests/e2e --config=playwright.mjs
  fi

  local exit_code=$?

  if [[ $exit_code -eq 0 ]]; then
    echo ""
    success "All E2E tests passed!"
  else
    echo ""
    error "E2E tests failed (exit code: $exit_code)"
  fi

  return $exit_code
}

# ==============================================================================
# Main Script
# ==============================================================================

# Parse command line arguments
STOP_DB=false
WATCH_MODE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --stop-db)
      STOP_DB=true
      shift
      ;;
    --watch)
      WATCH_MODE=true
      shift
      ;;
    --help|-h)
      show_help
      exit 0
      ;;
    *)
      error "Unknown option: $1"
      echo ""
      show_help
      exit 1
      ;;
  esac
done

# Print header
echo ""
echo -e "${BOLD}${MAGENTA}╔═══════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${MAGENTA}║      E2E Test Runner for Squash Bot   ║${RESET}"
echo -e "${BOLD}${MAGENTA}╚═══════════════════════════════════════╝${RESET}"
echo ""

# Detect environment
if is_ci; then
  info "Environment: ${BOLD}CI/CD${RESET}"
  info "PostgreSQL service is managed by CI pipeline"
else
  info "Environment: ${BOLD}Local Development${RESET}"
  info "PostgreSQL will be managed via docker-compose.dev.yml"
fi

echo ""

# Handle PostgreSQL lifecycle (local only)
if ! is_ci; then
  if is_postgres_running; then
    success "PostgreSQL is already running"
  else
    start_postgres
  fi
fi

# Run migrations
run_migrations

# Run tests
TEST_EXIT_CODE=0
run_tests "$WATCH_MODE" || TEST_EXIT_CODE=$?

# Cleanup (local only)
if ! is_ci && [[ "$STOP_DB" == "true" ]]; then
  echo ""
  stop_postgres
fi

# Final summary
echo ""
if [[ $TEST_EXIT_CODE -eq 0 ]]; then
  echo -e "${BOLD}${GREEN}╔═══════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${GREEN}║          ✓ Tests Completed!          ║${RESET}"
  echo -e "${BOLD}${GREEN}╚═══════════════════════════════════════╝${RESET}"
else
  echo -e "${BOLD}${RED}╔═══════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${RED}║          ✗ Tests Failed!             ║${RESET}"
  echo -e "${BOLD}${RED}╚═══════════════════════════════════════╝${RESET}"
fi
echo ""

exit $TEST_EXIT_CODE
