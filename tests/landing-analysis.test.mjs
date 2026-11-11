import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim} from '../dist/js/physics.js';
import {LANDING_STEP,createLandingRun,landingRunInput,updateLandingRun} from '../dist/js/landing-experiment.js';
import {landingTheory,landingImpulseAudit,landingTradeoff} from '../dist/js/landing-analysis.js';

function experiment(options={},manual=false){
  const sim=new PhysicsSim(),run=createLandingRun(sim,{height:3,...options});
  let steps=0;
  while(!run.done&&steps++<20000){
    sim.step(LANDING_STEP,landingRunInput(run,sim,manual&&run.elapsed>.1&&run.elapsed<.2));
    updateLandingRun(run,sim);
  }
  assert.ok(run.done);
  return {...run.result,groupId:'audit',vehicleId:'roadster'};
}
const free=experiment(),brake=experiment({method:'brake',brakeHeight:2.25});

test('untreated 3 m drop exposes analytic validation and measured precontact kinetic energy',()=>{
  const theory=landingTheory(free);
  assert.equal(theory.eligible,true);assert.ok(Math.abs(theory.expectedSpeed-7.67072)<.0001);
  assert.ok(theory.relativeErrorPercent<.5,'report contact-step integration error rather than replacing the measured speed');
  assert.equal(free.touchdownMass,free.initialMass);assert.equal(free.touchdownGasUsed,0);
  assert.equal(free.touchdownKineticEnergyJ,.5*free.touchdownMass*free.touchdownSpeed**2);
  assert.ok(Math.abs(free.touchdownKineticEnergyJ-free.initialPotentialEnergyJ)/free.initialPotentialEnergyJ<.01);
  assert.ok(free.samples.every(sample=>[sample.massKg,sample.kineticEnergyJ,sample.potentialEnergyJ,sample.springEnergyJ].every(Number.isFinite)));
  assert.ok(free.samples.some(sample=>sample.potentialEnergyJ<0),'compression may move CG below the unloaded contact datum');
  assert.ok(free.samples.some(sample=>sample.springEnergyJ>0),'contact stores elastic energy');
});

test('powered and manual runs retain contact mass/energy but cannot claim freefall or fixed-mass validation',()=>{
  const manual=experiment({},true);
  for(const result of [brake,manual]){
    assert.equal(landingTheory(result).eligible,false);
    assert.equal(landingTheory(result).relativeErrorPercent,null);
    assert.equal(landingImpulseAudit(result).eligible,false);
    assert.equal(landingImpulseAudit(result).residualNs,null);
    assert.ok(result.touchdownMass<result.initialMass);
    assert.ok(result.touchdownGasUsed>0&&result.touchdownGasUsed<=result.gasUsed);
    assert.ok(Math.abs(result.initialMass-result.touchdownMass-result.touchdownGasUsed)<1e-9);
    assert.ok(result.finalMass<=result.touchdownMass);
  }
});

test('full-interval signed ground+gravity impulse agrees with the matching final momentum, including hull correction',()=>{
  const audit=landingImpulseAudit(free);
  assert.equal(audit.eligible,true);assert.ok(free.correctionImpulseNs>0);
  assert.equal(audit.groundImpulseNs,free.totalGroundImpulseNs);
  assert.ok(Math.abs(audit.gravityImpulseNs+free.initialMass*free.parameters.gravity*free.elapsed)<1e-6);
  assert.equal(audit.momentumChangeNs,free.initialMass*free.finalVelocityY);
  assert.equal(audit.duration,free.elapsed);
  assert.ok(Math.abs(audit.residualNs)<1e-6);
  assert.ok(audit.relativeResidualPercent<1e-7);
  assert.notEqual(audit.groundImpulseNs,free.groundImpulseNs,'do not mix the first-compression interval with the entire observation interval');
});

test('zero-height absolute check remains finite and has no relative-speed percentage',()=>{
  const zero=experiment({height:0}),theory=landingTheory(zero);
  assert.equal(theory.eligible,true);assert.equal(theory.expectedSpeed,0);assert.equal(theory.expectedFallTime,0);
  assert.ok(Number.isFinite(theory.absoluteError));assert.equal(theory.relativeErrorPercent,null);
});

test('incomplete or changed-force measurements are not silently treated as analytic validation',()=>{
  for(const result of [{...free,status:'timeout'},{...free,freeFallConditionsValid:false},{...free,gasUsed:1},{...free,parameters:{gravity:NaN}}]){
    assert.equal(landingTheory(result).eligible,false);assert.equal(landingTheory(result).relativeErrorPercent,null);
  }
  for(const result of [{...free,status:'timeout'},{...free,constantMassAuditValid:false},{...free,finalMass:free.initialMass-1},{...free,totalGravityImpulseNs:undefined}]){
    assert.equal(landingImpulseAudit(result).eligible,false);assert.equal(landingImpulseAudit(result).residualNs,null);
  }
});

test('Pareto candidates require stable landing and isolate vehicle, batch, initial conditions and rig',()=>{
  const row=(id,gas,force,overrides={})=>({...brake,id,gasUsed:gas,peakEquivalentGroundForceN:force,...overrides});
  const lowGas=row('low-gas',10,40000),lowLoad=row('low-load',30,20000),dominated=row('dominated',35,45000);
  const unsafe=row('unsafe',1,1,{bodyStrike:true}),unsettled=row('unsettled',2,2,{status:'unsettled',settled:false});
  const manual=row('manual',1,1,{manualLiftUsed:true}),bottomed=row('bottomed',1,1,{bottomedOut:true});
  const mismatches=[['vehicleId','other'],['groupId','other'],['height',4],['initialMass',2000],['initialGas',300],['springK',30000],['damperC',1000],['targetSpeed',1],['tankPressureMPa',30],['initialTemperature',280]]
    .map(([key,value],index)=>row('other-'+index,0,1,{[key]:value}));
  const result=landingTradeoff([lowGas,lowLoad,dominated,unsafe,unsettled,manual,bottomed,...mismatches],lowGas);
  assert.deepEqual(result.candidates.map(r=>r.id),['low-gas','low-load']);
  assert.deepEqual(result.eligible.map(r=>r.id),['low-gas','low-load','dominated']);
  assert.deepEqual(result.excluded.map(r=>r.id),['unsafe','unsettled','manual','bottomed']);
  assert.equal(result.rows.length,7);assert.deepEqual(landingTradeoff([]),{rows:[],eligible:[],candidates:[],excluded:[]});
});
