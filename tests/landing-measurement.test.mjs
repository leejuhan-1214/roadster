import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {PhysicsSim} from '../dist/js/physics.js';
import {LANDING_STEP,createLandingRun,landingRunInput,updateLandingRun} from '../dist/js/landing-experiment.js';
import {landingLiveReadings} from '../dist/js/landing-live.js';
import {landingSpringState} from '../dist/js/landing-measurement.js';
import {landingReactionTrace} from '../dist/js/landing-analysis.js';

function advance(sim,run){sim.step(LANDING_STEP,landingRunInput(run,sim));updateLandingRun(run,sim);}

test('force-envelope maxima use their own measured step endpoints; airborne bins stay unloaded',()=>{
  const sim=new PhysicsSim(),run=createLandingRun(sim,{height:20,method:'brake',brakeHeight:1.5});
  const steps=new Map();
  while(!run.done){
    advance(sim,run);
    const ground=sim.groundForceN,equivalent=ground+sim.groundCorrectionImpulseNs/LANDING_STEP;
    const acceleration=sim.resolvedAcceleration.clone();acceleration.y+=sim.params.gravity;
    steps.set(run.elapsed,{ground,equivalent,gLoad:acceleration.length()/sim.params.gravity});
  }
  const {samples,touchdownTime}=run.result;
  let independentPeak=false;
  for(const [i,sample] of samples.entries()){
    if(sample.time<touchdownTime)assert.equal(sample.equivalentGroundForceN,0);
    const end=samples[i+1]?.time??Infinity;
    for(const [field,timestamp,raw] of [['groundForceN','groundForcePeakTime','ground'],['equivalentGroundForceN','equivalentGroundForcePeakTime','equivalent'],['gLoad','gLoadPeakTime','gLoad']]){
      assert.ok(sample[timestamp]>=sample.time&&sample[timestamp]<end);
      assert.equal(sample[field],steps.get(sample[timestamp])[raw]);
    }
    if(sample.equivalentGroundForcePeakTime>sample.time&&sample.equivalentGroundForceN>0)independentPeak=true;
  }
  assert.ok(independentPeak);
  const points=landingReactionTrace(run.result);
  assert.ok(points.some(point=>point.time===0&&point.forceKN===0),'the line stays at zero until contact');
  assert.ok(points.every(point=>point.time>=0||point.forceKN===0));
  assert.equal(Math.max(...points.map(point=>point.forceKN)),run.result.peakEquivalentGroundForceN/1000);
});

test('older straddling bins keep their measured load without drawing a reaction in flight',()=>{
  const legacy={touchdownTime:1,samples:[
    {time:.980,equivalentGroundForceN:0},{time:.996,equivalentGroundForceN:120000},{time:1.006,equivalentGroundForceN:25000}
  ]};
  const points=landingReactionTrace(legacy);
  assert.equal(points.length,4);
  assert.deepEqual(points.slice(1,3),[{time:0,forceKN:0},{time:0,forceKN:120}]);
  assert.equal(legacy.samples[1].time,.996);
  assert.deepEqual(landingReactionTrace({touchdownTime:null,samples:legacy.samples}),[]);
});

test('live and logged elastic storage use the same end-state pose throughout impact',()=>{
  for(const options of [{height:3,method:'free'},{height:3,method:'brake',brakeHeight:2.25}]){
    const sim=new PhysicsSim(),run=createLandingRun(sim,options);let sampleCount=0,sawDifferentPhase=false;
    for(let step=0;step<15000&&!run.done;step++){
      advance(sim,run);
      if(run.samples.length===sampleCount)continue;
      sampleCount=run.samples.length;
      const sample=run.samples.at(-1),live=landingLiveReadings(sim);
      assert.equal(sample.time,run.elapsed);
      assert.equal(sample.springEnergyJ,live.springEnergyJ);
      assert.equal(sample.stateCompression,live.compression);
      if(Math.abs(sample.compression-sample.stateCompression)>.000001)sawDifferentPhase=true;
    }
    assert.ok(run.done);assert.ok(sawDifferentPhase,'force evaluation and the stored pose are intentionally distinct phases');
  }
});

test('first-deceleration duration and ground impulse have the same resolved 2 ms endpoint',()=>{
  for(const height of [.1,3]){
    const sim=new PhysicsSim(),run=createLandingRun(sim,{height,method:'free'});
    for(let step=0;step<15000&&!run.done;step++)advance(sim,run);
    assert.ok(run.done);
    const r=run.result;
    assert.ok(Number.isFinite(r.contactEndTime)&&Number.isFinite(r.contactEndVelocityY));
    assert.equal(r.contactDuration,r.contactEndTime-r.touchdownTime);
    const endpointStep=r.contactEndTime/LANDING_STEP;
    assert.ok(Math.abs(endpointStep-Math.round(endpointStep))<1e-8);
    const crossingStep=r.touchdownTime/LANDING_STEP;
    assert.ok(Math.abs(crossingStep-Math.round(crossingStep))>1e-5,'these two releases cross the plane between grid points');
    assert.ok(Math.abs(r.touchdownTime-Math.sqrt(2*height/r.parameters.gravity))<1e-9);
    assert.ok(r.contactEndVelocityY>=0||Math.abs(r.contactEndVelocityY)<.01);
    const deltaP=r.initialMass*(r.contactEndVelocityY+r.touchdownSpeed);
    const gravityImpulse=-r.initialMass*r.parameters.gravity*r.contactDuration;
    assert.ok(Math.abs(r.groundImpulseNs+gravityImpulse-deltaP)<1e-6,'same-interval momentum balance includes the actual terminal velocity');
    if(height===3){assert.ok(r.impactCorrectionImpulseNs>0);assert.ok(r.contactEndVelocityY>0,'do not silently call the rebound sample exactly zero velocity');}
  }
});

test('an unfinished fall has no fabricated deceleration endpoint and a new run clears it',()=>{
  const sim=new PhysicsSim(),run=createLandingRun(sim,{height:3});advance(sim,run);
  assert.equal(run.contactEndTime,null);assert.equal(run.contactEndVelocityY,null);assert.equal(run.contactDuration,null);
  for(let step=0;step<15000&&!run.done;step++)advance(sim,run);
  const next=createLandingRun(sim,{height:1});
  assert.equal(next.contactEndTime,null);assert.equal(next.contactEndVelocityY,null);assert.equal(next.contactDuration,null);
});

test('current-pose spring measurement respects orientation, sampled surface height and normal without mutating the solver',()=>{
  const sim=new PhysicsSim();sim.state.q.setFromAxisAngle(new Vector3(1,0,0),.12);sim.state.pos.set(0,2,0);
  const expected=[0,.04,.12,.26],normal=.8;
  sim.wheels.forEach((wheel,index)=>{
    const y=wheel.pos.clone().applyQuaternion(sim.state.q).y+sim.state.pos.y;
    wheel.surfaceY=y-(sim.params.wheelRadius-expected[index])/normal;wheel.normalY=normal;
    wheel.compression=8;
  });
  const snapshot=JSON.stringify({state:sim.state,wheels:sim.wheels,params:sim.params});
  const actual=landingSpringState(sim);
  actual.compressions.forEach((value,index)=>assert.ok(Math.abs(value-expected[index])<1e-12));
  assert.ok(Math.abs(actual.stateCompression-.26)<1e-12);
  assert.ok(Math.abs(actual.springEnergyJ-.5*sim.params.springK*expected.reduce((sum,x)=>sum+x*x,0))<1e-8);
  assert.equal(JSON.stringify({state:sim.state,wheels:sim.wheels,params:sim.params}),snapshot);
  sim.params.contactEnabled=false;
  assert.equal(landingSpringState(sim).springEnergyJ,0);
  assert.deepEqual(landingSpringState(sim).compressions,[0,0,0,0]);
});
