#!/usr/bin/env bash
# 65 一次性初始化（可重复执行）。用法：sudo bash setup-65.sh <go-version> <go-sha256>
set -euo pipefail
GO_VER=${1:?go version, e.g. go1.27.3}
GO_SHA=${2:?sha256 of ${GO_VER}.linux-amd64.tar.gz}
HERE=$(cd "$(dirname "$0")" && pwd)

echo "== apt: jq sqlite3 cloudflared"
install -d -m 0755 /usr/share/keyrings
if [ ! -s /usr/share/keyrings/cloudflare-main.gpg ]; then
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
fi
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
  > /etc/apt/sources.list.d/cloudflared.list
# /etc/apt/apt.conf 里有个不通的代理（10.3.19.253:22001），本脚本直连，不改那个文件
APT_OPTS=(-o Acquire::http::Proxy=false -o Acquire::https::Proxy=false)
apt-get "${APT_OPTS[@]}" update -qq
DEBIAN_FRONTEND=noninteractive apt-get "${APT_OPTS[@]}" install -y -qq jq sqlite3 cloudflared ca-certificates curl >/dev/null

echo "== go ${GO_VER}"
if [ "$(/usr/local/go/bin/go version 2>/dev/null | awk '{print $3}')" != "$GO_VER" ]; then
  dl=$(mktemp -d)
  curl -fsSL "https://dl.google.com/go/${GO_VER}.linux-amd64.tar.gz" -o "$dl/go.tgz"
  echo "${GO_SHA}  $dl/go.tgz" | sha256sum -c -
  rm -rf /usr/local/go && tar -C /usr/local -xzf "$dl/go.tgz"
  rm -rf "$dl"
fi
ln -sf /usr/local/go/bin/go /usr/local/bin/go
ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt

echo "== users"
id xiaohe >/dev/null 2>&1 || useradd --system --home-dir /opt/xiaohe --shell /usr/sbin/nologin xiaohe
id runner >/dev/null 2>&1 || useradd --create-home --shell /bin/bash runner

echo "== dirs"
install -d -o root -g root -m 0755 /opt/xiaohe /opt/xiaohe/releases /opt/xiaohe/bin
install -d -o root -g root -m 0700 /etc/xiaohe
for d in db audio backup; do install -d -o xiaohe -g xiaohe -m 0750 /data/$d; done
chown xiaohe:xiaohe /data/db /data/audio /data/backup

echo "== systemd units"
install -m 0644 "$HERE/xiaohe.service" /etc/systemd/system/xiaohe.service
install -m 0644 "$HERE/cloudflared-xiaohe.service" /etc/systemd/system/cloudflared-xiaohe.service
systemctl daemon-reload
echo "done"
