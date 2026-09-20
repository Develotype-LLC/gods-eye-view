#!/usr/bin/env bash
set -euo pipefail
test "$(hostname)" = godseye
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends nginx apache2-utils ca-certificates curl xz-utils
cd /tmp
curl -fsSLO https://nodejs.org/dist/v24.15.0/node-v24.15.0-linux-x64.tar.xz
curl -fsSLo node-SHASUMS256.txt https://nodejs.org/dist/v24.15.0/SHASUMS256.txt
grep ' node-v24.15.0-linux-x64.tar.xz$' node-SHASUMS256.txt | sha256sum -c -
tar -xJf node-v24.15.0-linux-x64.tar.xz -C /opt
ln -sfn /opt/node-v24.15.0-linux-x64/bin/node /usr/local/bin/node
ln -sfn /opt/node-v24.15.0-linux-x64/bin/npm /usr/local/bin/npm
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' > /etc/apt/sources.list.d/cloudflared.list
apt-get update -qq
apt-get install -y --no-install-recommends cloudflared
id godseye >/dev/null 2>&1 || useradd --system --home /srv/godseye --shell /usr/sbin/nologin godseye
id cloudflared >/dev/null 2>&1 || useradd --system --home /nonexistent --shell /usr/sbin/nologin cloudflared
install -d -m 0750 -o root -g cloudflared /etc/cloudflared
install -d -m 0755 /srv/godseye/releases
systemctl disable --now ssh.service ssh.socket
