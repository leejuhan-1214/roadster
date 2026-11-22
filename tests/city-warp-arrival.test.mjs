import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {PhysicsSim} from '../dist/js/physics.js';
import {attachStreamingCity} from '../dist/js/city-streaming.js';
import {prepareWarpArrival} from '../dist/js/city-warp-arrival.js';

const road={id:'A',width:10,points:[[-60,0],[60,0]]};
const core={bounds:{minX:-64,maxX:64,minZ:-64,maxZ:64},roads:[road]};
const point={x:0,z:1.5,heading:0,roadId:'A'};

test('checks the whole vehicle against obstacles and searches only the selected lane',async()=>{
  const sim=new PhysicsSim(),position=sim.state.pos.clone();
  sim.setObstacles([{id:'pole-at-nose',center:[2,.7,1.5],size:[.2,1.4,.2]}]);
  assert.equal(sim.parkingClearAt(0,1.5,0,0),false);
  assert.equal(sim.parkingClearAt(0,1.5,Math.PI/2,0),true);
  assert.deepEqual(await prepareWarpArrival(core,sim,point),{x:6,z:1.5,heading:0,surfaceY:0});
  const wrongWay={...core,roads:[{...road,id:'B'}]};
  await assert.rejects(prepareWarpArrival(wrongWay,sim,point),/도로/);
  assert.ok(sim.state.pos.equals(position));
});

test('street furniture is registered before the clearance query and overhead structures remain passable',async()=>{
  const sim=new PhysicsSim();
  const city={...core,streetOverlay:{prepareCellAt(){
    sim.setObstacles([{center:[0,4,1.5],size:[50,1,7]},{center:[0,.5,1.5],size:[1,1,1]}]);
    return true;
  }}};
  assert.deepEqual(await prepareWarpArrival(city,sim,point),{x:6,z:1.5,heading:0,surfaceY:0});
  const blocked={...core,streetOverlay:{prepareCellAt:()=>false}};
  await assert.rejects(prepareWarpArrival(blocked,sim,point),/도로/);
});

test('out-of-coverage, off-road, obstructed or cancelled travel leaves the vehicle where it was',async()=>{
  const sim=new PhysicsSim(),position=sim.state.pos.clone();
  await assert.rejects(prepareWarpArrival(core,sim,{...point,x:120}),/도로/);
  await assert.rejects(prepareWarpArrival(core,sim,{...point,z:5}),/도로/);
  sim.setObstacles([{center:[0,12,1.5],size:[60,24,5]}]);
  await assert.rejects(prepareWarpArrival(core,sim,point),/도로/);
  const abort=new AbortController();abort.abort();
  await assert.rejects(prepareWarpArrival(core,sim,point,{signal:abort.signal}),{name:'AbortError'});
  assert.ok(sim.state.pos.equals(position));
});

test('paused map prepares all four remote guard tiles, keeps local colliders and limits worker requests',async t=>{
  const requests=[],tiles={},wanted=['5_1','5_2','6_1','6_2'],previous=globalThis.Worker;
  const dest={...point,x:3072,z:1024};
  const stalled='7_3',cancelled=[];
  for(const key of ['0_0',...wanted,stalled]){
    const [ix,iz]=key.split('_').map(Number);
    tiles[key]={bounds:{minX:ix*512,maxX:(ix+1)*512,minZ:iz*512,maxZ:(iz+1)*512}};
  }
  globalThis.Worker=class {
    postMessage({type,id,options}){
      if(type==='cancel')cancelled.push(id);
      if(type)return;
      requests.push(options.id);
      if(options.id===stalled)return;
      const payload={id:options.id,origin:options.origin,roads:[{...road,points:[[3000,1024],[3170,1024]]}],
        trees:[],meshes:[],obstacles:[{center:[5000,1,5000],size:[1,2,1]}]};
      queueMicrotask(()=>this.onmessage({data:{id,payload}}));
    }
    terminate(){}
  };
  t.after(()=>{if(previous)globalThis.Worker=previous;else delete globalThis.Worker;});
  const data={schemaVersion:1,tileSize:512,bounds:{minX:-512,minZ:-512,maxX:4096,maxZ:2048},tiles};
  const city={...core,root:new Group(),buildings:[],spawn:{position:[0,0,0]},nearestRoadName:()=>'',dispose(){}};
  const manifestUrl=new URL('data:application/json,'+encodeURIComponent(JSON.stringify(data)));
  await attachStreamingCity(city,{manifestUrl});t.after(()=>city.dispose());
  const sim=new PhysicsSim();
  city.streaming.bindPhysics(sim);
  for(let frame=0;frame<8&&!city.streaming.hasAt(0,0);frame++){
    city.streaming.update(0,0);
    await new Promise(resolve=>setImmediate(resolve));
  }
  assert.ok(city.streaming.hasAt(0,0));
  assert.deepEqual(await prepareWarpArrival(city,sim,dest),{x:3072,z:1024,heading:0,surfaceY:0});
  assert.deepEqual([...requests].sort(),['0_0',...wanted].sort());
  for(const key of requests)assert.ok(sim.obstacleChunks.has('seoul:'+key));
  assert.ok(city.streaming.hasAt(0,0));
  const controller=new AbortController();
  const pending=prepareWarpArrival(city,sim,{...dest,x:3840,z:1792},{signal:controller.signal});
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(requests.includes(stalled));
  controller.abort();
  await assert.rejects(pending,{name:'AbortError'});
  assert.equal(city.streaming.wanted.has(stalled),false);
  assert.equal(cancelled.length,1);
});
