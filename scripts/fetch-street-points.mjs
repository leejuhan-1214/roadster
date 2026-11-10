import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Subway entrances (with exit numbers) and traffic-signal positions for the
// area of the streamed Seoul tiles. Run by a maintainer; the app only reads the
// bundled result.   node scripts/fetch-street-points.mjs
const manifest=JSON.parse(await fs.readFile(path.resolve(import.meta.dirname,'../dist/assets/city/seoul/manifest.json'),'utf8'));
const [south,west,north,east]=manifest.bbox,origin=manifest.origin,box=[south,west,north,east].join(',');
const query=`[out:json][timeout:90];(node["railway"="subway_entrance"](${box});node["railway"="station"](${box});node["highway"="traffic_signals"](${box}););out;`;
const endpoints=[process.env.OSM_OVERPASS_ENDPOINT,'https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter','https://overpass.kumi.systems/api/interpreter'].filter(Boolean);
let raw=null,endpoint=null,wait=4000;
for(let attempt=0;attempt<5&&!raw;attempt++){
  for(const candidate of endpoints){
    try{
      const response=await fetch(candidate,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'RoadsterLandingLab/1.28 (bounded educational offline city extract)'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(120000)});
      if(!response.ok){console.error(candidate,'HTTP',response.status);continue;}
      const text=await response.text(),parsed=JSON.parse(text);if(!parsed.elements?.length||parsed.remark)continue;
      raw=text;endpoint=candidate;break;
    }catch(error){console.error(candidate,error.message);}
  }
  if(!raw){await new Promise(resolve=>setTimeout(resolve,wait));wait*=2;}
}
if(!raw)throw new Error('Overpass did not answer.');
const source=JSON.parse(raw),metreLon=111320*Math.cos(origin[0]*Math.PI/180);
const metres=e=>[Math.round((e.lon-origin[1])*metreLon*10)/10,Math.round(-(e.lat-origin[0])*111320*10)/10];
const inside=p=>p[0]>=manifest.bounds.minX&&p[0]<manifest.bounds.maxX&&p[1]>=manifest.bounds.minZ&&p[1]<manifest.bounds.maxZ;
const stations=[],entrances=[],signals=[];
for(const e of source.elements){
  const t=e.tags||{},p=metres(e);if(!inside(p))continue;
  if(t.railway==='station'&&t.name)stations.push({p,name:t.name});
  else if(t.railway==='subway_entrance')entrances.push({p,ref:t.ref||'',name:t.name||''});
  else if(t.highway==='traffic_signals')signals.push(p);
}
// An entrance belongs to the nearest station within 420 m.
for(const e of entrances){
  let best='',distance=420;for(const s of stations){const d=Math.hypot(s.p[0]-e.p[0],s.p[1]-e.p[1]);if(d<distance){distance=d;best=s.name;}}
  e.station=best;delete e.name;
}
const byPlace=(a,b)=>a.p?a.p[0]-b.p[0]||a.p[1]-b.p[1]:a[0]-b[0]||a[1]-b[1];
entrances.sort(byPlace);signals.sort(byPlace);
const stamp=source.osm3s?.timestamp_osm_base||null;
const output={name:'서울 강남역 중심 지하철 출입구·신호 위치',unit:'metre',origin,bounds:manifest.bounds,attribution:'© OpenStreetMap contributors',license:'ODbL-1.0',licenseUrl:'https://www.openstreetmap.org/copyright',sourceTimestamp:stamp,downloadedAt:new Date().toISOString(),
  entrances:entrances.map(e=>[e.p[0],e.p[1],e.ref,e.station]),signals};
const dir=path.resolve(import.meta.dirname,'../dist/assets/city'),text=JSON.stringify(output);
await fs.writeFile(path.join(dir,'street-points.json'),text);
await fs.writeFile(path.join(dir,'street-points.provenance.json'),JSON.stringify({file:'street-points.json',sha256:createHash('sha256').update(text).digest('hex'),bytes:Buffer.byteLength(text),query,endpoint,bbox:manifest.bbox,origin,sourceTimestamp:stamp,downloadedAt:output.downloadedAt,rawSha256:createHash('sha256').update(raw).digest('hex'),counts:{entrances:entrances.length,signals:signals.length,stations:stations.length},license:'Open Database License 1.0',licenseUrl:'https://opendatacommons.org/licenses/odbl/1-0/',attribution:'© OpenStreetMap contributors',changes:'Projected to local metres around Gangnam station and rounded to 0.1 m; each subway entrance keeps its exit number and the name of the nearest mapped station within 420 m. Orientation, canopy shape, signal masts and their placement beside the carriageway are rendering assumptions.'},null,2)+'\n');
console.log(JSON.stringify({entrances:entrances.length,signals:signals.length,stations:stations.length,bytes:Buffer.byteLength(text),sourceTimestamp:stamp,endpoint}));
