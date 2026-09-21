#!/usr/bin/env python3
import os,subprocess,tarfile,datetime
from pathlib import Path
root=Path(__file__).resolve().parents[1];host=os.environ['GODSEYE_PROXMOX_HOST'];assert not host.startswith('-')
ssh=['ssh','-o','BatchMode=yes','-o','ForwardAgent=no','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10',host]
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');target='/var/lib/godseye/imports/land-'+stamp
archive=root/'.gev-cache/land-intake.tar.gz'
with tarfile.open(archive,'w:gz') as t:
 t.add(root/'.gev-cache/land-intake/packet',arcname='packet');t.add(root/'scripts/import-land-parcels.py',arcname='import.py');t.add(root/'deploy/database/land.sql',arcname='schema.sql')
def run(s,**kw):return subprocess.run(ssh+[s],check=True,**kw)
run('pct exec 110 -- mkdir -p '+target)
with archive.open('rb') as f:run('pct exec 110 -- tar -xzf - --no-same-owner -C '+target,stdin=f)
run('pct exec 110 -- chown -R postgres:postgres '+target)
run('pct exec 110 -- chmod 700 '+target)
run('pct exec 110 -- runuser -u postgres -- pg_dump -Fc -f /var/lib/postgresql/landman-backups/pre-land-'+stamp+'.dump landman')
run('pct exec 110 -- runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d landman -f '+target+'/schema.sql')
run('pct exec 110 -- runuser -u postgres -- python3 '+target+'/import.py '+target+'/packet')
print('Imported '+target,flush=True)
