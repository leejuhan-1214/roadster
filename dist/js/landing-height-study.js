import {dragConstant,predictedBrakeDistance} from './landing-aerodynamics.js?v=20261119-air161';
import {PhysicsSim} from './physics.js?v=20261122-wheel-repair';
import {nozzle} from './air-nozzle.js?v=20261118-audit148';
import {LANDING_STEP, LANDING_MODEL_VERSION, landingSettings, landingRunInput, updateLandingRun} from './landing-experiment.js?v=20261120-basemass';
import {landingTargetMet} from './landing-analysis.js?v=20261120-basemass';
import {startHoverLandingRun, landingPhaseAir, STUDY_HOVER_SECONDS} from './landing-hover.js?v=20261120-basemass';

const HEIGHT=20;

// Predict using only information available when the controller first commands
// braking. Assume an upright car and instantaneously open all four lift valves,
// freeze mass and tank conditions, and respect the controller's 1.1 g ceiling.
function predictAtCommand(sim,targetSpeed){
  const entrySpeed=Math.max(0,-sim.state.vel.y);
  const area=sim.thrusters.slice(0,4).reduce((sum,t)=>sum+t.area,0);
  const maximum=nozzle(sim.state.pressure,sim.state.temp,area).force;
  const referenceAcceleration=Math.min(1.1*sim.params.gravity,maximum/sim.mass-sim.params.gravity);
  const commandMassKg=sim.mass,kAtCommand=dragConstant(sim.params)/commandMassKg;
  const predictedDistance=predictedBrakeDistance(entrySpeed,targetSpeed,referenceAcceleration,kAtCommand);
  return {entrySpeed,referenceAcceleration,predictedDistance,commandMassKg,kAtCommand};
}

export function measureHeightStudyTrial(source,config){
  const sim=new PhysicsSim(source.parameters);
  const run=startHoverLandingRun(sim,config);
  const conditions={vehicleId:source.vehicleId,vehicleTitle:source.vehicleTitle,parameters:run.parameters,
    hover:run.hover,releaseMassKg:run.initialMass,physicsStep:LANDING_STEP,modelVersion:LANDING_MODEL_VERSION};
  let commandY=null,actualDistance=null,distanceToContact=null,targetState='no-command',supportDelay=null;
  let prediction={entrySpeed:null,referenceAcceleration:null,predictedDistance:null};
  while(!run.done){
    const beforeContact=run.touchdownTime===null;
    const t=run.elapsed,y=sim.state.pos.y,vy=sim.state.vel.y,mass=sim.mass;
    const input=landingRunInput(run,sim);
    if(commandY===null&&run.autoBrakeTime!==null){
      commandY=y;
      prediction=predictAtCommand(sim,run.targetSpeed);
      targetState=prediction.entrySpeed<=run.targetSpeed?'already':'unreached';
      if(targetState==='already')actualDistance=0;
    }
    sim.step(LANDING_STEP,input);
    updateLandingRun(run,sim);
    if(commandY===null||!beforeContact)continue;
    // The last airborne portion ends at geometric contact. The impulse from
    // the ground may not count as braking by the nozzles.
    const flightTime=run.touchdownTime===null?LANDING_STEP:Math.max(0,Math.min(LANDING_STEP,run.touchdownTime-t));
    const ay=sim.state.acceleration.y;
    const dropAfter=dt=>commandY-(y+vy*dt+.5*ay*dt*dt);
    if(run.touchdownTime!==null)distanceToContact=dropAfter(flightTime);
    if(targetState==='unreached'&&ay>0&&vy < -run.targetSpeed){
      const crossing=(-run.targetSpeed-vy)/ay;
      if(crossing<=flightTime+1e-12){
        actualDistance=dropAfter(Math.min(flightTime,crossing));targetState='reached';
      }
    }
    if(supportDelay===null&&flightTime>0&&sim.verticalThrustN>(mass+sim.mass)*.5*sim.params.gravity){
      // Report the endpoint of the first supporting integration interval.
      supportDelay=t+flightTime-run.autoBrakeTime;
    }
  }
  const gas=landingPhaseAir(run);
  if(commandY!==null&&run.touchdownTime===null&&targetState==='unreached')targetState='no-contact';
  const feasible=run.status==='landed'&&run.settled&&landingTargetMet(run)&&!run.bodyStrike&&!run.bottomedOut;
  return {conditions,row:{
    method:run.method,brakeHeight:run.method==='eco'?run.ecoPlannedBrakeHeight:run.brakeHeight,
    autoBrakeHeight:run.autoBrakeHeight,autoBrakeTime:run.autoBrakeTime,targetSpeed:run.targetSpeed,
    ...prediction,actualDistance,distanceToContact,supportDelay,targetState,
    touchdownTime:run.touchdownTime,touchdownSpeed:run.touchdownSpeed,
    peakEquivalentGroundForceN:run.touchdownTime===null?null:run.peakEquivalentGroundForceN,
    groundImpulseNs:run.contactEndTime===null?null:run.groundImpulseNs,
    status:run.status,settled:run.settled,bodyStrike:run.bodyStrike,bottomedOut:run.bottomedOut,feasible,
    hoverGasKg:gas.hoverKg,landingGasKg:gas.landingKg,totalGasKg:gas.totalKg
  }};
}

// Include every tenth of a metre strictly inside each 1 m interval whose
// observed status changes, in either direction. Equal endpoints do not prove
// that an unmeasured interval is monotone.
export function refineBrakeHeights(coarse){
  const heights=[];
  for(let i=1;i<coarse.length;i++){
    if(coarse[i].feasible===coarse[i-1].feasible)continue;
    for(let j=1;j<10;j++)heights.push((coarse[i-1].brakeHeight*10+j)/10);
  }
  return heights;
}

export function runLandingHeightStudy(source,onProgress=()=>{}){
  if(!source?.parameters||!Number.isFinite(source.parameters.dryMass))throw new Error('비교할 차체의 물리 조건이 필요합니다.');
  const config=landingSettings({...source.config,height:HEIGHT,physicsStep:LANDING_STEP,
    hoverSeconds:source.hoverSeconds??STUDY_HOVER_SECONDS,method:'brake'});
  const rows=[];
  let conditions,total=HEIGHT+2;
  function record(brakeHeight,phase){
    const trial=measureHeightStudyTrial(source,{...config,brakeHeight,method:phase==='eco'?'eco':'brake'});
    conditions??={...trial.conditions,config};
    rows.push(trial.row);
    onProgress({done:rows.length,total,phase});
  }
  onProgress({done:0,total,phase:'coarse'});
  for(let h=0;h<=HEIGHT;h++)record(h,'coarse');
  const fine=refineBrakeHeights(rows);
  // Retain the current fixed-height setting as a reference even when it falls
  // outside a refinement interval (the standard report setting is 1.50 m).
  if(config.brakeHeight<=HEIGHT&&!rows.some(row=>row.brakeHeight===config.brakeHeight)
    &&!fine.includes(config.brakeHeight))fine.push(config.brakeHeight);
  total+=fine.length;
  for(const h of fine.sort((a,b)=>a-b))record(h,'fine');
  rows.sort((a,b)=>a.brakeHeight-b.brakeHeight);
  record(config.brakeHeight,'eco');
  return {conditions,rows};
}
