import * as Cesium from 'cesium';
import {REFERENCE_COLORS} from './records.js';
const node=(tag,text)=>{const e=document.createElement(tag);if(text!=null)e.textContent=String(text);return e;};
const human=s=>s.replace(/_/g,' ');
function properties(data){const dl=node('dl');dl.className='record-properties';for(const [key,value] of Object.entries(data||{})){if(value===null||value===''||typeof value==='object')continue;dl.append(node('dt',human(key)),node('dd',value));}return dl;}
export function mountReferenceRecordsPanel({viewer,dataManager,layer}){
 const panel=node('section');panel.id='records-panel';panel.hidden=true;panel.setAttribute('aria-label','Reference data explorer');
 panel.innerHTML=`<header><strong>WELLS, WATER & ENVIRONMENT</strong><button data-hide aria-label="Hide reference data explorer">✕</button></header>
 <details data-layers><summary>Visible map layers</summary><div data-toggles></div></details>
 <div data-legend></div><label>Inspect collection<select data-dataset aria-label="Reference collection"></select></label>
 <p data-status></p><p data-note></p><div data-map-controls><button data-fit>Zoom to coverage</button><label data-period-label>Reporting period<select data-period></select></label><label data-measurement-label>Measurement<select data-measurement><option value="ET">Actual ET · mm/month</option><option value="ETo">Reference ETo · mm/month</option></select></label><p data-et-legend>ET color scale: teal 0 → amber 300 mm/month. Missing values use the default green.</p></div>
 <p data-view role="status"></p><form data-search><label>RRC record type<select data-kind><option value="">All API-linked records</option></select></label><label>Texas API-8<input data-api placeholder="10300256" pattern="[0-9]{8}"></label><label>Or source lease / gas-well / operator ID<input data-key placeholder="Preserve source leading zeros"></label><button>Search downloaded RRC records</button></form>
 <div data-detail></div><footer><small>Source snapshots • click a marker for records; click clusters to zoom.</small></footer>`;
 document.body.append(panel);const abort=new AbortController(),on=(selector,event,fn)=>panel.querySelector(selector).addEventListener(event,fn,{signal:abort.signal});
 const kinds=['operator','plug_action','iwar_record','iwar_well','permian_current_well_status','permian_operator_county_year','w10_test','g10_test','annual_legal_operator_ranking','ewa_exxon_family_candidate','ewa_operator_snapshot','well_location'];
 for(const k of kinds)panel.querySelector('[data-kind]').append(new Option(human(k),k));
 on('[data-hide]','click',()=>void dataManager.setEnabled('reference-records',false,{origin:'user'}));
 on('[data-dataset]','change',e=>void layer.showDataset(e.target.value));on('[data-fit]','click',()=>layer.flyTo());
 on('[data-period]','change',e=>layer.setPeriod(e.target.value));on('[data-measurement]','change',e=>layer.setMeasurement(e.target.value));
 on('[data-search]','submit',e=>{e.preventDefault();void layer.searchArchive({kind:panel.querySelector('[data-kind]').value,api:panel.querySelector('[data-api]').value.trim(),key:panel.querySelector('[data-key]').value.trim()});});
 let catalogRef,lastSelected,lastDetail,lastArchive;
 function sync(){
  const s=layer.getState();panel.hidden=!s.enabled;if(!s.enabled)return;
  if(catalogRef!==s.metadata){catalogRef=s.metadata;panel.querySelector('[data-dataset]').replaceChildren(...s.metadata.map(d=>new Option(d.name,d.id)));const toggles=panel.querySelector('[data-toggles]');toggles.replaceChildren();for(const d of s.metadata.filter(d=>d.feature_count>0)){const label=node('label'),input=node('input');input.type='checkbox';input.dataset.layer=d.id;input.addEventListener('change',()=>void layer.toggle(d.id,input.checked),{signal:abort.signal});label.append(input,node('span',d.name));toggles.append(label);}}
  for(const input of panel.querySelectorAll('[data-layer]'))input.checked=s.active.includes(input.dataset.layer);
  const legend=panel.querySelector('[data-legend]');legend.replaceChildren(...s.active.map(id=>{const tag=node('span',s.metadata.find(d=>d.id===id)?.name||id);tag.style.borderLeft='5px solid '+(REFERENCE_COLORS[id]||'#6ecdd4');return tag;}));
  panel.querySelector('[data-dataset]').value=s.selected;const d=s.metadata.find(d=>d.id===s.selected);if(!d)return;
  panel.querySelector('[data-status]').textContent=s.selected==='rrc-records'?`${Number(d.observation_count).toLocaleString()} searchable source rows · imported ${new Date(d.imported_at).toLocaleDateString()}`:`${Number(d.feature_count).toLocaleString()} feature records · ${Number(d.located_count).toLocaleString()} located · ${Number(d.observation_count).toLocaleString()} linked history rows · imported ${new Date(d.imported_at).toLocaleDateString()}`;
  panel.querySelector('[data-note]').textContent=d.note;
  const isArchive=s.selected==='rrc-records',et=s.selected==='openet';panel.querySelector('[data-map-controls]').hidden=isArchive;panel.querySelector('[data-search]').hidden=!isArchive;
  panel.querySelector('[data-measurement-label]').hidden=!et;panel.querySelector('[data-et-legend]').hidden=!et;
  panel.querySelector('[data-period-label]').hidden=!d.periods?.length;
  if(lastSelected!==s.selected){lastSelected=s.selected;panel.querySelector('[data-period]').replaceChildren(new Option('All periods',''),...(d.periods||[]).map(p=>new Option(p,p)));}
  panel.querySelector('[data-period]').value=s.period;panel.querySelector('[data-measurement]').value=s.measurement;
  const result=s.results.get(s.selected);const hint=result?.mode==='clusters'?'clustered; zoom for individual records':'click a marker';
  panel.querySelector('[data-view]').textContent=s.error||(s.loading.includes(s.selected)?'Loading visible area…':result?`${result.count.toLocaleString()} in view · ${hint}`:'');
  if(lastDetail===s.detail&&lastArchive===s.archive)return;lastDetail=s.detail;lastArchive=s.archive;const box=panel.querySelector('[data-detail]');box.replaceChildren();
  if(s.detail){const d=s.detail;if(d.loading){box.append(node('p','Loading records…'));return;}if(d.error){box.append(node('p',d.error));return;}
   box.append(node('h3',d.feature?.name||'Record unavailable'),properties(d.feature?.properties));
   if(d.total){box.append(node('h4',`${d.total.toLocaleString()} linked records`));for(const r of d.observations){const entry=node('details');entry.append(node('summary',[r.period,r.kind].filter(Boolean).join(' · ')),properties(r.raw));box.append(entry);}pagination(box,d.offset,d.total,100,offset=>void layer.loadDetail(d.dataset,d.key,offset));}
  }
  if(s.archive){const a=s.archive;if(a.loading){box.append(node('p','Searching downloaded records…'));return;}if(a.error){box.append(node('p',a.error));return;}
   panel.querySelector('[data-api]').value=a.filters.api||'';panel.querySelector('[data-key]').value=a.filters.key||'';panel.querySelector('[data-kind]').value=a.filters.kind||'';
   box.append(node('p',`${a.total.toLocaleString()} matching records`),node('small',a.note));
   for(const r of a.rows){const entry=node('details');entry.append(node('summary',`${human(r.kind)} · ${r.api8||r.join_key||'source record'}`),properties(r.raw));box.append(entry);}
   pagination(box,a.offset,a.total,50,offset=>void layer.searchArchive({...a.filters,offset}));
  }
 }
 function pagination(box,offset,total,size,load){const row=node('div');row.append(node('small',`${offset+1}–${Math.min(offset+size,total)} of ${total.toLocaleString()}`));if(offset){const b=node('button','Previous');b.onclick=()=>load(Math.max(0,offset-size));row.append(b);}if(offset+size<total){const b=node('button','Next records');b.onclick=()=>load(offset+size);row.append(b);}box.append(row);}
 const unsubscribe=layer.subscribe(sync),handler=new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
 handler.setInputAction(e=>{if(!layer.getState().enabled)return;const id=viewer.scene.pick(e.position)?.id?.id;if(typeof id==='string'&&id.startsWith('reference:'))void layer.pick(id);},Cesium.ScreenSpaceEventType.LEFT_CLICK);
 sync();return()=>{abort.abort();unsubscribe();handler.destroy();panel.remove();};
}
