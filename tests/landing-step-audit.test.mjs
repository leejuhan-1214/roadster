import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim} from '../dist/js/physics.js';
import {LANDING_STEP,LANDING_AUDIT_STEPS,createLandingRun,landingRunInput,updateLandingRun} from '../dist/js/landing-experiment.js';
import {replayLandingStep} from '../dist/js/landing-step-worker.js';
import {canAuditLanding,stepAuditSource,stepAuditCSV} from '../dist/js/landing-step-audit.js';

function measured(method){
  const sim=new PhysicsSim(),run=createLandingRun(sim,{height:20,brakeHeight:1.5,method});
  while(!run.done){
    sim.step(LANDING_STEP,landingRunInput(run,sim));updateLandingRun(run,sim);
  }
  return {...run.result,id:'test',vehicleId:'roadster'};
}

test('twenty metre free fall has one contact speed across genuine step refinements while a hard impact depends on h',()=>{
  const reference=measured('free'),source=stepAuditSource(reference);
  const rows=LANDING_AUDIT_STEPS.map(step=>replayLandingStep(source,step));
  assert.equal(rows[0].speed,reference.touchdownSpeed);
  assert.equal(rows[0].impulse,reference.groundImpulseNs);
  assert.equal(rows[0].peak,reference.peakEquivalentGroundForceN);
  for(const r of rows){
    assert.ok(Math.abs(r.speed-Math.sqrt(-9.80665*Math.expm1(-2*(.5*1.225*3.4/r.initialMass)*20)/(.5*1.225*3.4/r.initialMass)))<.002);
    assert.equal(r.initialMass,reference.initialMass);
    assert.ok(Math.abs(r.impulse/rows[0].impulse-1)<.01);
    assert.ok(Math.abs(r.contactEndTime/r.step-Math.round(r.contactEndTime/r.step))<1e-7);
  }
  assert.ok(rows[2].peak>3*rows[0].peak);
  const [header,...data]=stepAuditCSV(source,rows);
  const column=name=>header.indexOf(name);
  assert.deepEqual(data.map(r=>r[column('physics_ms')]),[2,1,.5]);
  assert.ok(data.every(r=>r[column('controller_ms')]===2&&r.length===header.length));
  assert.equal(data[2][column('peak_delta_vs_0.5ms_N')],0);
  assert.equal(data[0][column('peak_delta_vs_0.5ms_N')],rows[0].peak-rows[2].peak);
});

test('automatic eco/brake retain their original control clock and 2 ms results',()=>{
  for(const method of ['eco','brake']){
    const reference=measured(method),source=stepAuditSource(reference);
    for(const step of LANDING_AUDIT_STEPS){
      const r=replayLandingStep(source,step);
      assert.ok(Number.isFinite(r.autoBrakeTime)&&r.autoBrakeTime>0);
      assert.ok(Math.abs(r.autoBrakeTime/.002-Math.round(r.autoBrakeTime/.002))<1e-7);
      if(step===LANDING_STEP){
        assert.equal(r.speed,reference.touchdownSpeed);assert.equal(r.gasUsed,reference.gasUsed);
        assert.equal(r.peak,reference.peakEquivalentGroundForceN);
      }
    }
  }
});

test('unsupported timing, manual trials and data without reproducible conditions cannot start a replay',()=>{
  const reference=measured('free');
  for(const change of [{manualLiftUsed:true},{status:'timeout'},{parameters:null},{modelVersion:'legacy'}]){
    assert.equal(canAuditLanding({...reference,...change}),false);
    assert.throws(()=>stepAuditSource({...reference,...change}));
  }
  assert.throws(()=>replayLandingStep(stepAuditSource(reference),.004),RangeError);
  const sim=new PhysicsSim(),run=createLandingRun(sim,{physicsStep:.001});
  sim.step(.002,landingRunInput(run,sim));
  assert.throws(()=>updateLandingRun(run,sim,.002),/fixed/);
});
