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
  advance(dry,new DrivingController(),keys('KeyB'),3);
  advance(ice,new DrivingController(),keys('KeyB'),3);
  assert.ok(Math.abs(dry.state.vel.x)<.02);assert.ok(ice.state.vel.x>19);
  assert.equal(ice.frictionForceN,0);assert.ok(dry.state.pos.x<24);
});

test('restored Space lift and Shift rear boost use the finite tank, with B taking brake priority',()=>{
  const sim=new PhysicsSim(CITY_DRIVE_PARAMS),control=new DrivingController(),gas=sim.state.gas;
  advance(sim,control,keys('Space'),1.2);
  assert.ok(sim.state.pos.y-sim.restHeight>.5,'Space lifts the car through actual nozzle force');
  assert.equal(sim.contactCount,0);assert.ok(sim.state.gas<gas-10);
  const before=sim.state.vel.x;
  advance(sim,control,keys('Space','ShiftLeft'),.6);
  assert.ok(sim.state.vel.x>before+1,'rear boost accelerates the rigid body');
  assert.ok(sim.thrusters[4].force>0&&sim.thrusters[5].force>0);
  const brake=control.update(keys('ShiftRight','KeyB'),sim,STEP);
  assert.equal(brake.boost,false);assert.equal(brake.airBrake,true);assert.ok(brake.airMoveForward<0);
});

test('H captures altitude once per press and respects Space override above the old 15 m limit',()=>{
  const sim=new PhysicsSim({...CITY_DRIVE_PARAMS,roadRoughness:0,aeroEnabled:false}),control=new DrivingController();
  sim.reset('flight');sim.state.pos.y=sim.restHeight+30;sim.state.vel.set(0,0,0);
  const initial=sim.state.pos.clone(),gas=sim.state.gas;
  const command=control.update(keys('KeyH'),sim,STEP);
  assert.equal(control.altHold,true);assert.equal(control.targetHeight,30);assert.equal(command.verticalAcceleration,0);
  assert.deepEqual(sim.state.pos,initial,'controller must not write pose');
  advance(sim,control,keys('KeyH'),.3);assert.equal(control.altHold,true,'key repeat cannot toggle hold off');
  advance(sim,control,keys(),.7);
  assert.ok(Math.abs(sim.state.pos.y-initial.y)<.15,'hold keeps the captured 30 m target');
  assert.ok(sim.state.gas<gas-10);
  const lift=control.update(keys('Space'),sim,STEP);
  assert.equal(lift.lift,1);assert.equal(lift.altHold,false);assert.equal(lift.verticalAcceleration,undefined);
  const resumed=control.update(keys(),sim,STEP);assert.equal(resumed.altHold,true);
  control.update(keys('KeyH'),sim,STEP);assert.equal(control.altHold,false);
  control.reset();assert.equal(control.altHold,false);assert.equal(control.airborne,false);
});

test('air WASD steers gimbals while B slows with gas and cannot brake an empty tank in vacuum',()=>{
  const sim=new PhysicsSim({...CITY_DRIVE_PARAMS,roadRoughness:0,aeroEnabled:false}),control=new DrivingController();
  sim.reset('flight');sim.state.pos.y=sim.restHeight+20;sim.state.vel.set(8,0,0);
  const request=control.update(keys('KeyW','KeyD','ArrowUp','KeyQ'),sim,STEP);
  assert.equal(request.throttle,0);assert.equal(request.steer,0);
  assert.equal(request.airMoveForward,1);assert.equal(request.airMoveRight,1);
  assert.equal(request.pitch,-1);assert.equal(request.yaw,1);
  const gas=sim.state.gas;
  advance(sim,control,keys('KeyB'),1.5);
  assert.ok(sim.state.vel.x<4,'air brake applies opposing nozzle force');
  assert.ok(sim.state.gas<gas-10);assert.equal(sim.contactCount,0);
  assert.ok(Math.abs(sim.state.q.x)<.03&&Math.abs(sim.state.q.z)<.03,'vectored braking holds the chassis level');
  const empty=new PhysicsSim({...CITY_DRIVE_PARAMS,tankPressureMPa:.101325,aeroEnabled:false,roadRoughness:0});
  empty.reset('flight');empty.state.pos.y=empty.restHeight+50;empty.state.vel.set(8,0,0);
  advance(empty,new DrivingController(),keys('KeyB'),1);
  assert.ok(Math.abs(empty.state.vel.x-8)<1e-9,'without gas or aerodynamic drag, B cannot slow airborne horizontal motion');
  assert.equal(empty.totalThrust,0);assert.equal(empty.contactCount,0);
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
