import * as THREE from 'three';

// The surveyed centre stays fixed. Only the surrounding illustrative districts
// are generated. Absolute cell coordinates seed each block, including negatives.
export const CITY_CHUNK_SIZE=256;
export const CITY_CHUNK_RADIUS=2;
const GRID=128;
const mix=(x,z,s=0)=>{let h=Math.imul(x|0,374761393)^Math.imul(z|0,668265263)^Math.imul(s+1,1274126177);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;};
const overlaps=(a,b)=>a.maxX>b.minX&&a.minX<b.maxX&&a.maxZ>b.minZ&&a.minZ<b.maxZ;
const expanded=(b,n)=>({minX:b.minX-n,maxX:b.maxX+n,minZ:b.minZ-n,maxZ:b.maxZ+n});
function segmentClip(a,b,box){
  let lo=0,hi=1;const dx=b[0]-a[0],dz=b[1]-a[1];
  for(const [p,q] of [[-dx,a[0]-box.minX],[dx,box.maxX-a[0]],[-dz,a[1]-box.minZ],[dz,box.maxZ-a[1]]]){
    if(Math.abs(p)<1e-10){if(q<0)return null;continue;}
    const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return null;
  }
  return [lo,hi];
}
function outside(a,b,box){
  const range=segmentClip(a,b,box);if(!range)return [[a,b]];
  const at=t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],result=[];
  if(range[0]>0)result.push([a,at(range[0])]);if(range[1]<1)result.push([at(range[1]),b]);return result;
}
export function createCityGateways(city){
  const b=city.bounds,r=expanded(b,48),roads=[];
  const add=(a,c,width=20)=>roads.push({a,b:c,width});
  add([r.minX,r.minZ],[r.maxX,r.minZ]);add([r.maxX,r.minZ],[r.maxX,r.maxZ]);
  add([r.maxX,r.maxZ],[r.minX,r.maxZ]);add([r.minX,r.maxZ],[r.minX,r.minZ]);
  for(const s of city.segments)for(const p of [s.a,s.b]){
    if(Math.abs(p[0]-b.minX)<.1)add(p,[r.minX,p[1]],s.road.width);
    else if(Math.abs(p[0]-b.maxX)<.1)add(p,[r.maxX,p[1]],s.road.width);
    else if(Math.abs(p[1]-b.minZ)<.1)add(p,[p[0],r.minZ],s.road.width);
    else if(Math.abs(p[1]-b.maxZ)<.1)add(p,[p[0],r.maxZ],s.road.width);
  }
  return roads;
}
export function createDistrictData(tx,tz,coreBounds,gateways=[]){
  const size=CITY_CHUNK_SIZE,cx=(tx+.5)*size,cz=(tz+.5)*size;
  const box={minX:tx*size,maxX:(tx+1)*size,minZ:tz*size,maxZ:(tz+1)*size};
  if(box.minX>=coreBounds.minX&&box.maxX<=coreBounds.maxX&&box.minZ>=coreBounds.minZ&&box.maxZ<=coreBounds.maxZ)return null;
  const roads=[],buildings=[],local=p=>[p[0]-cx,p[1]-cz];
  const add=(a,b,width)=>{
    const clip=segmentClip(a,b,box);if(!clip)return;
    const at=t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
    for(const [u,v]of outside(at(clip[0]),at(clip[1]),coreBounds)){
      if(Math.hypot(v[0]-u[0],v[1]-u[1])<.3)continue;
      roads.push({id:Math.floor(mix(tx,tz,roads.length)*1e9),name:'확장 도시',type:'secondary',width,lanes:Math.round(width/3.2),points:[local(u),local(v)]});
    }
  };
  for(let n=0;n<=2;n++){
    const x=box.minX+n*GRID,z=box.minZ+n*GRID;
    add([x,box.minZ],[x,box.maxZ],Math.abs(Math.round(x/GRID)%4)===0?26:18);
    add([box.minX,z],[box.maxX,z],Math.abs(Math.round(z/GRID)%4)===0?26:18);
  }
  for(const road of gateways)add(road.a,road.b,road.width);
  // Lots never touch the real extract or its exit connectors. Adjacent chunks
  // agree on road centre lines; structures stay at least 19 m away from them.
  for(let gx=tx*2;gx<tx*2+2;gx++)for(let gz=tz*2;gz<tz*2+2;gz++)for(let k=0;k<4;k++){
    const x=gx*GRID+35+(k%2)*58,z=gz*GRID+35+Math.floor(k/2)*58;
    const w=23+mix(gx,gz,k)*12,d=22+mix(gx,gz,k+4)*13;
    const footprint={minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2};
    if(overlaps(footprint,expanded(coreBounds,8))||gateways.some(r=>segmentClip(r.a,r.b,expanded(footprint,r.width/2+4))))continue;
    const height=9+Math.floor(mix(gx,gz,k+8)*14)*3.3;
    buildings.push({id:Math.floor(mix(gx,gz,k+12)*2e9),height,points:[[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2]].map(local)});
  }
  if(!roads.length)return null;
  const half=size/2/111320;
  return {origin:[0,0],bbox:[-half,-half,half,half],roads,buildings,attribution:'절차 생성 확장 도시 · 실제 지도 아님',chunk:{tx,tz,cx,cz}};
}

/** At most 25 live chunks, with explicit GPU disposal on eviction. */
export function attachStreamingCity(city,createWorld,{treeAsset=null}={}){
  const coreObstacles=city.obstacles,coreRoads=city.roads,coreName=city.nearestRoadName;
  const chunks=new Map(),gateways=createCityGateways(city),root=new THREE.Group();root.name='streamed illustrative districts';city.root.add(root);
  const sharedGeometry=new Set(),sharedMaterials=new Set();
  for(const level of treeAsset?.levels||[])for(const part of level){sharedGeometry.add(part.geometry);sharedMaterials.add(part.material);}
  for(const name of ['OSM road network','real road sidewalks','OSM building facades','office curtain walls']){
    const material=city.root.getObjectByName(name)?.material;if(material)sharedMaterials.add(material);
  }
  let anchor='',revision=0;
  const release=chunk=>{
    const geometries=new Set(),materials=new Set(),textures=new Set();
    chunk.root.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry&&!sharedGeometry.has(o.geometry))geometries.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])if(!sharedMaterials.has(m))materials.add(m);});
    for(const g of geometries)g.dispose();for(const m of materials){for(const t of Object.values(m))if(t?.isTexture)textures.add(t);m.dispose();}for(const t of textures)t.dispose();root.remove(chunk.root);
  };
  const update=(x,z)=>{
    if(!Number.isFinite(x)||!Number.isFinite(z))return false;
    const tx=Math.floor(x/CITY_CHUNK_SIZE),tz=Math.floor(z/CITY_CHUNK_SIZE),key=tx+','+tz;if(key===anchor)return false;anchor=key;
    const wanted=new Set();for(let dx=-CITY_CHUNK_RADIUS;dx<=CITY_CHUNK_RADIUS;dx++)for(let dz=-CITY_CHUNK_RADIUS;dz<=CITY_CHUNK_RADIUS;dz++)wanted.add((tx+dx)+','+(tz+dz));
    for(const [k,chunk]of chunks)if(!wanted.has(k)){release(chunk);chunks.delete(k);}
    for(const k of wanted){if(chunks.has(k))continue;const [a,b]=k.split(',').map(Number),data=createDistrictData(a,b,city.bounds,gateways);if(!data)continue;
      const chunk=createWorld(data,{treeAsset});const {cx,cz}=data.chunk;
      // The source factory's large background plane must not cover neighbours.
      const base=chunk.root.children.find(o=>o.geometry?.type==='PlaneGeometry'&&!o.name);
      if(base){base.geometry.dispose();base.geometry=new THREE.PlaneGeometry(CITY_CHUNK_SIZE,CITY_CHUNK_SIZE);base.position.y=-.06;}
      for(const name of ['OSM road network','real road sidewalks','OSM building facades','office curtain walls']){
        const target=chunk.root.getObjectByName(name),source=city.root.getObjectByName(name);if(!target||!source)continue;
        if(name==='OSM road network'||name==='real road sidewalks'){const uv=target.geometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)+cx/4,uv.getY(i)+cz/4);uv.needsUpdate=true;}
        const old=target.material;for(const t of Object.values(old))if(t?.isTexture)t.dispose();old.dispose();target.material=source.material;
      }
      chunk.root.position.set(cx,0,cz);root.add(chunk.root);
      chunk.worldObstacles=chunk.obstacles.map(o=>({...o,id:'district-'+k+'-'+o.id,center:[o.center[0]+cx,o.center[1],o.center[2]+cz],...(o.footprint?{footprint:o.footprint.map(p=>[p[0]+cx,p[1]+cz])}:{}),...(o.points?{points:o.points.map(p=>[p[0]+cx,p[1]+cz])}:{})}));
      chunk.worldRoads=chunk.roads.map(r=>({...r,points:r.points.map(p=>[p[0]+cx,p[1]+cz])}));chunks.set(k,chunk);
    }
    city.obstacles=coreObstacles.concat(...[...chunks.values()].map(c=>c.worldObstacles));city.roads=coreRoads.concat(...[...chunks.values()].map(c=>c.worldRoads));revision++;return true;
  };
  city.nearestRoadName=(x,z)=>x>=city.bounds.minX&&x<=city.bounds.maxX&&z>=city.bounds.minZ&&z<=city.bounds.maxZ?coreName(x,z):'확장 도시 · 절차 생성';
  const dispose=city.dispose.bind(city);city.dispose=()=>{for(const chunk of chunks.values())release(chunk);chunks.clear();city.root.remove(root);dispose();};
  city.streaming={update,chunks,root,get revision(){return revision;},get maxChunks(){return (2*CITY_CHUNK_RADIUS+1)**2;}};
  update(city.spawn.position[0],city.spawn.position[2]);return city;
}
