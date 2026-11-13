import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim} from '../dist/js/physics.js';
import {DrivingController,CITY_DRIVE_PARAMS} from '../dist/js/driving-input.js';

const dt=.002,keys=(...codes)=>new Set(codes);
const make=()=>new PhysicsSim({...CITY_DRIVE_PARAMS,roadRoughness:0});
function advance(sim,driver,input,seconds){
  for(let i=0;i<seconds/dt;i++)sim.step(dt,driver.update(input,sim,dt));
}

test('parked controller requests no fan, compressor, or gas by default',()=>{
  const sim=make(),driver=new DrivingController(),gas=sim.state.gas,battery=sim.state.batteryJ;
  advance(sim,driver,keys(),1);
  assert.equal(sim.lastInput.fan,false);assert.equal(sim.lastInput.compressor,false);
  assert.equal(sim.state.gas,gas);assert.equal(sim.totalThrust,0);
  assert.equal(sim.state.batteryJ,battery);
});

test('ground drive uses fan suction and electricity without consuming tank gas',()=>{
  const sim=make(),driver=new DrivingController(),gas=sim.state.gas,battery=sim.state.batteryJ;
  advance(sim,driver,keys('KeyW'),2);
  assert.equal(sim.lastInput.fan,true);assert.ok(sim.fanForce>0);
  assert.equal(sim.state.gas,gas);assert.equal(sim.totalThrust,0);
  assert.ok(sim.state.batteryJ<battery);assert.ok(sim.state.vel.x>8);
  assert.ok(sim.wheels.every(w=>Math.abs(w.spinAngle)>1));
});

test('fan and compressor preferences are explicit and survive a controller reset',()=>{
  const sim=make(),driver=new DrivingController({fanEnabled:false,compressorEnabled:true});
  let input=driver.update(keys('KeyW'),sim,.1);
  assert.equal(input.fan,false);assert.equal(input.compressor,true);
  driver.reset();input=driver.update(keys('KeyW'),sim,.1);
  assert.equal(input.fan,false);assert.equal(input.compressor,true);
  driver.setOptions({fanEnabled:true,compressorEnabled:false});
  input=driver.update(keys('KeyW'),sim,.1);
  assert.equal(input.fan,true);assert.equal(input.compressor,false);
});

test('Space and height hold never request downward suction during takeoff',()=>{
  for(const command of ['Space','KeyH']){
    const sim=make(),driver=new DrivingController();
    const input=driver.update(keys('KeyW',command),sim,.1);
    assert.equal(input.fan,false,command);assert.equal(input.stabilize,true,command);
  }
});

test('airborne WASD and boost preserve gas controls but never request suction',()=>{
  for(const command of ['KeyW','KeyA','KeyD','KeyF']){
    const sim=make(),driver=new DrivingController();sim.reset('flight');
    sim.state.pos.y=sim.restHeight+5;sim.contactCount=0;
    const input=driver.update(keys(command),sim,.1);
    assert.equal(input.fan,false,command);assert.equal(input.airborne,true,command);
    assert.equal(input.throttle,0,command);
    if(command==='KeyF')assert.equal(input.boost,true);
    if(command==='KeyA')assert.equal(input.airMoveRight,-1);
    if(command==='KeyD')assert.equal(input.airMoveRight,1);
  }
});

test('Shift drift disables the automatic suction without disabling wheel drive',()=>{
  const sim=make(),driver=new DrivingController();
  const input=driver.update(keys('KeyW','KeyA','ShiftLeft'),sim,.1);
  assert.equal(input.fan,false);assert.equal(input.handbrake,1);assert.ok(input.throttle>0);
});

test('B still overrides F and wheel acceleration while requesting ground grip',()=>{
  const sim=make(),driver=new DrivingController();sim.state.vel.x=12;
  const input=driver.update(keys('KeyW','KeyF','KeyB'),sim,.1);
  assert.equal(input.boost,false);assert.equal(input.throttle,0);
  assert.equal(input.brake,1);assert.equal(input.fan,true);
});

test('ground fan drive retains actual front wheel steering and changes heading',()=>{
  const sim=make(),driver=new DrivingController();
  advance(sim,driver,keys('KeyW'),1.5);
  advance(sim,driver,keys('KeyW','KeyA'),1.5);
  assert.equal(sim.lastInput.fan,true);
  assert.ok(sim.wheels.filter(w=>w.isFront).every(w=>w.steer>.04));
  assert.ok(Math.abs(sim.state.q.y)>.03);assert.equal(driver.airborne,false);
});
