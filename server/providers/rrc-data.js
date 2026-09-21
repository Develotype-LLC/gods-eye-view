import {createHash} from 'node:crypto';
export const RRC_BOUNDS = [-102.85,31.3,-102.45,31.6];
export const RRC_DATASETS = {wells:'givw-z9t4',history:'qq2j-f2zm'};
const numeric = value => value == null || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const clean = value => String(value ?? '').trim();
const date = value => /^\d{4}-\d{2}-\d{2}/.test(value || '') ? value.slice(0,10) : null;

export function buildRrcSnapshot(masters, volumes, refreshedAt) {
  const byUic = new Map(), groups = new Map(); let excluded = 0, missingVolumes = 0;
  for (const row of masters) {
    if (![1,2].includes(Number(row.uic_type_injection))) continue;
    const api8 = clean(row.api_no), uic = clean(row.uic_number);
    const longitude = numeric(row.longitude_nad83), latitude = numeric(row.latitude_nad83);
    if (!/^\d{8}$/.test(api8) || api8.endsWith('00000') || !/^\d{9}$/.test(uic) || longitude == null || latitude == null || longitude < RRC_BOUNDS[0] || longitude > RRC_BOUNDS[2] || latitude < RRC_BOUNDS[1] || latitude > RRC_BOUNDS[3]) {excluded++; continue;}
    if (byUic.has(uic)) throw new Error('Duplicate RRC UIC');
    const id = `42${api8}0000`;
    const well = {id,api8,uic,longitude,latitude,permitType:Number(row.uic_type_injection),
      permitDate:date(Number(row.uic_type_injection)===1 ? row.w14_date : row.h1_date) || date(row.letter_date),
      canceled:Boolean(row.permit_canceled_date),plugged:Boolean(row.w3_plugged_date),
      topFt:numeric(row.top_inj_zone),bottomFt:numeric(row.bot_inj_zone),leaseName:clean(row.lease_name),wellNumber:clean(row.well_no_display),operatorNumber:clean(row.operator_number)};
    byUic.set(uic,well); if (!groups.has(id)) groups.set(id,[]); groups.get(id).push(well);
  }
  if (!groups.size) throw new Error('No valid disposal wells returned');
  const monthly = new Map(), seen = new Set();
  for (const row of volumes) {
    if (![1,2].includes(Number(row.type_uic))) continue;
    const well = byUic.get(clean(row.uic_no)); if (!well) continue;
    const month = date(row.formatted_date)?.slice(0,7);
    if (!month || month < '2016-01' || month > refreshedAt.slice(0,7)) throw new Error('Invalid RRC reporting month');
    const key = `${row.uic_no}:${month}`; if (seen.has(key)) throw new Error('Duplicate RRC permit/month'); seen.add(key);
    const bbl = numeric(row.vol_liq); if (bbl == null) {missingVolumes++; continue;} if (bbl < 0) throw new Error('Negative RRC volume');
    const wellKey = `${well.id}:${month}`;
    if (!monthly.has(wellKey)) monthly.set(wellKey,{id:well.id,month,bbl:0,weighted:0,weight:0,maxPsi:null});
    const out = monthly.get(wellKey); out.bbl += bbl;
    const average=numeric(row.inj_press_avg), maximum=numeric(row.inj_press_max);
    if(bbl>0 && average>0){out.weighted+=bbl*average;out.weight+=bbl;}
    if(bbl>0 && maximum>0)out.maxPsi=Math.max(out.maxPsi??0,maximum);
  }
  const histories = new Map();
  for(const row of monthly.values()){
    if(!histories.has(row.id))histories.set(row.id,[]);
    histories.get(row.id).push({month:row.month,bbl:row.bbl,avgPsi:row.weight?row.weighted/row.weight:null,maxPsi:row.maxPsi});
  }
  let trimmed = 0;
  const wells = [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([id,permits])=>{
    permits.sort((a,b)=>Number(a.canceled||a.plugged)-Number(b.canceled||b.plugged)||(b.permitDate??'').localeCompare(a.permitDate??'')||a.uic.localeCompare(b.uic));
    const {uic,...primary}=permits[0];
    const history=(histories.get(id)??[]).sort((a,b)=>a.month.localeCompare(b.month));
    // The source pre-populates future/current zero rows; do not turn these into shutoff claims.
    while(history.length && history.at(-1).bbl===0){history.pop();trimmed++;}
    return {...primary,uics:permits.map(p=>p.uic).sort(),zone:'unknown',zoneRule:'Not classified by this live feed',history};
  });
  const months=wells.flatMap(w=>w.history.map(r=>r.month)).sort();
  if(!months.length)throw new Error('No usable RRC history returned');
  return {schemaVersion:1,title:'Crane County area disposal wells',evidence:'Texas RRC public records, retrieved directly',
    sourceMode:'rrc-api',sourceRetrievedAt:refreshedAt,exportedAt:refreshedAt,period:[months[0],months.at(-1)],
    wellCount:wells.length,historyWellCount:wells.filter(w=>w.history.length).length,recordCount:months.length,bounds:RRC_BOUNDS,
    audit:{rawPermits:masters.length,excludedPermits:excluded,rawMonthlyRows:volumes.length,missingVolumeRows:missingVolumes,trimmedTrailingZeroMonths:trimmed},
    inputHashes:{wellMaster:createHash('sha256').update(JSON.stringify(masters)).digest('hex'),h10:createHash('sha256').update(JSON.stringify(volumes)).digest('hex')},
    sources:[{name:'Texas RRC UIC well-location master',url:'https://data.texas.gov/resource/givw-z9t4.json'},{name:'Texas RRC H-10 injection monitoring',url:'https://data.texas.gov/resource/qq2j-f2zm.json'}],
    limitations:[
      'Latest retrieved public records are not real-time measurements. Monthly H-10 measurements are filed annually and reporting periods differ by well.',
      'Coverage is the fixed Crane County pilot rectangle. Null-coordinate permits cannot enter a geographic query. This is not a statewide inventory.',
      'Only disposal types 1/2 are included. Volumes are aggregated from UIC permits to a synthetic API-14-like join ID; completion suffix 0000 is not verified.',
      'Blank volume rows are omitted and counted in the audit; totals cover available records only. Trailing zero months are omitted because source placeholders cannot prove shutoff. Earlier source zeros are not independently validated.',
      'Pressure zero is treated as missing because unreported values and gravity feed cannot be distinguished. No shallow/deep classification is inferred from the live feed.',
      'Permit flags describe source records, not proof of current operation. Locations retain source NAD83 coordinates as approximate WGS84 and are not surveyed.',
      'Spatial overlap does not establish cause, injection attribution, or available disposal capacity.'
    ],wells};
}
