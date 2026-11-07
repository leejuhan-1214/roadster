import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion} from 'three';
import {PhysicsSim,allocateLift,GIMBAL_LIMIT,GIMBAL_RATE,ATMOSPHERE} from '../dist/js/physics.js';
import {getLevelMoveInput,createGuidedRun,updateGuidedRun} from '../dist/js/flight-plan.js';
import {createVehicle} from '../dist/js/vehicle.js';
import {RenderStateBuffer} from '../dist/js/render-state.js';
const up=new Vector3(0,1,0),dt=.002;
const airborne=(params={})=>{const sim=new PhysicsSim({aeroEnabled:false,...params});sim.state.pos.y=10;sim.contactCount=0;return sim;};
const tilt=sim=>Math.acos(Math.min(1,up.clone().applyQuaternion(sim.state.q).y));
test('vector allocator conserves commanded vertical force and cancels off-axis roll/pitch moment',()=>{
 for(const cg of [new Vector3(),new Vector3(.2,.1,-.1)])for(const direction of [new Vector3(.3,1,0).normalize(),new Vector3(.25,1,-.3).normalize()]){
  const V=21000,tx=450,tz=-700,result=allocateLift(V,tx,tz,direction,cg,[18000,18000,18000,18000]);
  const force=new Vector3(),torque=new Vector3();let i=0;
  for(const x of [.86,-.86])for(const z of [-.80,.80]){const r=new Vector3(x,-.46,z).sub(cg),f=direction.clone().multiplyScalar(result.thrust[i++]);force.add(f);torque.add(new Vector3().crossVectors(r,f));}
  assert.ok(!result.saturated);assert.ok(result.thrust.every(f=>f>=0&&f<=18000));
  assert.ok(Math.abs(force.y-V)<1e-8);assert.ok(Math.abs(torque.x-tx)<1e-8);assert.ok(Math.abs(torque.z-tz)<1e-8);assert.ok(Math.abs(torque.y-result.yawTorque)<1e-8);
 }
 const f=allocateLift(21000,0,0,new Vector3(.4,1,0).normalize(),new Vector3(),[18000,18000,18000,18000]).thrust;
 assert.ok(f[2]>f[0],'rear lift compensates the nose-up moment from forward force below CG');
 const limited=allocateLift(21000,0,0,up,new Vector3(),[200,200,200,200]);assert.ok(limited.saturated);assert.ok(limited.thrust.every(f=>f>=0&&f<=200));
});
test('all four horizontal directions and diagonal move with small body tilt and real gas use',()=>{
 for(const [x,z] of [[1,0],[-1,0],[0,1],[0,-1],[1,1]]){
  const sim=airborne({cgX:.2,cgY:.1,cgZ:-.1});let maxTilt=0;
  for(let i=0;i<500;i++){sim.step(dt,{lift:1,airMoveForward:x,airMoveRight:z});maxTilt=Math.max(maxTilt,tilt(sim));}
  if(x)assert.ok(sim.state.vel.x*x>2);if(z)assert.ok(sim.state.vel.z*z>2);
  assert.ok(maxTilt<1.2*Math.PI/180);assert.ok(sim.state.gas<sim.initialGas-20);assert.equal(sim.contactCount,0);
  assert.ok(Math.abs(sim.telemetry().gimbalAngleDeg-25)<1e-8);assert.ok(sim.wheels.every(w=>w.load===0));
 }
});
test('gimbal cone and slew limits survive reversals and return to centre without teleporting the body',()=>{
 const sim=airborne();let previous=up.clone();
 for(let i=0;i<600;i++){const axis=i<200?1:i<400?-1:0;sim.step(dt,{lift:1,airMoveForward:axis,airMoveRight:axis});const direction=sim.thrusters[0].dir;
  assert.ok(up.angleTo(direction)<=GIMBAL_LIMIT+1e-9);assert.ok(previous.angleTo(direction)<=GIMBAL_RATE*dt+1e-8);previous.copy(direction);
 }
 assert.ok(up.angleTo(sim.thrusters[0].dir)<1e-8);sim.reset();assert.equal(sim.telemetry().gimbalAngleDeg,0);
});
test('pressure limits and manual attitude inputs remain physical instead of locking orientation',()=>{
 const empty=airborne();empty.state.pressure=ATMOSPHERE;empty.step(.1,{lift:1,airMoveRight:1});assert.equal(empty.state.vel.z,0);assert.equal(empty.totalThrust,0);
 const low=airborne({tankPressureMPa:1});for(let i=0;i<500;i++)low.step(dt,{altHold:true,targetHeight:10,airMoveRight:1});assert.ok(low.saturation);assert.ok(low.state.vel.y<-5);
 const manual=airborne();for(let i=0;i<300;i++)manual.step(dt,{lift:1,pitch:1});assert.ok(tilt(manual)>.1,'manual pitch still rotates the rigid body through torque');
 const ground=new PhysicsSim();ground.step(.1,{airMoveRight:1});assert.equal(ground.telemetry().gimbalAngleDeg,0);
});
test('level movement demonstration lands with bounded attitude using the normal gas controller',()=>{
 const sim=new PhysicsSim(),run=createGuidedRun('2');let maxTilt=0,maxZ=0,peakAngle=0;
 for(let i=0;i<3000&&!run.ended;i++){updateGuidedRun(run,sim);if(run.ended)break;sim.step(dt,getLevelMoveInput(sim.state.time));maxTilt=Math.max(maxTilt,tilt(sim));maxZ=Math.max(maxZ,sim.state.pos.z);peakAngle=Math.max(peakAngle,sim.telemetry().gimbalAngleDeg);}
 assert.equal(run.reason,'landed');assert.ok(maxZ>.5);assert.ok(maxTilt<.04);assert.ok(peakAngle>24);assert.ok(sim.state.gas>0&&sim.state.gas<sim.initialGas);assert.ok(run.contactSpeed<2);
});
test('visible nozzle hinges and interpolated exhaust agree with the physical axes',()=>{
 const vehicle=createVehicle(),sim=airborne(),buffer=new RenderStateBuffer(sim);assert.equal(vehicle.gimbalNozzles.length,4);
 buffer.beforeStep();sim.step(.1,{lift:1,airMoveRight:1});buffer.afterStep(sim);const pose=buffer.sample(.5);
 vehicle.root.position.copy(pose.bodyPosition);vehicle.root.quaternion.copy(pose.q);
 for(let i=0;i<4;i++){
  const pivot=vehicle.gimbalNozzles[i],t=pose.thrusters[i];pivot.quaternion.setFromUnitVectors(up,t.dir);pivot.updateWorldMatrix(true,false);
  const origin=pivot.getWorldPosition(new Vector3()),expected=t.pos.clone().applyQuaternion(pose.q).add(pose.pos);assert.ok(origin.distanceTo(expected)<1e-9);
  const offset=pivot.userData.exitOffset.clone(),exit=pivot.localToWorld(offset.clone());const direction=t.dir.clone().applyQuaternion(pose.q);
  assert.ok(exit.clone().sub(origin).normalize().dot(direction)<-.999999);assert.deepEqual(pivot.userData.exitOffset.toArray(),offset.toArray());
 }
 assert.ok(pose.thrusters[0].dir.angleTo(up)>0&&pose.thrusters[0].dir.angleTo(up)<sim.thrusters[0].dir.angleTo(up));
});
