import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {PhysicsSim,DEFAULTS} from '../dist/js/physics.js';
import {DrivingController,CITY_DRIVE_PARAMS} from '../dist/js/driving-input.js';
import {vehicleProfile,vehiclePhysics} from '../dist/js/vehicle-profiles.js';
import {adaptRoadsterScene} from '../dist/js/roadster-model.js';
import {createVehicle} from '../dist/js/vehicle.js';
import {prepareAssessmentVehicle} from '../dist/js/assessment-vehicle.js';
import {configureVehicleFit} from '../dist/js/vehicle-fit.js';
import {disposeVehicle} from '../dist/js/real-vehicle-model.js';
import {loadModelGeometry} from './model-loader-helper.mjs';

const dt=.002,spawnHeading=-1.22009,up=new Vector3(0,1,0);
const keys=(...codes)=>new Set(codes);
function moving(params={},speed=70/3.6){
  const sim=new PhysicsSim({...CITY_DRIVE_PARAMS,...params}),driver=new DrivingController();
  sim.state.q.setFromAxisAngle(up,spawnHeading);sim.state.pos.set(-2.95,sim.restHeight,17.28);
  sim.state.vel.set(Math.cos(spawnHeading)*speed,0,-Math.sin(spawnHeading)*speed);
  sim.wheels.forEach(w=>w.omega=speed/sim.params.wheelRadius);driver.throttle=1;
  return {sim,driver};
}
function turnRun(params,kph,code='KeyA',fullThrottle=false){
  const {sim,driver}=moving(params,kph/3.6),initialGas=sim.state.gas;
  for(let i=0;i<1000;i++){
    const input=driver.update(keys('KeyW',code),sim,dt);
    // A sustained full-torque request is the former keyboard behaviour.
    if(fullThrottle)input.throttle=1;
    sim.step(dt,input);
    assert.equal(sim.contactCount,4);assert.equal(sim.state.gas,initialGas);
  }
  return {yaw:Math.atan2(Math.sin(sim.telemetry().attitude.yaw-spawnHeading),Math.cos(sim.telemetry().attitude.yaw-spawnHeading)),speed:sim.telemetry().horizontalSpeed,sim};
}

test('actual Roadster chassis steers in both directions at city heading under held W',async()=>{
  const profile=vehicleProfile('roadster'),gltf=await loadModelGeometry(profile);
  const vehicle=adaptRoadsterScene(gltf.scene,createVehicle(),gltf.parser);
  try{
    prepareAssessmentVehicle(vehicle);configureVehicleFit(vehicle,profile);
    const params={...vehiclePhysics(profile,vehicle.geometryParams,DEFAULTS),...CITY_DRIVE_PARAMS};
    const full=turnRun(params,70,'KeyA',true),left=turnRun(params,70),right=turnRun(params,70,'KeyD');
    assert.ok(left.yaw>full.yaw*1.65,'reserving tire grip must improve actual heading response over full drive torque');
    assert.ok(left.yaw>.4&&right.yaw<-.4,'A/D must turn the rigid chassis, not only its wheels');
    assert.ok(Math.abs(left.yaw+right.yaw)<.015,'left and right remain symmetric at the real spawn heading');
    assert.ok(left.speed<full.speed-3,'assist changes wheel drive request instead of inventing extra lateral force');
  }finally{disposeVehicle(vehicle);}
});

test('keyboard cornering improves full-accelerator turns at moderate and high road speeds',()=>{
  for(const kph of [40,100]){
    const full=turnRun({},kph,'KeyA',true),assisted=turnRun({},kph);
    assert.ok(assisted.yaw>full.yaw*1.4,kph+' km/h heading response improves');
    assert.ok(assisted.speed>kph/3.6,'forward drive still accelerates while steering');
  }
});

test('ground cornering obeys dry/wet/ice tire force limits and cannot turn on zero friction',()=>{
  for(const mu of [1.15,.65,.15,0]){
    const result=turnRun({friction:mu,roadRoughness:0,aeroEnabled:false},70);
    for(const wheel of result.sim.wheels)assert.ok(wheel.tireForceN<=mu*wheel.load+1e-6);
    if(mu>0)assert.ok(result.sim.frictionForceN>0);
    if(mu===0){assert.ok(Math.abs(result.yaw)<1e-9);assert.equal(result.sim.frictionForceN,0);assert.equal(result.sim.totalThrust,0);}
  }
});

test('cornering torque priority leaves straight launch, coasting, braking, reverse and flight controls intact',()=>{
  const {sim,driver}=moving(),start=driver.update(keys('KeyW'),sim,.1);
  assert.equal(start.throttle,1);assert.equal(start.corneringAssist,false);
  const turning=driver.update(keys('KeyW','KeyA'),sim,.1);assert.ok(turning.throttle<=.45+1e-12);assert.equal(turning.corneringAssist,true);
  const coasting=driver.update(keys('KeyA'),sim,.1);assert.equal(coasting.throttle,0);assert.equal(coasting.brake,.1);assert.equal(coasting.corneringAssist,false);
  const brake=driver.update(keys('KeyW','KeyA','KeyB'),sim,.1);assert.equal(brake.throttle,0);assert.equal(brake.brake,1);
  const reverse=moving({},-3);reverse.driver.throttle=-1;
  const r=reverse.driver.update(keys('KeyS','KeyA'),reverse.sim,.1);assert.equal(r.corneringAssist,false);assert.ok(r.throttle<0);
  const parking=moving({},2),p=parking.driver.update(keys('KeyW','KeyA'),parking.sim,.1);assert.equal(p.corneringAssist,false);assert.equal(p.throttle,1);
  sim.state.pos.y=sim.restHeight+5;sim.contactCount=0;
  const flight=driver.update(keys('KeyW','KeyA'),sim,.1);assert.equal(flight.corneringAssist,false);assert.equal(flight.throttle,0);assert.equal(flight.airMoveForward,1);assert.equal(flight.yaw,1);
});
