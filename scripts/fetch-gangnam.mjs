import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Rebuild this bounded ODbL extract; no map service is contacted by the app.
const bbox=[37.4912,127.0191,37.5046,127.0361];
const origin=[37.4979,127.0276];
const query=`[out:json][timeout:90];(way["highway"]["area"!="yes"](${bbox.join(',')});way["building"](${bbox.join(',')}););out geom;`;
const endpoint=process.env.OSM_OVERPASS_ENDPOINT||'https://overpass-api.de/api/interpreter';
const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'RoadsterLandingLab/1.15 (bounded educational offline city extract)'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(110000)});
if(!response.ok)throw new Error('Overpass HTTP '+response.status);
const raw=await response.text(),source=JSON.parse(raw);
if(!source.elements?.length)throw new Error('Overpass returned no map elements: '+(source.remark||''));
const p=({lat,lon})=>[Math.round((lon-origin[1])*111320*Math.cos(origin[0]*Math.PI/180)*100)/100,Math.round(-(lat-origin[0])*111320*100)/100];
const roads=[],buildings=[];
const roadTypes=new Set(['motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','unclassified','residential','living_street','service']);
for(const e of source.elements){
  const t=e.tags||{},points=e.geometry?.map(p);if(!points||points.length<2)continue;
  if(roadTypes.has(t.highway)&&t.tunnel!=='yes'&&Number(t.layer||0)>=0){
    roads.push({id:e.id,type:t.highway,name:t.name||t['name:en']||'',lanes:Number.parseInt(t.lanes)||null,width:Number.parseFloat(t.width)||null,oneway:t.oneway==='yes',points});
  }
  if(t.building&&t.building!=='no'&&points.length>=4&&t.location!=='underground'&&Number(t.layer||0)>=0){
    buildings.push({id:e.id,type:t.building,name:t.name||'',height:Number.parseFloat(t.height)||null,levels:Number.parseFloat(t['building:levels'])||null,location:t.location||null,layer:Number(t.layer||0),points});
  }
}
roads.sort((a,b)=>a.id-b.id);buildings.sort((a,b)=>a.id-b.id);
const output={name:'서울 강남역',origin,bbox,attribution:'© OpenStreetMap contributors',license:'ODbL-1.0',licenseUrl:'https://www.openstreetmap.org/copyright',source: endpoint,sourceTimestamp:source.osm3s?.timestamp_osm_base||null,downloadedAt:new Date().toISOString(),roads,buildings};
const dir=path.resolve(import.meta.dirname,'../dist/assets/city');await fs.mkdir(dir,{recursive:true});
await fs.writeFile(path.join(dir,'gangnam.json'),JSON.stringify(output));
await fs.writeFile(path.join(dir,'provenance.json'),JSON.stringify({query,endpoint,bbox,origin,sourceTimestamp:output.sourceTimestamp,downloadedAt:output.downloadedAt,rawSha256:createHash('sha256').update(raw).digest('hex'),counts:{roads:roads.length,buildings:buildings.length},license:'Open Database License 1.0',licenseUrl:'https://opendatacommons.org/licenses/odbl/1-0/',attribution:'© OpenStreetMap contributors',changes:'Projected to local metre coordinates and rounded to centimetres; retained driving roads and building outlines/tags. Road width and building height fallbacks are rendering assumptions.'},null,2)+'\n');
console.log(JSON.stringify({roads:roads.length,buildings:buildings.length,bytes:JSON.stringify(output).length,sourceTimestamp:output.sourceTimestamp}));
