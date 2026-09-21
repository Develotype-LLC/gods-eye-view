import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTexasBox,texasProxy} from '../../server/providers/texas.js';
function fixture(query){let handle;texasProxy({pool:{query}}).configureServer({middlewares:{use(path,fn){assert.equal(path,'/api/reference/texas');handle=fn;}}});return async(url,method='GET')=>{let status,body;await handle({url,method},{set statusCode(v){status=v;},setHeader(){},end(v){body=JSON.parse(v);}});return{status,body};};}
test('viewport bounds reject malformed, wrapping and nonfinite inputs',()=>{
 assert.deepEqual(parseTexasBox('-107,25,-93,37'),[-107,25,-93,37]);
 for(const input of ['', 'a,25,-93,37','-107,25,-93,91','-93,25,-107,37','-107,37,-93,25'])assert.throws(()=>parseTexasBox(input));
});
test('large viewport returns aggregated cells and binds filter text as a SQL parameter',async()=>{
 const calls=[];const request=fixture(async(sql,args)=>{calls.push({sql,args});return {rows:sql.includes('count(*)::int AS count FROM')?[{count:1000000}]:[{count:1000000,longitude:-100,latitude:31}]};});
 const response=await request('/viewport?bbox=-107,25,-93,37&category=Oil%27');assert.equal(response.status,200);assert.equal(response.body.mode,'clusters');assert.equal(response.body.features.length,1);assert.equal(calls[0].args[4],"Oil'");assert.ok(!calls[0].sql.includes("Oil'"));
});
test('small viewport returns bounded points and invalid lookups never reach the database',async()=>{
 const calls=[];const request=fixture(async(sql,args)=>{calls.push(sql);return{rows:sql.includes('count(*)')?[{count:1}]:[{id:'1',api8:'10300256'}]};});
 assert.equal((await request('/viewport?bbox=-103,31,-102,32')).body.mode,'points');assert.ok(calls[1].includes('LIMIT 1500'));
 const before=calls.length;assert.equal((await request('/well?api=bad')).status,400);assert.equal(calls.length,before);assert.equal((await request('/status','POST')).status,405);
});
