#!/usr/bin/env bash
# Release a new xiaohe binary on 65. Run as root (runner calls it via sudo).
# Usage: release.sh <commit-sha> <path-to-built-binary>
# Steps: backup DB -> install binary -> switch symlink -> restart -> health check -> rollback on failure.
set -euo pipefail
COMMIT=${1:?commit}
SRC=${2:?binary path}
[[ "$COMMIT" =~ ^[0-9a-f]{7,40}$ ]] || { echo "bad commit: $COMMIT"; exit 2; }
[[ "$SRC" == /data/runner-work/* ]] || { echo "binary must come from /data/runner-work"; exit 2; }
[ -f "$SRC" ] || { echo "binary not found: $SRC"; exit 2; }

BASE=/opt/xiaohe
REL=$BASE/releases/$COMMIT
HEALTH=http://127.0.0.1:8080/api/health
exec 9>/run/xiaohe-release.lock; flock -n 9 || { echo "another release is running"; exit 3; }

PREV=$(readlink -f $BASE/current || true)

# 1. backup (skip if no DB yet or current binary is the placeholder)
if [ -f /data/db/xiaohe.db ] && [ -n "$PREV" ] && [ "$(basename "$PREV")" != placeholder ]; then
  sudo -u xiaohe XIAOHE_DB=/data/db/xiaohe.db "$PREV/xiaohe" backup "/data/backup/pre-$COMMIT.db"
  echo "backup: /data/backup/pre-$COMMIT.db"
fi

# 2. install
install -d -m 0755 "$REL"
install -m 0755 "$SRC" "$REL/xiaohe"
ln -sfn "$REL" $BASE/current.new && mv -T $BASE/current.new $BASE/current

# 3. restart + health check (30s)
systemctl restart xiaohe
ok=0
for i in $(seq 1 30); do
  sleep 1
  if curl -fsS -m 3 $HEALTH | jq -e '.ok == true and .db == "ok"' >/dev/null 2>&1; then ok=1; break; fi
done

if [ $ok = 1 ]; then
  echo "released $COMMIT: $(curl -fsS -m 3 $HEALTH)"
  # keep newest 5 releases (+ placeholder)
  ls -1dt $BASE/releases/*/ | grep -v placeholder | tail -n +6 | xargs -r rm -rf
  find /data/backup -name 'pre-*.db' -mtime +14 -delete
  exit 0
fi

echo "health check failed; rolling back to $PREV"
journalctl -u xiaohe --no-pager -n 30 | tail -30 || true
if [ -n "$PREV" ]; then
  ln -sfn "$PREV" $BASE/current.new && mv -T $BASE/current.new $BASE/current
  systemctl restart xiaohe
  sleep 3; curl -fsS -m 3 $HEALTH || true
fi
exit 1
