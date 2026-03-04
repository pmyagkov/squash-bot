#!/bin/sh
set -e

RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 30 \
  -X POST "${BOT_URL}/check-payments" \
  -H "X-API-Key: ${API_KEY}" \
  2>/dev/null) || RESPONSE=$'\n000'

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ] || echo "$BODY" | grep -q '"error"'; then
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  ERROR_MSG=$(echo "$BODY" | grep -o '"error":"[^"]*"' | head -1 | sed 's/"error":"//;s/"//')
  [ -z "$ERROR_MSG" ] && ERROR_MSG="HTTP ${HTTP_CODE}"
  TEXT="🔴 check-payments failed!%0A%0AError: ${ERROR_MSG}%0ATime: ${TIMESTAMP}"
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${ADMIN_CHAT_ID}" \
    -d "text=${TEXT}" \
    > /dev/null 2>&1
fi
