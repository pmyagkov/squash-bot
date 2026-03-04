#!/bin/sh
set -e

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${BOT_URL}/health" 2>/dev/null) || RESPONSE="000"

if [ "$RESPONSE" != "200" ]; then
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  TEXT="🔴 Squash Bot health check failed!%0A%0AStatus: ${RESPONSE}%0ATime: ${TIMESTAMP}"
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${ADMIN_CHAT_ID}" \
    -d "text=${TEXT}" \
    > /dev/null 2>&1
fi
