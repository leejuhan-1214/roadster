import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {VEHICLES,vehiclePhysics} from '../dist/js/jet-vehicle.js';
import {EXPERIMENT_VEHICLE_IDS} from '../dist/js/experiment-vehicles.js';
import {PhysicsSim} from '../dist/js/physics.js';
import {createVehicle} from '../dist/js/vehicle.js';
import {adaptRoadsterScene} from '../dist/js/roadster-model.js';
import {adaptRealVehicle,disposeVehicle} from '../dist/js/real-vehicle-model.js';
import {prepareAssessmentVehicle} from '../dist/js/assessment-vehicle.js';
import {prepareRocketRetrofit} from '../dist/js/rocket-retrofit.js';
import {configureVehicleFit} from '../dist/js/vehicle-fit.js';
import {installJetRig} from '../dist/js/jet-rig.js';
import {loadModelGeometry} from '../tests/model-loader-helper.mjs';
import {LANDING_STEP,LANDING_METHODS,createLandingRun,landingRunInput,updateLandingRun} from '../dist/js/landing-experiment.js';
const root=new URL('../',import.meta.url),output=new URL('docs/data/jet-v144-audit.json',root);
const sources=['jet-engine.js','jet-vehicle.js','jet-rig.js','physics.js','landing-experiment.js','landing-economy.js','vehicle-fit.js'];
async function hashes(){return Object.fromEntries(await Promise.all(sources.map(async path=>[path,createHash('sha256').update(await readFile(new URL('dist/js/'+path,root))).digest('hex')])));}
const before=await hashes(),audit={version:'1.44',generatedAt:new Date().toISOString(),node:process.version,sourceHashes:before,
method:'Actual shipped GLB/glTF -> adapter -> assessment preparation -> retrofit -> vehicle fitter -> external jet rig -> app vehiclePhysics -> fixed 0.002 s PhysicsSim.',
configuration:{height:2,brakeHeight:1,springK:70000,damperC:4000,targetSpeed:.5,startMode:'hover'},
validationPolicy:'Free/brake must complete finite contact with landed or unsettled status; gentle/eco must settle without body/rig strike. Unsettled remains an observed negative result.',
notes:['Numerical regression, not aircraft certification.','Lift engines prestarted at idle; startup costs excluded.','Fuel in kg; forces in N; time in s.','Identical deterministic preparation for every method.'],vehicles:[],checks:[],errors:[]};
const check=(condition,message)=>{audit.checks.push({pass:!!condition,message});if(!condition)audit.errors.push(message);};
for(const id of EXPERIMENT_VEHICLE_IDS){
 const profile=VEHICLES.find(p=>p.id===id);assert.ok(profile,id);
 const asset=await loadModelGeometry(profile);
 const vehicle=id==='roadster'?adaptRoadsterScene(asset.scene,createVehicle(),asset.parser):adaptRealVehicle(asset.scene,profile);
 try{
  prepareAssessmentVehicle(vehicle);prepareRocketRetrofit(vehicle);configureVehicleFit(vehicle,profile);
  const jet=installJetRig(vehicle,profile),geometry={...vehicle.geometryParams,...Object.fromEntries(Object.entries(jet).filter(([,v])=>typeof v==='number'))};
  const params=vehiclePhysics(profile,geometry),initialMass=params.dryMass+params.fuelCapacityKg;
  const record={id,title:profile.title,sourceMeshCount:vehicle.sourceMeshCount,geometry,
   skinBounds:{min:vehicle.nozzleFit.skinBounds.min.toArray(),max:vehicle.nozzleFit.skinBounds.max.toArray()},
   physicalBounds:{min:jet.physicalBounds.min.toArray(),max:jet.physicalBounds.max.toArray()},
   initialMassKg:initialMass,liftThrustN:64*1100*.85,initialStaticThrustWeight:64*1100*.85/(initialMass*9.80665),
   rigMinimumSweptClearanceM:jet.info.minimumSweptGroundClearanceM,results:[]};
  check(record.initialStaticThrustWeight>1,id+': installed static thrust exceeds weight');
  check(record.rigMinimumSweptClearanceM>.30,id+': gimbal sweep ground clearance >0.30 m');
  let firstRelease=null;
  for(const method of LANDING_METHODS){
   const sim=new PhysicsSim(params),run=createLandingRun(sim,{...audit.configuration,method:method.id});
   let steps=0,nonfinite=false,peakHorizontalDrift=0;
   while(!run.done&&steps<150000){
    sim.step(LANDING_STEP,landingRunInput(run,sim));updateLandingRun(run,sim,LANDING_STEP);steps++;
    peakHorizontalDrift=Math.max(peakHorizontalDrift,Math.hypot(sim.state.pos.x,sim.state.pos.z));
    if(![...sim.state.pos.toArray(),...sim.state.vel.toArray(),...sim.state.q.toArray(),...sim.state.omega.toArray(),sim.state.gas,sim.mass].every(Number.isFinite)){nonfinite=true;break;}
   }
   const sameRelease=firstRelease===null?true:JSON.stringify(run.releaseState)===JSON.stringify(firstRelease);
   if(firstRelease===null)firstRelease=run.releaseState;
   const row={method:method.id,status:run.status,done:run.done,steps,preparationComplete:run.preparationComplete,
    releaseState:run.releaseState,identicalPreparation:sameRelease,nonfinite,
    preparationTimeS:run.preparationTime,landingTimeS:run.elapsed,missionTimeS:run.missionElapsed,
    preparationFuelKg:run.preparationFuelUsedKg,landingFuelKg:run.fuelUsedKg,missionFuelKg:run.missionFuelUsedKg,remainingFuelKg:sim.state.gas,
    actualReleaseHeightM:run.actualReleaseHeight,releaseVerticalSpeedMps:run.initialVelocityY,
    touchdownTimeS:run.touchdownTime,touchdownSpeedMps:run.touchdownSpeed,peakForceN:run.peakEquivalentGroundForceN,peakContinuousForceN:run.peakGroundForceN,
    contactPeakG:run.contactPeakG,maxCompressionM:run.maxCompression,bodyStrike:run.bodyStrike,bottomedOut:run.bottomedOut,
    predictionSpeedMps:run.ecoPredictedTouchdownSpeed,predictionFuelKg:run.ecoPredictedTouchdownGas,touchdownFuelKg:run.touchdownFuelUsedKg,peakHorizontalDriftM:peakHorizontalDrift,
    fuelEnergyBalanceErrorJ:Math.abs(sim.state.gas*params.jetFuelLHVJkg+sim.state.fuelChemicalEnergyJ-sim.initialEnergy),
    airMassBalanceErrorKg:Math.abs(sim.state.jetAirInKg+sim.state.gasUsed-sim.state.jetExhaustKg)};
   record.results.push(row);
   check(run.done&&!nonfinite,id+'/'+method.id+': finite completed state');
   check((method.id==='gentle'||method.id==='eco')?run.status==='landed':['landed','unsettled'].includes(run.status),id+'/'+method.id+': valid completed contact outcome');
   check(run.preparationComplete&&run.releaseState!==null,id+'/'+method.id+': true ground-to-hover preparation');
   check(sameRelease,id+'/'+method.id+': identical release state across methods');
   check(Math.abs(run.actualReleaseHeight-2)<=.005&&Math.abs(run.initialVelocityY)<.005,id+'/'+method.id+': release tolerances');
   check(Math.abs(run.preparationFuelUsedKg+run.fuelUsedKg-run.missionFuelUsedKg)<1e-7,id+'/'+method.id+': mission fuel accounting');
   check([run.touchdownSpeed,run.peakEquivalentGroundForceN,run.missionElapsed].every(Number.isFinite),id+'/'+method.id+': finite contact metrics');
   if(method.id==='gentle'||method.id==='eco')check(!run.bodyStrike,id+'/'+method.id+': controlled landing avoids body/rig ground strike');
   console.log(id,method.id,JSON.stringify({status:row.status,prep:row.preparationFuelKg,fuel:row.landingFuelKg,speed:row.touchdownSpeedMps,peak:row.peakForceN,body:row.bodyStrike}));
  }
  audit.vehicles.push(record);
 }finally{disposeVehicle(vehicle);}
}
audit.sourceHashesAfter=await hashes();check(JSON.stringify(before)===JSON.stringify(audit.sourceHashesAfter),'Audited source files unchanged during execution');
audit.pass=audit.errors.length===0;audit.completedAt=new Date().toISOString();
await mkdir(new URL('docs/data/',root),{recursive:true});await writeFile(output,JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify({output:output.pathname,pass:audit.pass,checks:audit.checks.length,errors:audit.errors},null,2));
if(!audit.pass)process.exitCode=1;
