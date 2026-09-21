import * as Cesium from 'cesium';
const TEXAS=[-106.7,25.7,-93.4,36.6];
export function createTexasLayer(){
 let viewer,source,enabled=false,generation=0,request,status,detail=null,history=null,category='',result=null,error=null,loading=false,removeMove;
 const listeners=new Set(),picks=new Map();
 const notify=()=>{for(const fn of listeners)fn();};
 async function get(path,signal){const r=await fetch('/api/reference/texas/'+path,{signal});const d=await r.json();if(!r.ok)throw new Error(d.error||'Texas data unavailable');return d;}
 async function readStatus(){status=await get('status');if(!status.datasets.some(d=>d.name==='gis'))throw new Error('Statewide GIS import is not ready');return status;}
 function bounds(){const r=viewer.camera.computeViewRectangle();if(!r)return TEXAS;const b=[r.west,r.south,r.east,r.north].map(Cesium.Math.toDegrees);if(b[0]>=b[2])return TEXAS;return b;}
 async function refresh(){
  if(!enabled)return;const intent=++generation;request?.abort();request=new AbortController();loading=true;error=null;notify();
  try{
   const data=await get('viewport?'+new URLSearchParams({bbox:bounds().join(','),category}),request.signal);
   if(!enabled||intent!==generation)return;
   result=data;source.entities.removeAll();picks.clear();
   data.features.forEach((feature,i)=>{
    const id=`texas:${i}`;picks.set(id,feature);const cluster=data.mode==='clusters';
    source.entities.add({id,position:Cesium.Cartesian3.fromDegrees(feature.longitude,feature.latitude),
      point:{pixelSize:cluster?Math.min(34,12+Math.log10(feature.count+1)*5):9,color:Cesium.Color.fromCssColorString(cluster?'#4eada2':'#f5c976'),outlineColor:Cesium.Color.BLACK,outlineWidth:1,heightReference:cluster?Cesium.HeightReference.NONE:Cesium.HeightReference.CLAMP_TO_GROUND,disableDepthTestDistance:Infinity},
      ...(cluster?{label:{text:feature.count.toLocaleString(),pixelOffset:new Cesium.Cartesian2(0,-22),font:'12px sans-serif',fillColor:Cesium.Color.WHITE,outlineColor:Cesium.Color.BLACK,outlineWidth:2,style:Cesium.LabelStyle.FILL_AND_OUTLINE,verticalOrigin:Cesium.VerticalOrigin.CENTER,heightReference:Cesium.HeightReference.NONE,disableDepthTestDistance:Infinity}}:{})});
   });viewer.scene.requestRender();
  }catch(reason){if(reason.name!=='AbortError'&&intent===generation)error=reason.message;}
  finally{if(intent===generation){loading=false;notify();}}
 }
 let selectIntent=0;
 async function select(query){const intent=++selectIntent;detail=null;history=null;notify();try{const value=await get('well?'+new URLSearchParams(query));if(intent===selectIntent){detail=value;error=null;notify();}}catch(reason){error=reason.message;notify();}}
 return {
  id:'texas-wells',name:'Texas wells · statewide database',icon:'◈',source:'Texas RRC · PostGIS',updateInterval:0,
  init(v){viewer=v;removeMove=viewer.camera.moveEnd.addEventListener(()=>void refresh());return true;},
  async enable(){await readStatus();source=new Cesium.CustomDataSource('Texas RRC statewide wells');await viewer.dataSources.add(source);enabled=true;await refresh();return true;},
  disable(){enabled=false;generation++;request?.abort();if(source&&!viewer.isDestroyed())viewer.dataSources.remove(source,true);source=null;picks.clear();notify();return true;},
  destroy(){this.disable();removeMove?.();listeners.clear();return true;},update(){return true;},readStatus,
  flyTo(){viewer.camera.flyTo({destination:Cesium.Rectangle.fromDegrees(...TEXAS),duration:1.5});},
  setCategory(value){category=value;void refresh();},
  async inspectId(id){await select({id});},
  async search(api){await select({api});const w=detail?.matches[0];if(w?.longitude&&w?.latitude)viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(w.longitude,w.latitude,9000),duration:1.2});},
  pick(id){const row=picks.get(id);if(!row)return;if(result.mode==='clusters'){const pad=Math.max(.015,(row.east-row.west)*.1);viewer.camera.flyTo({destination:Cesium.Rectangle.fromDegrees(row.west-pad,row.south-pad,row.east+pad,row.north+pad),duration:1.2});}else void select({id:row.id});},
  async loadHistory(){const api=detail?.matches[0]?.api8;if(!api)return;history={loading:true};notify();try{const data=await get('history?'+new URLSearchParams({api}));if(detail?.matches[0]?.api8===api)history=data;}catch(reason){history={error:reason.message};}notify();},
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  getState(){return{enabled,status,detail,history,category,result,error,loading};},
  getStats(){return{count:result?.count??0,source:'Texas RRC · local PostGIS',coverage:'Statewide well-location inventory',error};}
 };
}
