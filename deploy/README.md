# Godseye deployment

- Fork: https://github.com/Develotype-LLC/gods-eye-view
- Upstream: https://github.com/bilawalsidhu/gods-eye-view
- Landman login: https://landman.develotype.com (defaults to the Landman workspace).
- Original URL: https://godseye.develotype.com
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
generated password is in local mode-600 `deploy/.secrets/viewer.json`. Dia uses username `dia`, with a separate generated password in mode-600 `deploy/.secrets/viewers/dia.json` and the local handoff file `deploy/.secrets/dia-login.txt`. Deployment upserts these users without truncating the password file. Both accounts access the same application and datasets; this is not per-user data isolation. Tunnel
credentials are in `deploy/.secrets/tunnel.json`. Both are gitignored and excluded
from deployment archives. Only `/healthz` is unauthenticated.

No internal reference information is included. This remains
a protected evaluation/development baseline; see `docs/DEVELOTYPE-LAYERS.md` for
data intake and upstream asset licensing limitations.

## Google 3D and search

Google project `develotype-godseye` supplies Photorealistic 3D Tiles and geocoding.
The gitignored mode-600 `.env` contains `GOOGLE_MAPS_API_KEY`, restricted to Map
Tiles and the hosted/local website referrers. Vite embeds this browser key during
build; it is intentionally visible to authenticated users and restricted at Google.

`GOOGLE_GEOCODING_API_KEY` is a separate server-only key restricted to Geocoding
and the container's public outbound IPv4. Deployment writes only this key into
root-owned mode-600 `/etc/godseye.env`; systemd loads it into the app. If the site's
outbound public IP changes, update this key's restriction. The browser routes
forward/reverse Google geocoding through authenticated `/api/google/geocode`.
This avoids Google's rejection of referrer-restricted keys for geocoding.

Initial quotas: 20 Google 3D root requests/day and 100 legacy geocoding
requests/day. Unused 2D/Street View tile and geocoding-v4 daily quotas are zero.
A $10 monthly project budget alerts billing account recipients at 50%, 90%, and
100%; this is an alert, not a spending cap. Optional Places, Street View, Cesium
ion, and OpenAI integrations are not configured.

Run `VERIFY_GOOGLE_3D=1 node deploy/verify.mjs` to check live geocoding, successful
Google tile responses, completed tile rendering, and authentication. Credentials
and request query strings are excluded from its diagnostic output.

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

The Landman hostname defaults to the Landman workspace even with a saved console preference or a shared-map hash. An explicit `?view=console` still allows switching to Full console. Both hostnames route through the existing tunnel and nginx authentication. Google Maps browser-key referrers include both HTTPS hostnames.

## Antony access · 2026-09-21

Antony uses `antony` at https://landman.develotype.com. His generated credentials
are stored in mode-600 `deploy/.secrets/viewers/antony.json` and the private handoff
file `deploy/.secrets/antony-login.txt`; deployment preserves this account through
the existing viewer upsert. The public-data map and existing land/pipeline tools
are shared application features. No private owner-relationship project membership
has been granted to Antony. Private owner-workspace authorization is separate from
the basic site login and is enforced per project.

The non-secret user guide is [Antony getting started](../docs/reference/ANTONY-GETTING-STARTED.md).
