#!/usr/bin/env python3
import csv,gzip,hashlib,io,json,re,sys,unicodedata
from pathlib import Path
import psycopg2
from psycopg2.extras import Json as PgJson

def Json(value):return PgJson(value,dumps=lambda x:json.dumps(x,ensure_ascii=False))

def norm(value):return ' '.join(re.sub(r'[^\w\s]',' ',unicodedata.normalize('NFKC',value or '').upper()).split())
root=Path(sys.argv[1]);conn=psycopg2.connect(dbname='landman',user='postgres')
conn.set_client_encoding('UTF8')
manifest=json.load(open(root/'manifest.json'));seeds=json.load(open(root/'entity-seeds.json'));sources={x['id']:x for x in seeds['sources']}
with conn,conn.cursor() as cur:
 cur.execute('SELECT pg_advisory_xact_lock(492813)')
 for k,g in json.load(open(root/'basins.json')).items():cur.execute('INSERT INTO landman.land_basin VALUES(%s,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s),4326))) ON CONFLICT(id) DO NOTHING',(k,json.dumps(g)))
 for county in manifest:
  sid=county['fips']+':'+county['sha256'];cur.execute('SELECT 1 FROM landman.land_snapshot WHERE id=%s',(sid,))
  if cur.fetchone():continue
  cur.execute('INSERT INTO landman.land_snapshot(id,fips,metadata) VALUES(%s,%s,%s)',(sid,county['fips'],Json({k:v for k,v in county.items() if k!='geometry'})))
  cur.execute('CREATE TEMP TABLE lp(fips text,key text,wkb text,basins jsonb) ON COMMIT DROP')
  with gzip.open(root/(county['fips']+'-parcels.csv.gz'),'rt') as f:cur.copy_expert('COPY lp FROM STDIN CSV',f)
  cur.execute("INSERT INTO landman.land_parcel(snapshot_id,source_key,geom,basins,area_acres) SELECT %s,key,g,ARRAY(SELECT jsonb_array_elements_text(basins)),ST_Area(g::geography)/4046.8564224 FROM (SELECT *,ST_Force2D(ST_SetSRID(ST_GeomFromWKB(decode(wkb,'hex')),4326)) AS g FROM lp) q",(sid,))
  cur.execute('DROP TABLE lp');cur.execute('CREATE TEMP TABLE la(fips text,key text,parcel_key text,raw_owner text,owner_key text,properties jsonb) ON COMMIT DROP')
  with gzip.open(root/(county['fips']+'-accounts.csv.gz'),'rt') as f:cur.copy_expert('COPY la FROM STDIN CSV',f)
  cur.execute("UPDATE la SET owner_key='OWNER NOT SUPPLIED', raw_owner=COALESCE(raw_owner,'Owner not supplied') WHERE owner_key IS NULL OR btrim(owner_key)=''")
  cur.execute('ANALYZE la');cur.execute('ANALYZE landman.land_parcel')
  cur.execute('INSERT INTO landman.land_owner(owner_key,name) SELECT owner_key,min(raw_owner) FROM la GROUP BY owner_key ON CONFLICT DO NOTHING')
  cur.execute('ANALYZE landman.land_owner')
  cur.execute('INSERT INTO landman.land_account SELECT p.id,a.key,a.owner_key,a.raw_owner,a.properties FROM la a JOIN landman.land_parcel p ON p.snapshot_id=%s AND p.source_key=a.parcel_key',(sid,))
  cur.execute('DROP TABLE la')
  cur.execute('SELECT count(*),count(*) FILTER(WHERE NOT ST_IsValid(geom)) FROM landman.land_parcel WHERE snapshot_id=%s',(sid,));n,invalid=cur.fetchone();assert n==county['parcels'] and invalid==0
  cur.execute('INSERT INTO landman.land_county VALUES(%s,%s,%s,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s),4326))) ON CONFLICT(fips) DO UPDATE SET snapshot_id=excluded.snapshot_id,geom=excluded.geom',(county['fips'],county['county'],sid,json.dumps(county['geometry'])))
  print(county['county'],n,flush=True)
 for e in seeds['entities']:
  category=e['category'].lower();roles=[]
  for label,token in [('upstream','upstream'),('midstream','midstream'),('holdco','holdco'),('minerals','mineral'),('minerals','royalt')]:
   if token in category and label not in roles:roles.append(label)
  candidate={k:e.get(k) for k in ['id','rawLegalName','family','jurisdiction','relationshipType','relationshipAsOf','reviewStatus']}
  candidate['sources']=[{k:sources[s].get(k) for k in ['title','url','sourceDate','locator','limitations']} for s in e['sourceIDs'] if s in sources]
  for name in [e['rawLegalName']]+[a for a in e.get('aliases',[]) if isinstance(a,str)]:
   cur.execute('UPDATE landman.land_owner SET candidate_roles=ARRAY(SELECT DISTINCT unnest(candidate_roles || %s::text[])), candidates=candidates || %s::jsonb WHERE owner_key=%s AND NOT candidates @> %s::jsonb',(roles,Json([candidate]),norm(name),Json([{'id':e['id']}])) )
 cur.execute('ANALYZE landman.land_parcel');cur.execute('ANALYZE landman.land_account');cur.execute('ANALYZE landman.land_owner')
print('Committed parcel intake',flush=True)
