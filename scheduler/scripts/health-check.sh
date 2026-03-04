#!/bin/sh
set -e

# Telegram API URL (test server uses /test/ prefix)
if [ "$TELEGRAM_TEST_SERVER" = "true" ]; then
  TG_API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/test"
else
  TG_API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"
fi

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${BOT_URL}/health" 2>/dev/null) || RESPONSE="000"

if [ "$RESPONSE" = "200" ]; then
  echo "[health-check] OK (200)"
else
  echo "[health-check] FAIL (${RESPONSE})"
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  TEXT="🔴 Squash Bot health check failed!%0A%0AStatus: ${RESPONSE}%0ATime: ${TIMESTAMP}"
  curl -s -X POST "${TG_API}/sendMessage" \
    -d "chat_id=${TELEGRAM_LOG_CHAT_ID}" \
    -d "text=${TEXT}" \
    > /dev/null 2>&1
  echo "[health-check] Alert sent to ${TELEGRAM_LOG_CHAT_ID}"
fi
