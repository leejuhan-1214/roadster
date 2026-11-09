import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim} from '../dist/js/physics.js';
import {DrivingController,CITY_DRIVE_PARAMS} from '../dist/js/driving-input.js';
import {CityBrakeTrial} from '../dist/js/city-experiment.js';
const keys=(...codes)=>new Set(codes),dt=.002;
const pair=()=>({sim:new PhysicsSim({...CITY_DRIVE_PARAMS,roadRoughness:0,aeroEnabled:false}),driver:new DrivingController()});
function advance(sim,driver,codes,seconds){for(let i=0;i<seconds/dt;i++)sim.step(dt,driver.update(keys(...codes),sim,dt));}

test('F fires the finite-gas rear boost while Shift never commands a booster',()=>{
  const {sim,driver}=pair(),gas=sim.state.gas;
  advance(sim,driver,['KeyF'],.5);
  assert.ok(sim.state.vel.x>1);assert.ok(sim.state.gas<gas-1);
  assert.ok(sim.thrusters[4].force>0&&sim.thrusters[5].force>0);
  const shift=driver.update(keys('ShiftLeft'),sim,.1);
  assert.equal(shift.boost,false);assert.equal(shift.handbrake,1);assert.equal(shift.brake,0);
  const b=driver.update(keys('KeyW','KeyF','ShiftRight','KeyB'),sim,.1);
  assert.equal(b.boost,false);assert.equal(b.handbrake,0);assert.equal(b.brake,1);assert.equal(b.throttle,0);
});

test('both Shift keys select rear-wheel drifting with or without W and release into normal control',()=>{
  for(const shift of ['ShiftLeft','ShiftRight']){
    const {sim,driver}=pair();sim.reset('rolling');
    const coasting=driver.update(keys(shift,'KeyA'),sim,.1);
    assert.equal(coasting.handbrake,1);assert.equal(coasting.brake,0);assert.equal(coasting.boost,false);
    const driving=driver.update(keys('KeyW',shift,'KeyA'),sim,.1);
    assert.ok(driving.throttle>0);assert.equal(driving.handbrake,1);assert.equal(driving.corneringAssist,false);
    const restored=driver.update(keys('KeyW','KeyA'),sim,.1);
    assert.equal(restored.handbrake,0);assert.equal(restored.corneringAssist,true);
    assert.ok(restored.throttle<driving.throttle);
  }
});

test('Shift cannot create air braking, carrier thrust or a rear boost in flight',()=>{
  const {sim,driver}=pair();sim.reset('flight');sim.state.pos.y=sim.restHeight+20;sim.state.vel.set(0,0,0);
  const gas=sim.state.gas;
  advance(sim,driver,['ShiftLeft'],.3);
  assert.equal(sim.lastInput.handbrake,0);assert.equal(sim.lastInput.boost,false);assert.equal(sim.lastInput.flightAssist,false);
  assert.equal(sim.state.gas,gas);assert.ok(sim.state.vel.y<-2);
});

test('Shift-assisted stops cannot become valid B-only braking measurements',()=>{
  const {sim}=pair();sim.reset('rolling');
  const trial=new CityBrakeTrial();
  trial.sample(sim,{braking:true,drifting:true});assert.equal(trial.getSnapshot().current,null);
  trial.sample(sim,{braking:false});trial.sample(sim,{braking:true});
  assert.equal(trial.status,'measuring');sim.state.time+=dt;
  trial.sample(sim,{braking:true,drifting:true});
  assert.equal(trial.lastResult.valid,false);assert.equal(trial.lastResult.reason,'drift');
});
