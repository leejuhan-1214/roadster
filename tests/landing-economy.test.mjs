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

test('every comparison shares exactly four landing methods without duplicating economy',()=>{
  assert.equal(landingSettings({method:'eco'}).method,'eco');
  assert.equal(LANDING_METHODS.length,4);
  const fleet=[{id:'a'},{id:'b'}];
  assert.deepEqual(createLandingJobs('economy',fleet,{},'a').map(r=>r.method),['free','brake','gentle','eco']);
  assert.deepEqual(createLandingJobs('methods',fleet,{},'a'),createLandingJobs('economy',fleet,{},'a'));
  assert.equal(createLandingJobs('fleet-methods',fleet,{},'a').length,8);
});

test('automatic economy starts with measured zero thrust and zero gas use across heights and masses',()=>{
  for(const dryMass of [1090,1350,1640,1900,3150])for(const height of [.02,3,10]){
    const sim=new PhysicsSim({dryMass}),run=createLandingRun(sim,{height,method:'eco'});
    let steps=0;
    while(!run.braking&&!run.done&&steps<10000){
      const input=landingRunInput(run,sim);
      if(run.braking)break;
      sim.step(.002,input);updateLandingRun(run,sim);steps++;
      assert.equal(sim.totalThrust,0);assert.equal(sim.state.gas,run.initialGas);
      assert.ok(Math.abs(sim.state.vel.y+sim.params.gravity*run.elapsed)<1e-8);
    }
    assert.ok(steps>=2);assert.equal(run.ecoProfile,'brake');
    assert.ok(run.ecoCoastTime+1e-10>=run.ecoMinimumCoastTime);
    assert.ok(run.autoBrakeHeight<height);
  }
});

test('heavy-chassis economy remains delayed braking when the target speed is infeasible',()=>{
  const eco=runLanding({}, {dryMass:3150}).result,gentle=runLanding({method:'gentle'},{dryMass:3150}).result;
  assert.equal(eco.ecoProfile,'brake');assert.equal(eco.ecoPlanFeasible,false);
  assert.ok(eco.ecoCoastTime>=eco.ecoMinimumCoastTime);
  assert.ok(eco.gasUsed<=gentle.gasUsed+1e-4);
  assert.ok(eco.touchdownSpeed>eco.targetSpeed);
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

test('the separate gentle method remains observable beyond the free-fall deadline',()=>{
  const sim=new PhysicsSim({dryMass:100}),run=createLandingRun(sim,{height:40,method:'gentle'});
  // This synthetic light rig is not a vehicle specification; it can sustain
  // the separate gentle controller through a longer descent.
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
