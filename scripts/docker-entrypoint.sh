#!/bin/sh

# Docker entrypoint script for Squash Payment Bot
# Database migrations and seeding are handled by the db-init service in docker-compose

set -e

echo "[Entrypoint] Starting Squash Payment Bot..."
exec node dist/index.js
