#!/usr/bin/env python3
"""Deploy the local built preview to the dedicated CT110, without logging secrets."""
import datetime
import io
import json
import os
from pathlib import Path
import secrets
import subprocess
import tarfile
import re

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent
HOST = os.environ.get('GODSEYE_PROXMOX_HOST')
if not HOST or HOST.startswith('-'):
    raise SystemExit('Set GODSEYE_PROXMOX_HOST to the established user@host SSH destination')
SSH = ['ssh', '-o', 'BatchMode=yes', '-o', 'ForwardAgent=no', '-o',
       'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', HOST]

def remote(command, data=None):
    result = subprocess.run(SSH + [command], input=data, capture_output=True)
    if result.returncode:
        raise RuntimeError(f'Remote step failed ({result.returncode}); output withheld: {command}')
    return result.stdout

def put(path, content, mode='0644', owner='root:root'):
    remote(f"pct exec 110 -- sh -c 'umask 077; cat > {path}; chmod {mode} {path}; chown {owner} {path}'", content)

assert remote('pct exec 110 -- hostname').strip() == b'godseye'
assert (ROOT / 'dist/index.html').is_file(), 'Build first'
private = BASE / '.secrets'
private.mkdir(mode=0o700, exist_ok=True)
os.chmod(private, 0o700)
viewer = private / 'viewer.json'
if not viewer.exists():
    with os.fdopen(os.open(viewer, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as f:
        json.dump({'url': 'https://godseye.develotype.com', 'username': 'brian',
                   'password': secrets.token_urlsafe(30)}, f)
account = json.loads(viewer.read_text())
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
target = f'/srv/godseye/releases/{stamp}'
archive = io.BytesIO()
with tarfile.open(fileobj=archive, mode='w:gz') as tar:
    for name in ['package.json', 'package-lock.json', 'vite.config.js', 'build',
                 'server', 'src', 'scripts', 'config', 'dist', 'LICENSE', 'DATA_SOURCES.md']:
        tar.add(ROOT / name, arcname=name)
remote(f'pct exec 110 -- mkdir -p {target}')
remote(f'pct exec 110 -- tar -xzf - --no-same-owner -C {target}', archive.getvalue())
remote(f"pct exec 110 -- bash -lc 'export PATH=/usr/local/bin:/usr/bin:/bin; cd {target} && PUPPETEER_SKIP_DOWNLOAD=true npm ci --no-audit --no-fund > /tmp/godseye-npm.log 2>&1 && mkdir -p .gev-cache .gev-logs node_modules/.vite-temp && chown godseye:godseye .gev-cache .gev-logs node_modules/.vite-temp'")
remote('pct exec 110 -- htpasswd -iBc /etc/nginx/godseye-viewers.htpasswd brian', (account['password'] + '\n').encode())
remote('pct exec 110 -- chown root:www-data /etc/nginx/godseye-viewers.htpasswd')
remote('pct exec 110 -- chmod 0640 /etc/nginx/godseye-viewers.htpasswd')
put('/etc/nginx/sites-available/godseye', (BASE / 'nginx.conf').read_bytes())
remote("pct exec 110 -- sh -c 'test ! -L /etc/nginx/sites-enabled/default || unlink /etc/nginx/sites-enabled/default; ln -sfn /etc/nginx/sites-available/godseye /etc/nginx/sites-enabled/godseye'")
put('/etc/cloudflared/godseye.json', (private / 'tunnel.json').read_bytes(), '0640', 'root:cloudflared')
put('/etc/cloudflared/config.yml', (BASE / 'cloudflared.yml').read_bytes(), '0640', 'root:cloudflared')
for name in ['godseye', 'cloudflared-godseye']:
    put(f'/etc/systemd/system/{name}.service', (BASE / f'{name}.service').read_bytes())
env_path = ROOT / '.env'
if env_path.exists():
    selected = [line for line in env_path.read_text().splitlines() if line.startswith('GOOGLE_GEOCODING_API_KEY=')]
    if selected:
        assert len(selected) == 1 and re.fullmatch(r'GOOGLE_GEOCODING_API_KEY=[A-Za-z0-9_-]+', selected[0])
        put('/etc/godseye.env', (selected[0] + '\n').encode(), '0600')
remote('pct exec 110 -- nginx -t')
remote('pct exec 110 -- cloudflared tunnel --config /etc/cloudflared/config.yml ingress validate')
previous = remote('pct exec 110 -- readlink /srv/godseye/current || true').decode().strip()
receipt_path = BASE / 'last-release.json'
if not receipt_path.exists() or json.loads(receipt_path.read_text()).get('release') != previous:
    previous = ''  # Only roll back to a release with a successful activation receipt.
remote(f"pct exec 110 -- sh -c 'ln -s {target} /srv/godseye/current.next && mv -Tf /srv/godseye/current.next /srv/godseye/current'")
try:
    remote('pct exec 110 -- systemctl daemon-reload')
    remote('pct exec 110 -- systemctl enable godseye nginx cloudflared-godseye')
    remote('pct exec 110 -- systemctl restart godseye nginx cloudflared-godseye')
    config = f'url = "http://127.0.0.1:8080/"\nuser = "{account["username"]}:{account["password"]}"\nretry = 10\nretry-delay = 1\nretry-all-errors\n'
    body = remote('pct exec 110 -- curl --fail --silent --show-error --config -', config.encode())
    assert b'<html' in body and b'/assets/' in body
except Exception:
    if previous:
        remote(f"pct exec 110 -- sh -c 'ln -s {previous} /srv/godseye/current.rollback && mv -Tf /srv/godseye/current.rollback /srv/godseye/current'")
        remote('pct exec 110 -- systemctl restart godseye')
    else:
        remote('pct exec 110 -- systemctl stop godseye cloudflared-godseye')
    raise
receipt = {'container': 110, 'hostname': 'godseye', 'url': account['url'],
           'release': target, 'previous': previous or None,
           'upstreamCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
           'authenticatedOrigin': True}
(BASE / 'last-release.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
