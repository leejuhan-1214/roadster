import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,PhysicsSim} from '../dist/js/physics.js';
import {ROCKET_PARAMS} from '../dist/js/rocket-layout.js';
import {refineBrakeHeights,runLandingHeightStudy,measureHeightStudyTrial} from '../dist/js/landing-height-study.js';
import {LANDING_STEP,landingRunInput,updateLandingRun} from '../dist/js/landing-experiment.js';
import {startHoverLandingRun} from '../dist/js/landing-hover.js';

test('refinement samples only the interiors of both kinds of observed transition',()=>{
  const rows=[false,true,true,false].map((feasible,brakeHeight)=>({feasible,brakeHeight}));
  const fine=refineBrakeHeights(rows);
  assert.equal(fine.length,18);
  assert.deepEqual(fine.slice(0,9),[.1,.2,.3,.4,.5,.6,.7,.8,.9]);
  assert.deepEqual(fine.slice(9),[2.1,2.2,2.3,2.4,2.5,2.6,2.7,2.8,2.9]);
});

test('20 m height study separates command, goal, and contact on a controlled hover release',()=>{
  const progress=[];
  const study=runLandingHeightStudy({parameters:{...DEFAULTS,...ROCKET_PARAMS},vehicleId:'roadster',
    config:{height:3,brakeHeight:1.5,targetSpeed:.5}},event=>progress.push(event));
  const {conditions,rows}=study;
  assert.equal(conditions.config.height,20);
  assert.ok(Math.abs(conditions.hover.releaseHeightM-20)<1e-10);
  assert.equal(conditions.hover.durationS,1);
  assert.equal(progress.at(-1).done,rows.length);
  assert.equal(progress.at(-1).total,rows.length);
  assert.equal(rows.at(-1).method,'eco');
  const fixed=rows.slice(0,-1);
  assert.equal(new Set(fixed.map(r=>r.brakeHeight)).size,fixed.length);
  for(let h=0;h<=20;h++)assert.ok(fixed.some(row=>row.brakeHeight===h));
  for(const row of rows){
    assert.ok(row.groundImpulseNs>0&&Number.isFinite(row.groundImpulseNs));
    assert.equal(row.hoverGasKg,conditions.hover.gasUsedKg);
    assert.equal(row.totalGasKg,row.hoverGasKg+row.landingGasKg);
    if(row.actualDistance!==null)assert.ok(row.actualDistance<=row.distanceToContact+1e-9);
    if(row.predictedDistance>0)assert.ok(Math.abs(2*row.referenceAcceleration*row.predictedDistance-
      (row.entrySpeed**2-row.targetSpeed**2))<1e-9);
  }
  const never=fixed[0],late=fixed.find(r=>r.brakeHeight===1.5),atRelease=fixed.at(-1),eco=rows.at(-1);
  assert.equal(never.targetState,'no-command');assert.equal(never.predictedDistance,null);
  assert.equal(never.distanceToContact,null);assert.equal(never.actualDistance,null);
  assert.ok(never.landingGasKg>0,'closing the hover valves still expels some gas');
  assert.equal(late.targetState,'unreached');assert.equal(late.actualDistance,null);
  assert.ok(late.predictedDistance>late.distanceToContact&&late.touchdownSpeed>.5);
  assert.ok(late.supportDelay>0&&late.supportDelay<late.touchdownTime-late.autoBrakeTime);
  assert.equal(atRelease.autoBrakeTime,0);assert.equal(atRelease.targetState,'already');
  assert.equal(atRelease.actualDistance,0);assert.equal(atRelease.feasible,false);
  assert.ok(eco.feasible&&eco.actualDistance>eco.predictedDistance&&eco.actualDistance<=eco.distanceToContact);
  // The phase ledger includes gas released by the closing valves after first contact.
  const sim=new PhysicsSim(conditions.parameters);
  const replay=startHoverLandingRun(sim,{...conditions.config,method:'brake',brakeHeight:1.5});
  while(!replay.done){
    sim.step(LANDING_STEP,landingRunInput(replay,sim));updateLandingRun(replay,sim);
  }
  assert.ok(late.landingGasKg>replay.touchdownGasUsed);
  assert.equal(late.landingGasKg,replay.initialGas-sim.state.gas);
  assert.equal(late.groundImpulseNs,replay.groundImpulseNs);
});

test('an unfinished airborne descent has neither a measured peak nor a ground impulse',()=>{
  // With little dry mass this low-speed test can stay in flight beyond the
  // ordinary fixed-braking observation window.
  const {row}=measureHeightStudyTrial({parameters:{...DEFAULTS,...ROCKET_PARAMS,dryMass:100}},
    {height:20,method:'brake',brakeHeight:20,hoverSeconds:0,targetSpeed:.2});
  assert.equal(row.status,'timeout');assert.equal(row.touchdownTime,null);
  assert.equal(row.groundImpulseNs,null);assert.equal(row.peakEquivalentGroundForceN,null);
});
