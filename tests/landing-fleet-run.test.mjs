import test from 'node:test';
import assert from 'node:assert/strict';
import {VEHICLES,vehiclePhysics} from '../dist/js/vehicle-profiles.js';
import {experimentVehicles} from '../dist/js/experiment-vehicles.js';
import {PhysicsSim,DEFAULTS} from '../dist/js/physics.js';
import {adaptRealVehicle,disposeVehicle} from '../dist/js/real-vehicle-model.js';
import {adaptRoadsterScene} from '../dist/js/roadster-model.js';
import {createVehicle} from '../dist/js/vehicle.js';
import {prepareAssessmentVehicle} from '../dist/js/assessment-vehicle.js';
import {configureVehicleFit} from '../dist/js/vehicle-fit.js';
import {createLandingJobs,createLandingRun,landingRunInput,updateLandingRun,landingClearance,LANDING_STEP} from '../dist/js/landing-experiment.js';
import {loadModelGeometry} from './model-loader-helper.mjs';

const cohort=experimentVehicles(VEHICLES);

test('the five mass-comparison chassis complete four same-height landing methods with finite recorded results',async t=>{
  const options={height:3,brakeHeight:1.5,targetSpeed:.5,springK:70000,damperC:4000};
  const jobs=createLandingJobs('fleet-methods',cohort,options,'roadster'),results=[];
  assert.equal(jobs.length,20);
  let initialGas;
  for(const profile of cohort){
    const gltf=await loadModelGeometry(profile);
    const vehicle=profile.id==='roadster'?adaptRoadsterScene(gltf.scene,createVehicle(),gltf.parser):adaptRealVehicle(gltf.scene,profile);
    try{
      prepareAssessmentVehicle(vehicle);configureVehicleFit(vehicle,profile);
      for(const job of jobs.filter(job=>job.vehicleId===profile.id)){
        const sim=new PhysicsSim(vehiclePhysics(profile,vehicle.geometryParams,DEFAULTS));
        const run=createLandingRun(sim,{...options,method:job.method,vehicleId:profile.id});
        assert.ok(Math.abs(landingClearance(sim)-3)<1e-10,profile.id+' initial tire clearance');
        initialGas??=run.initialGas;assert.ok(Math.abs(run.initialGas-initialGas)<1e-10,'identical tank charge in every comparison');
        let minTemperature=sim.state.temp;
        for(let n=0;!run.done&&n<30000;n++){
          sim.step(LANDING_STEP,landingRunInput(run,sim));updateLandingRun(run,sim,LANDING_STEP);
          minTemperature=Math.min(minTemperature,sim.state.temp);
        }
        assert.ok(run.done,profile.id+' '+job.method+' must finish or report failure');
        assert.ok(['landed','unsettled','timeout'].includes(run.result.status));
        assert.ok(run.touchdownTime!==null,profile.id+' '+job.method+' touches the ground at default height');
        for(const key of ['elapsed','touchdownSpeed','peakEquivalentGroundForceN','contactPeakG','maxCompression','gasUsed'])assert.ok(Number.isFinite(run.result[key]),profile.id+' '+job.method+' finite '+key);
        assert.ok(run.gasUsed>=0&&run.gasUsed<=run.initialGas,'no gas creation or negative tank mass');
        assert.ok(minTemperature>=sim.params.minimumGasOperatingTemperature-1e-6,'rated temperature floor is preserved');
        assert.ok(sim.telemetry().massBalanceError<1e-9);assert.ok(sim.telemetry().tankEnergyBalanceError<1e-4);
        assert.equal(run.result.height,3);assert.ok(run.samples.length>0);
        if(job.method==='free'){
          assert.equal(run.gasUsed,0);
          assert.ok(Math.abs(run.touchdownSpeed-Math.sqrt(2*DEFAULTS.gravity*3))<.06,'free fall uses the shared height');
        }
        if(job.method==='eco'){
          assert.equal(run.ecoProfile,'brake');
          assert.ok(run.ecoMinimumCoastTime>0);
          assert.ok(run.ecoCoastTime+1e-10>=run.ecoMinimumCoastTime);
        }
        results.push({vehicleId:profile.id,method:job.method,status:run.status,speed:run.touchdownSpeed,peak:run.peakEquivalentGroundForceN,gas:run.gasUsed,ecoPlanFeasible:run.ecoPlanFeasible,target:run.targetSpeed,thermalLimited:sim.state.thermalLimited,bodyStrike:run.bodyStrike});
      }
    }finally{disposeVehicle(vehicle);}
  }
  assert.equal(results.length,20);assert.equal(new Set(results.map(r=>r.vehicleId+'/'+r.method)).size,20);
  const roadster=results.filter(r=>r.vehicleId==='roadster');
  assert.ok(roadster.find(r=>r.method==='gentle').speed<roadster.find(r=>r.method==='brake').speed);
  assert.ok(roadster.find(r=>r.method==='brake').speed<roadster.find(r=>r.method==='free').speed);
  const eco=roadster.find(r=>r.method==='eco'),gentle=roadster.find(r=>r.method==='gentle');
  // The reference feed cannot meet this 3 m target. Both strategies hit the
  // same thermal reserve, so strict fuel saving is not physically guaranteed.
  assert.equal(eco.ecoPlanFeasible,false);assert.ok(eco.speed>eco.target+.025);
  assert.equal(eco.thermalLimited,true);assert.equal(gentle.thermalLimited,true);
  assert.ok(Math.abs(eco.gas-gentle.gas)<.001,'the thermal-limited fallback stays within 1 g of the common reserve');
  assert.equal(eco.bodyStrike,true,'a hard body impact must not become a successful gentle landing');
  assert.ok(roadster.find(r=>r.method==='eco').peak<roadster.find(r=>r.method==='brake').peak);
  t.diagnostic('20 same-height runs completed: '+results.filter(r=>r.status==='landed').length+' settled, '+results.filter(r=>r.status==='unsettled').length+' unsettled, '+results.filter(r=>r.status==='timeout').length+' timed out.');
});
