import test from 'node:test';
import assert from 'node:assert/strict';
import {VEHICLES,vehiclePhysics} from '../dist/js/vehicle-profiles.js';
import {ELECTRIC_DRIVE_DEFAULTS} from '../dist/js/electric-drive.js';
import {PhysicsSim,DEFAULTS} from '../dist/js/physics.js';
import {CITY_DRIVE_PARAMS,DrivingController} from '../dist/js/driving-input.js';
import {rocketRollAuthority} from '../dist/js/rocket-flight.js';
import {adaptRealVehicle,disposeVehicle} from '../dist/js/real-vehicle-model.js';
import {adaptRoadsterScene} from '../dist/js/roadster-model.js';
import {createVehicle} from '../dist/js/vehicle.js';
import {prepareAssessmentVehicle} from '../dist/js/assessment-vehicle.js';
import {prepareRocketRetrofit} from '../dist/js/rocket-retrofit.js';
import {configureVehicleFit} from '../dist/js/vehicle-fit.js';
import {loadModelGeometry} from './model-loader-helper.mjs';
const dt=.002, up=s=>1-2*(s.state.q.x**2+s.state.q.z**2);
const selected=['mazda-miata-mx-5','bmw','ferrari','roadster','tesla-cybertruck'];
for(const id of ['sd-67gp-kuiper-t81','sd-67gp-guthrie-eagle','chevrolet-onix'])test(id+': level-road acceleration and rear boost keep tire contact',async()=>{
 const profile=VEHICLES.find(p=>p.id===id),gltf=await loadModelGeometry(profile);
 const car=adaptRealVehicle(gltf.scene,profile);
 try{
  prepareAssessmentVehicle(car);prepareRocketRetrofit(car);configureVehicleFit(car,profile);
  const params={...vehiclePhysics(profile,car.geometryParams,DEFAULTS),...CITY_DRIVE_PARAMS,
    parkedWheelMounts:true,cityWheelGeometry:car.cityWheelGeometry,cityGroundSupports:car.cityGroundSupports};
  for(const boost of [false,true]){
   const sim=new PhysicsSim(params),driver=new DrivingController(),idle=new Set(),pedals=new Set(['KeyW']);
   if(boost)pedals.add('KeyF');
   sim.reset('ground');
   for(let i=0;i<350;i++)sim.step(dt,driver.update(idle,sim,dt));
   const initial=sim.state.pos.clone();
   for(let i=0;i<2500;i++){
    sim.step(dt,driver.update(pedals,sim,dt));
    assert.ok(sim.contactCount>0,'ordinary forward acceleration must stay on the road');
   }
   assert.ok(sim.state.pos.x-initial.x>50);
   assert.ok(Math.abs(sim.state.pos.z-initial.z)<1,'neutral steering must hold a straight line');
   assert.ok(Math.abs(sim.telemetry().attitude.yaw)<Math.PI/180);
   assert.equal(sim.state.gasUsed>0,boost);
   const lift=new Set(['Space','KeyF']);
   for(let i=0;i<700;i++)sim.step(dt,driver.update(lift,sim,dt));
   assert.equal(sim.contactCount,0,'commanded lift still works with the booster held');
  }
  // The street heading and submillimetre road relief break the perfect left/
  // right symmetry of a car placed at the origin. The course also supplies
  // unlimited gas, so tank depletion cannot hide back-driven motor overspeed.
  const heading=-1.22009,sim=new PhysicsSim({...params,unlimitedRaceGas:true}),driver=new DrivingController();
  sim.state.pos.x=-2.95;sim.state.pos.z=17.28;sim.state.q.setFromAxisAngle({x:0,y:1,z:0},heading);
  const start=sim.state.pos.clone(),pedals=new Set(['KeyW','KeyF']),onlyW=new Set(['KeyW']),idle=new Set();
  for(let i=0;i<400;i++)sim.step(dt,driver.update(idle,sim,dt));
  let maxRPM=0;
  for(let i=0;i<5000;i++){
   const keys=i<800||(i>1400&&i<2000)?onlyW:pedals;
   sim.step(dt,driver.update(keys,sim,dt));
   maxRPM=Math.max(maxRPM,...sim.motorState.motors.map(m=>m.rpm));
   assert.ok(sim.contactCount>0);
  }
  const dx=sim.state.pos.x-start.x,dz=sim.state.pos.z-start.z;
  assert.ok(dx*Math.cos(heading)-dz*Math.sin(heading)>400);
  assert.ok(Math.abs(dx*Math.sin(heading)+dz*Math.cos(heading))<.5,'straight burst acceleration should hold the chosen street heading');
  assert.ok(maxRPM<ELECTRIC_DRIVE_DEFAULTS.maxMotorRPM*1.02,'rear boost must respect coupled road motor redline');
  // A brief upward impulse reproduces the suspension unload after a curb.
  // F remains held throughout. Only a deliberate launch may use belly jets.
  sim.state.vel.y+=2.3;
  let unloaded=false,backOnTires=false,peak=0;
  const y=sim.state.pos.y;
  for(let i=0;i<750;i++){
   sim.step(dt,driver.update(pedals,sim,dt));
   unloaded ||= sim.contactCount===0;
   backOnTires ||= unloaded&&sim.contactCount>=3;
   peak=Math.max(peak,sim.state.pos.y-y);
   assert.ok(sim.thrusters.slice(0,4).every(nozzle=>nozzle.force<1),'a road hop must stay unpowered vertically');
  }
  assert.ok(unloaded&&backOnTires&&peak<.5,'the car should settle after the hop');
 }finally{disposeVehicle(car);}
});
for(const id of selected)test(id+': fitted real chassis uses shared jets and completes a physical roll within its authority envelope',async()=>{
 const profile=VEHICLES.find(p=>p.id===id),gltf=await loadModelGeometry(profile);
 const vehicle=id==='roadster'?adaptRoadsterScene(gltf.scene,createVehicle(),gltf.parser):adaptRealVehicle(gltf.scene,profile);
 let params;
 try{prepareAssessmentVehicle(vehicle);prepareRocketRetrofit(vehicle);configureVehicleFit(vehicle,profile);params=vehiclePhysics(profile,vehicle.geometryParams,DEFAULTS);}finally{disposeVehicle(vehicle);}
 assert.equal(params.propulsionProfile,'rocket10');assert.equal(params.liftNozzleArea,.0005);
 const idle=new PhysicsSim({...params,roadRoughness:0}),parked=new DrivingController();
 for(let i=0;i<500;i++)idle.step(dt,parked.update(new Set(),idle,dt));
 assert.equal(idle.state.gasUsed,0);assert.ok(idle.state.vel.length()<.05);
 const baseline=new PhysicsSim({...params,roadRoughness:0}),baseDriver=new DrivingController();
 const boosted=new PhysicsSim({...params,roadRoughness:0}),boostDriver=new DrivingController();
 for(let i=0;i<350;i++){baseline.step(dt,baseDriver.update(new Set(['KeyW']),baseline,dt));boosted.step(dt,boostDriver.update(new Set(['KeyW','KeyF']),boosted,dt));}
 assert.ok(boosted.state.vel.length()>baseline.state.vel.length()*1.2,'rear thrust adds real acceleration');
 assert.ok(boosted.state.gasUsed>0&&baseline.state.gasUsed===0);
 assert.ok(boosted.thrusters.slice(4,8).every(t=>t.mdot>0),'all four rear valves flow');
 const sim=new PhysicsSim({...params,roadRoughness:0}),driver=new DrivingController();
 sim.state.pos.y+=20;sim.state.vel.y=7;sim.contactCount=0;
 assert.ok(rocketRollAuthority(sim).sufficient,'controlled full-air high-clearance test is feasible');
 let minUp=1,minHeight=Infinity;
 for(let i=0;i<3500&&driver.maneuverStatus!=='complete';i++){
  sim.step(dt,driver.update(new Set(i===0?['KeyX']:[]),sim,dt));minUp=Math.min(minUp,up(sim));minHeight=Math.min(minHeight,sim.state.pos.y-sim.restHeight);
  assert.equal(sim.contactCount,0);assert.equal(sim.bodyGroundContacts,0);
  assert.ok([sim.state.pos.y,sim.state.vel.y,sim.state.gas,sim.state.q.w].every(Number.isFinite));
 }
 assert.equal(driver.maneuverStatus,'complete');assert.ok(minUp<-.99);assert.ok(up(sim)>.9999);assert.ok(minHeight>2);
 assert.ok(sim.state.omega.length()<.05);assert.ok(sim.state.gasUsed>0&&sim.state.gas>0);
 assert.ok(Math.abs(sim.telemetry().massBalanceError)<1e-9);
 if(id==='tesla-cybertruck'){
  const limited=new PhysicsSim(params),d=new DrivingController();limited.state.pos.y+=20;limited.state.vel.y=7;limited.contactCount=0;
  limited.state.gas*=.56;limited.state.temp*=.56**.4;limited.state.pressure*=.56**1.4;
  d.update(new Set(['KeyX']),limited,dt);assert.equal(d.maneuverStatus,'thrust');assert.equal(d.rocketRoll.active,false);
 }
});
