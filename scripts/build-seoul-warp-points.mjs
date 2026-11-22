// Rebuild with node scripts/build-seoul-warp-points.mjs, or pass --check in CI.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {indexRegionalTiles, decodeRegionalPack} from '../dist/js/city-regional-packs.js';
import {buildCityTile,tileRoadWidth} from '../dist/js/city-tile-builder.js';

const cityDir = new URL('../dist/assets/city/', import.meta.url);
const json = path => JSON.parse(readFileSync(new URL(path, cityDir)));
const map = json('seoul/driving-map.json');
const streets = json('street-points.json');
const core = json('gangnam.json');
const manifest = json('seoul/manifest.json');
indexRegionalTiles(manifest);
const [south, west, north, east] = core.bbox;
const [lat, lon] = core.origin;
const lonScale = 111320 * Math.cos(lat * Math.PI / 180);
const coreBounds = {minX:(west-lon)*lonScale, maxX:(east-lon)*lonScale, minZ:(lat-north)*111320, maxZ:(lat-south)*111320};
const inside = (x,z,b) => x>=b.minX && x<b.maxX && z>=b.minZ && z<b.maxZ;
const boxes = new WeakMap();
function nearRing(x,z,ring,pad) {
  let b = boxes.get(ring);
  if (!b) {
    b = {minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};
    for(const [px,pz] of ring){b.minX=Math.min(b.minX,px);b.maxX=Math.max(b.maxX,px);b.minZ=Math.min(b.minZ,pz);b.maxZ=Math.max(b.maxZ,pz);}
    boxes.set(ring,b);
  }
  if(x<b.minX-pad || x>b.maxX+pad || z<b.minZ-pad || z>b.maxZ+pad)return false;
  let within = false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [ax,az]=ring[j],[bx,bz]=ring[i];
    if((az>z)!==(bz>z) && x<(bx-ax)*(z-az)/(bz-az)+ax)within=!within;
    if(pad){
      const dx=bx-ax,dz=bz-az;
      const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));
      if(Math.hypot(ax+t*dx-x,az+t*dz-z)<=pad)return true;
    }
  }
  return within;
}

const tiles = new Map(),packs = new Map();
function packCell(url,cell){
  if(!packs.has(url)){
    const bytes=readFileSync(new URL('seoul/'+url,cityDir));
    packs.set(url,decodeRegionalPack(JSON.parse(gunzipSync(bytes))));
  }
  return packs.get(url)[cell];
}
function loadTile(ix,iz) {
  const key=ix+'_'+iz;
  if(tiles.has(key))return tiles.get(key);
  const entry=manifest.tiles[key];
  if(!entry || (!entry.url && !entry.pack))return null;
  let tile;
  if(entry.url){
    tile=json('seoul/'+entry.url);
    if(entry.waterPack)tile.water=packCell(entry.waterPack,entry.cell).water;
  }else tile=packCell(entry.pack,entry.cell);
  tiles.set(key,tile);
  return tile;
}
const cellAt = (x,z) => loadTile(Math.floor(x/manifest.tileSize),Math.floor(z/manifest.tileSize));
const sourceAt = (x,z) => inside(x,z,coreBounds)?core:cellAt(x,z);

const areas=['도심권','동북권','서북권','서남권','동남권','한강 다리'];
const landmarks=[
  ['gangnam',4],['coex',4],['national-museum',0],['arts-center',4],['seoul-st-marys',4],
  ['lotte-tower',4],['olympic-park',4],['worldcup-stadium',2],['city-hall',0],['national-assembly',3],
  ['heunginjimun',0],['dobong-office',1],['nowon-office',1],['botanic-park',3],['yeouido-park',3],['seoul-forest',1]
];
const stations=[
  ['seoul','서울',0],['gwanghwamun','광화문',0],['hongik','홍대입구',2],['sinchon','신촌',2],['gongdeok','공덕',2],
  ['gupabal','구파발',2],['yeonsinnae','연신내',2],['suyu','수유',1],['cheongnyangni','청량리',1],
  ['wangsimni','왕십리',1],['sangbong','상봉',1],['konkuk','건대입구',1],['dobongsan','도봉산',1],
  ['gimpo-airport','김포공항',3],['hwagok','화곡',3],['mokdong','목동',3],['sindorim','신도림',3],
  ['gasan','가산디지털단지',3],['guro-digital','구로디지털단지',3],['sillim','신림',3],['seoul-national','서울대입구',3],
  ['sadang','사당',3],['yangjae','양재',4],['suseo','수서',4],['munjeong','문정',4],['godeok','고덕',4]
];
// Endpoints are derived from each bridge's recorded OSM centerline.
const bridges=[['gayang','south'],['yanghwa','north'],['mapo','north'],['hangang','south'],
  ['banpo','south'],['hannam','north'],['jamsil','south'],['gwangjin','north']];
const anchors=landmarks.map(([id,area])=>{
  const landmark=map.landmarks.find(x=>x.id===id);
  return {id:'place-'+id,name:landmark.name,group:areas[area],x:landmark.x,z:landmark.z};
});
for (const [id,name,area] of stations) {
  const entries=streets.entrances.filter(e=>e[3]===name || (name==='서울' && e[3]==='서울역'));
  assert(entries.length,'Unknown station '+name);
  const center=entries.reduce(([x,z],e)=>[x+e[0]/entries.length,z+e[1]/entries.length],[0,0]);
  anchors.push({id:'station-'+id,name:name+'역',group:areas[area],x:center[0],z:center[1]});
}
for (const [id,end] of bridges) {
  const bridge=map.bridges.find(b=>b.id===id);
  const ordered=[...bridge.points].sort((a,b)=>a[1]-b[1]);
  const [x,z]=end==='north'?ordered[0]:ordered.at(-1);
  anchors.push({id:'bridge-'+id+'-'+end,name:bridge.name+' '+(end==='north'?'북단':'남단'),group:areas[5],x,z});
}

const classes=new Set(['primary','secondary','tertiary','residential','unclassified']);
// Some snapshots preserve a tunnel or expressway name while dropping its grade tag.
const unsuitableRoadName=/지하차도|지하도로|고가도로|도시고속|고속도로|동부간선로|강변북로|올림픽대로|내부순환로|서부간선로|북부간선로/;
function clearApproach(x,z,dx,dz){
  for(const step of [-5,0,6,12]){
    const px=x+dx*step,pz=z+dz*step, source=sourceAt(px,pz);
    if(!source)return false;
    if(map.water.some(r=>nearRing(px,pz,r,2.5)) && !map.islands.some(r=>nearRing(px,pz,r,0)))return false;
    if(source.water?.some(r=>nearRing(px,pz,r.points,2.5) && !r.holes?.some(h=>nearRing(px,pz,h,0))))return false;
    if([...(source.buildings||[]),...(source.contextBuildings||[])].some(b=>nearRing(px,pz,b.points,3.8)))return false;
    if(streets.entrances.some(e=>Math.hypot(px-e[0],pz-e[1])<9))return false;
  }
  return true;
}

function choose(anchor){
  const candidates=[];
  const add=(roads,source)=>{
    for(const road of roads){
      const width=tileRoadWidth(road);
      if(!/[가-힣]/.test(road.name) || unsuitableRoadName.test(road.name) || !classes.has(road.type)
        || width<6 || road.tunnel || road.bridge || road.layer)continue;
      for(let i=1;i<road.points.length;i++){
        const [ax,az]=road.points[i-1], [bx,bz]=road.points[i];
        const length=Math.hypot(bx-ax,bz-az);
        if(length<27)continue;
        const dx=(bx-ax)/length,dz=(bz-az)/length;
        const projected=(anchor.x-ax)*dx+(anchor.z-az)*dz;
        const t=Math.max(8,Math.min(length-16,projected));
        let lanes=Number(road.lanes)||Math.max(road.oneway?1:2,Math.round(width/3.2));
        if(!road.oneway)lanes=Math.max(2,lanes);
        const laneWidth=width/lanes;
        const offset=road.oneway?(lanes%2?0:laneWidth*.5):laneWidth*(lanes%2?1:.5);
        const x=ax+dx*t-dz*offset,z=az+dz*t+dx*offset;
        const distance=Math.hypot(x-anchor.x,z-anchor.z);
        if(distance>600 || sourceAt(x,z)!==source || sourceAt(x+dx*12,z+dz*12)!==source)continue;
        const score=distance+(width<8?25:0)+(width<11?8:0);
        candidates.push({road,score,distance,x,z,dx,dz});
      }
    }
  };
  const ix=Math.floor(anchor.x/manifest.tileSize),iz=Math.floor(anchor.z/manifest.tileSize);
  if(inside(anchor.x,anchor.z,{minX:coreBounds.minX-600,maxX:coreBounds.maxX+600,minZ:coreBounds.minZ-600,maxZ:coreBounds.maxZ+600}))add(core.roads,core);
  for(let j=iz-1;j<=iz+1;j++)for(let i=ix-1;i<=ix+1;i++){const tile=loadTile(i,j);if(tile)add(tile.roads,tile);}
  const candidate=candidates.sort((a,b)=>a.score-b.score).find(c=>clearApproach(c.x,c.z,c.dx,c.dz));
  assert(candidate,'No clear, drivable lane near '+anchor.name);
  const {x,z,dx,dz,road,distance}=candidate;
  if(process.argv.includes('--details'))console.log(anchor.name,road.name,Math.round(distance)+'m',String(road.id));
  return [anchor.id,anchor.name,anchor.group,+x.toFixed(2),+z.toFixed(2),+Math.atan2(-dz,dx).toFixed(6),road.name,String(road.id)];
}

const rows=anchors.map(choose);
assert.equal(new Set(rows.map(r=>r[0])).size,rows.length);
for(const a of rows)for(const b of rows)if(a!==b)assert(Math.hypot(a[3]-b[3],a[4]-b[4])>90,a[1]+' too close to '+b[1]);
const output = '// Generated by scripts/build-seoul-warp-points.mjs from the shipped Seoul road and landmark data.\n'
  +'// x is east, z is south. Heading follows the published road geometry in radians.\n'
  +'const rows = [\n'+rows.map(r=>'  '+JSON.stringify(r)).join(',\n')+'\n];\n\n'
  +'export const SEOUL_WARP_POINTS = Object.freeze(rows.map(([id,name,group,x,z,heading,roadName,roadId]) =>\n'
  +'  Object.freeze({id,name,group,x,z,heading,roadName,roadId})));\n';
const catalog=new URL('../dist/js/seoul-warp-points.js',import.meta.url);
if(process.argv.includes('--check'))assert.equal(readFileSync(catalog,'utf8').replaceAll('\r\n','\n'),output,'Warp catalog is stale');
else writeFileSync(catalog,output);
console.log(rows.length+' road arrivals verified across '+areas.length+' groups');

// Exercise the same clipped road polygons, obstacle meshes and arrival resolver used by city driving.
if(process.argv.includes('--physics')){
  const {prepareWarpArrival}=await import('../dist/js/city-warp-arrival.js');
  const {PhysicsSim}=await import('../dist/js/physics.js');
  const {createCityPlan,mergeCityBuildingData}=await import('../dist/js/city-world.js');
  const {SEOUL_WARP_POINTS}=await import('../dist/js/seoul-warp-points.js');
  const landmarkAssets=[json('../city-buildings/manifest.json'),json('../city-buildings/extra-landmarks.json')];
  const plan=createCityPlan(mergeCityBuildingData(core,landmarkAssets),{landmarkAssets});
  const excludeBuildingIds=plan.buildings.map(b=>String(b.id));
  const sim=new PhysicsSim({bodyLength:5.8,bodyWidth:2.4,bodyHeight:2});
  for(const point of SEOUL_WARP_POINTS){
    const roads=[...plan.roads],obstacles=[...plan.obstacles],keys=new Set();
    for(const dx of [-40,40])for(const dz of [-40,40]){
      const x=point.x+dx,z=point.z+dz;
      if(!inside(x,z,coreBounds))keys.add(Math.floor(x/manifest.tileSize)+'_'+Math.floor(z/manifest.tileSize));
    }
    for(const key of keys){
      const entry=manifest.tiles[key],tile=loadTile(entry.ix,entry.iz);
      const payload=buildCityTile(tile,{id:key,bounds:entry.bounds,coreBounds,excludeBuildingIds});
      roads.push(...payload.roads);
      obstacles.push(...payload.obstacles);
    }
    sim.setObstacles(obstacles.filter(b=>
      Math.abs(point.x-b.center[0])<40+b.size[0]/2 && Math.abs(point.z-b.center[2])<40+b.size[2]/2));
    let arrival;
    try{arrival=await prepareWarpArrival({bounds:manifest.bounds,roads},sim,point);}
    catch(error){throw new Error('No clear 5.8 m × 2.4 m arrival at '+point.name,{cause:error});}
    assert(sim.parkingClearAt(arrival.x,arrival.z,arrival.heading,arrival.surfaceY),point.name);
  }
  console.log('All '+rows.length+' arrival roads fit the 5.8 m × 2.4 m test vehicle.');
}
