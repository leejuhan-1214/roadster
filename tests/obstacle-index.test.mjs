import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {createObstacleIndex,queryObstacles} from '../dist/js/obstacle-index.js';
import {PhysicsSim} from '../dist/js/physics.js';

function box(id,x,z,sx=8,sz=8){return {id,min:new Vector3(x-sx/2,0,z-sz/2),max:new Vector3(x+sx/2,10,z+sz/2)};}
test('city broad phase includes every intersecting box at negative and cell-boundary coordinates',()=>{
  const boxes=Array.from({length:500},(_,i)=>box(i,(i%25-12)*24,(Math.floor(i/25)-10)*24));
  boxes.push(box('wide',0,0,100000,100000));
  const index=createObstacleIndex(boxes);
  for(const [x,z,r] of [[0,0,0],[-32,-32,3],[31.99,32.01,7],[300,-200,4]]){
    const actual=queryObstacles(index,x,z,r);
    const exact=boxes.filter(b=>b.max.x>=x-r&&b.min.x<=x+r&&b.max.z>=z-r&&b.min.z<=z+r);
    for(const hit of exact)assert.ok(actual.includes(hit));
    assert.equal(actual.length,new Set(actual).size);
    assert.deepEqual(actual,[...actual].sort((a,b)=>boxes.indexOf(a)-boxes.indexOf(b)));
    assert.ok(actual.length<20,'the city query discards distant buildings');
  }
});

test('indexed collision and support match linear resolution with hundreds of distant buildings',()=>{
  const near=[{id:'wall',center:[8,3,0],size:[.2,6,15]},{id:'platform',center:[-20,.5,0],size:[10,1,10]}];
  const distant=Array.from({length:500},(_,i)=>({id:'far'+i,center:[200+(i%25)*18,10,200+Math.floor(i/25)*18],size:[8,20,8]}));
  const a=new PhysicsSim({aeroEnabled:false}),b=new PhysicsSim({aeroEnabled:false});
  a.setObstacles([...near,...distant]);b.setObstacles(near);
  assert.equal(a.surfaceHeightAt(-20,0,2),b.surfaceHeightAt(-20,0,2));
  for(const sim of [a,b]){sim.state.vel.x=12;for(const wheel of sim.wheels)wheel.omega=12/sim.params.wheelRadius;}
  for(let i=0;i<500;i++){a.step(.002,{});b.step(.002,{});}
  assert.ok(a.state.pos.distanceTo(b.state.pos)<1e-10);
  assert.ok(a.state.vel.distanceTo(b.state.vel)<1e-10);
  assert.equal(a.collisionCount,b.collisionCount);assert.equal(a.lastObstacleImpact.id,'wall');
  a.setObstacles([]);assert.equal(a.surfaceHeightAt(-20,0,2),0,'clearing a city also clears its spatial index');
});
