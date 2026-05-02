#!/bin/sh
# entrypoint.sh — detect host iptables backend and align symlinks before starting.
# Runs as root (container's effective user) so it can manage symlinks under /usr/sbin.
set -eu

log() { printf '[entrypoint] %s\n' "$*" >&2; }

# Resolve the location of a tool, considering both /sbin and /usr/sbin.
which_tool() {
    name="$1"
    for prefix in /usr/sbin /sbin /usr/bin /bin; do
        if [ -x "$prefix/$name" ]; then
            echo "$prefix/$name"
            return 0
        fi
    done
    return 1
}

detect_backend() {
    # Try iptables-nft first (modern default). The probe runs against the host
    # netfilter via the shared netns, so a successful list means the backend
    # is usable on the host kernel.
    nft_bin=$(which_tool iptables-nft 2>/dev/null || true)
    nft_save_bin=$(which_tool iptables-nft-save 2>/dev/null || true)
    leg_bin=$(which_tool iptables-legacy 2>/dev/null || true)

    if [ -n "$nft_bin" ] && "$nft_bin" -L >/dev/null 2>&1; then
        if [ -n "$nft_save_bin" ]; then
            out=$("$nft_save_bin" 2>/dev/null | head -1 || true)
            case "$out" in
                *xtables-save*|*nf_tables*) echo "nft"; return 0 ;;
            esac
        fi
        # Fallback heuristic: nft binary worked → assume nft.
        echo "nft"; return 0
    fi
    if [ -n "$leg_bin" ] && "$leg_bin" -L >/dev/null 2>&1; then
        echo "legacy"; return 0
    fi
    echo "nft"  # safest modern default
}

align_one() {
    base="$1"      # e.g. iptables, iptables-save, iptables-restore
    target="$2"    # e.g. iptables-nft, iptables-nft-save
    src=$(which_tool "$target" 2>/dev/null || true)
    if [ -n "$src" ]; then
        ln -sf "$src" "/usr/sbin/$base" 2>/dev/null || true
    fi
}

align_symlinks() {
    backend="$1"
    log "selecting iptables backend: $backend"
    case "$backend" in
        legacy)
            align_one iptables           iptables-legacy
            align_one iptables-save      iptables-legacy-save
            align_one iptables-restore   iptables-legacy-restore
            align_one ip6tables          ip6tables-legacy
            align_one ip6tables-save     ip6tables-legacy-save
            align_one ip6tables-restore  ip6tables-legacy-restore
            ;;
        nft|*)
            align_one iptables           iptables-nft
            align_one iptables-save      iptables-nft-save
            align_one iptables-restore   iptables-nft-restore
            align_one ip6tables          ip6tables-nft
            align_one ip6tables-save     ip6tables-nft-save
            align_one ip6tables-restore  ip6tables-nft-restore
            ;;
    esac
}

# 1) align iptables backend
backend=$(detect_backend)
align_symlinks "$backend"
export IPTD_BACKEND="$backend"

# 2) ensure data/config directories exist and are writable.
mkdir -p "${IPTD_DATA_DIR:-/var/lib/iptables-dashboard}" "${IPTD_CONFIG_DIR:-/etc/iptables-dashboard}"

# 3) materialize a default config if none exists.
cfg="${IPTD_CONFIG_DIR:-/etc/iptables-dashboard}/config.toml"
if [ ! -f "$cfg" ] && [ -f /etc/iptables-dashboard/config.example.toml ]; then
    cp /etc/iptables-dashboard/config.example.toml "$cfg"
    log "wrote default config to $cfg"
fi

# 4) hand off to the application. Required runtime flags on `docker run`:
#       --net=host  --cap-add=NET_ADMIN  --cap-add=NET_RAW
log "starting $*"
exec "$@"
