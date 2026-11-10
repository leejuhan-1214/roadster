import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildCityTile,cityTileTransferables,CITY_TILE_VERTEX_LIMIT} from '../dist/js/city-tile-builder.js';
import {createCityTileHydrator} from '../dist/js/city-tile-mesh.js';
import {containsFootprint} from '../dist/js/city-footprint.js';
const bounds={minX:0,maxX:512,minZ:0,maxZ:512};
const road={id:100,name:'테헤란로',type:'primary',width:13,lanes:4,points:[[-100,200],[1100,300]]};
const input=(extra={})=>({roads:[],buildings:[],...extra});
const square=(id,x,z,size=8)=>({id,height:12,points:[[x,z],[x+size,z],[x+size,z+size],[x,z+size]]});
const worldVertices=(tile,kind)=>tile.meshes.filter(m=>m.kind===kind).flatMap(m=>Array.from({length:m.position.length/3},(_,i)=>[m.position[i*3]+tile.origin[0],m.position[i*3+1],m.position[i*3+2]+tile.origin[1],m.uv[i*2],m.uv[i*2+1]]));

test('road polygons and world UVs agree on neighbouring tile boundaries',()=>{
  const a=buildCityTile(input({roads:[road]}),{bounds}),b=buildCityTile(input({roads:[road]}),{bounds:{...bounds,minX:512,maxX:1024}});
  for(const tile of [a,b])for(const kind of ['road','walk','paint']){
    const points=worldVertices(tile,kind);assert.ok(points.length);
    for(const [x,,z,u,v]of points){
      assert.ok(x>=tile.bounds.minX-.0001&&x<=tile.bounds.maxX+.0001);
      assert.ok(z>=tile.bounds.minZ-.0001&&z<=tile.bounds.maxZ+.0001);
      assert.ok(Math.abs(u-x/4)<.0001&&Math.abs(v-z/4)<.0001);
    }
  }
  for(const kind of ['road','walk','paint']){
    const edge=tile=>[...new Set(worldVertices(tile,kind).filter(p=>Math.abs(p[0]-512)<1e-4).map(p=>p[2].toFixed(3)))].sort();
    assert.deepEqual(edge(a),edge(b),kind+' has a seamless clipped edge');
  }
});

test('whole building ownership keeps protruding walls and exact collisions together',()=>{
  const building=square(14,490,20,44),a=buildCityTile(input({buildings:[building]}),{bounds});
  const b=buildCityTile(input({buildings:[building]}),{bounds:{...bounds,minX:512,maxX:1024}});
  // A centroid exactly at512 belongs to the inclusive lower bound of the right tile.
  assert.equal(a.stats.buildings,0);assert.equal(b.stats.buildings,1);
  assert.equal(b.obstacles.length,1);
  assert.ok(worldVertices(b,'wall').some(p=>p[0]===490));
  assert.deepEqual(b.obstacles[0].size,[44,12,44]);
  const owned=buildCityTile(input({buildings:[building],buildingsOwned:true}),{bounds});
  assert.equal(owned.stats.buildings,1,'offline owner assignment is authoritative');
  const excluded=buildCityTile(input({buildings:[building],buildingsOwned:true}),{bounds,excludeBuildingIds:['14']});
  assert.equal(excluded.obstacles.length,0);assert.equal(excluded.stats.buildings,0);
});

test('core exclusion removes road and ground interiors without inventing connectors',()=>{
  const core={minX:200,maxX:300,minZ:100,maxZ:350};
  const tile=buildCityTile(input({roads:[road]}),{bounds,coreBounds:core});
  for(const kind of ['road','walk','paint','ground'])for(const mesh of tile.meshes.filter(m=>m.kind===kind)){
    for(let i=0;i<mesh.position.length;i+=9){
      const x=(mesh.position[i]+mesh.position[i+3]+mesh.position[i+6])/3+tile.origin[0];
      const z=(mesh.position[i+2]+mesh.position[i+5]+mesh.position[i+8])/3+tile.origin[1];
      assert.ok(!(x>core.minX+1e-5&&x<core.maxX-1e-5&&z>core.minZ+1e-5&&z<core.maxZ-1e-5),kind+' triangle intrudes into retained core');
    }
  }
  assert.equal(tile.roads.length,2);assert.ok(tile.roads.every(r=>r.id===road.id));
  for(const r of tile.roads)for(const [x,z]of r.points)assert.ok(!(x>core.minX&&x<core.maxX&&z>core.minZ&&z<core.maxZ));
});

test('mapped water retains real polygon holes',()=>{
  const water={id:1,points:[[10,10],[110,10],[110,110],[10,110]],holes:[[[40,40],[60,40],[60,60],[40,60]]]};
  const tile=buildCityTile(input({water:[water]}),{bounds});let covered=0;
  for(const m of tile.meshes.filter(m=>m.kind==='water'))for(let i=0;i<m.position.length;i+=9){
    const p=m.position;covered+=Math.abs((p[i+3]-p[i])*(p[i+8]-p[i+2])-(p[i+5]-p[i+2])*(p[i+6]-p[i]))*.5;
  }
  assert.ok(Math.abs(covered-9600)<.001);
});

test('worker output uses bounded finite buffers and transferable ownership',()=>{
  const buildings=Array.from({length:600},(_,i)=>square(1000+i,(i%30)*15+2,Math.floor(i/30)*15+2));
  const tile=buildCityTile(input({buildings,buildingsOwned:true}),{bounds});
  assert.ok(tile.meshes.filter(m=>m.kind==='wall').length>1);
  for(const m of tile.meshes){
    assert.ok(m.position.length/3<=CITY_TILE_VERTEX_LIMIT);
    assert.equal(m.normal.length,m.position.length);assert.equal(m.color.length,m.position.length);
    assert.equal(m.uv.length,m.position.length/3*2);
    for(const key of ['position','normal','uv','color'])assert.ok(m[key].every(Number.isFinite));
  }
  const buffers=cityTileTransferables(tile);assert.equal(buffers.length,new Set(buffers).size);
  const clone=structuredClone(tile,{transfer:buffers});
  assert.ok(buffers.every(b=>b.byteLength===0));
  assert.ok(clone.meshes.every(m=>m.position.byteLength>0));
});

test('hydration is incremental, skips geometry scans, and preserves shared resources',()=>{
  const tile=buildCityTile(input({roads:[road],buildings:[square(1,10,10)]}),{bounds});
  const shared=new THREE.MeshStandardMaterial(),materials=new Map(tile.meshes.map(m=>[m.name,shared]));
  let sharedDisposals=0;shared.addEventListener('dispose',()=>sharedDisposals++);
  const h=createCityTileHydrator(tile,{materials});
  assert.equal(h.root.children.length,0);let steps=0;
  while(!h.done){
    const before=h.root.children.length;h.step();steps++;
    assert.ok(h.root.children.length-before<=1);
  }
  assert.equal(steps,tile.meshes.length);
  for(const m of h.root.children){assert.ok(m.geometry.boundingSphere);assert.equal(m.material,shared);}
  const geometries=h.root.children.map(m=>m.geometry);let disposed=0;
  for(const g of geometries)g.addEventListener('dispose',()=>disposed++);
  h.dispose();h.dispose();assert.equal(disposed,geometries.length);assert.equal(sharedDisposals,0);assert.equal(h.step(),true);
  shared.dispose();
});

test('tree hydration is sliced and never disposes shared tree assets',()=>{
  const geometry=new THREE.BoxGeometry(1,4,1),material=new THREE.MeshStandardMaterial(),depthMaterial=new THREE.MeshDepthMaterial();
  let g=0,m=0,d=0;geometry.addEventListener('dispose',()=>g++);material.addEventListener('dispose',()=>m++);depthMaterial.addEventListener('dispose',()=>d++);
  const tile=buildCityTile(input(),{bounds});tile.trees=Array.from({length:40},(_,i)=>({x:i*4-80,z:80,height:6,rotation:0}));
  const h=createCityTileHydrator(tile,{treeAsset:{height:4,levels:[[{geometry,material,depthMaterial}],[{geometry,material,depthMaterial}]]}});
  let steps=0;while(!h.done){h.step();steps++;}
  assert.ok(steps>=tile.meshes.length+2&&steps<=tile.meshes.length+4);
  const groves=h.root.children.filter(o=>Number.isFinite(o.userData.treeCount));
  assert.equal(groves.reduce((sum,g)=>sum+g.userData.treeCount,0),40);
  assert.ok(groves.every(g=>g.userData.treeCount<=32));
  h.dispose();assert.deepEqual([g,m,d],[0,0,0]);
  geometry.dispose();material.dispose();depthMaterial.dispose();
});

test('unsupported underground roads are absent but surveyed bridge routes remain',()=>{
  const tile=buildCityTile(input({roads:[road,{...road,id:2,tunnel:true},{...road,id:3,layer:-1},{...road,id:4,bridge:true}]}),{bounds});
  assert.deepEqual(tile.roads.map(r=>r.id),[100,4]);
});

test('building courtyards keep visible roof holes, inner walls, and collision openings',()=>{
  const building={id:83,height:12,points:[[10,10],[110,10],[110,110],[10,110]],holes:[[[40,40],[60,40],[60,60],[40,60],[40,40]]]};
  const tile=buildCityTile(input({buildings:[building],buildingsOwned:true}),{bounds});let covered=0;
  for(const m of tile.meshes.filter(m=>m.kind==='roof'))for(let i=0;i<m.position.length;i+=9){const p=m.position;covered+=Math.abs((p[i+3]-p[i])*(p[i+8]-p[i+2])-(p[i+5]-p[i+2])*(p[i+6]-p[i]))*.5;}
  assert.ok(Math.abs(covered-9600)<.001);
  assert.equal(worldVertices(tile,'wall').length,48,'both outer facade and all four courtyard walls exist');
  assert.ok(!tile.obstacles.some(o=>containsFootprint(o.footprint,50,50)),'courtyard has no invisible building collider');
  for(const p of [[20,20],[50,20],[80,50],[50,80]])assert.ok(tile.obstacles.some(o=>containsFootprint(o.footprint,...p)),'building remains solid around courtyard');
});

