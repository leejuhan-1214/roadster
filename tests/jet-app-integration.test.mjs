import test from 'node:test';
import assert from 'node:assert/strict';
import {VEHICLES,vehicleProfile,vehiclePhysics} from '../dist/js/jet-vehicle.js';
import {experimentVehicles,experimentMass} from '../dist/js/experiment-vehicles.js';
import {PhysicsSim,DEFAULTS} from '../dist/js/physics.js';
import {RenderStateBuffer} from '../dist/js/render-state.js';
import {DrivingController} from '../dist/js/driving-input.js';
import {landingPhaseLabel} from '../dist/js/landing-live.js';

const near=(actual,expected,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const make=id=>new PhysicsSim({...vehiclePhysics(vehicleProfile(id||'roadster'),{},DEFAULTS),roadRoughness:0,aeroEnabled:false});

test('all app cars retain body mass while adding exactly the declared 976 kg rig and 150 kg fuel',()=>{
  assert.equal(VEHICLES.length,77);
  const cohort=experimentVehicles(VEHICLES);assert.equal(cohort.length,5);
  for(const profile of VEHICLES){
    const sim=make(profile.id),display=experimentMass(profile);
    assert.equal(sim.params.propulsionKind,'air-breathing-jet',profile.id);
    near(profile.dryMass,profile.referenceMass+976);
    near(sim.mass,profile.referenceMass+976+150);near(display.total,sim.mass);
    near(display.rig,976);near(display.gas,150);
    for(const key of ['inertiaRoll','inertiaYaw','inertiaPitch'])assert.ok(Number.isFinite(sim.params[key])&&sim.params[key]>0,`${profile.id}: ${key}`);
  }
  assert.ok(cohort.every((profile,index)=>index===0||experimentMass(profile).total>experimentMass(cohort[index-1]).total));
});

test('render buffer interpolates actual engine RPM and preserves discrete running/phase without modifying physics',()=>{
  const sim=make();sim.primeJetIdle();
  const buffer=new RenderStateBuffer(sim),before=sim.thrusters[0].rpm;
  buffer.beforeStep();sim.step(.002,{jetEnabled:true,jetLiftOnly:true,lift:1,stabilize:false});buffer.afterStep(sim);
  const after=sim.thrusters[0].rpm,view=buffer.sample(.25);
  near(view.thrusters[0].rpm,before+(after-before)*.25);
  assert.equal(view.thrusters[0].running,true);assert.equal(view.thrusters[0].jetState.phase,'running');
  assert.equal(view.thrusters[4].running,false);near(view.thrusters[4].rpm,0);
  const actualPhase=sim.thrusters[0].jetState.phase;view.thrusters[0].jetState.phase='render-only';
  assert.equal(sim.thrusters[0].jetState.phase,actualPhase);
  buffer.beforeStep();sim.step(.002,{jetCutoff:true,stabilize:false});buffer.afterStep(sim);
  assert.equal(buffer.sample(.5).thrusters[0].running,false);
  assert.equal(buffer.sample(.5).thrusters[0].jetState.phase,sim.thrusters[0].jetState.phase);
});

test('H launches from a hot-idle ground state and approaches its held altitude through forces',()=>{
  const sim=make(),driver=new DrivingController();sim.primeJetIdle();
  const startPosition=sim.state.pos.clone(),startVelocity=sim.state.vel.clone();
  const first=driver.update(new Set(['KeyH']),sim,.002);
  assert.ok(sim.state.pos.equals(startPosition));assert.ok(sim.state.vel.equals(startVelocity));
  assert.equal(driver.altHold,true);assert.ok(Number.isFinite(first.verticalAcceleration));
  sim.step(.002,first);
  let maximum=sim.state.pos.y-sim.restHeight;
  for(let i=1;i<15000;i++){
    sim.step(.002,driver.update(new Set(),sim,.002));
    maximum=Math.max(maximum,sim.state.pos.y-sim.restHeight);
  }
  assert.ok(maximum>.6,`maximum height ${maximum}`);
  near(sim.state.pos.y-sim.restHeight,driver.targetHeight,.12);
  assert.ok(Math.abs(sim.state.vel.y)<.1);assert.equal(sim.contactCount,0);
  assert.ok(sim.state.gasUsed>0&&sim.state.gas>0);
});

test('jet cars refuse unsupported automatic barrel rolls with a response-limit status and no pose mutation',()=>{
  for(const profile of experimentVehicles(VEHICLES)){
    const sim=make(profile.id),driver=new DrivingController();sim.primeJetIdle();
    sim.state.pos.y+=20;sim.state.vel.y=8;sim.contactCount=0;
    const position=sim.state.pos.clone(),velocity=sim.state.vel.clone(),quaternion=sim.state.q.clone(),gas=sim.state.gas;
    const input=driver.update(new Set(['KeyX']),sim,.002);
    assert.equal(driver.maneuverStatus,'response');assert.equal(driver.rocketRoll.active,false);
    assert.equal(input.rollRateTarget,undefined);
    assert.ok(sim.state.pos.equals(position));assert.ok(sim.state.vel.equals(velocity));assert.ok(sim.state.q.equals(quaternion));near(sim.state.gas,gas);
  }
});

test('live phases distinguish real takeoff, hover acquisition and preparation failure',()=>{
  const sim=make();
  assert.equal(landingPhaseLabel(sim,{phase:'ascending',touchdownTime:null},{active:true}),'상승 준비 · 이륙');
  assert.equal(landingPhaseLabel(sim,{phase:'hovering',touchdownTime:null},{active:true}),'부양 안정화');
  assert.equal(landingPhaseLabel(sim,{phase:'failed',touchdownTime:null,touchdownSpeed:null},{active:true}),'부양 조건 미달');
});
