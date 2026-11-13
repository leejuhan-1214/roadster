import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim,ATMOSPHERE} from '../dist/js/physics.js';
import {LANDING_METHODS,createLandingJobs,createLandingRun,landingRunInput,updateLandingRun,landingSettings} from '../dist/js/landing-experiment.js';

function runLanding(options={},params={}){
  const sim=new PhysicsSim(params),run=createLandingRun(sim,{height:3,brakeHeight:1.5,method:'eco',...options});
  for(let i=0;!run.done&&i<40000;i++){
    sim.step(.002,landingRunInput(run,sim));updateLandingRun(run,sim);
  }
  assert.ok(run.done,'bounded experiment must terminate');
  return {sim,run,result:run.result};
}

test('economy is opt-in for four-method jobs and preserves legacy three-method comparisons',()=>{
  assert.equal(landingSettings({method:'eco'}).method,'eco');
  assert.equal(LANDING_METHODS.length,3);
  const fleet=[{id:'a'},{id:'b'}];
  assert.deepEqual(createLandingJobs('economy',fleet,{},'a').map(r=>r.method),['free','brake','gentle','eco']);
  assert.equal(createLandingJobs('methods',fleet,{},'a').length,3);
  assert.equal(createLandingJobs('fleet-methods',fleet,{},'a').length,6);
});

test('coast then brake reduces gas versus gentle and impact versus a late fixed trigger',()=>{
  const eco=runLanding().result,gentle=runLanding({method:'gentle'}).result,brake=runLanding({method:'brake'}).result;
  assert.equal(eco.status,'landed');assert.equal(eco.bodyStrike,false);assert.equal(eco.bottomedOut,false);
  assert.ok(eco.gasUsed<gentle.gasUsed*.8);
  assert.ok(eco.peakEquivalentGroundForceN<brake.peakEquivalentGroundForceN*.85);
  assert.ok(eco.touchdownSpeed<=.56);
  assert.ok(eco.ecoCoastTime>0&&eco.autoBrakeHeight>0&&eco.autoBrakeHeight<eco.height);
  assert.ok(Math.abs(eco.touchdownSpeed-eco.ecoPredictedTouchdownSpeed)<.05);
  assert.equal(eco.ecoPlanFeasible,true);
});

test('zero and already gentle drops consume no gas',()=>{
  for(const height of [0,.005]){
    const r=runLanding({height}).result;
    assert.equal(r.gasUsed,0);assert.equal(r.autoBrakeHeight,null);assert.equal(r.ecoCoastTime,null);
  }
});

test('depleted pressure remains a failed physical landing without fabricated braking',()=>{
  const {sim,result:r}=runLanding({}, {tankPressureMPa:ATMOSPHERE/1e6});
  assert.equal(r.ecoPlanFeasible,false);assert.equal(r.gasUsed,0);
  assert.ok(r.touchdownSpeed>7);assert.ok(r.bodyStrike||r.bottomedOut);
  assert.ok(sim.state.pressure>=ATMOSPHERE-1e-6);
});

test('user touchdown speed controls are retained by the planner',()=>{
  const slow=runLanding({targetSpeed:.2}).result,fast=runLanding({targetSpeed:2}).result;
  assert.equal(slow.targetSpeed,.2);assert.equal(fast.targetSpeed,2);
  assert.ok(slow.touchdownSpeed<fast.touchdownSpeed);
  assert.ok(slow.touchdownSpeed<=.26);assert.ok(fast.touchdownSpeed<=2.06);
});

test('a bounded forecast never labels an unfinished high drop as a touchdown prediction',()=>{
  const sim=new PhysicsSim(),r=createLandingRun(sim,{height:1e8,method:'eco'});
  assert.equal(r.ecoPlanFeasible,false);
  assert.equal(r.ecoPredictedTouchdownSpeed,null);assert.equal(r.ecoPredictedGas,null);
  assert.ok(Number.isFinite(r.ecoPlannedBrakeHeight));assert.ok(Number.isFinite(r.ecoPlanTimeMs));
  assert.equal(sim.state.vel.length(),0);assert.equal(sim.state.gas,r.initialGas);
});

test('an economy gentle-profile fallback remains observable beyond the free-fall deadline',()=>{
  const sim=new PhysicsSim({dryMass:100}),run=createLandingRun(sim,{height:40,method:'eco'});
  // Exercise the selected-profile execution independently of the planner's
  // preference: this synthetic light rig (not a vehicle specification) can
  // sustain the longer gentle descent.
  run.ecoProfile='gentle';run.ecoPlannedBrakeHeight=40;
  for(let i=0;!run.done&&i<14000;i++){
    sim.step(.002,landingRunInput(run,sim));updateLandingRun(run,sim);
  }
  assert.equal(run.status,'landed');assert.ok(run.touchdownTime>16);
  assert.ok(run.gasUsed>0&&run.gasUsed<run.initialGas);
});

test('controller planning and feedback do not change state and manual lift stays available',()=>{
  for(const height of [.005,3]){
  const sim=new PhysicsSim(),run=createLandingRun(sim,{height,method:'eco'});
  const snapshot=()=>[...sim.state.pos,...sim.state.vel,sim.state.gas,sim.state.temp,sim.state.pressure];
  const before=snapshot();landingRunInput(run,sim);assert.deepEqual(snapshot(),before);
  const manual=landingRunInput(run,sim,true);assert.equal(manual.lift,1);assert.deepEqual(snapshot(),before);
  sim.step(.002,manual);updateLandingRun(run,sim);
  assert.equal(run.manualLiftUsed,true);
  const after=snapshot(),resumed=landingRunInput(run,sim,false);
  assert.equal(run.braking,true);assert.ok(Number.isFinite(resumed.verticalAcceleration));assert.deepEqual(snapshot(),after);
  }
});
