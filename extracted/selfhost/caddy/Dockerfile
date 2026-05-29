# Custom Caddy build with IP rate limiting support.
# The official caddy:2-alpine image does not include third-party modules,
# so production builds must compile the rate_limit handler explicitly.
FROM caddy:2-builder-alpine AS builder

RUN xcaddy build \
    --with github.com/mholt/caddy-ratelimit

FROM caddy:2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
