import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import { PhysicsSim, ATMOSPHERE } from '../dist/js/physics.js';

const step=(sim,count,input={stabilize:false},dt=.002)=>{for(let i=0;i<count;++i)sim.step(dt,input);};
const kinetic=sim=>.5*sim.mass*sim.state.vel.lengthSq()+.5*sim.state.omega.clone().multiply(sim.inertia).dot(sim.state.omega);
function maxBodyX(sim){let max=-Infinity;for(const x of [-1.95,1.95])for(const y of [-.32,.55])for(const z of [-.87,.87])max=Math.max(max,new Vector3(x,y,z).sub(sim.cg).applyQuaternion(sim.state.q).add(sim.state.pos).x);return max;}

test('head-on wall collision removes inward momentum, dissipates kinetic energy and does not pass through',()=>{
  const sim=new PhysicsSim({gravity:0,aeroEnabled:false});
  sim.state.pos.y=10;sim.contactCount=0;sim.state.vel.x=20;
  sim.setObstacles([{id:'wall',center:[5.1,10,0],size:[.2,12,12]}]);
  const energy=kinetic(sim);let peakX=-Infinity;
  for(let i=0;i<180;i++){sim.step(.002,{stabilize:false});peakX=Math.max(peakX,maxBodyX(sim));}
  assert.ok(peakX<=5.00001,`outer chassis X ${peakX}`);
  assert.ok(kinetic(sim)<energy*.08);
  assert.ok(sim.lastObstacleImpact?.id==='wall');
  assert.ok(sim.impactImpulse>0);
  assert.equal(sim.state.gas,sim.initialGas);
});

test('rotated oblique contact resolves an oriented chassis and generates angular response',()=>{
  const sim=new PhysicsSim({gravity:0,aeroEnabled:false});
  sim.state.pos.y=10;sim.state.q.setFromAxisAngle(new Vector3(0,1,0),.4);sim.contactCount=0;sim.state.vel.x=15;
  sim.setObstacles([{id:'wall',center:[5.1,10,0],size:[.2,12,12]}]);
  const energy=kinetic(sim);step(sim,140);
  assert.ok(maxBodyX(sim)<5.00001);
  assert.ok(Math.abs(sim.state.omega.y)>.1,'off-center contact produces a yaw impulse');
  assert.ok(kinetic(sim)<energy);
});

test('thin obstacle stops a 300 m/s chassis at the fixed substep without tunneling',()=>{
  const sim=new PhysicsSim({gravity:0,aeroEnabled:false});sim.state.pos.y=20;sim.contactCount=0;sim.state.vel.x=300;
  sim.setObstacles([{id:'thin-wall',center:[5,20,0],size:[.04,20,20]}]);
  // A single display-frame step is still subdivided by the ordinary physics integrator.
  sim.step(.1,{stabilize:false});
  assert.ok(maxBodyX(sim)<4.98001);
  assert.ok(sim.state.vel.x<0);
  assert.ok(sim.lastObstacleImpact?.id==='thin-wall');
  assert.ok([...sim.state.pos.toArray(),...sim.state.omega.toArray()].every(Number.isFinite));
});

test('four independent wheel springs land on a platform top, settle and carry the vehicle weight',()=>{
  const sim=new PhysicsSim();sim.setObstacles([{id:'platform',center:[0,1,0],size:[12,2,12]}]);
  sim.state.pos.y=6;sim.contactCount=0;step(sim,3000);
  assert.equal(sim.contactCount,4);
  assert.ok(Math.abs(sim.state.pos.y-(2+sim.restHeight))<.003);
  assert.ok(Math.abs(sim.state.vel.y)<.01);
  for(const w of sim.wheels){assert.equal(w.surfaceY,2);assert.ok(w.load>0);}
  assert.ok(Math.abs(sim.wheels.reduce((n,w)=>n+w.load,0)-sim.mass*sim.params.gravity)<1);
  assert.equal(sim.surfaceHeightAt(0,0,.3),0,'an overhead box is not a tire support surface');
});

test('ceiling impact acts downwards without creating roof tire contacts',()=>{
  const sim=new PhysicsSim({gravity:0,aeroEnabled:false});sim.state.pos.y=2;sim.state.vel.y=10;sim.contactCount=0;
  sim.setObstacles([{id:'ceiling',center:[0,4.5,0],size:[12,1,12]}]);step(sim,200);
  assert.ok(sim.state.pos.y+.55<4.00001);
  assert.ok(sim.state.vel.y<0);
  assert.equal(sim.contactCount,0);
  assert.ok(sim.wheels.every(w=>w.load===0));
});

test('empty obstacle set leaves normal integration unchanged and malformed geometry is rejected',()=>{
  const a=new PhysicsSim(),b=new PhysicsSim();b.setObstacles([]);
  step(a,150,{throttle:1,stabilize:true});step(b,150,{throttle:1,stabilize:true});
  assert.deepEqual(a.state.pos.toArray(),b.state.pos.toArray());
  assert.deepEqual(a.state.vel.toArray(),b.state.vel.toArray());
  assert.throws(()=>b.setObstacles([{center:[0,0,0],size:[1,-1,1]}]),TypeError);
  b.setObstacles([{id:'test',center:[12,1,0],size:[2,2,2]}]);b.reset();assert.equal(b.obstacles.length,1);
  b.setObstacles([]);assert.equal(b.obstacles.length,0);
});

function airborne(){const s=new PhysicsSim({aeroEnabled:false});s.state.pos.y=20;s.contactCount=0;return s;}
test('WASD vectors finite-gas thrust while holding the chassis nearly level',()=>{
  const forward=airborne();forward.step(.002,{lift:1,airMoveForward:1});
  assert.ok(Math.abs(forward.state.vel.x)<.001,'actuator and valve lag give bounded first-step acceleration');
  step(forward,499,{lift:1,airMoveForward:1});
  assert.ok(forward.state.vel.x>1.5);
  assert.ok(forward.state.q.angleTo(new Quaternion())<.02,'body stays level while nozzles turn');
  assert.ok(forward.state.gas<forward.initialGas);
  assert.ok(forward.wheels.every(w=>w.load===0));
  const right=airborne(),left=airborne();step(right,500,{lift:1,airMoveRight:1});step(left,500,{lift:1,airMoveRight:-1});
  assert.ok(right.state.vel.z>1.5&&left.state.vel.z<-1.5);
  assert.ok(Math.abs(right.state.vel.z+left.state.vel.z)<1e-8);
  step(forward,750,{stabilize:true});
  assert.ok(forward.state.q.angleTo(new Quaternion())<.02,'released input returns to level via attitude feedback');
});

test('depleted tank cannot move or tilt in response to airborne direction commands',()=>{
  const sim=airborne();sim.state.pressure=ATMOSPHERE;
  step(sim,200,{lift:1,airMoveForward:1,airMoveRight:1});
  assert.equal(sim.state.vel.x,0);assert.equal(sim.state.vel.z,0);
  assert.equal(sim.state.q.angleTo(new Quaternion()),0);
  assert.equal(sim.totalThrust,0);
});
