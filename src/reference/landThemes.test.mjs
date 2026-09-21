import test from 'node:test';
import assert from 'node:assert/strict';
import {parcelTheme} from './landThemes.js';
import {densityOptions,wellDensity,densityCache} from '../../server/providers/wellDensity.js';
import {densityColor} from './densityModel.js';
test('ownership themes preserve missing and partial names without merging unknown parties',()=>{
 assert.equal(parcelTheme({id:1,ownership:[]},'research').research,'unknown');
 const named={key:'SMITH',roles:['upstream'],reviewed:false};
 assert.equal(parcelTheme({ownership:[named]},'research').research,'candidate');
 const mixed=parcelTheme({ownership:[named,{key:'OWNER NOT SUPPLIED'}]},'research');
 assert.equal(mixed.research,'partial');assert.equal(mixed.dashed,true);
 assert.equal(parcelTheme({ownership:[{...named,reviewed:true}]},'research').research,'reviewed');
 assert.equal(parcelTheme({ownership:[{...named,roles:[]}]},'class').role,'unclassified');
 assert.equal(parcelTheme({ownership:[named,{key:'OTHER',roles:['midstream'],reviewed:true}]},'class').role,'mixed');
});
test('density resolution is explicit and bounded; color scale is stable across viewports',()=>{
 assert.deepEqual(densityOptions(new URLSearchParams()),{view:'auto',cellKm:25});
 for(const q of ['cellKm=0','cellKm=NaN','cellKm=1','view=pressure'])assert.throws(()=>densityOptions(new URLSearchParams(q)));
 assert.equal(densityColor(1),densityColor(4));assert.notEqual(densityColor(.01),densityColor(5));
});
test('density query uses full fixed equal-area cells, bound category values and an area denominator',async()=>{
 let call;
 await wellDensity(async(sql,args)=>{call={sql,args};return{rows:[]};},[-180,-80,180,80],"Oil'",25);
 assert.deepEqual(call.args,[-107,25,-93,37,"Oil'",25000]);
 assert.match(call.sql,/5070/);assert.match(call.sql,/floor\(ST_X\(p.g\)\/\$6\)/);assert.match(call.sql,/\$6\*\$6\/1000000/);assert.ok(!call.sql.includes("Oil'"));
 assert.deepEqual(await wellDensity(()=>{throw Error('Outside coverage must not query');},[0,0,5,5],'',25),[]);
});

test('density cache reuses full cells across pans, coalesces calls and invalidates on import',async()=>{
 let version='1', builds=0;
 const cached=densityCache(async(sql,args)=>{
   if(sql.includes('AS version'))return {rows:[{version}]};
   builds++;assert.equal(args[6],version);
   assert.deepEqual(args.slice(0,4),[-107,25,-93,37]);
   return {rows:[{west:-103,east:-102,south:31,north:32,count:100}]};
 });
 const [a,b]=await Promise.all([cached([-104,30,-102.5,33],'',25),cached([-102.5,31,-101,32],'',25)]);
 assert.equal(builds,1);assert.equal(a[0].count,b[0].count);
 assert.deepEqual(await cached([-100,31,-99,32],'',25),[]);
 version='2';await cached([-104,30,-101,33],'',25);assert.equal(builds,2);
});
