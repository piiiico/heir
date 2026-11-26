#!/usr/bin/env bash
# Connector scope, run INSIDE the Sprite by hand, no model calls.
# The VM holds no token; the gateway attaches one only for paths on the connector's allow-list.
set -uo pipefail
G="https://api.sprites.dev/v1/gateway/custom_api/FlNWPaQnDQyGg4tU_qOByA"  # GitHub, Custom API connector
echo "$(date -u +%FT%TZ) on $(hostname) as $(id -un)"
echo "env vars named like token/key/secret: $(env | grep -ci -E 'token|key|secret')"
for p in /repos/piiiico/heir /repos/piiiico/agent-errata /user; do
  code=$(curl -s -o /tmp/cs.body -w '%{http_code}' "$G$p")
  # "permissions" is only in GitHub's answer when a token was attached: proof the gateway authenticated.
  note=$(grep -o '"error":"[^"]*"' /tmp/cs.body || grep -o '"admin": *[a-z]*' /tmp/cs.body | head -1 | sed 's/^/token attached, /')
  printf 'GET %-28s -> HTTP %s  %s\n' "$p" "$code" "$note"
done
