import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim} from '../dist/js/physics.js';
import {DrivingController,CITY_DRIVE_PARAMS} from '../dist/js/driving-input.js';
const STEP=.002,keys=(...codes)=>new Set(codes);
function advance(sim,control,input,seconds){for(let n=0;n<seconds/STEP;n++)sim.step(STEP,control.update(input,sim,STEP));}

test('city pedals brake before reverse and do not command thrust or direct state changes',()=>{
  const sim=new PhysicsSim(CITY_DRIVE_PARAMS),control=new DrivingController();sim.reset('rolling');
  const initial=sim.state.pos.clone(),velocity=sim.state.vel.clone();
  const request=control.update(keys('KeyS'),sim,STEP);
  assert.equal(request.throttle,0);assert.ok(request.brake>0);assert.equal(request.lift,0);assert.equal(request.stabilize,false);
  assert.deepEqual(sim.state.pos,initial);assert.deepEqual(sim.state.vel,velocity);
  let reversed=false;
  for(let i=0;i<2000;i++){
    const input=control.update(keys('KeyS'),sim,STEP);
    if(sim.state.vel.x>.3)assert.equal(input.throttle,0,'reverse must brake positive motion first');
    sim.step(STEP,input);if(input.throttle<0)reversed=true;
  }
  assert.ok(reversed);assert.ok(sim.state.vel.x<-.5);assert.equal(control.gear,'R');
  advance(sim,control,keys('KeyS'),6);assert.ok(sim.state.vel.x>-8.1,'reverse torque governor remains below 29 km/h');
});

test('accelerator responds and pedal release slows with friction even at a full battery',()=>{
  const sim=new PhysicsSim(CITY_DRIVE_PARAMS),control=new DrivingController();
  advance(sim,control,keys('KeyW'),3);
  assert.ok(sim.state.vel.x>20,'accelerator generates meaningful actual wheel acceleration');
  const before=sim.state.vel.x;
  // Full charge suppresses regenerative torque. The friction brake must still work.
  sim.state.batteryJ=sim.params.batteryKWh*3.6e6;
  advance(sim,control,keys(),3);
  assert.ok(before-sim.state.vel.x>4,'pedal-off braking does not depend on charging headroom');
  assert.ok(sim.brakeForceN>1000);assert.equal(sim.totalThrust,0);
});

test('city braking respects the tire surface instead of forcing velocity to zero',()=>{
  const dry=new PhysicsSim(CITY_DRIVE_PARAMS),ice=new PhysicsSim({...CITY_DRIVE_PARAMS,friction:0});
  dry.reset('rolling');ice.reset('rolling');
  advance(dry,new DrivingController(),keys('Space'),3);
  advance(ice,new DrivingController(),keys('Space'),3);
  assert.ok(Math.abs(dry.state.vel.x)<.02);assert.ok(ice.state.vel.x>19);
  assert.equal(ice.frictionForceN,0);assert.ok(dry.state.pos.x<24);
});

test('keyboard steering recentres and reduces high-speed steering without inventing yaw',()=>{
  const sim=new PhysicsSim(CITY_DRIVE_PARAMS),control=new DrivingController();
  for(let i=0;i<200;i++)control.update(keys('KeyA'),sim,STEP);
  assert.ok(control.steer>.99);
  sim.state.vel.x=40;
  for(let i=0;i<200;i++)control.update(keys('ArrowLeft'),sim,STEP);
  assert.ok(control.steer<.08);assert.equal(sim.state.omega.length(),0);
  for(let i=0;i<200;i++)control.update(keys(),sim,STEP);
  assert.equal(control.steer,0);
  const conflict=control.update(keys('KeyW','KeyS','KeyD','KeyA'),sim,STEP);
  assert.equal(conflict.throttle,0);assert.ok(conflict.brake>0);assert.equal(conflict.steer,0);
});
