# Runtime-only Dockerfile.
#
# The Rust binary is built ahead of time by the GitHub Actions `binary` job
# (per-arch native musl static link via cargo-zigbuild) and placed at
# ./docker/bin/iptables-dashboard before `docker buildx build` runs. The
# frontend bundle is embedded into the binary at compile time via rust-embed,
# so this image only needs the runtime dependencies and the prebuilt binary.
#
# For local development use docker/docker-compose.dev.yml — it mounts the
# source tree and runs `cargo run` + `pnpm dev` directly, no image rebuild
# required.

FROM alpine:3.20

# Path (relative to build context) to the prebuilt static binary.
# Defaulted so a CI matrix can override it per architecture if needed.
ARG IPTD_BINARY=docker/bin/iptables-dashboard

RUN apk add --no-cache \
        iptables iptables-legacy \
        ip6tables \
        ca-certificates \
        tini \
        su-exec \
        tzdata \
        wget \
    && addgroup -S iptd \
    && adduser -S -G iptd -h /var/lib/iptables-dashboard iptd \
    && mkdir -p /var/lib/iptables-dashboard /etc/iptables-dashboard \
    && chown -R iptd:iptd /var/lib/iptables-dashboard /etc/iptables-dashboard

COPY ${IPTD_BINARY} /usr/local/bin/iptables-dashboard
COPY docker/entrypoint.sh /entrypoint.sh
COPY docker/config.example.toml /etc/iptables-dashboard/config.example.toml
RUN chmod +x /entrypoint.sh /usr/local/bin/iptables-dashboard

ENV IPTD_LISTEN=0.0.0.0:7642 \
    IPTD_DATA_DIR=/var/lib/iptables-dashboard \
    IPTD_CONFIG_DIR=/etc/iptables-dashboard \
    RUST_LOG=info

EXPOSE 7642
VOLUME ["/var/lib/iptables-dashboard", "/etc/iptables-dashboard"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:7642/api/v1/health >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]
CMD ["iptables-dashboard"]
