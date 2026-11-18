import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim} from '../dist/js/physics.js';
import {ROCKET_PARAMS} from '../dist/js/rocket-layout.js';
import {createLandingJobs,createLandingRun,landingRunInput,updateLandingRun,LANDING_STEP} from '../dist/js/landing-experiment.js';
import {economyInitialState} from '../dist/js/landing-economy.js';
import {landingTradeoff} from '../dist/js/landing-analysis.js';
import {landingBaselineComparison,LandingUI} from '../dist/js/landing-ui.js';

test('Roadster ballast sweep holds geometry, centered inertia, gas and release height constant, including after reuse',()=>{
  const fleet=[{id:'bmw'},{id:'roadster'}];
  const jobs=createLandingJobs('ballast',fleet,{height:20},'bmw');
  assert.equal(jobs.length,12);assert.deepEqual(new Set(jobs.map(j=>j.vehicleId)),new Set(['roadster']));
  assert.equal(createLandingJobs('ballast',[{id:'bmw'}],{},'bmw').length,0);
  const sim=new PhysicsSim({...ROCKET_PARAMS,dryMass:1900});
  const baseGas=sim.initialGas,rest=sim.restHeight,inertia=sim.inertia.toArray(),mounts=sim.thrusters.map(t=>t.pos.toArray());
  const results=[];
  for(const job of jobs){
    const run=createLandingRun(sim,{...job,height:20,brakeHeight:1.5,groupKind:'ballast',groupId:'mass'});
    assert.equal(run.initialMass,1900+baseGas+job.ballastKg);
    assert.equal(run.initialGas,baseGas);assert.equal(run.parameters.dryMass,1900);
    assert.equal(run.parameters.ballastKg,job.ballastKg);
    assert.equal(economyInitialState(sim,20).dryMass,1900+job.ballastKg);
    assert.deepEqual(sim.inertia.toArray(),inertia);assert.deepEqual(sim.cg.toArray(),[0,0,0]);
    assert.deepEqual(sim.thrusters.map(t=>t.pos.toArray()),mounts);
    assert.ok(Math.abs(sim.restHeight-rest+job.ballastKg*sim.params.gravity/(4*sim.params.springK))<1e-12);
    for(let step=0;!run.done&&step<25000;step++){
      sim.step(LANDING_STEP,landingRunInput(run,sim));updateLandingRun(run,sim);
    }
    assert.ok(run.done&&Number.isFinite(run.touchdownSpeed));
    results.push(run.result);
  }
  const free=results.filter(row=>row.method==='free');
  for(const row of free){
    assert.ok(Math.abs(row.touchdownSpeed-Math.sqrt(2*9.80665*20))<1e-7);
    assert.equal(row.gasUsed,0);
  }
  assert.notEqual(free[0].groundImpulseNs,free[2].groundImpulseNs);
  for(const row of results){
    assert.equal(landingBaselineComparison(row,results).baseline.ballastKg,row.ballastKg);
    const peers=landingTradeoff(results,row).rows;
    assert.equal(peers.length,4);assert.ok(peers.every(a=>a.ballastKg===row.ballastKg));
  }
  const next=createLandingRun(sim,{vehicleId:'roadster',method:'free',height:20});
  assert.equal(next.ballastKg,0);assert.equal(sim.params.dryMass,1900);assert.equal(next.initialMass,free[0].initialMass);
  assert.equal(sim.restHeight,rest);
});

test('report comparisons keep added mass and integration step separate even in a mixed or legacy result set',()=>{
  const free={method:'free',modelVersion:'1.46.0',groupId:'x',vehicleId:'roadster',height:20,
    targetSpeed:.5,springK:75000,damperC:6000,initialMass:2275,initialGas:375,tankVolume:.9,
    tankPressureMPa:35.875,initialTemperature:300,status:'landed',touchdownSpeed:1,peakEquivalentGroundForceN:500};
  const same={...free,method:'brake',physicsStep:.002,ballastKg:0};
  const finer={...free,physicsStep:.001},weighted={...free,ballastKg:100};
  assert.equal(landingBaselineComparison(same,[finer,weighted,free]).baseline,free);
  assert.deepEqual(landingTradeoff([finer,weighted,free,same],same).rows,[free,same]);
  const elements=new Map();
  function element(selector){if(!elements.has(selector))elements.set(selector,{});return elements.get(selector);}
  const rows=[0,100,200].map(kg=>({...free,groupKind:'ballast',ballastKg:kg,initialMass:2275+kg}));
  const ui={dialog:{querySelector:element},researchVehicle:'roadster@100'};
  LandingUI.prototype.renderResearch.call(ui,rows);
  assert.equal(element('#landing-research-vehicle-label').hidden,false);
  assert.equal(element('#landing-research-vehicle').value,'roadster@100');
  assert.match(element('#landing-research-scope').textContent,/추가 100 kg/);
});
