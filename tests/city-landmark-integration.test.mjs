import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mergeCityBuildingData,createCityPlan,pointInPolygon} from '../dist/js/city-world.js';
import {createStreetDetails} from '../dist/js/city-facades.js';

const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const [source,main,extra,footprints]=await Promise.all([
  json('../dist/assets/city/gangnam.json'),
  json('../dist/assets/city-buildings/manifest.json'),
  json('../dist/assets/city-buildings/extra-landmarks.json'),
  json('../docs/research/gangnam-landmark-footprints.json'),
]);
const assets=[main,extra];
const merged=mergeCityBuildingData(source,assets);
const plan=createCityPlan(merged,{landmarkAssets:assets});
const skipIds=new Set(assets.flatMap(a=>a.skipCollisionBuildingIds||[]).map(String));
const replacedIds=new Set(assets.flatMap(a=>a.replacedBuildingIds||[]));
const contains=(box,p)=>p.every((v,i)=>Math.abs(v-box.center[i])<box.size[i]/2-1e-6);
const worldPoint=(model,x,y,z)=>{
  const c=Math.cos(model.rotationRadians),s=Math.sin(model.rotationRadians);
  return [model.center[0]+x*c+z*s,y,model.center[1]-x*s+z*c];
};
const ringKey=ring=>[...new Set(ring.map(p=>p.map(n=>n.toFixed(2)).join(',')))].sort().join(';');
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;};
const dispose=root=>{
  const geometries=new Set(),materials=new Set();
  root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
  for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
};

test('real landmark manifests merge without changing the source extract or metadata',()=>{
  const data=freeze(structuredClone(source)),metadata=freeze(structuredClone(assets));
  const before=JSON.stringify(data),assetsBefore=JSON.stringify(metadata);
  const result=mergeCityBuildingData(data,metadata),byId=new Map(result.buildings.map(b=>[String(b.id),b]));
  assert.notEqual(result,data);assert.notEqual(result.buildings,data.buildings);
  assert.equal(JSON.stringify(data),before);assert.equal(JSON.stringify(metadata),assetsBefore);
  assert.equal(byId.size,result.buildings.length,'landmark replacement must not duplicate building IDs');
  for(const asset of metadata){
    for(const id of asset.removedBuildingIds||[])assert.ok(!byId.has(String(id)),`obsolete component ${id}`);
    for(const b of asset.additionalBuildings||[])assert.deepEqual(byId.get(String(b.id)).points,b.points);
    for(const [id,height] of Object.entries(asset.buildingHeightOverrides||{}))if(byId.has(id))assert.equal(byId.get(id).height,height);
  }
  assert.equal(result.roads,data.roads,'road topology is retained');
});

test('every formerly missing multipolygon outer ring is present at its original OSM position',()=>{
  for(const relation of footprints.filter(b=>b.rings)){
    const id=`r${relation.id}`;
    const additions=merged.buildings.filter(b=>String(b.id)===id||String(b.id).startsWith(id+'p'));
    assert.equal(additions.length,relation.rings.length,`${relation.name}: retain all separate outer rings`);
    assert.deepEqual(additions.map(b=>ringKey(b.points)).sort(),relation.rings.map(ringKey).sort(),`${relation.name}: use actual rings, not a filled convex envelope`);
    assert.ok(additions.every(b=>plan.buildings.some(p=>p.id===b.id)),`${relation.name}: stays inside the active city`);
  }
  // Old Monaco corners and Kyobo connecting volumes otherwise fill modeled voids.
  for(const id of [504791066,504791067,504791069,504791070,541900101,541900103,541900105]){
    assert.ok(source.buildings.some(b=>b.id===id),'regression fixture contains the original component');
    assert.ok(!merged.buildings.some(b=>b.id===id),`remove replaced landmark component ${id}`);
  }
});

test('model collision solids replace generic full-height building strips exactly once',()=>{
  const explicit=assets.flatMap(a=>a.collisionSolids||[]),byId=new Map(plan.obstacles.map(b=>[b.id,b]));
  assert.ok(explicit.length>100,'real bundled manifests include their modeled collision volumes');
  assert.equal(byId.size,plan.obstacles.length,'collision IDs remain unique');
  for(const solid of explicit){
    assert.deepEqual(byId.get(solid.id),solid,`preserve model solid ${solid.id}`);
    assert.ok([...solid.center,...solid.size].every(Number.isFinite));
    assert.ok(solid.size.every(n=>n>0));
  }
  for(const id of skipIds)assert.ok(!plan.obstacles.some(b=>b.id.startsWith(`building-${id}-`)),`no full-height duplicate collider for ${id}`);
  assert.equal(plan.obstacles.filter(b=>!b.id.startsWith('building-')).length,explicit.length);
  assert.ok(plan.obstacles.some(b=>b.id.startsWith('building-')),'ordinary OSM buildings still collide');
});

test('landmark integration keeps the complete starting chassis clear on the original road',()=>{
  const original=createCityPlan(source),[x,,z]=plan.spawn.position;
  assert.deepEqual(plan.spawn,original.spawn);
  assert.ok(plan.segments.some(s=>{
    const t=(x-s.a[0])*s.dx+(z-s.a[1])*s.dz;
    return t>=0&&t<=s.length&&Math.hypot(x-s.a[0]-s.dx*t,z-s.a[1]-s.dz*t)<s.road.width/2;
  }));
  for(const b of plan.buildings)assert.ok(!pointInPolygon(x,z,b.points),`spawn inside ${b.name||b.id}`);
  for(const b of plan.obstacles){
    assert.ok(Math.abs(x-b.center[0])>b.size[0]/2+2.6||Math.abs(z-b.center[2])>b.size[2]/2+2.6,`spawn chassis overlaps ${b.id}`);
  }
});

test('the modeled Kyobo gap and Monaco courtyard/recess are not filled by generic collision',()=>{
  const kyobo=extra.models.find(m=>m.key==='kyobo-tower'),monaco=extra.models.find(m=>m.key==='boutique-monaco');
  assert.ok(kyobo&&monaco);
  const empty=[
    ['Kyobo middle gap',worldPoint(kyobo,0,60,0)],
    ['Monaco courtyard',worldPoint(monaco,0,60,monaco.depth*.3)],
    ['Monaco multi-storey recess',worldPoint(monaco,-monaco.width/2+monaco.width/9,17+3.5*(117-17)/23,-monaco.depth/2+monaco.depth/7)],
  ];
  for(const [label,point] of empty)assert.ok(!plan.obstacles.some(b=>contains(b,point)),`${label} should remain open`);
  const wing=worldPoint(kyobo,kyobo.width/2-5,60,0);
  assert.ok(plan.obstacles.some(b=>contains(b,wing)),'the adjacent actual Kyobo tower still has collision');
});

test('street facade details exclude imported landmarks and retain six bounded render batches',()=>{
  const root=createStreetDetails(plan.buildings,plan.segments,{excludedIds:replacedIds});
  const landmarks=plan.buildings.filter(b=>replacedIds.has(b.id));
  const excluded=createStreetDetails(landmarks,plan.segments,{excludedIds:replacedIds});
  const control=createStreetDetails(landmarks,plan.segments);
  try{
    assert.ok(control.userData.buildings>0,'the exclusion check exercises street-facing landmarks');
    assert.equal(excluded.children.length,0);assert.equal(excluded.userData.instances,0);
    assert.ok(root.children.length>0&&root.children.length<=6);
    assert.ok(root.children.every(mesh=>mesh.isInstancedMesh));
    const total=root.children.reduce((sum,m)=>sum+m.count,0);
    assert.equal(total,root.userData.instances);
    assert.equal(root.userData.triangles,total*12);assert.ok(total*12<150000);
    for(const mesh of root.children){
      assert.ok(mesh.instanceMatrix.array.every(Number.isFinite));
      assert.ok(Number.isFinite(mesh.boundingSphere.radius));
    }
  }finally{dispose(root);dispose(excluded);dispose(control);}
});
