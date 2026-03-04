FROM alpine:3.20

RUN apk add --no-cache curl

COPY crontab /etc/crontabs/root
COPY scripts/ /scripts/
RUN chmod +x /scripts/*.sh

CMD ["crond", "-f", "-l", "2"]
