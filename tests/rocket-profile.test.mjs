import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {PhysicsSim,ATMOSPHERE,nozzle} from '../dist/js/physics.js';
import {DrivingController} from '../dist/js/driving-input.js';
import {ROCKET_PARAMS,ROCKET_THRUSTERS} from '../dist/js/rocket-layout.js';
import {ROCKET_ROLL_MIN_HEIGHT} from '../dist/js/rocket-flight.js';
const dt=.002,up=sim=>new Vector3(0,1,0).applyQuaternion(sim.state.q).y;

test('Rocket profile uses shared 4 belly + 4 rear + 2 side geometry and 250 kg charge',()=>{
  const sim=new PhysicsSim({propulsionProfile:'rocket2026'});
  assert.equal(sim.initialGas,250);assert.equal(sim.params.tankVolume,.6);
  assert.deepEqual(sim.thrusters.map(t=>t.group),['lift','lift','lift','lift','boost','boost','boost','boost','yaw+','yaw-']);
  sim.thrusters.forEach((t,i)=>{assert.deepEqual(t.mountPosition.toArray(),ROCKET_THRUSTERS[i].position);assert.deepEqual(t.dir.toArray(),ROCKET_THRUSTERS[i].direction);});
  assert.equal(sim.thrusters[0].area,new PhysicsSim().thrusters[0].area,'controlled comparisons retain the same lift throat area');
  const force=sim.thrusters.filter(t=>t.group==='boost').reduce((sum,t)=>sum+nozzle(sim.state.pressure,sim.state.temp,t.area).force,0);
  assert.ok(force>80000&&force<85000);
  assert.equal(new PhysicsSim().initialGas,375,'legacy profile remains explicit and unchanged');
});

test('Rocket W+F accelerates through nozzle and tire forces, with finite gas and no idle discharge',()=>{
  const sim=new PhysicsSim(ROCKET_PARAMS),driver=new DrivingController();
  for(let i=0;i<500;i++)sim.step(dt,driver.update(new Set(),sim,dt));
  assert.equal(sim.state.gasUsed,0);assert.ok(sim.state.vel.length()<.05);
  let elapsed=0,peak=0,contact=4;
  while(elapsed<2&&sim.state.vel.x<100/3.6){sim.step(dt,driver.update(new Set(['KeyW','KeyF']),sim,dt));elapsed+=dt;peak=Math.max(peak,sim.telemetry().rearThrustN);contact=Math.min(contact,sim.contactCount);}
  assert.ok(elapsed<1.2&&elapsed>.5,`actual force integration reaches 100 km/h in ${elapsed}s`);
  assert.ok(sim.state.gasUsed>50&&sim.state.gasUsed<130);assert.ok(peak>60000);assert.equal(contact,4);
  assert.ok(Math.abs(sim.telemetry().massBalanceError)<1e-9);assert.ok(Math.abs(sim.telemetry().tankEnergyBalanceError)<1e-5);
  const empty=new PhysicsSim({...ROCKET_PARAMS,gravity:0,contactEnabled:false,aeroEnabled:false});empty.state.pressure=ATMOSPHERE;
  for(let i=0;i<100;i++)empty.step(dt,{boost:true,stabilize:false});
  assert.equal(empty.state.vel.length(),0);assert.equal(empty.state.omega.length(),0);
});

test('X performs one physical barrel roll and captures upright attitude without touching ground',()=>{
  const sim=new PhysicsSim(ROCKET_PARAMS),driver=new DrivingController();sim.state.pos.y+=ROCKET_ROLL_MIN_HEIGHT;sim.contactCount=0;
  let minUp=1,minHeight=Infinity,peakRate=0,quaternionTravel=0,previous=sim.state.q.clone();
  for(let i=0;i<3500&&driver.maneuverStatus!=='complete';i++){
    const input=driver.update(new Set(i===0?['KeyX']:[]),sim,dt);sim.step(dt,input);
    quaternionTravel+=2*Math.acos(Math.min(1,Math.abs(previous.dot(sim.state.q))));previous.copy(sim.state.q);
    minUp=Math.min(minUp,up(sim));minHeight=Math.min(minHeight,sim.state.pos.y-sim.restHeight);peakRate=Math.max(peakRate,sim.state.omega.length());
    assert.equal(sim.contactCount,0);assert.equal(sim.bodyGroundContacts,0);
  }
  assert.equal(driver.maneuverStatus,'complete');assert.equal(driver.maneuverProgress,1);assert.equal(driver.altHold,true);
  assert.ok(minUp<-.99,'body actually passes upside down');assert.ok(quaternionTravel>2*Math.PI-.02&&quaternionTravel<2*Math.PI+.3);
  assert.ok(up(sim)>.9999&&sim.state.omega.length()<.05);assert.ok(minHeight>3);assert.ok(peakRate>4);
  assert.ok(sim.state.gasUsed>60&&sim.state.gasUsed<160,'roll consumes finite gas');
  assert.ok(sim.telemetry().massBalanceError<1e-9&&sim.telemetry().tankEnergyBalanceError<1e-5);
});

test('roll request gates unsafe launch states, aborts with B, and cannot rotate an empty tank',()=>{
  for(const [kind,expected] of [['ground','height'],['low','height'],['gas','gas'],['tilted','attitude'],['legacy','profile']]){
    const sim=new PhysicsSim(kind==='legacy'?{}:ROCKET_PARAMS),driver=new DrivingController();
    if(kind!=='ground'){sim.state.pos.y+=kind==='low'?2:10;sim.contactCount=0;}
    if(kind==='gas'){sim.state.gas*=.4;sim.state.pressure*=.4;}
    if(kind==='tilted')sim.state.q.setFromAxisAngle(new Vector3(1,0,0),1);
    driver.update(new Set(['KeyX']),sim,dt);assert.equal(driver.maneuverStatus,expected);assert.equal(driver.rocketRoll.active,false);
  }
  const sim=new PhysicsSim(ROCKET_PARAMS),driver=new DrivingController();sim.state.pos.y+=10;sim.contactCount=0;
  sim.step(dt,driver.update(new Set(['KeyX']),sim,dt));driver.update(new Set(['KeyB']),sim,dt);assert.equal(driver.maneuverStatus,'cancelled');
  const empty=new PhysicsSim({...ROCKET_PARAMS,gravity:0,contactEnabled:false,aeroEnabled:false});empty.state.pos.y=20;empty.contactCount=0;empty.state.pressure=ATMOSPHERE;
  for(let i=0;i<500;i++)empty.step(dt,{rollRateTarget:5,verticalAcceleration:0});
  assert.equal(empty.state.omega.length(),0);assert.equal(empty.state.q.w,1);
});

test('normal 1.3 to 1.5 second Space launches all permit a full physical X roll',()=>{
  for(const seconds of [1.3,1.4,1.5]){
    const sim=new PhysicsSim({...ROCKET_PARAMS,roadRoughness:0}),driver=new DrivingController();
    for(let i=0;i<500;i++)sim.step(dt,driver.update(new Set(),sim,dt));
    for(let i=0;i<Math.round(seconds/dt);i++)sim.step(dt,driver.update(new Set(['Space']),sim,dt));
    const gas=sim.state.gas;let minUp=1;
    for(let i=0;i<3500&&driver.maneuverStatus!=='complete';i++){
      sim.step(dt,driver.update(new Set(i===0?['KeyX']:[]),sim,dt));minUp=Math.min(minUp,up(sim));assert.equal(sim.contactCount,0);
    }
    assert.equal(driver.maneuverStatus,'complete',String(seconds));assert.ok(minUp<-.99&&up(sim)>.9999);assert.ok(sim.state.omega.length()<.05);
    assert.ok(sim.state.gas<gas&&sim.state.gas>0);assert.ok(sim.state.pos.y-sim.restHeight>3);
  }
});
test('longer launches reject depleted roll reserve before committing',()=>{
  const sim=new PhysicsSim({...ROCKET_PARAMS,roadRoughness:0}),driver=new DrivingController();
  for(let i=0;i<800;i++)sim.step(dt,driver.update(new Set(['Space']),sim,dt));
  driver.update(new Set(['KeyX']),sim,dt);assert.equal(driver.maneuverStatus,'gas');assert.equal(driver.rocketRoll.active,false);
});
test('partly depleted hover cannot spend its roll reserve preparing upward momentum',()=>{
  const sim=new PhysicsSim(ROCKET_PARAMS),driver=new DrivingController();sim.state.pos.y+=10;sim.contactCount=0;
  sim.state.gas*=.65;sim.state.pressure*=.65**1.4;sim.state.temp*=.65**.4;
  driver.update(new Set(['KeyX']),sim,dt);assert.equal(driver.maneuverStatus,'momentum');assert.equal(driver.rocketRoll.active,false);
});
