// Run from the repository with node scripts/measure-landing-height.mjs.
// Use the same fitted model, controller, release and measurement routines as
// the browser. Archive v1.60 separately; it used a drag-free release.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadModelGeometry} from '../tests/model-loader-helper.mjs';
import {vehicleProfile} from '../dist/js/vehicle-profiles.js';
import {createVehicle} from '../dist/js/vehicle.js';
import {adaptRoadsterScene} from '../dist/js/roadster-model.js';
import {disposeVehicle} from '../dist/js/real-vehicle-model.js';
import {prepareAssessmentVehicle} from '../dist/js/assessment-vehicle.js';
import {prepareRocketRetrofit} from '../dist/js/rocket-retrofit.js';
import {configureVehicleFit} from '../dist/js/vehicle-fit.js';
import {roadsterHeightStudySource} from '../dist/js/landing-height-source.js';
import {measureHeightStudyTrial,runLandingHeightStudy} from '../dist/js/landing-height-study.js';
import {heightStudyCSV} from '../dist/js/landing-height-study-ui.js';
import {landingCsvText} from '../dist/js/landing-ui.js';
import {PhysicsSim} from '../dist/js/physics.js';
import {
  LANDING_STEP,LANDING_AUDIT_STEPS,createLandingJobs,createLandingRun,landingRunInput,updateLandingRun
} from '../dist/js/landing-experiment.js';
import {landingTargetMet} from '../dist/js/landing-analysis.js';
import {stepAuditSource} from '../dist/js/landing-step-audit.js';
import {replayLandingStep} from '../dist/js/landing-step-worker.js';

function closedValveTrial(source,job,aeroEnabled){
  const sim=new PhysicsSim(source.parameters);
  const run=createLandingRun(sim,{...source.config,...job,aeroEnabled});
  assert.equal(sim.params.aeroEnabled,aeroEnabled,'the release must retain the requested air model');
  while(!run.done){
    sim.step(LANDING_STEP,landingRunInput(run,sim));
    updateLandingRun(run,sim);
  }
  return run.result;
}

function recordTrial(r){
  return {
    method:r.method,ballast_kg:r.ballastKg,height_m:r.height,initial_mass_kg:r.initialMass,
    initial_gas_kg:r.initialGas,contact_speed_m_s:r.touchdownSpeed,first_ground_impulse_N_s:r.groundImpulseNs,
    peak_equivalent_reaction_N:r.peakEquivalentGroundForceN,gas_used_kg:r.gasUsed,
    command_s:r.autoBrakeTime,first_above_weight_s:r.firstAboveWeightTime,touchdown_s:r.touchdownTime,
    settled:r.settled,body_contact:r.bodyStrike,bump_stop:r.bottomedOut,
    goal_met:r.status==='landed'&&r.settled&&!r.bodyStrike&&!r.bottomedOut&&landingTargetMet(r),
    aero_enabled:r.parameters.aeroEnabled,hover_duration_s:0,controller_ms:LANDING_STEP*1000,
    physics_ms:r.physicsStep*1000,model_version:r.modelVersion,parameters_json:JSON.stringify(r.parameters)
  };
}

function table(records){
  const keys=Object.keys(records[0]);
  return [keys,...records.map(row=>keys.map(key=>row[key]??''))];
}

// Independent 1D reference for a vertical constant-mass unpowered drop. The
// controlled level rig applies aerodynamic drag at its centre of mass.
function levelFreeFallSpeed(height,gravity,mass,density,verticalDragArea){
  const decayPerMetre=density*verticalDragArea/mass;
  return decayPerMetre>0?Math.sqrt(-2*gravity*Math.expm1(-decayPerMetre*height)/decayPerMetre)
    :Math.sqrt(2*gravity*height);
}

async function saveTable(filename,rows){
  const csv=landingCsvText(rows);
  await Promise.all(['docs','dist'].map(folder=>writeFile(
    new URL('../'+folder+'/data/'+filename+'.csv',import.meta.url),csv,'utf8')));
}

const profile=vehicleProfile('roadster');
const gltf=await loadModelGeometry(profile);
const vehicle=adaptRoadsterScene(gltf.scene,createVehicle(),gltf.parser);
let source;
try{
  prepareAssessmentVehicle(vehicle);prepareRocketRetrofit(vehicle);configureVehicleFit(vehicle,profile);
  source=roadsterHeightStudySource(vehicle.geometryParams);
}finally{
  disposeVehicle(vehicle);
}
const study=runLandingHeightStudy(source);
assert.equal(study.conditions.parameters.aeroEnabled,true);
for(const row of study.rows){
  assert.ok(Math.abs(row.hoverGasKg+row.landingGasKg-row.totalGasKg)<1e-8);
  if(row.feasible)assert.ok(row.settled&&!row.bodyStrike&&!row.bottomedOut&&row.touchdownSpeed<=row.targetSpeed);
  if(row.targetState==='reached')assert.ok(row.actualDistance>=0&&row.actualDistance<=row.distanceToContact+1e-8);
}

const mass=[],audit=[],controls=[];
for(const job of createLandingJobs('ballast',[profile],source.config,profile.id)){
  const run=closedValveTrial(source,job,true);
  const row=recordTrial(run);
  mass.push(row);
  if(job.ballastKg===0){
    const dragFree=closedValveTrial(source,job,false);
    controls.push(row,recordTrial(dragFree));
    if(job.method==='free'){
      const vacuumSpeed=Math.sqrt(2*run.parameters.gravity*run.height);
      assert.ok(Math.abs(dragFree.touchdownSpeed-vacuumSpeed)<1e-7);
      assert.ok(run.touchdownSpeed>0&&run.touchdownSpeed<dragFree.touchdownSpeed);
      assert.equal(run.gasUsed,0);
      assert.equal(dragFree.gasUsed,0);
    }
  }
  const replaySource=stepAuditSource({...run,id:job.method+'-'+job.ballastKg,vehicleId:profile.id});
  for(const step of LANDING_AUDIT_STEPS){
    const result=replayLandingStep(replaySource,step);
    if(step===LANDING_STEP){
      assert.equal(result.speed,run.touchdownSpeed);
      assert.equal(result.impulse,run.groundImpulseNs);
      assert.equal(result.peak,run.peakEquivalentGroundForceN);
      assert.equal(result.gasUsed,run.gasUsed);
    }
    audit.push({
      method:run.method,ballast_kg:run.ballastKg,height_m:run.height,initial_mass_kg:result.initialMass,
      controller_ms:LANDING_STEP*1000,physics_ms:step*1000,contact_speed_m_s:result.speed,
      first_ground_impulse_N_s:result.impulse,peak_equivalent_reaction_N:result.peak,
      touchdown_s:result.contactTime,gas_used_kg:result.gasUsed,
      aero_enabled:run.parameters.aeroEnabled,model_version:run.modelVersion,parameters_json:JSON.stringify(run.parameters)
    });
  }
}
assert.equal(mass.length,12);
assert.equal(audit.length,36);
assert.equal(controls.length,8);
const eligibleFixed=study.rows.filter(row=>row.method==='brake'&&row.feasible);
assert.ok(eligibleFixed.length);
const best=eligibleFixed.reduce((a,b)=>a.landingGasKg<=b.landingGasKg?a:b);
const sensitivity=[];
const {verticalDragArea:standardArea,airDensity:density}=study.conditions.parameters;
assert.ok(standardArea>0&&density>0);
for(const scale of [.75,1,1.25]){
  const verticalDragArea=standardArea*scale;
  const cfg={...source.config,aeroEnabled:true,verticalDragArea};
  const modified={...source,config:cfg,parameters:{...source.parameters,verticalDragArea}};
  const free=closedValveTrial(modified,{method:'free'},true);
  assert.equal(free.parameters.verticalDragArea,verticalDragArea);
  const solution=levelFreeFallSpeed(free.height,free.parameters.gravity,free.initialMass,density,verticalDragArea);
  // The full solver samples drag every 2 ms and interpolates first tire contact.
  assert.ok(Math.abs(free.touchdownSpeed-solution)<.002,
    '6DOF free fall disagrees with the level-body reference: '+free.touchdownSpeed+' vs '+solution);
  const freeRow=recordTrial(free);
  const common={air_density_kg_m3:density,vertical_CdA_m2:verticalDragArea,area_scale:scale};
  sensitivity.push({...common,method:'free',hover_duration_s:0,brake_setting_m:null,
    contact_speed_m_s:free.touchdownSpeed,level_body_analytic_freefall_m_s:solution,hover_air_kg:0,
    landing_air_kg:free.gasUsed,total_air_kg:free.gasUsed,peak_2ms_reaction_N:free.peakEquivalentGroundForceN,
    first_deceleration_ground_impulse_N_s:free.groundImpulseNs,eligible:freeRow.goal_met});
  for(const method of ['brake','eco']){
    const {conditions,row}=measureHeightStudyTrial(modified,{...cfg,method,brakeHeight:best.brakeHeight,hoverSeconds:1});
    assert.equal(conditions.parameters.verticalDragArea,verticalDragArea);
    if(scale===1){
      const original=method==='brake'?best:study.rows.find(r=>r.method==='eco');
      assert.equal(row.touchdownSpeed,original.touchdownSpeed);
      assert.equal(row.totalGasKg,original.totalGasKg);
    }
    sensitivity.push({...common,method,hover_duration_s:1,brake_setting_m:row.brakeHeight,
      contact_speed_m_s:row.touchdownSpeed,level_body_analytic_freefall_m_s:null,hover_air_kg:row.hoverGasKg,
      landing_air_kg:row.landingGasKg,total_air_kg:row.totalGasKg,peak_2ms_reaction_N:row.peakEquivalentGroundForceN,
      first_deceleration_ground_impulse_N_s:row.groundImpulseNs,eligible:row.feasible});
  }
}
await Promise.all([
  saveTable('landing-height-v161',heightStudyCSV(study)),
  saveTable('landing-ballast-v161',table(mass)),
  saveTable('landing-timestep-v161',table(audit)),
  saveTable('landing-drag-control-v161',table(controls)),
  saveTable('landing-drag-sensitivity-v161',table(sensitivity))
]);
console.log(JSON.stringify(study,null,2));
