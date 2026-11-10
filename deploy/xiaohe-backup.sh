#!/usr/bin/env bash
# Daily DB backup on 65 (runs as user xiaohe from xiaohe-backup.timer). Keeps 14 copies.
set -euo pipefail
DIR=${XIAOHE_BACKUP_DIR:-/data/backup}
OUT=$DIR/xiaohe-$(date -u +%Y%m%d).db
rm -f "$OUT" "$OUT.gz"
/opt/xiaohe/current/xiaohe backup "$OUT"
gzip -9 "$OUT"
ls -1t "$DIR"/xiaohe-*.db.gz | tail -n +15 | xargs -r rm -f
echo "backup ok: $OUT.gz"
# TODO(step 5): upload to R2 bucket xiaohe-backup
