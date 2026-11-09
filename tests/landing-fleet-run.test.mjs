import test from 'node:test';
import assert from 'node:assert/strict';
import {VEHICLES,vehiclePhysics} from '../dist/js/vehicle-profiles.js';
import {PhysicsSim,DEFAULTS} from '../dist/js/physics.js';
import {adaptRealVehicle,disposeVehicle} from '../dist/js/real-vehicle-model.js';
import {adaptRoadsterScene} from '../dist/js/roadster-model.js';
import {createVehicle} from '../dist/js/vehicle.js';
import {prepareAssessmentVehicle} from '../dist/js/assessment-vehicle.js';
import {configureVehicleFit} from '../dist/js/vehicle-fit.js';
import {createLandingJobs,createLandingRun,landingRunInput,updateLandingRun,landingClearance,LANDING_STEP} from '../dist/js/landing-experiment.js';
import {loadModelGeometry} from './model-loader-helper.mjs';

test('all 13 real asset chassis complete three same-height landing methods with finite recorded results',async t=>{
  const options={height:3,brakeHeight:1.5,targetSpeed:.5,springK:75000,damperC:6000};
  const jobs=createLandingJobs('fleet-methods',VEHICLES,options,VEHICLES[0].id),results=[];
  assert.equal(jobs.length,39);
  let initialGas;
  for(const profile of VEHICLES){
    const gltf=await loadModelGeometry(profile);
    const vehicle=profile.id==='roadster'?adaptRoadsterScene(gltf.scene,createVehicle(),gltf.parser):adaptRealVehicle(gltf.scene,profile);
    try{
      prepareAssessmentVehicle(vehicle);configureVehicleFit(vehicle,profile);
      for(const job of jobs.filter(job=>job.vehicleId===profile.id)){
        const sim=new PhysicsSim(vehiclePhysics(profile,vehicle.geometryParams,DEFAULTS));
        const run=createLandingRun(sim,{...options,method:job.method,vehicleId:profile.id});
        assert.ok(Math.abs(landingClearance(sim)-3)<1e-10,profile.id+' initial tire clearance');
        initialGas??=run.initialGas;assert.ok(Math.abs(run.initialGas-initialGas)<1e-10,'identical tank charge in every comparison');
        for(let n=0;!run.done&&n<30000;n++){
          sim.step(LANDING_STEP,landingRunInput(run,sim));updateLandingRun(run,sim,LANDING_STEP);
        }
        assert.ok(run.done,profile.id+' '+job.method+' must finish or report failure');
        assert.ok(['landed','unsettled','timeout'].includes(run.result.status));
        assert.ok(run.touchdownTime!==null,profile.id+' '+job.method+' touches the ground at default height');
        for(const key of ['elapsed','touchdownSpeed','peakEquivalentGroundForceN','contactPeakG','maxCompression','gasUsed'])assert.ok(Number.isFinite(run.result[key]),profile.id+' '+job.method+' finite '+key);
        assert.ok(run.gasUsed>=0&&run.gasUsed<=run.initialGas,'no gas creation or negative tank mass');
        assert.equal(run.result.height,3);assert.ok(run.samples.length>0);
        if(job.method==='free'){
          assert.equal(run.gasUsed,0);
          assert.ok(Math.abs(run.touchdownSpeed-Math.sqrt(2*DEFAULTS.gravity*3))<.06,'free fall uses the shared height');
        }
        results.push({vehicleId:profile.id,method:job.method,status:run.status,speed:run.touchdownSpeed,peak:run.peakEquivalentGroundForceN,gas:run.gasUsed});
      }
    }finally{disposeVehicle(vehicle);}
  }
  assert.equal(results.length,39);assert.equal(new Set(results.map(r=>r.vehicleId+'/'+r.method)).size,39);
  const roadster=results.filter(r=>r.vehicleId==='roadster');
  assert.ok(roadster.find(r=>r.method==='gentle').speed<roadster.find(r=>r.method==='brake').speed);
  assert.ok(roadster.find(r=>r.method==='brake').speed<roadster.find(r=>r.method==='free').speed);
  t.diagnostic('39 same-height runs completed: '+results.filter(r=>r.status==='landed').length+' settled, '+results.filter(r=>r.status==='unsettled').length+' unsettled, '+results.filter(r=>r.status==='timeout').length+' timed out.');
});
