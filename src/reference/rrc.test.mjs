import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildRrcSnapshot} from '../../server/providers/rrc-data.js';
import {rrcProxy} from '../../server/providers/rrc.js';
const permit=(uic='000000001',api='10300001')=>({uic_number:uic,api_no:api,latitude_nad83:'31.4',longitude_nad83:'-102.6',uic_type_injection:'1',w14_date:'2001-01-01'});
const record=(uic='000000001',month='2020-01',bbl='100',psi='50')=>({uic_no:uic,formatted_date:month+'-01T00:00:00',vol_liq:bbl,inj_press_avg:psi,inj_press_max:psi,type_uic:'1'});
const date='2026-09-20T00:00:00Z';
test('UIC aggregation excludes waterflood and placeholders, weights pressure and preserves internal zero',()=>{
 const data=buildRrcSnapshot([permit(),permit('000000002'),permit('000000003','10300000')],[record(),record('000000002','2020-01','300','100'),{...record(),type_uic:'3'},record('000000001','2020-02','0','0'),record('000000001','2020-03','100','0'),record('000000001','2020-04','0','0')],date);
 assert.equal(data.wellCount,1);assert.equal(data.audit.excludedPermits,1);
 assert.equal(data.wells[0].history[0].bbl,400);assert.equal(data.wells[0].history[0].avgPsi,87.5);
 assert.equal(data.wells[0].history[1].bbl,0);assert.equal(data.wells[0].history[1].avgPsi,null);assert.equal(data.wells[0].history[2].avgPsi,null);
 assert.equal(data.period[1],'2020-03');assert.equal(data.audit.trimmedTrailingZeroMonths,1);
});
test('blank volumes do not turn into zero; duplicate and negative rows fail',()=>{
 const data=buildRrcSnapshot([permit()],[record(),record('000000001','2020-02','')],date);
 assert.equal(data.audit.missingVolumeRows,1);assert.equal(data.recordCount,1);
 assert.throws(()=>buildRrcSnapshot([permit()],[record(),record()],date),/Duplicate/);
 assert.throws(()=>buildRrcSnapshot([permit()],[record('000000001','2020-01','-1')],date),/Negative/);
});
function mount(plugin){let handler;plugin.configureServer({middlewares:{use(p,fn){assert.equal(p,'/api/reference/rrc/injection');handler=fn;}}});return handler;}
async function request(handler,url='/',method='GET'){let code,body;await handler({url,method},{set statusCode(v){code=v;},setHeader(){},end(v){body=JSON.parse(v);}});return {code,body};}
test('fixed source is coalesced, persisted, reused across restart, and explicitly stale after failure',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'rrc-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));const cachePath=path.join(dir,'cache.json');let calls=0,clock=Date.parse(date);
 const fetchImpl=async url=>{calls++;const u=new URL(url);assert.equal(u.hostname,'data.texas.gov');return new Response(JSON.stringify(u.pathname.includes('givw')?[permit()]:[record()]));};
 const handler=mount(rrcProxy({cachePath,fetchImpl,now:()=>clock}));const result=await Promise.all([request(handler),request(handler)]);assert.equal(calls,2);assert.equal(result[0].body.sourceMode,'rrc-api');assert.equal(JSON.parse(await readFile(cachePath)).wellCount,1);
 assert.equal((await request(handler,'/?bbox=anything')).code,400);assert.equal((await request(handler,'/','POST')).code,405);
 const restart=mount(rrcProxy({cachePath,now:()=>clock,fetchImpl:async()=>{throw new Error('offline');}}));assert.equal((await request(restart)).body.connection.state,'cached');
 clock+=7*60*60_000;const stale=await request(restart);assert.equal(stale.body.connection.state,'stale');assert.equal(stale.body.sourceRetrievedAt,new Date(date).toISOString());
});

test('first-run failure serves an explicitly labeled archive and backs off repeated fetches',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'rrc-fallback-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const fallbackPath=path.join(dir,'archive.json');await writeFile(fallbackPath,JSON.stringify(buildRrcSnapshot([permit()],[record()],date)));
 let calls=0;const handler=mount(rrcProxy({cachePath:path.join(dir,'missing.json'),fallbackPath,fetchImpl:async()=>{calls++;throw new Error('offline');}}));
 const first=await request(handler);assert.equal(first.code,200);assert.equal(first.body.sourceMode,'archive-fallback');assert.equal(first.body.connection.state,'fallback');
 await request(handler);assert.equal(calls,1);
});
