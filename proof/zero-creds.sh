#!/usr/bin/env bash
# Zero-credential proof, run INSIDE the Sprite. Searches env + filesystem for credential shapes.
# A search that cannot find a planted dummy proves nothing, so the dummy goes in first (positive
# control), must be found, is removed, and only then does the real count count.
set -uo pipefail
NEEDLES='ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{50,}|gho_[A-Za-z0-9]{36}|sk-or-v1-[a-f0-9]{40,}|sk-ant-[A-Za-z0-9_-]{20,}|FlyV1 [A-Za-z0-9_+/=-]{20,}|SPRITES_TOKEN=|OPENROUTER_API_KEY=|GITHUB_TOKEN='
ROOTS="/home /root /etc /tmp /var /opt /srv /usr/local"
scan() {
  { env; cat /proc/1/environ 2>/dev/null | tr '\0' '\n'; } | grep -Ec "$NEEDLES"
  sudo -n true 2>/dev/null && S=sudo || S=
  $S timeout 120 grep -rIlE --exclude-dir=node_modules "$NEEDLES" $ROOTS 2>/dev/null | grep -v "/heir/proof/zero-creds.sh$"
}
# Say who scanned: without sudo, files only root can read (/root, parts of /etc) are not searched.
sudo -n true 2>/dev/null && echo "scanning as $(id -un) with sudo" || echo "scanning as $(id -un) WITHOUT sudo: root-only files are not searched"
DUMMY=/tmp/planted-dummy.env
FAKE="ghp_$(head -c 200 /dev/urandom | tr -dc A-Za-z0-9 | head -c 36)"
echo "GITHUB_TOKEN=$FAKE" > $DUMMY
c=$(GITHUB_TOKEN=$FAKE scan); echo "control: dummy planted in a file ($DUMMY) and in the environment"; echo "$c" | sed 's/^/  /'
[ "$(echo "$c" | head -1)" -ge 1 ] && echo "$c" | grep -qx "$DUMMY" || { echo "CONTROL FAILED: the scan cannot see a planted credential; result void"; rm -f $DUMMY; exit 2; }
echo "control found both. Removing it."
rm -f $DUMMY
r=$(scan); envhits=$(echo "$r" | head -1); files=$(echo "$r" | tail -n +2 | grep -c . || true)
echo "env/process hits: $envhits"; echo "files with credential shapes: $files"; echo "$r" | tail -n +2 | sed 's/^/  /'
[ "$envhits" = 0 ] && [ "$files" = 0 ] && echo "Secrets on VM: 0" || { echo "Secrets on VM: NOT ZERO"; exit 1; }
