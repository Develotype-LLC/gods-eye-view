#!/usr/bin/env python3
"""Import an audited source packet and the existing RRC SQLite archive atomically."""
import argparse, hashlib, json, sqlite3
from pathlib import Path
import psycopg2
from psycopg2.extras import execute_values, Json as PgJson

def Json(value): return PgJson(value, dumps=lambda v:json.dumps(v,ensure_ascii=False,allow_nan=False))

def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()

def main():
    ap=argparse.ArgumentParser();ap.add_argument('directory',type=Path);ap.add_argument('--rrc',type=Path,required=True);args=ap.parse_args()
    files=[p for p in sorted(args.directory.glob('*.json')) if p.name not in ('manifest.json',) and 'features' in json.loads(p.read_text()) and 'id' in json.loads(p.read_text())]
    manifest={'files':[{'file':p.name,'sha256':sha(p)} for p in files],'rrc':{'file':str(args.rrc),'sha256':sha(args.rrc)}}
    conn=psycopg2.connect(dbname='landman',user='postgres');conn.set_client_encoding('UTF8')
    with conn,conn.cursor() as cur:
        cur.execute('SELECT pg_try_advisory_xact_lock(492812)');assert cur.fetchone()[0]
        cur.execute('INSERT INTO landman.reference_run(manifest) VALUES(%s) RETURNING id',(Json(manifest),));run=cur.fetchone()[0]
        for path in files:
            d=json.loads(path.read_text());key=d['id'];features=d['features']
            values=[(run,key,f['key'],f['name'],f.get('api8'),f.get('date'),json.dumps(f['geometry']) if f.get('geometry') else None,Json(f['properties'])) for f in features]
            if values:execute_values(cur,'INSERT INTO landman.reference_feature(run_id,dataset,key,name,api8,observed_date,geom,properties) VALUES %s',values,template='(%s,%s,%s,%s,%s,%s,ST_SetSRID(ST_GeomFromGeoJSON(%s),4326),%s)',page_size=500)
            obs=d['observations'];values=[(run,key,o['key'],o['period'],o['kind'],o.get('value'),Json(o['raw'])) for o in obs]
            if values:execute_values(cur,'INSERT INTO landman.reference_observation(run_id,dataset,feature_key,period,kind,value,raw) VALUES %s',values,page_size=1000)
            cur.execute('SELECT count(*),count(geom),count(*) FILTER (WHERE geom IS NOT NULL AND NOT ST_IsValid(geom)) FROM landman.reference_feature WHERE run_id=%s AND dataset=%s',(run,key));n,located,invalid=cur.fetchone();assert n==len(features) and invalid==0,(key,n,invalid)
            metadata={k:v for k,v in d.items() if k not in ('features','observations')}
            activate(cur,key,run,d['name'],d['source'],d['note'],n,located,len(obs),metadata)
            print(key,n,located,len(obs),flush=True)
        db=sqlite3.connect(args.rrc.resolve().as_uri()+'?mode=ro',uri=True);db.row_factory=sqlite3.Row
        kinds=['operator','plug_action','iwar_record','iwar_well','iwar_well_operator','iwar_well_denial_code','permian_current_well_status','permian_operator_county_year','w10_test','g10_test','source_manifest','derived_artifact','derived_artifact_source','schema_metadata','annual_legal_operator_ranking','operator_group_membership','ewa_exxon_family_candidate','ewa_operator_snapshot','well_location']
        counts={}
        for kind in kinds:
            cursor=db.execute('SELECT * FROM "'+kind+'"');n=0
            while True:
                rows=cursor.fetchmany(1000)
                if not rows:break
                values=[]
                for r in rows:
                    raw=dict(r);n+=1;api=raw.get('api8');join=str(raw.get('lease_number') or raw.get('gas_well_id') or raw.get('operator_number') or '')
                    values.append((run,kind,n,api,join,Json(raw)))
                execute_values(cur,'INSERT INTO landman.rrc_record(run_id,kind,record_id,api8,join_key,raw) VALUES %s',values,page_size=1000)
            counts[kind]=n;print('RRC',kind,n,flush=True)
        # Take one dated GIS location per API without implying it is unique. Record multiplicity.
        cur.execute("CREATE TEMP TABLE reference_api_locations ON COMMIT DROP AS SELECT DISTINCT ON(api8) api8,geom,count(*) OVER(PARTITION BY api8) AS location_count FROM landman.well_location WHERE run_id=(SELECT run_id FROM landman.dataset WHERE name='gis') AND api8 IS NOT NULL ORDER BY api8,objectid")
        cur.execute('CREATE INDEX ON reference_api_locations(api8)')
        for key,kind,name,note in [
            ('rrc-inactive','iwar_well','RRC inactive wells · August 2026','August 10, 2026 inactive inventory, not current live status. Locations joined by API-8 to the newer statewide GIS; where multiple locations exist the first is displayed.'),
            ('rrc-plugging','plug_action','RRC plugging history · 2015–2026','Physical plugging actions, 2015–2026 partial year. One marker per API; actions are not distinct wells. Joined to newer GIS by API-8; first of multiple locations shown.')]:
            cur.execute("""INSERT INTO landman.reference_feature(run_id,dataset,key,name,api8,observed_date,geom,properties)
            SELECT %s,%s,r.api8,'API-8 '||r.api8,r.api8,NULL,l.geom,
              jsonb_build_object('api8',r.api8,'record_count',count(*),'gis_location_count',max(l.location_count),'location_basis','API-8 join to current imported RRC GIS; first location')
            FROM landman.rrc_record r LEFT JOIN reference_api_locations l ON l.api8=r.api8
            WHERE r.run_id=%s AND r.kind=%s AND r.api8 IS NOT NULL GROUP BY r.api8,l.geom""",(run,key,run,kind))
            cur.execute('SELECT count(*),count(geom) FROM landman.reference_feature WHERE run_id=%s AND dataset=%s',(run,key));n,located=cur.fetchone()
            activate(cur,key,run,name,'Local RRC source-faithful SQLite archive',note,n,located,counts[kind],{'rrc_kind':kind,'archive':manifest['rrc'],'counts':counts})
        activate(cur,'rrc-records',run,'RRC downloaded record archive','Texas RRC · local source archive','Source-faithful records. W-10/G-10 daily test rates are not annual production; operator/county/year production is not per-well. Search tests by source lease or gas-well ID, not API.',0,0,sum(counts.values()),{'counts':counts,'archive':manifest['rrc']})
        # Transaction activates all collections together only after count reconciliation.
    print('Activated reference run',run,flush=True)

def activate(cur,key,run,name,source,note,n,located,obs,metadata):
    cur.execute('''INSERT INTO landman.reference_dataset(id,run_id,name,source,note,feature_count,located_count,observation_count,metadata) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)
    ON CONFLICT(id) DO UPDATE SET run_id=excluded.run_id,name=excluded.name,source=excluded.source,note=excluded.note,feature_count=excluded.feature_count,located_count=excluded.located_count,observation_count=excluded.observation_count,metadata=excluded.metadata''',(key,run,name,source,note,n,located,obs,Json(metadata)))
if __name__=='__main__':main()
