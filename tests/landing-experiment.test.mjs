import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim} from '../dist/js/physics.js';
import {createLandingRun,landingRunInput,updateLandingRun,landingClearance,landingSettings} from '../dist/js/landing-experiment.js';

function experiment(options={},params={},batches=[1]){
  const sim=new PhysicsSim(params),run=createLandingRun(sim,options);let frame=0;
  while(!run.done){
    const count=batches[frame++%batches.length];
    for(let n=0;n<count&&!run.done;n++){
      sim.step(.002,landingRunInput(run,sim));updateLandingRun(run,sim);
    }
    assert.ok(frame<10000,'run must finish within a bounded time');
  }
  return {sim,run,result:run.result};
}

test('different mass, spring sag and wheel radius begin at the same unloaded tire clearance',()=>{
  for(const [dryMass,wheelRadius,springK] of [[1900,.36,75000],[1350,.29,30000],[1685,.34,150000]]){
    const sim=new PhysicsSim({dryMass,wheelRadius,windX:7,roadRoughness:2,aeroEnabled:true,cgY:.3});
    sim.setObstacles([{center:[0,0,0],size:[4,1,4]}]);
    const run=createLandingRun(sim,{height:3,springK});
    assert.ok(Math.abs(landingClearance(sim)-3)<1e-12);
    assert.equal(sim.state.vel.length(),0);assert.equal(sim.state.omega.length(),0);
    assert.equal(sim.contactCount,0);assert.ok(sim.wheels.every(w=>!w.grounded&&w.load===0&&w.compression===0));
    assert.equal(sim.obstacles.length,0);assert.equal(sim.params.windX,0);assert.equal(sim.params.roadRoughness,0);
    assert.equal(sim.params.aeroEnabled,false);assert.equal(sim.params.cgY,0);
    assert.equal(run.initialGas,375);assert.equal(run.initialMass,dryMass+375);
  }
});

test('free-fall touchdown follows sqrt(2gh) independently of chassis mass',()=>{
  const speeds=[];
  for(const dryMass of [1350,1685,1900]){
    const {result:r}=experiment({method:'free',height:2},{dryMass});speeds.push(r.touchdownSpeed);
    assert.equal(r.status,'landed');assert.equal(r.gasUsed,0);
    assert.ok(Math.abs(r.touchdownSpeed-Math.sqrt(2*9.80665*2))<.025);
    assert.ok(r.touchdownTime>0&&r.contactDuration>0&&r.groundImpulseNs>0);
  }
  assert.ok(Math.max(...speeds)-Math.min(...speeds)<1e-10);
});

test('both thrust-based methods reduce first contact speed and peak ground load through real gas use',()=>{
  const free=experiment({method:'free'}).result;
  for(const method of ['brake','gentle']){
    const {sim,result:r}=experiment({method});
    assert.equal(r.status,'landed');assert.ok(r.touchdownSpeed<free.touchdownSpeed*.2);
    assert.ok(r.peakEquivalentGroundForceN<free.peakEquivalentGroundForceN*.2);
    assert.ok(r.gasUsed>20&&r.gasUsed<r.initialGas);assert.ok(sim.state.pressure<35.875e6);
    assert.equal(r.bodyStrike,false);assert.equal(r.correctionImpulseNs,0);
    assert.ok(sim.thrusters.every(t=>t.opening>=0&&t.opening<=1));
  }
});

test('late braking has a measurable cost and cannot remove velocity instantaneously',()=>{
  const early=experiment({method:'brake',brakeHeight:2}).result;
  const late=experiment({method:'brake',brakeHeight:.1}).result;
  assert.ok(late.touchdownSpeed>early.touchdownSpeed+4);
  assert.ok(late.peakEquivalentGroundForceN>early.peakEquivalentGroundForceN*2);
  const sim=new PhysicsSim(),run=createLandingRun(sim,{method:'brake',brakeHeight:5});
  const before=sim.state.vel.y,input=landingRunInput(run,sim);
  assert.equal(sim.state.vel.y,before);assert.ok(Number.isFinite(input.verticalAcceleration));
  sim.step(.002,input);assert.ok(Math.abs(sim.state.vel.y-before)<.1);
});

test('spring and damper controls alter measured suspension response',()=>{
  const soft=experiment({height:.5,springK:30000,damperC:1000}).result;
  const stiff=experiment({height:.5,springK:150000,damperC:15000}).result;
  assert.equal(soft.springK,30000);assert.equal(stiff.damperC,15000);
  assert.ok(Math.abs(soft.peakGroundForceN-stiff.peakGroundForceN)>10000);
  assert.ok(Math.abs(soft.maxCompression-stiff.maxCompression)>.01);
});

test('ground impulse accounts for momentum change and gravity, including hull correction',()=>{
  const {sim,result:r}=experiment({method:'free',height:3});
  const expected=r.initialMass*(sim.state.vel.y+sim.params.gravity*r.elapsed);
  assert.ok(r.bodyStrike);assert.ok(r.correctionImpulseNs>0);
  assert.ok(r.peakEquivalentGroundForceN>r.peakGroundForceN);
  assert.ok(Math.abs(r.totalGroundImpulseNs-expected)<1e-6);
  assert.ok(r.contactPeakG>r.peakGroundForceN/(r.initialMass*sim.params.gravity));
});

test('render-frame batching does not alter landing metrics or sampled peak envelopes',()=>{
  const slow=experiment({method:'brake'}, {},[25,17,33]).result;
  const fast=experiment({method:'brake'}, {},[8,9,8]).result;
  assert.deepEqual(slow,fast);
  assert.equal(Math.max(...slow.samples.map(s=>s.equivalentGroundForceN)),slow.peakEquivalentGroundForceN);
  const sim=new PhysicsSim(),run=createLandingRun(sim);sim.step(.016,{});
  assert.throws(()=>updateLandingRun(run,sim,.016),/fixed/);
  assert.throws(()=>updateLandingRun(run,sim),/fixed/,'cannot skip substep measurements and silently lose the impact peak');
});

test('completed measurement is frozen and a new trial clears all old peaks and samples',()=>{
  const {sim,run}=experiment();const result=structuredClone(run.result),sampleCount=run.samples.length;
  sim.step(.002,{lift:1});updateLandingRun(run,sim);
  assert.deepEqual(run.result,result);assert.equal(run.samples.length,sampleCount);
  const next=createLandingRun(sim,{height:1,method:'gentle'});
  assert.equal(next.touchdownTime,null);assert.equal(next.peakEquivalentGroundForceN,0);
  assert.equal(next.samples.length,0);assert.equal(next.gasUsed,0);assert.equal(next.done,false);
  assert.equal(sim.state.gas,next.initialGas);
});

test('fuel exhaustion cannot create unphysical lift or guarantee the requested approach speed',()=>{
  const {sim,result:r}=experiment({method:'gentle'},{tankPressureMPa:.101325});
  assert.equal(r.gasUsed,0);assert.equal(sim.totalThrust,0);
  assert.ok(r.touchdownSpeed>7);assert.ok(r.bodyStrike);
});

test('settings bounds are finite and failed airborne trials time out',()=>{
  const settings=landingSettings({height:Infinity,springK:-1,damperC:NaN,method:'unknown',targetSpeed:0});
  assert.equal(settings.height,3);assert.equal(settings.springK,30000);
  assert.equal(settings.damperC,6000);assert.equal(settings.method,'free');assert.equal(settings.targetSpeed,.2);
  const sim=new PhysicsSim(),run=createLandingRun(sim);sim.params.gravity=0;sim.params.contactEnabled=false;
  for(let n=0;n<7500;n++){sim.step(.002,{});updateLandingRun(run,sim);}
  assert.equal(run.done,true);assert.equal(run.result.status,'timeout');assert.equal(run.result.touchdownSpeed,null);
  assert.ok(Number.isFinite(run.result.peakG));
});

test('reaching the observation limit while still oscillating is not a settled landing',()=>{
  const {result:r}=experiment({height:5,method:'free',springK:150000,damperC:1000});
  assert.equal(r.status,'unsettled');assert.equal(r.settled,false);
  assert.ok(r.elapsed-r.touchdownTime>=3);assert.ok(r.touchdownSpeed>0);
});
