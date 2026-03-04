#!/bin/sh
set -e

# Generate crontab from environment variables
cat > /tmp/crontab <<EOF
${HEALTH_SCHEDULE} /scripts/health-check.sh
${CHECK_EVENTS_SCHEDULE} /scripts/check-events.sh
${CHECK_PAYMENTS_SCHEDULE} /scripts/check-payments.sh
EOF

echo "Scheduler starting with:"
cat /tmp/crontab
echo "---"

exec supercronic /tmp/crontab
