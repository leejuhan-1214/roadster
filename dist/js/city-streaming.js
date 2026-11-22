import * as THREE from 'three';
import {createTileScheduler} from './city-tile-scheduler.js?v=20261118-circuit155';
import {createCityTileHydrator} from './city-tile-mesh.js?v=20261122-roadhandling';
import {indexRegionalTiles} from './city-regional-packs.js?v=20261119-wide157';
export const CITY_CHUNK_SIZE=512;
export const CITY_CHUNK_RADIUS=2;
const GUARD_CORNERS=[[-8,-8],[8,-8],[-8,8],[8,8]];
const within=(x,z,b)=>x>=b.minX&&x<b.maxX&&z>=b.minZ&&z<b.maxZ;
function tileWorker(options){
 let worker=null,serial=0;const pending=new Map();
 function start(){
  if(worker)return;worker=new Worker(new URL('./city-tile-worker.js?v=20261122-wheel-repair',import.meta.url),{type:'module'});
  worker.postMessage({type:'init',options});
  worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);p.cleanup();data.error?p.reject(new Error(data.error)):p.resolve(data.payload);};
  worker.onerror=error=>{for(const p of pending.values()){p.cleanup();p.reject(new Error(error.message||'Map worker failed'));}pending.clear();worker?.terminate();worker=null;};
 }
 return {load(url,options,signal){start();return new Promise((resolve,reject)=>{
  const id=++serial,abort=()=>{worker?.postMessage({type:'cancel',id});pending.delete(id);reject(new DOMException('Aborted','AbortError'));};
  if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});
  pending.set(id,{resolve,reject,cleanup:()=>signal.removeEventListener('abort',abort)});worker.postMessage({id,url,options});
 });},dispose(){worker?.terminate();worker=null;for(const p of pending.values()){p.cleanup();p.reject(new DOMException('Disposed','AbortError'));}pending.clear();}};
}
/** Real OSM coverage is finite. Missing tiles never become invented streets. */
export async function attachStreamingCity(city,{treeAsset=null,manifestUrl=new URL('../assets/city/seoul/manifest.json?v=20261119-wide157',import.meta.url)}={}){
 const response=await fetch(manifestUrl);if(!response.ok)throw new Error('서울 지도 목록 HTTP '+response.status);
 const manifest=await response.json();if(manifest.schemaVersion!==1||manifest.tileSize!==CITY_CHUNK_SIZE)throw new Error('Unsupported Seoul map schema');
 indexRegionalTiles(manifest);
 const base=city.root.children.find(o=>o.geometry?.type==='PlaneGeometry'&&!o.name);
 if(base){base.geometry.dispose();base.geometry=new THREE.PlaneGeometry(city.bounds.maxX-city.bounds.minX,city.bounds.maxZ-city.bounds.minZ);base.position.x=(city.bounds.minX+city.bounds.maxX)/2;base.position.z=(city.bounds.minZ+city.bounds.maxZ)/2;}
 const root=new THREE.Group();root.name='actual Seoul map tiles';city.root.add(root);
 const coreRoads=city.roads,coreName=city.nearestRoadName,materials=new Map();
 city.root.traverse(o=>{if(o.isMesh&&o.name&&o.material)materials.set(o.name,o.material);});
 const worker=tileWorker({coreBounds:city.bounds,excludeBuildingIds:city.buildings.map(b=>String(b.id))});
 let physics=null,lastRevision=-1,blocked='',disposed=false;
 const scheduler=createTileScheduler({manifest,
  load:(entry,key,signal)=>{
   const absolute=relative=>relative?new URL(relative,manifestUrl).href:null;
   return worker.load(absolute(entry.url),{id:key,bounds:entry.bounds,origin:[(entry.bounds.minX+entry.bounds.maxX)/2,(entry.bounds.minZ+entry.bounds.maxZ)/2],pack:absolute(entry.pack||entry.waterPack),cell:entry.cell},signal);
  },
  hydrate:payload=>createCityTileHydrator(payload,{materials,treeAsset,prepareCollision:true}),
  onActivate:(key,chunk)=>{physics?.setObstacleChunk('seoul:'+key,chunk.obstacles,chunk.collision);root.add(chunk.root);},
  onEvict:(key,chunk)=>{physics?.removeObstacleChunk('seoul:'+key);root.remove(chunk.root);}
 });
 const readyAt=(x,z)=>within(x,z,city.bounds)||scheduler.hasAt(x,z);
 let mappedRoads=coreRoads;
 Object.defineProperty(city,'roads',{configurable:true,enumerable:true,get(){
  if(lastRevision!==scheduler.revision){
   lastRevision=scheduler.revision;
   mappedRoads=coreRoads.concat(...[...scheduler.chunks.values()].map(c=>c.roads));
  }
  return mappedRoads;
 }});
 const streaming={...scheduler,root,manifest,get requests(){return scheduler.requests;},get wanted(){return scheduler.wanted;},get revision(){return scheduler.revision;},get status(){return blocked;},get maxChunks(){return 49;},
  update:scheduler.update,
  bindPhysics(sim){physics=sim;if(sim)for(const [key,c]of scheduler.chunks)sim.setObstacleChunk('seoul:'+key,c.obstacles,c.collision);},
  guard(state,dt){
   blocked='';const x=state.pos.x+state.vel.x*dt,z=state.pos.z+state.vel.z*dt;
   if(within(x-8,z-8,city.bounds)&&within(x+8,z+8,city.bounds)&&scheduler.contains(x-8,z-8)&&scheduler.contains(x+8,z+8))return true;
   for(const [dx,dz]of GUARD_CORNERS){
    if(!scheduler.contains(x+dx,z+dz)){blocked='실제 지도 범위 끝 · R 출발점';break;}
    if(!readyAt(x+dx,z+dz)){blocked=scheduler.failures.size?'지도 재시도 중 · 잠시 정지':'다음 실제 지도 로딩 중';break;}
   }
   if(blocked){state.vel.x=0;state.vel.z=0;return false;}return true;
  }
 };
 city.nearestRoadName=(x,z)=>{
  if(blocked)return blocked;if(within(x,z,city.bounds))return coreName(x,z);
  let best=Infinity,name='서울 · OpenStreetMap';
  for(const [key,c]of scheduler.chunks){const b=manifest.tiles[key].bounds;if(x<b.minX-512||x>b.maxX+512||z<b.minZ-512||z>b.maxZ+512)continue;for(const r of c.roads)for(let i=1;i<r.points.length;i++){
   const a=r.points[i-1],b=r.points[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1))),d=(x-a[0]-dx*t)**2+(z-a[1]-dz*t)**2;
   if(d<best){best=d;name=r.name||'서울 도로';}
  }}return name;
 };
 const originalDispose=city.dispose.bind(city);city.dispose=()=>{if(disposed)return;disposed=true;scheduler.dispose();worker.dispose();city.root.remove(root);Object.defineProperty(city,'roads',{configurable:true,enumerable:true,writable:true,value:coreRoads});originalDispose();};
 city.streaming=streaming;streaming.update(city.spawn.position[0],city.spawn.position[2]);return city;
}
