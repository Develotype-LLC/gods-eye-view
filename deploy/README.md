# Godseye deployment

- Fork: https://github.com/Develotype-LLC/gods-eye-view
- Upstream: https://github.com/bilawalsidhu/gods-eye-view
- Intended URL: https://godseye.develotype.com
- Proxmox: established SSH destination in `GODSEYE_PROXMOX_HOST`, container **110**, `godseye`.
- Ubuntu 24.04, unprivileged LXC, 2 CPU cores, 4 GiB RAM, 512 MiB swap,
  32 GiB ZFS disk, DHCP on `vmbr0`. IDs 108 and 109 were already occupied.
- Node 24.15.0; built Vite preview plus upstream server middleware.
- Application: loopback port 4173; nginx authentication proxy: loopback port 8080;
  dedicated Cloudflare tunnel; tunnel metrics: loopback port 20241.
- Services: `godseye`, `nginx`, `cloudflared-godseye`, enabled at boot.

## Access

HTTP Basic authentication protects the application, assets, and API routes over
HTTPS. This is not Cloudflare Access or per-user SSO. Username is `brian`; the
generated password is in local mode-600 `deploy/.secrets/viewer.json`. Tunnel
credentials are in `deploy/.secrets/tunnel.json`. Both are gitignored and excluded
from deployment archives. Only `/healthz` is unauthenticated.

No API credentials or internal reference information were included. This remains
a protected evaluation/development baseline; see `docs/DEVELOTYPE-LAYERS.md` for
data intake and upstream asset licensing limitations.

## Build, deploy, verify

Use Node 24.15.0 (local Homebrew `node@24`):
Set `GODSEYE_PROXMOX_HOST` to the existing authenticated Proxmox SSH destination.

```sh
npm ci
npm run build
npm test
python3 deploy/deploy.py
node deploy/verify.mjs
```

The test suite needs local socket access. The browser verifier uses Puppeteer and
reads credentials internally without printing them. `verification.json` records
HTTP/browser checks; screenshots are in the gitignored `screenshots/` directory.

`bootstrap.sh` is the initial container setup, already run through Proxmox. It
checks hostname, installs a checksummed Node release and signed Cloudflare package,
and creates dedicated unprivileged service accounts. No direct container SSH is
required; administer through `pct exec 110 -- ...` on Proxmox.

`deploy.py` checks container identity, uploads a new release, installs locked Linux
dependencies, validates nginx/tunnel config, and switches `/srv/godseye/current`.
It checks authenticated origin HTML and restores the previous app release if
activation fails. On a failed first release, it stops the app and tunnel. Config
changes are not automatically rolled back; review them separately. Old releases
remain under `/srv/godseye/releases/`. `last-release.json` records activation.

After deployment, verify public authentication and browser rendering. Healthz
alone does not prove the globe or upstream feeds are working. No backup schedule
was added; the baseline is reconstructible from the fork and private tunnel file.

## Local development

`npm run dev` starts the upstream local interface. Keep `origin` pointed at the
Develotype fork and `upstream` at Bilawal Sidhu's repository. Work on feature
branches and retain upstream attribution. Private data and secrets do not belong
in this public fork.
