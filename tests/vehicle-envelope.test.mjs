import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {PhysicsSim} from '../dist/js/physics.js';
import {BODY_ENVELOPE} from '../dist/js/vehicle-layout.js';

const advance=(sim,n)=>{for(let i=0;i<n;i++)sim.step(.002,{stabilize:false});};

test('default envelope preserves the original Roadster drop trajectory',()=>{
  const implicit=new PhysicsSim(),explicit=new PhysicsSim({
    bodyLength:4.42,bodyWidth:2.2,bodyHeight:1.14,bodyCenterY:.08,
  });
  assert.deepEqual(implicit.bodyHalf,BODY_ENVELOPE.half);
  assert.deepEqual(implicit.bodyBoxCenter.toArray(),BODY_ENVELOPE.center);
  for(const sim of [implicit,explicit]){sim.reset('drop');advance(sim,2500);}
  assert.deepEqual(implicit.state.pos.toArray(),explicit.state.pos.toArray());
  assert.deepEqual(implicit.state.vel.toArray(),explicit.state.vel.toArray());
  assert.equal(implicit.lastImpactSpeed,explicit.lastImpactSpeed);
  assert.equal(implicit.maxG,explicit.maxG);
});

test('obstacle contact uses the selected vehicle length and width',()=>{
  for(const axis of ['x','z']){
    const short=new PhysicsSim({gravity:0,aeroEnabled:false,bodyLength:2,bodyWidth:1});
    const long=new PhysicsSim({gravity:0,aeroEnabled:false,bodyLength:6,bodyWidth:3});
    const wall=axis==='x'?{center:[2.5,10,0],size:[.2,10,20]}:{center:[0,10,1.25],size:[20,10,.2]};
    for(const sim of [short,long]){
      sim.state.pos.set(0,10,0);sim.state.vel[axis]=2;sim.contactCount=0;
      sim.setObstacles([{id:'extent-wall',...wall}]);advance(sim,1);
    }
    assert.equal(short.collisionCount,0);
    assert.equal(long.lastObstacleImpact.id,'extent-wall');
    assert.ok(long.lastObstacleImpact.impulse>0);
    assert.ok(long.state.vel[axis]<short.state.vel[axis]);
  }
});

test('ground spring and overlap correction use selected body height and vertical center',()=>{
  const shallow=new PhysicsSim({gravity:0,aeroEnabled:false,bodyHeight:1,bodyCenterY:-.2});
  const deep=new PhysicsSim({gravity:0,aeroEnabled:false,bodyHeight:3,bodyCenterY:-.2});
  for(const sim of [shallow,deep]){sim.state.pos.set(0,1,0);sim.contactCount=0;advance(sim,1);}
  assert.equal(shallow.state.acceleration.y,0);
  assert.ok(deep.state.acceleration.y>0,'the new lower hull supplies body skid force');
  assert.ok(deep.state.pos.y>=1.7-1e-12,'the selected lower hull cannot remain below ground');
});

test('tilted vehicle ground correction accounts for its width',()=>{
  const results=[];
  for(const width of [1,3]){
    const sim=new PhysicsSim({gravity:0,bodyWidth:width,bodyHeight:.5,bodyCenterY:0});
    sim.state.pos.set(0,.2,0);
    sim.state.q.setFromAxisAngle(new Vector3(1,0,0),Math.PI/2);
    sim._resolveGround();results.push(sim.state.pos.y);
  }
  assert.ok(Math.abs(results[0]-.5)<1e-12);
  assert.ok(Math.abs(results[1]-1.5)<1e-12);
});

test('reset updates envelopes and constrains invalid dimensions without losing zero center',()=>{
  const sim=new PhysicsSim();
  Object.assign(sim.params,{bodyLength:5,bodyWidth:1.8,bodyHeight:1.2,bodyCenterY:0});
  sim.reset();assert.deepEqual(sim.bodyHalf,[2.5,.6,.9]);assert.equal(sim.bodyBoxCenter.y,0);
  Object.assign(sim.params,{bodyLength:Infinity,bodyWidth:-1,bodyHeight:100,bodyCenterY:NaN});
  sim.reset();assert.deepEqual(sim.bodyHalf,[2.21,2,.25]);assert.equal(sim.bodyBoxCenter.y,.08);
});
