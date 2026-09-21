#!/usr/bin/env python3
"""Transfer the audited intake to CT110 and run its transactional loader."""
import os, subprocess, tarfile, datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
host=os.environ['GODSEYE_PROXMOX_HOST'];assert not host.startswith('-')
ssh=['ssh','-o','BatchMode=yes','-o','ForwardAgent=no','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10',host]
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
target='/var/lib/godseye/imports/reference-'+stamp
archive=ROOT/'.gev-cache/reference-intake.tar.gz'
with tarfile.open(archive,'w:gz') as t:
 t.add(ROOT/'.gev-cache/reference-intake',arcname='packet')
 t.add('/Users/brian/uplabs/xon/recursivewater/datapack/rrc_texas.sqlite',arcname='rrc_texas.sqlite')
 t.add(ROOT/'scripts/import-reference-records.py',arcname='import.py')
 t.add(ROOT/'deploy/database/reference-records.sql',arcname='schema.sql')
def run(command,**kwargs):return subprocess.run(ssh+[command],check=True,**kwargs)
run('pct exec 110 -- mkdir -p '+target)
with archive.open('rb') as f:run('pct exec 110 -- tar -xzf - --no-same-owner -C '+target,stdin=f)
run('pct exec 110 -- chown -R postgres:postgres '+target)
run('pct exec 110 -- chmod 700 '+target)
run('pct exec 110 -- runuser -u postgres -- pg_dump -Fc -f /var/lib/postgresql/landman-backups/pre-reference-'+stamp+'.dump landman')
run('pct exec 110 -- runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d landman -f '+target+'/schema.sql')
run('pct exec 110 -- runuser -u postgres -- python3 '+target+'/import.py '+target+'/packet --rrc '+target+'/rrc_texas.sqlite')
print('Imported source packet at '+target,flush=True)
