import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim} from '../dist/js/physics.js';
import {ROCKET_PARAMS} from '../dist/js/rocket-layout.js';
import {planEconomyLanding,predictCalibratedLanding} from '../dist/js/landing-economy.js';
import {createLandingRun,landingRunInput,updateLandingRun} from '../dist/js/landing-experiment.js';

const snapshot=sim=>JSON.stringify({state:sim.state,wheels:sim.wheels,thrusters:sim.thrusters});
function run(dryMass,height=3){
 const sim=new PhysicsSim({...ROCKET_PARAMS,dryMass}),run=createLandingRun(sim,{height,method:'eco'});
 for(let i=0;!run.done&&i<15000;i++){sim.step(.002,landingRunInput(run,sim));updateLandingRun(run,sim);}
 assert.ok(run.done,'reference experiment completes');
 return {sim,run,result:run.result};
}

test('real-gas economy predictions track the live solver across the five experiment masses',()=>{
 for(const dryMass of [1022.6,1282.6,1572.6,1832.6,3082.6]){
  const {result:r}=run(dryMass);
  assert.equal(r.ecoPlanFeasible,false,'reference thrust cannot hover a car or guarantee .5m/s');
  assert.ok(Math.abs(r.ecoPredictedTouchdownSpeed-r.touchdownSpeed)<.1,'predicted speed within .1m/s');
  assert.ok(Math.abs(r.ecoPredictedTouchdownGas-r.touchdownGasUsed)<.1,'contact gas within .1kg');
  assert.ok(Math.abs(r.ecoPredictedGas-r.gasUsed)<.1,'closure-tail gas within .1kg');
  assert.ok(r.ecoCoastTime>=r.ecoMinimumCoastTime-1e-10);
  assert.ok(r.gasUsed>0&&r.touchdownSpeed>r.targetSpeed);
 }
});

test('calibrated prediction and its condition cache never mutate state or bypass changed input',()=>{
 const sim=new PhysicsSim({...ROCKET_PARAMS,dryMass:1832.6});
 const before=snapshot(sim),p1=planEconomyLanding(sim,3,.5);
 assert.equal(snapshot(sim),before);
 const p2=planEconomyLanding(sim,3,.5);assert.deepEqual(p2,p1);
 p2.predictedSpeed=-1;assert.equal(planEconomyLanding(sim,3,.5).predictedSpeed,p1.predictedSpeed);
 const different=planEconomyLanding(sim,10,.5);assert.notEqual(different.predictedSpeed,p1.predictedSpeed);
 assert.equal(snapshot(sim),before);
 const bounded=planEconomyLanding(sim,1e8,.5);
 assert.equal(bounded.predictedSpeed,null);assert.equal(bounded.predictedGas,null);assert.equal(bounded.feasible,false);
});

test('thermal protection is retained and four separately fed nozzles reduce impact without fictitious hover',()=>{
 const sim=new PhysicsSim({...ROCKET_PARAMS,dryMass:1832.6});
 const prediction=predictCalibratedLanding(sim,3,2.625,.5);
 assert.ok(prediction.complete);
 assert.ok(prediction.speed>5&&prediction.speed<Math.sqrt(2*sim.params.gravity*3));
 assert.ok(prediction.gasUsed<sim.state.gas*.3,'medium-temperature protection limits gas delivery');
 const high=run(1832.6,10).result;
 assert.ok(Math.abs(high.ecoPredictedTouchdownSpeed-high.touchdownSpeed)<.1);
 assert.ok(Math.abs(high.ecoPredictedGas-high.gasUsed)<.1);
});
