import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {readResponseJsonCapped} from './common/http.js';
import {defaultSourceRoot} from './common/source-root.js';
import {buildRrcSnapshot,RRC_DATASETS} from './rrc-data.js';
import {validateInjection} from '../../src/reference/injectionModel.js';
const TTL=6*60*60_000;
export function rrcProxy({fetchImpl=(...args)=>fetch(...args),now=()=>Date.now(),cachePath=process.env.LANDMAN_RRC_CACHE||path.join(defaultSourceRoot,'.gev-cache/rrc-injection.json'),fallbackPath=path.join(defaultSourceRoot,'dist/reference-data/heavenwatch/injection.json')}={}){
 let cache,loaded=false,pending,retryAt=0;
 async function rows(dataset,where,order,signal){
  const all=[];
  for(let offset=0;offset<50_000;offset+=5000){
   const url=new URL(`https://data.texas.gov/resource/${dataset}.json`);
   url.search=new URLSearchParams({'$where':where,'$limit':'5000','$offset':String(offset),'$order':order});
   const response=await fetchImpl(url.toString(),{signal,redirect:'error',headers:{Accept:'application/json'}});
   if(!response.ok){await response.body?.cancel();throw new Error('RRC request failed');}
   const batch=await readResponseJsonCapped(response,12*1024*1024);if(!Array.isArray(batch))throw new Error('Invalid RRC response');
   all.push(...batch);if(batch.length<5000)return all;
  }throw new Error('RRC page budget exceeded');
 }
 async function refresh(){
  if(pending)return pending;
  pending=(async()=>{
   const signal=AbortSignal.timeout(50_000);
   const masters=await rows(RRC_DATASETS.wells,'latitude_nad83 between 31.3 and 31.6 AND longitude_nad83 between -102.85 and -102.45 AND uic_type_injection in (1,2)','uic_number',signal);
   if(masters.length>2000)throw new Error('RRC pilot permit limit exceeded');
   const uics=[...new Set(masters.map(r=>r.uic_number))];if(uics.some(u=>!/^\d{9}$/.test(u)))throw new Error('Invalid UIC identifier');
   const volumes=[];
   for(let i=0;i<uics.length;i+=50){
    const clause=uics.slice(i,i+50).map(u=>`'${u}'`).join(',');
    volumes.push(...await rows(RRC_DATASETS.history,`uic_no in(${clause}) AND formatted_date >= '2016-01-01' AND type_uic in (1,2)`,'uic_no,formatted_date,id',signal));
    if(volumes.length>100_000)throw new Error('RRC history limit exceeded');
   }
   const result=validateInjection(buildRrcSnapshot(masters,volumes,new Date(now()).toISOString()));
   await mkdir(path.dirname(cachePath),{recursive:true});await writeFile(cachePath+'.tmp',JSON.stringify(result),{mode:0o600});await rename(cachePath+'.tmp',cachePath);cache=result;return result;
  })().catch(error=>{retryAt=now()+5*60_000;throw error;}).finally(()=>{pending=null;});return pending;
 }
 async function get(){
  if(!loaded){loaded=true;try{const stored=validateInjection(JSON.parse(await readFile(cachePath,'utf8')));if(stored.sourceMode==='rrc-api'&&Number.isFinite(Date.parse(stored.sourceRetrievedAt)))cache=stored;}catch{}}
  if(cache && now()-Date.parse(cache.sourceRetrievedAt)<TTL)return {...cache,connection:{state:'cached',cacheHours:6}};
  try{if(now()<retryAt)throw new Error('Backoff');return {...await refresh(),connection:{state:'refreshed',cacheHours:6}};}
  catch{
   if(cache)return {...cache,connection:{state:'stale',warning:'Texas RRC refresh failed; showing the previous cached records.'}};
   const fallback=validateInjection(JSON.parse(await readFile(fallbackPath,'utf8')));return {...fallback,sourceMode:'archive-fallback',connection:{state:'fallback',warning:'Texas RRC is unavailable; showing the bundled HeavenWatch archive.'}};
  }
 }
 function install(server){server.middlewares.use('/api/reference/rrc/injection',async(req,res)=>{
  const reply=(code,body)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));};
  if(req.method!=='GET')return reply(405,{error:'Method not allowed'});
  if(new URL(req.url||'/','http://localhost').search)return reply(400,{error:'The RRC endpoint serves the fixed pilot area only'});
  try{return reply(200,await get());}catch{return reply(503,{error:'Texas RRC and the local fallback are unavailable'});}
 });}
 return {name:'landman-rrc',configureServer:install,configurePreviewServer:install};
}
