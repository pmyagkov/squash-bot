FROM alpine:3.20

# Install curl and supercronic
RUN apk add --no-cache curl && \
    ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then ARCH="arm64"; else ARCH="amd64"; fi && \
    curl -fsSL "https://github.com/aptible/supercronic/releases/download/v0.2.43/supercronic-linux-${ARCH}" -o /usr/local/bin/supercronic && \
    chmod +x /usr/local/bin/supercronic

COPY scripts/ /scripts/
RUN chmod +x /scripts/*.sh

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Default schedules (can be overridden via environment variables)
# supercronic supports 6-field cron (with seconds) and standard 5-field
ENV HEALTH_SCHEDULE="*/5 * * * *" \
    CHECK_EVENTS_SCHEDULE="*/15 * * * *" \
    CHECK_PAYMENTS_SCHEDULE="0 12 * * *"

ENTRYPOINT ["/entrypoint.sh"]
