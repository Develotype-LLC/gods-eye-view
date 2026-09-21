import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceRecordsProxy} from '../../server/providers/reference-records.js';
function fixture(query){let handle;referenceRecordsProxy({pool:{query}}).configureServer({middlewares:{use(path,fn){assert.equal(path,'/api/reference/records');handle=fn;}}});return async(url,method='GET')=>{let status,body;await handle({url,method},{set statusCode(v){status=v;},setHeader(){},end(v){body=JSON.parse(v);}});return{status,body};};}
const dataset={id:'openet',run_id:3,metadata:{}};
test('invalid archive types and API identifiers cannot become SQL',async()=>{
 const request=fixture(()=>{throw new Error('Should not query');});
 for(const url of ['/rrc?kind=secret_table','/rrc?api=10300256%27','/rrc?offset=-1','/rrc?key=%27%3B','/viewport?dataset=bad%27'])assert.equal((await request(url)).status,400);
 assert.equal((await request('/catalog','POST')).status,405);
});
test('ET period and measurement are bound and feature payload is bounded',async()=>{
 const calls=[];const request=fixture(async(sql,args)=>{calls.push({sql,args});return{rows:sql.startsWith('SELECT *')?[dataset]:sql.includes('count(*)::int AS n')?[{n:42}]:[]};});
 const response=await request('/viewport?dataset=openet&bbox=-102,33,-101,34&period=2018-07&kind=ETo');assert.equal(response.status,200);assert.equal(response.body.mode,'features');assert.equal(calls[1].args[6],'2018-07');assert.equal(calls[1].args[7],'ETo');assert.ok(calls[2].sql.includes('LIMIT 1000'));assert.ok(!calls[2].sql.includes('2018-07'));
});
test('large source layers use count-preserving clusters instead of truncating records',async()=>{
 const request=fixture(async(sql)=>({rows:sql.startsWith('SELECT *')?[{...dataset,id:'texnet-seismic'}]:sql.includes('count(*)::int AS n')?[{n:50000}]:[{count:50000,longitude:-102,latitude:32}]}));
 const response=await request('/viewport?dataset=texnet-seismic&bbox=-110,25,-90,37');assert.equal(response.status,200);assert.equal(response.body.mode,'clusters');assert.equal(response.body.count,50000);assert.equal(response.body.features[0].count,50000);
});
test('RRC tests keep source-key lookup separate from API lookup and retain pagination',async()=>{
 const calls=[];const request=fixture(async(sql,args)=>{calls.push({sql,args});return{rows:sql.startsWith('SELECT *')?[{...dataset,id:'rrc-records'}]:sql.includes('count(*)')?[{n:250}]:[]};});
 const response=await request('/rrc?kind=w10_test&key=000123&offset=50');assert.equal(response.status,200);assert.equal(response.body.total,250);assert.equal(calls[1].args[2],'');assert.equal(calls[1].args[3],'000123');assert.equal(calls[2].args[4],50);assert.ok(calls[2].sql.includes('LIMIT 50'));
});
test('point inspection uses source geometry, retained period filters and bounded nearest facts',async()=>{
 const calls=[];const request=fixture(async(sql,args)=>{calls.push({sql,args});return{rows:sql.startsWith('SELECT *')?[dataset]:sql.includes('count(*)::int AS n')?[{n:9}]:[{key:'field-1',contains_point:true,value:55,distance_m:0}]};});
 const r=await request('/inspect?dataset=openet&longitude=-102&latitude=33&radius=500&period=2018-07&kind=ETo');assert.equal(r.status,200);assert.equal(r.body.total,9);assert.equal(r.body.features[0].contains_point,true);assert.deepEqual(calls[1].args,[-102,33,500,3,'openet','2018-07','ETo']);assert.match(calls[2].sql,/ST_Covers/);assert.match(calls[2].sql,/LIMIT 5/);assert.match(calls[1].sql,/ST_DWithin/);
 const before=calls.length;assert.equal((await request('/inspect?dataset=openet&longitude=-102&latitude=33&radius=90000')).status,400);assert.equal(calls.length,before);
});
