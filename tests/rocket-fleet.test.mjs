import test from 'node:test';
import assert from 'node:assert/strict';
import {HARDWARE_PARAMS,REFERENCE_AIR_KG} from '../dist/js/reference-hardware.js';
import {VEHICLES,vehiclePhysics} from '../dist/js/vehicle-profiles.js';
import {PhysicsSim,DEFAULTS} from '../dist/js/physics.js';
import {DrivingController} from '../dist/js/driving-input.js';
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
// Deliberately unverified v1.42 high-authority rig: algorithm fixture only.
// These values never replace the source-backed production hardware.
const highAuthorityFixture={realGas:false,calibratedHardware:false,tankVolume:.6,tankPressureMPa:35.875,
 initialTemperature:300,ambientTemperature:300,feedLossCoefficient:120,liftNozzleArea:.0005,
 boostNozzleArea:.00045,yawNozzleArea:.0001,valveTau:.03,valveCloseTau:.03,minimumGasOperatingTemperature:0};

for(const id of selected)test(id+': source-backed fitted chassis respects limited thrust; separate high-authority fixture verifies roll control',async()=>{
 const profile=VEHICLES.find(p=>p.id===id),gltf=await loadModelGeometry(profile);
 const vehicle=id==='roadster'?adaptRoadsterScene(gltf.scene,createVehicle(),gltf.parser):adaptRealVehicle(gltf.scene,profile);
 let params;
 try{prepareAssessmentVehicle(vehicle);prepareRocketRetrofit(vehicle);configureVehicleFit(vehicle,profile);params=vehiclePhysics(profile,vehicle.geometryParams,DEFAULTS);}finally{disposeVehicle(vehicle);}
 assert.equal(params.propulsionProfile,'rocket10');assert.equal(params.liftNozzleArea,HARDWARE_PARAMS.liftNozzleArea);
 assert.equal(params.calibratedHardware,true);assert.equal(params.realGas,true);
 const idle=new PhysicsSim({...params,roadRoughness:0}),parked=new DrivingController();
 for(let i=0;i<500;i++)idle.step(dt,parked.update(new Set(),idle,dt));
 assert.equal(idle.state.gasUsed,0);assert.ok(idle.state.vel.length()<.05);
 const baseline=new PhysicsSim({...params,roadRoughness:0}),baseDriver=new DrivingController();
 const boosted=new PhysicsSim({...params,roadRoughness:0}),boostDriver=new DrivingController();
 let allRearFlowed=false;
 for(let i=0;i<350;i++){baseline.step(dt,baseDriver.update(new Set(['KeyW']),baseline,dt));boosted.step(dt,boostDriver.update(new Set(['KeyW','KeyF']),boosted,dt));allRearFlowed ||= boosted.thrusters.slice(4,8).every(t=>t.mdot>0);}
 assert.ok(boosted.state.vel.length()>baseline.state.vel.length()+.001,'rated rear flow adds acceleration without a fabricated 20% performance requirement');
 assert.ok(boosted.state.gasUsed>0&&baseline.state.gasUsed===0);
 assert.ok(allRearFlowed,'all four rear valves flow before any temperature cut-out');
 const reference=new PhysicsSim({...params,roadRoughness:0}),referenceDriver=new DrivingController();
 assert.ok(Math.abs(reference.initialGas-REFERENCE_AIR_KG)<1e-9);
 reference.state.pos.y+=20;reference.state.vel.y=7;reference.contactCount=0;
 assert.equal(rocketRollAuthority(reference).sufficient,false,'documented hardware cannot sustain the old roll envelope');
 const referencePose=reference.state.q.toArray(),referenceGas=reference.state.gas;
 referenceDriver.update(new Set(['KeyX']),reference,dt);
 assert.equal(referenceDriver.maneuverStatus,'thrust');assert.equal(referenceDriver.rocketRoll.active,false);
 assert.deepEqual(reference.state.q.toArray(),referencePose);assert.equal(reference.state.gas,referenceGas);
 const sim=new PhysicsSim({...params,...highAuthorityFixture,roadRoughness:0}),driver=new DrivingController();
 assert.ok(Math.abs(sim.initialGas-250)<1e-9,'this roll test explicitly uses the old hypothetical gas reserve');
 sim.state.pos.y+=20;sim.state.vel.y=7;sim.contactCount=0;
 assert.ok(rocketRollAuthority(sim).sufficient,'the separate hypothetical control fixture has sufficient torque and reserve');
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
  const limited=new PhysicsSim({...params,...highAuthorityFixture}),d=new DrivingController();limited.state.pos.y+=20;limited.state.vel.y=7;limited.contactCount=0;
  limited.state.gas*=.56;limited.state.temp*=.56**.4;limited.state.pressure*=.56**1.4;
  d.update(new Set(['KeyX']),limited,dt);assert.equal(d.maneuverStatus,'thrust');assert.equal(d.rocketRoll.active,false);
 }
});

// The complete catalogue must obey the same sourced hardware limits even when
// a lightweight body is selected. Real geometry fit/cover tests live separately.
test('all 77 source-backed vehicle profiles reject an unsupported aerial roll',()=>{
 assert.equal(VEHICLES.length,77);
 for(const profile of VEHICLES){
  const sim=new PhysicsSim(vehiclePhysics(profile,{},DEFAULTS)),driver=new DrivingController();
  sim.state.pos.y+=20;sim.state.vel.y=7;sim.contactCount=0;
  assert.equal(sim.params.calibratedHardware,true);
  assert.ok(Math.abs(sim.initialGas-REFERENCE_AIR_KG)<1e-9);
  assert.equal(rocketRollAuthority(sim).sufficient,false,profile.id+' limited authority');
  driver.update(new Set(['KeyX']),sim,dt);
  assert.equal(driver.rocketRoll.active,false,profile.id+' remains inactive');
  assert.equal(driver.maneuverStatus,'thrust',profile.id+' explains insufficient thrust');
 }
});
