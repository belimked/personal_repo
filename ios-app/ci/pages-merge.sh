#!/usr/bin/env bash
# 合并安装页：保留线上另一个平台的现有文件，再叠加本次构建的文件。
# 用法：pages-merge.sh <线上 BASE_URL> <本次构建目录> <输出目录>
set -euo pipefail
BASE=$1 NEW=$2 OUT=$3
mkdir -p "$OUT"
T=$(date +%s)
for f in DailyAssistant.ipa manifest.plist icon-57.png icon-512.png ios.json DailyAssistant.apk android.json; do
  [ -e "$NEW/$f" ] && continue
  # 带时间戳参数绕过 Pages CDN 缓存，避免拿到旧文件
  if curl -sfL --retry 3 -o "$OUT/$f" "$BASE/$f?t=$T"; then echo "kept   $f"; else rm -f "$OUT/$f"; echo "absent $f"; fi
done
cp -f "$NEW"/* "$OUT/"
sed -e "s#__BASE_URL__#$BASE#g" "$(dirname "$0")/install/index.html" > "$OUT/index.html"
ls -lh "$OUT"
