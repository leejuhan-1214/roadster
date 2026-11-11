import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PhysicsSim} from '../dist/js/physics.js';
import {landingLiveReadings,LandingLiveUI} from '../dist/js/landing-live.js';

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

