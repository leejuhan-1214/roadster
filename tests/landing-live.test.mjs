import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PhysicsSim} from '../dist/js/physics.js';
import {landingLiveReadings,landingPhaseLabel,LandingLiveUI} from '../dist/js/landing-live.js';
import {LANDING_STEP,createLandingRun,landingRunInput,updateLandingRun} from '../dist/js/landing-experiment.js';

test('live vertical kinetic energy uses current gas-dependent mass and only vertical speed',()=>{
  const sim=new PhysicsSim();sim.state.vel.set(12,-4,9);
  const before=landingLiveReadings(sim);assert.equal(before.verticalKineticEnergyJ,.5*sim.mass*16);
  sim.state.gas-=80;const after=landingLiveReadings(sim);
  assert.equal(after.mass,before.mass-80);assert.equal(before.verticalKineticEnergyJ-after.verticalKineticEnergyJ,640);
  sim.state.vel.y=4;assert.equal(landingLiveReadings(sim).verticalKineticEnergyJ,after.verticalKineticEnergyJ);
  sim.state.vel.set(90,0,70);assert.equal(landingLiveReadings(sim).verticalKineticEnergyJ,0);
});

test('live spring storage uses the current pose against wheel surfaces, excluding bump stops and damping',()=>{
  const sim=new PhysicsSim();const compression=[0,.1,.22,.3];
  sim.wheels.forEach((wheel,i)=>{wheel.compression=9;wheel.normalY=1;wheel.surfaceY=sim.state.pos.y+wheel.pos.y-sim.params.wheelRadius+compression[i];});
  const expected=.5*sim.params.springK*compression.reduce((sum,x)=>sum+x*x,0);
  assert.ok(Math.abs(landingLiveReadings(sim).springEnergyJ-expected)<1e-8);assert.ok(Math.abs(landingLiveReadings(sim).compression-.3)<1e-12);
  sim.params.damperC*=2;sim.state.vel.y=-10;assert.ok(Math.abs(landingLiveReadings(sim).springEnergyJ-expected)<1e-8);
  sim.params.springK*=2;assert.ok(Math.abs(landingLiveReadings(sim).springEnergyJ-expected*2)<1e-8);
});

test('readings preserve solver state and read world-space thrust without stale diagram values',()=>{
  const sim=new PhysicsSim();sim.state.q.setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/3);
  sim.thrusters[0].force=1000;sim.thrusters[0].dir.set(0,1,0);
  const snapshot=()=>JSON.stringify({params:sim.params,state:sim.state,wheels:sim.wheels,thrusters:sim.thrusters});
  const before=snapshot(),reading=landingLiveReadings(sim);assert.equal(snapshot(),before);
  assert.ok(Math.abs(reading.thrustVerticalN-500)<1e-9);
  const ids=['landing-weight','landing-thrust-y','landing-normal','landing-force-scale','landing-acceleration','landing-kinetic','landing-elastic','landing-live-compression','landing-phase'];
  const nodes=Object.fromEntries(ids.map(id=>[id,{textContent:''}]));
  LandingLiveUI.prototype.update.call({panel:{hidden:false},nodes},sim,{metrics:{thrustVerticalN:0,forceScaleNPerM:10000}},null);
  assert.equal(nodes['landing-thrust-y'].textContent,'0.5 kN');assert.equal(snapshot(),before);
});

test('eco phase follows real unpowered descent and solver thrust rather than an armed controller',()=>{
  const sim=new PhysicsSim(),run=createLandingRun(sim,{height:3,method:'eco'}),initialGas=sim.state.gas;
  const ids=['landing-weight','landing-thrust-y','landing-normal','landing-force-scale','landing-acceleration','landing-kinetic','landing-elastic','landing-live-compression','landing-phase'];
  const nodes=Object.fromEntries(ids.map(id=>[id,{textContent:''}])),ui={panel:{hidden:false},nodes};
  assert.equal(landingPhaseLabel(sim,{...run,braking:true},{active:true}),'무분사 낙하','a request alone must not claim actual braking thrust');
  let coastSteps=0,firstThrustTime=null;
  for(let step=0;step<2000&&!run.done;step++){
    sim.step(LANDING_STEP,landingRunInput(run,sim));updateLandingRun(run,sim);
    LandingLiveUI.prototype.update.call(ui,sim,{metrics:{thrustVerticalN:999999}},run,{active:true});
    if(sim.totalThrust===0){
      coastSteps++;assert.equal(sim.state.gas,initialGas);assert.equal(nodes['landing-phase'].textContent,'무분사 낙하');
    }else{
      firstThrustTime=run.elapsed;assert.ok(sim.state.gas<initialGas);assert.equal(nodes['landing-phase'].textContent,'착지 제동');break;
    }
  }
  assert.ok(coastSteps>0,'eco must have observed zero-thrust, zero-consumption flight');
  assert.ok(firstThrustTime>0,'the same flight must later produce actual braking thrust');
  assert.equal(landingPhaseLabel(sim,{...run,braking:false},{active:true}),'착지 제동','residual valve force must not be called unpowered');
  assert.equal(landingPhaseLabel(sim,run,{active:true,paused:true}),'착지 제동 · 정지');
  assert.equal(landingPhaseLabel(sim,{...run,manualLiftActive:true},{active:true}),'수동 분사');
  assert.equal(landingPhaseLabel(sim,{...run,touchdownTime:run.elapsed,manualLiftActive:true},{active:true}),'접촉 · 완충');
  assert.equal(landingPhaseLabel(sim,run,{active:false,paused:true}),'측정 완료');
  assert.equal(landingPhaseLabel(sim,null,{active:false}),'자유 조종');
});

