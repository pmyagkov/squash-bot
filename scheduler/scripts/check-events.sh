#!/bin/sh
set -e

# Telegram API URL (test server uses /test/ prefix)
if [ "$TELEGRAM_TEST_SERVER" = "true" ]; then
  TG_API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/test"
else
  TG_API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"
fi

RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 30 \
  -X POST "${BOT_URL}/check-events" \
  -H "X-API-Key: ${API_KEY}" \
  2>/dev/null) || RESPONSE=$'\n000'

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo "[check-events] OK (200) ${BODY}"
else
  echo "[check-events] FAIL (${HTTP_CODE}) ${BODY}"
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  ERROR_MSG=$(echo "$BODY" | grep -o '"error":"[^"]*"' | head -1 | sed 's/"error":"//;s/"//')
  [ -z "$ERROR_MSG" ] && ERROR_MSG="HTTP ${HTTP_CODE}"
  TEXT="🔴 check-events failed!%0A%0AError: ${ERROR_MSG}%0ATime: ${TIMESTAMP}"
  curl -s -X POST "${TG_API}/sendMessage" \
    -d "chat_id=${ADMIN_CHAT_ID}" \
    -d "text=${TEXT}" \
    > /dev/null 2>&1
  echo "[check-events] Alert sent to ${ADMIN_CHAT_ID}"
fi
