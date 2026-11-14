import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim} from '../dist/js/physics.js';
import {vehiclePhysics,vehicleProfile} from '../dist/js/jet-vehicle.js';
import {EXPERIMENT_VEHICLE_IDS} from '../dist/js/experiment-vehicles.js';
import {LANDING_METHODS,LANDING_STEP,createLandingRun,landingRunInput,updateLandingRun,
  landingClearance,jetReleaseState,jetHeightAcceleration} from '../dist/js/landing-experiment.js';
import {predictJetLanding,planJetLanding} from '../dist/js/landing-economy.js';

const close=(actual,expected,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<=tolerance,
  `${actual} differs from ${expected} by more than ${tolerance}`);
const outcomes=new Map();

function experiment(id,method,params={},options={}){
  const sim=new PhysicsSim({...vehiclePhysics(vehicleProfile(id)),...params});
  const run=createLandingRun(sim,{height:2,targetSpeed:.5,brakeHeight:2,method,...options});
  const groundStart=landingClearance(sim);
  let releaseObserved=false,peakUpwardSpeed=0,steps=0;
  while(!run.done&&steps++<150000){
    const preparing=run.phase!=='landing';
    sim.step(LANDING_STEP,landingRunInput(run,sim));
    const beforeUpdate=preparing?jetReleaseState(sim):null;
    if(preparing)peakUpwardSpeed=Math.max(peakUpwardSpeed,sim.state.vel.y);
    updateLandingRun(run,sim);
    if(preparing&&run.phase==='landing'){
      releaseObserved=true;
      // Measurement starts at the exact integrated state; no reset, velocity
      // assignment, top-up, or hidden engine re-prime is allowed at release.
      assert.deepEqual(run.releaseState,beforeUpdate);
      assert.deepEqual(jetReleaseState(sim),beforeUpdate);
      assert.equal(run.elapsed,0);
      assert.equal(run.samples.length,0);
    }
  }
  assert.ok(run.done,'trial must terminate within a finite simulation time');
  return {sim,run,result:run.result,groundStart,releaseObserved,peakUpwardSpeed};
}

function cohort(){
  if(!outcomes.size)for(const id of EXPERIMENT_VEHICLE_IDS){
    outcomes.set(id,Object.fromEntries(LANDING_METHODS.map(({id:method})=>[method,experiment(id,method)])));
  }
  return outcomes;
}

test('all five app vehicles really ascend from the ground and share one unchanged hover checkpoint across four methods',()=>{
  for(const [id,trials] of cohort()){
    const baseline=trials.free.result;
    for(const {sim,run,result:r,groundStart,releaseObserved,peakUpwardSpeed} of Object.values(trials)){
      assert.ok(groundStart<.01,`${id} must start on the ground`);
      assert.ok(releaseObserved&&peakUpwardSpeed>.1,`${id} must physically take off`);
      assert.equal(r.propulsionKind,'air-breathing-jet');
      assert.equal(r.status,'landed');
      assert.equal(r.preparationComplete,true);
      assert.ok(r.preparationTime>5&&r.preparationTime<20);
      assert.ok(r.hoverStableTime>=r.hoverDwell);
      close(r.actualReleaseHeight,2,r.hoverHeightToleranceM);
      assert.ok(Math.abs(r.initialVelocityY)<r.hoverSpeedToleranceMps);
      assert.deepEqual(r.releaseState,baseline.releaseState,`${id}: common preflight must ignore landing method`);
      assert.equal(r.preparationFuelUsedKg,baseline.preparationFuelUsedKg);
      assert.ok(r.touchdownTime>0&&r.touchdownTime<r.elapsed);
      assert.ok(r.samples[0].time>0&&r.samples[0].time<.01);
      assert.ok(r.touchdownMass<vehicleProfile(id).dryMass+150);
      assert.equal(sim.state.pressure,0);
      close(r.missionElapsed,r.preparationTime+r.elapsed);
      close(r.missionFuelUsedKg,r.preparationFuelUsedKg+r.fuelUsedKg);
      close(r.missionInitialFuelKg-r.finalFuelKg,r.missionFuelUsedKg);
      close(r.initialMass,vehicleProfile(id).dryMass+r.initialFuelKg);
      close(r.fuelUsedKg,r.gasUsed);
      close(r.finalFuelKg,sim.state.gas);
      assert.ok(r.preparationFuelUsedKg>0&&r.missionFuelUsedKg<150);
      assert.ok(sim.state.fuelChemicalEnergyJ>r.releaseState.fuelChemicalEnergyJ||run.method==='free');
    }
  }
});

test('powered landings reduce impact and the searched economy schedule uses less landing fuel than gentle descent',()=>{
  for(const [id,trials] of cohort()){
    const free=trials.free.result,gentle=trials.gentle.result,eco=trials.eco.result;
    assert.equal(free.fuelUsedKg,0);
    assert.ok(free.preparationFuelUsedKg>0,'zero landing fuel does not mean zero mission fuel');
    close(free.touchdownSpeed,Math.sqrt(free.initialVelocityY**2+2*9.80665*free.actualReleaseHeight),.025);
    assert.ok(free.bodyStrike,`${id}: untreated impact must remain visible`);
    for(const method of ['brake','gentle','eco']){
      const r=trials[method].result;
      assert.ok(r.touchdownSpeed<.55,`${id}/${method}: soft touchdown`);
      assert.ok(r.peakEquivalentGroundForceN<free.peakEquivalentGroundForceN*.2);
      assert.ok(r.fuelUsedKg>0);
    }
    assert.equal(eco.ecoPlanFeasible,true);
    assert.ok(eco.fuelUsedKg<gentle.fuelUsedKg*.8);
    // Economy optimizes fuel under a speed bound; it does not claim the
    // smallest impact force and smallest fuel simultaneously.
    assert.ok(gentle.touchdownSpeed<eco.touchdownSpeed);
    close(eco.ecoPredictedTouchdownSpeed,eco.touchdownSpeed,.01);
    close(eco.ecoPredictedTouchdownGas,eco.touchdownFuelUsedKg,.03);
  }
});

test('jet forecast uses copied actual spool/fuel state and cannot mutate a running experiment',()=>{
  const sim=new PhysicsSim(vehiclePhysics(vehicleProfile('roadster')));
  const run=createLandingRun(sim,{height:2,method:'gentle'});
  while(run.phase!=='landing'&&!run.done){sim.step(LANDING_STEP,landingRunInput(run,sim));updateLandingRun(run,sim);}
  const before=jetReleaseState(sim),plan=planJetLanding(sim,landingClearance(sim),.5);
  assert.deepEqual(jetReleaseState(sim),before);
  assert.ok(plan.feasible);
  const fine=predictJetLanding(sim,landingClearance(sim),.5,plan.jetProfile,.002);
  const coarse=predictJetLanding(sim,landingClearance(sim),.5,plan.jetProfile,.01);
  assert.deepEqual(jetReleaseState(sim),before);
  assert.ok(fine.complete&&coarse.complete);
  close(fine.speed,coarse.speed,.02);
  close(fine.fuelUsedKg,coarse.fuelUsedKg,.08);
  assert.ok(fine.fuelUsedKg>0&&fine.fuelUsedKg<before.fuelKg);
});

test('height hold remains stable for every app experiment mass after actual takeoff',()=>{
  for(const id of EXPERIMENT_VEHICLE_IDS){
    const sim=new PhysicsSim(vehiclePhysics(vehicleProfile(id)));
    sim.primeJetIdle();
    let worstError=0,worstSpeed=0;
    for(let i=0;i<12500;i++){
      sim.step(LANDING_STEP,{jetEnabled:true,jetLiftOnly:true,stabilize:true,verticalAcceleration:jetHeightAcceleration(sim,2)});
      if(i>10000){worstError=Math.max(worstError,Math.abs(landingClearance(sim)-2));worstSpeed=Math.max(worstSpeed,Math.abs(sim.state.vel.y));}
    }
    assert.ok(worstError<.005&&worstSpeed<.005,`${id}: sustained hover must be stable`);
    assert.ok(sim.state.gas>0&&sim.state.gas<150);
  }
});

test('an impossible fuel budget reports preparation failure without fabricating a landing result',()=>{
  const {result:r}=experiment('roadster','eco',{fuelCapacityKg:.1});
  assert.equal(r.status,'preparation-failed');
  assert.equal(r.preparationFailure,'fuel-exhausted');
  assert.equal(r.preparationComplete,false);
  assert.equal(r.releaseState,null);
  assert.equal(r.actualReleaseHeight,null);
  assert.equal(r.touchdownSpeed,null);
  assert.equal(r.fuelUsedKg,null);
  assert.equal(r.peakEquivalentGroundForceN,null);
  assert.equal(r.samples.length,0);
  close(r.missionFuelUsedKg,.1);
  close(r.preparationFuelUsedKg,.1);
  assert.equal(r.finalFuelKg,0);
});

test('higher requested releases are achieved by ascent, while late braking retains its physical spool-delay penalty',()=>{
  const high=experiment('roadster','eco',{}, {height:10});
  assert.equal(high.result.status,'landed');
  close(high.result.actualReleaseHeight,10,.005);
  assert.ok(high.result.preparationTime>cohort().get('roadster').eco.result.preparationTime);
  assert.ok(high.result.preparationFuelUsedKg>cohort().get('roadster').eco.result.preparationFuelUsedKg);
  const late=experiment('roadster','brake',{}, {brakeHeight:.1}).result;
  assert.ok(late.touchdownSpeed>cohort().get('roadster').brake.result.touchdownSpeed+1);
  assert.ok(late.peakEquivalentGroundForceN>cohort().get('roadster').brake.result.peakEquivalentGroundForceN*2);
});
