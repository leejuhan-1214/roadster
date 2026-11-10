import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCityWorld,createCityPlan} from '../dist/js/city-world.js';
import {createDistrictData,createCityGateways,attachStreamingCity,CITY_CHUNK_SIZE} from '../dist/js/city-streaming.js';
const data=JSON.parse(await readFile(new URL('../dist/assets/city/gangnam.json',import.meta.url),'utf8')),plan=createCityPlan(data);
test('districts are deterministic in every quadrant and keep buildings off surveyed centre and roads',()=>{
  for(const [x,z]of [[4,0],[-4,0],[0,4],[0,-4],[12345,-4200]]){
    const a=createDistrictData(x,z,plan.bounds,createCityGateways(plan));
    assert.deepEqual(a,createDistrictData(x,z,plan.bounds,createCityGateways(plan)));
    assert.ok(a.roads.length&&a.buildings.length);
    for(const b of a.buildings)for(const p of b.points){
      assert.ok(p.every(Number.isFinite));
      const wx=p[0]+a.chunk.cx,wz=p[1]+a.chunk.cz;
      assert.ok(wx<plan.bounds.minX||wx>plan.bounds.maxX||wz<plan.bounds.minZ||wz>plan.bounds.maxZ);
    }
  }
  assert.equal(createDistrictData(0,0,plan.bounds),null);
});
test('adjacent procedural chunks meet at the same road centres and widths',()=>{
  const left=createDistrictData(5,5,plan.bounds),right=createDistrictData(6,5,plan.bounds);
  const exits=(d,x)=>d.roads.flatMap(r=>r.points.filter(p=>Math.abs(p[0]+d.chunk.cx-x)<1e-6).map(p=>[p[1]+d.chunk.cz,r.width]));
  assert.deepEqual(exits(left,6*CITY_CHUNK_SIZE).sort(),exits(right,6*CITY_CHUNK_SIZE).sort());
});
test('every clipped real road exit has a connecting street to the outer boulevard',()=>{
  const gates=createCityGateways(plan),b=plan.bounds;
  for(const s of plan.segments)for(const p of [s.a,s.b])if(Math.min(Math.abs(p[0]-b.minX),Math.abs(p[0]-b.maxX),Math.abs(p[1]-b.minZ),Math.abs(p[1]-b.maxZ))<.1){
    assert.ok(gates.some(g=>g.a===p),'missing source exit');
  }
});
test('streaming evicts remote chunks, preserves core, colliders and shared materials, and survives return',()=>{
  const city=createCityWorld(data);attachStreamingCity(city,createCityWorld);
  try{
    const material=city.root.getObjectByName('OSM road network').material;let sharedDisposed=false;material.addEventListener('dispose',()=>sharedDisposed=true);
    const coreCount=plan.obstacles.length;
    city.streaming.update(2000,0);assert.ok(city.streaming.chunks.size>0&&city.streaming.chunks.size<=25);
    const old=[...city.streaming.chunks.values()][0];let released=false;old.root.traverse(o=>o.geometry?.addEventListener('dispose',()=>released=true));
    city.streaming.update(-2000,2000);assert.ok(released);assert.equal(sharedDisposed,false);
    assert.ok(city.obstacles.length>coreCount);assert.ok(city.obstacles.some(o=>o.center[0]<-1500&&o.center[2]>1500));
    assert.equal(city.nearestRoadName(-2000,2000),'확장 도시 · 절차 생성');
    const revision=city.streaming.revision;assert.equal(city.streaming.update(-2001,2001),false);assert.equal(city.streaming.revision,revision);
    city.streaming.update(0,0);assert.ok(city.streaming.chunks.size<=25);assert.equal(sharedDisposed,false);
    assert.ok(city.roads.some(r=>r.name==='강남대로'));
  }finally{city.dispose();}
});
