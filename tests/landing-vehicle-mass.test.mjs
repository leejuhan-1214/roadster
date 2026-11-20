import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim} from '../dist/js/physics.js';
import {createLandingJobs,createLandingRun} from '../dist/js/landing-experiment.js';
import {canAuditLanding} from '../dist/js/landing-step-audit.js';
import {economyInitialState} from '../dist/js/landing-economy.js';

test('each landing uses only the selected rig and its air, including legacy options',()=>{
  const vehicles=[{id:'roadster'}];
  assert.deepEqual(createLandingJobs('ballast',vehicles,{},'roadster'),[]);
  const jobs=createLandingJobs('methods',vehicles,{height:20},'roadster');
  assert.deepEqual(jobs.map(job=>job.method),['free','brake','gentle','eco']);
  const reference=new PhysicsSim({dryMass:1900});
  const sim=new PhysicsSim({dryMass:1900,ballastKg:200});
  assert.equal(sim.restHeight,reference.restHeight);
  assert.equal(sim.mass,reference.mass);
  for(const job of jobs){
    const run=createLandingRun(sim,{...job,height:20,ballastKg:200});
    assert.equal(run.initialMass,1900+run.initialGas);
    assert.equal(economyInitialState(sim,20).dryMass,1900);
    assert.ok(!Object.hasOwn(run.parameters,'ballastKg'));
    assert.ok(!Object.hasOwn(run.config,'ballastKg'));
    const saved={...run,status:'landed',touchdownSpeed:.4};
    assert.ok(canAuditLanding(saved));
    assert.ok(!canAuditLanding({...saved,parameters:{...saved.parameters,ballastKg:200}}));
  }
});
