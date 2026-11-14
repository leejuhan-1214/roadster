import {isJetProfile} from './jet-engine.js?v=20261115-jet1';
import {ForceWindow,FORCE_WINDOW_SECONDS} from './force-window.js?v=20261115-calibrated1';
import {landingSpringState} from './landing-measurement.js?v=20261111-calibration1';
import {planEconomyLanding,economyAcceleration,jetDescentAcceleration} from './landing-economy.js?v=20261115-jet1';

// A controlled comparison of a hypothetical common landing rig, not OEM crash data.
// All measurement updates run at the simulation's fixed 2 ms step. Force samples
// retain the maximum in each 10 ms chart bin; the summary never uses render rate.
export const LANDING_STEP=.002;
export const LANDING_METHODS=Object.freeze([
  {id:'free',label:'자유낙하'},
  {id:'brake',label:'지정 높이에서 분사'},
  {id:'gentle',label:'완만한 하강 제어'},
  {id:'eco',label:'절약 착지'},
]);
export const BRAKE_HEIGHT_FRACTIONS=Object.freeze([.1,.25,.5,.75,1]);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const finite=(value,fallback,min,max)=>clamp(Number.isFinite(Number(value))?Number(value):fallback,min,max);

export function landingSettings(options={}){
  const height=finite(options.height,3,0,Number.MAX_VALUE);
  return {...options,height,
    method:LANDING_METHODS.some(m=>m.id===options.method)?options.method:'free',
    brakeHeight:finite(options.brakeHeight,2,0,Number.MAX_VALUE),
    targetSpeed:finite(options.targetSpeed,.5,.2,2),
    springK:finite(options.springK,70000,30000,150000),
    damperC:finite(options.damperC,4000,1000,15000),
  };
}

/** Release/rig settings stay shared; a trigger sweep overrides only brakeHeight. */
export function createLandingJobs(kind,vehicles,settings={},activeVehicleId){
  const fleet=[...new Map(vehicles.map(vehicle=>[vehicle.id,vehicle])).values()];
  const active=fleet.find(vehicle=>vehicle.id===activeVehicleId)||fleet[0];
  if(!active)return [];
  const method=landingSettings(settings).method;
  if(kind==='brake-heights'){
    const height=landingSettings(settings).height;
    // Include an untreated baseline, then change only the brake trigger. Zero
    // height has one distinct trigger; avoid five identical measurements.
    const brakeHeights=[...new Set(BRAKE_HEIGHT_FRACTIONS.map(fraction=>height*fraction))];
    return [{vehicleId:active.id,method:'free'},...brakeHeights.map(brakeHeight=>({vehicleId:active.id,method:'brake',brakeHeight}))];
  }
  if(kind==='fleet-methods')return fleet.flatMap(vehicle=>LANDING_METHODS.map(item=>({vehicleId:vehicle.id,method:item.id})));
  if(kind==='methods'||kind==='economy')return LANDING_METHODS.map(item=>({vehicleId:active.id,method:item.id}));
  if(kind==='vehicles')return fleet.filter(vehicle=>settings.vehicleIds?.includes(vehicle.id)).map(vehicle=>({vehicleId:vehicle.id,method}));
  return [{vehicleId:active.id,method}];
}

/** Minimum unloaded tire-to-ground gap, unaffected by static spring sag. */
export function landingClearance(sim){
  return Math.min(...sim.wheels.map(w=>w.pos.clone().applyQuaternion(sim.state.q).y+sim.state.pos.y-sim.params.wheelRadius));
}

/** Resets the supplied vehicle using shared controlled environmental conditions. */
export function createLandingRun(sim,options={}){
  const config=landingSettings(options),jet=isJetProfile(sim.params);
  const staged=jet&&options.startMode!=='release';
  // A fixed 15 s deadline silently discarded high drops before first contact.
  // Keep that failure guard at ordinary heights, but scale it with free fall
  // and the gentle controller's 2.5 m/s cruise reference for larger releases.
  const freeFallTime=Math.sqrt(config.height)*Math.sqrt(2/9.80665);
  const flightTimeout=Math.max(15,freeFallTime*2+10,['gentle','eco'].includes(config.method)?config.height/2.5+10:0);
  const precontactSampleInterval=Math.max(.01,flightTimeout/4000);
  Object.assign(sim.params,{springK:config.springK,damperC:config.damperC,
    gravity:9.80665,windX:0,windZ:0,roadRoughness:0,aeroEnabled:false,
    contactEnabled:true,friction:1.15,rollingResistance:.015,
    // Fixed level, centred loading isolates mass and chassis geometry differences.
    cgX:0,cgY:0,cgZ:0});
  sim.setObstacles([]);sim.reset('ground');
  if(!staged){
  sim.state.pos.set(0,.31+sim.params.wheelRadius+config.height,0);
  sim.state.vel.set(0,0,0);sim.state.q.identity();sim.state.omega.set(0,0,0);
  sim.contactCount=sim.lastContactCount=0;
  for(const w of sim.wheels){w.grounded=false;w.compression=0;w.load=0;w.omega=0;}
  }else sim.primeJetIdle();
  const planStart=config.method==='eco'&&!staged?performance.now():0;
  const economy=config.method==='eco'&&!staged?planEconomyLanding(sim,landingClearance(sim),config.targetSpeed):null;
  const ecoPlanTimeMs=economy?performance.now()-planStart:null;
  const run={...config,config:Object.freeze({...config}),startTime:sim.state.time,previousStepTime:sim.state.time,
    initialMass:sim.mass,initialGas:sim.state.gas,tankVolume:sim.params.tankVolume,
    tankPressureMPa:sim.params.tankPressureMPa,initialTemperature:sim.params.initialTemperature,
    // The energy datum is the CG height at level, unloaded tire contact.
    // After compression, gravitational energy relative to this datum can be negative.
    energyDatumY:sim.state.pos.y-config.height,initialPotentialEnergyJ:sim.mass*sim.params.gravity*config.height,
    previousMass:sim.mass,previousGas:sim.state.gas,finalMass:sim.mass,finalVelocityY:0,
    touchdownMass:null,touchdownKineticEnergyJ:null,touchdownGasUsed:null,
    totalGravityImpulseNs:0,constantMassAuditValid:true,freeFallConditionsValid:true,
    parameters:Object.freeze({...sim.params}),flightTimeout,precontactSampleInterval,elapsed:0,done:false,status:'running',
    braking:false,manualLiftActive:false,manualLiftUsed:false,manualLiftDuration:0,
    ecoPlannedBrakeHeight:economy?.brakeHeight??null,ecoPredictedTouchdownSpeed:economy?.predictedSpeed??null,
    ecoPredictedGas:economy?.predictedGas??null,ecoPlanFeasible:economy?.feasible??null,
    ecoPredictedTouchdownGas:economy?.predictedTouchdownGas??null,ecoProfile:economy?.profile??null,
    ecoCoastOnly:economy?.coastOnly??false,autoBrakeHeight:null,ecoCoastTime:null,
    ecoMinimumCoastTime:economy?.minimumCoastTime??null,
    ecoPlanTimeMs,jetLandingProfile:economy?.jetProfile??null,
    touchdownTime:null,touchdownSpeed:null,contactDuration:null,contactEndTime:null,contactEndVelocityY:null,
    forceWindow:new ForceWindow(),forceWindowSeconds:FORCE_WINDOW_SECONDS,currentEquivalentGroundForceN:0,
    peakGroundForceN:0,peakEquivalentGroundForceN:0,peakRawEquivalentGroundForceN:0,peakG:0,contactPeakG:0,
    groundImpulseNs:0,totalGroundImpulseNs:0,correctionImpulseNs:0,impactCorrectionImpulseNs:0,
    maxCompression:0,bottomedOut:false,bodyStrike:false,reboundHeight:0,
    gasUsed:0,samples:[],sampleBucket:-1,settledFor:0,settled:false,result:null};
  if(jet){
    Object.assign(run,{propulsionKind:'air-breathing-jet',startMode:staged?'hover':'release',phase:staged?'ascending':'landing',
      requestedHeight:config.height,actualReleaseHeight:staged?null:landingClearance(sim),initialVelocityY:sim.state.vel.y,
      prestartedIdle:staged,preparationComplete:!staged,missionStartTime:sim.state.time,missionElapsed:0,missionInitialFuelKg:sim.state.gas,
      initialFuelKg:sim.state.gas,finalFuelKg:sim.state.gas,fuelUsedKg:0,preparationFuelUsedKg:0,missionFuelUsedKg:0,
      preparationTime:0,hoverStableTime:0,hoverDwell:finite(options.hoverDwell,.4,.1,3),
      hoverHeightToleranceM:.005,hoverSpeedToleranceMps:.005,touchdownFuelUsedKg:null,
      preparationTimeout:Math.max(45,config.height/1+35),preparationPeakHeight:Math.max(0,landingClearance(sim)),releaseState:null,
      flightTimeout:Math.max(30,config.height/.2+20),freeFallConditionsValid:!staged,constantMassAuditValid:!staged});
    if(staged&&config.height===0)beginJetLanding(run,sim);
  }
  return run;
}


/** Feed into PhysicsSim.step(.002, ...), then call updateLandingRun. */
export function landingRunInput(run,sim,manualLift=false){
  const off={stabilize:false,lift:0,altHold:false,fan:false,wing:false,boost:false,
    throttle:0,brake:0,steer:0,coastRegen:false};
  if(run.propulsionKind==='air-breathing-jet')return jetRunInput(run,sim,manualLift,off);
  run.manualLiftActive=!!manualLift&&!run.done&&run.touchdownTime===null;
  if(run.manualLiftActive)return {...off,stabilize:true,lift:1};
  if(run.done||run.method==='free'||run.touchdownTime!==null)return off;
  const gap=landingClearance(sim),velocity=sim.state.vel.y,g=sim.params.gravity;
  if(run.method==='eco'){
    if((run.height===0||run.ecoCoastOnly)&&!run.manualLiftUsed)return off;
    if(!run.manualLiftUsed&&run.elapsed+1e-10<run.ecoMinimumCoastTime)return off;
    // Manual thrust changes the planned trajectory. On release, use feedback
    // immediately; measurements retain the manual-input marker for fair comparison.
    if(!run.braking&&(gap<=run.ecoPlannedBrakeHeight||run.manualLiftUsed)){
      run.braking=true;run.autoBrakeHeight=Math.max(0,gap);run.ecoCoastTime=run.elapsed;
    }
    if(!run.braking)return off;
    return {...off,stabilize:true,verticalAcceleration:economyAcceleration(gap,velocity,run.targetSpeed,g,sim.params.valveTau)};
  }
  if(run.method==='brake'&&gap<=run.brakeHeight)run.braking=true;
  if(run.method==='brake'&&!run.braking)return off;
  // Anticipate valve delay without changing actual velocity. A braking run waits
  // for the chosen clearance; gentle descent starts shaping speed immediately.
  const lead=Math.max(.001,sim.params.valveTau)*2;
  const futureGap=Math.max(.015,gap+velocity*lead);
  let acceleration;
  if(run.method==='brake'){
    const needed=(velocity*velocity-run.targetSpeed*run.targetSpeed)/(2*futureGap);
    acceleration=velocity<-run.targetSpeed?needed:5*(-run.targetSpeed-velocity);
  }else{
    const approachSpeed=Math.sqrt(run.targetSpeed*run.targetSpeed+4*futureGap);
    const target=-Math.min(2.5,approachSpeed);
    // Feed forward the changing speed reference; feedback still corrects the
    // actual finite-valve/tank response, without promising the target is reached.
    const feedForward=approachSpeed<2.5?-2*velocity/approachSpeed:0;
    acceleration=feedForward+6*(target-velocity);
  }
  return {...off,stabilize:true,verticalAcceleration:clamp(acceleration,-g,1.1*g)};
}

function complete(run,status){
  run.done=true;run.status=status;
  const {config,startTime,done,result,sampleBucket,settledFor,braking,previousMass,previousGas,previousStepTime,forceWindow,...data}=run;
  run.result={...data,samples:run.samples.map(s=>({...s})),config:{...config}};
}

/** Summary peaks use every step, including body-ground correction impulses.
 * peakGroundForceN is the continuous suspension/skid force. The equivalent peak
 * uses a fixed 20 ms moving-window integral including contact impulses.
 * Raw step-equivalent peaks remain diagnostics, not a material/crash stress.
 */
export function updateLandingRun(run,sim,dt=LANDING_STEP){
  if(run.done)return run;
  if(Math.abs(dt-LANDING_STEP)>1e-10||Math.abs(sim.stepDuration-LANDING_STEP)>1e-10||
    Math.abs(sim.state.time-run.previousStepTime-LANDING_STEP)>1e-9)
    throw new RangeError('Landing measurements require fixed 0.002 s physics steps.');
  run.previousStepTime=sim.state.time;
  if(run.propulsionKind==='air-breathing-jet'){
    run.missionElapsed=sim.state.time-run.missionStartTime;run.missionFuelUsedKg=run.missionInitialFuelKg-sim.state.gas;
    run.finalFuelKg=sim.state.gas;run.finalMass=sim.mass;
    if(run.phase!=='landing'){updateJetPreparation(run,sim,dt);return run;}
    run.fuelUsedKg=run.initialFuelKg-sim.state.gas;
  }
  run.elapsed=sim.state.time-run.startTime;
  if(run.manualLiftActive){run.manualLiftUsed=true;run.manualLiftDuration+=dt;}
  const ground=Math.max(0,sim.groundForceN),impulse=Math.max(0,sim.groundCorrectionImpulseNs);
  const rawEquivalent=ground+impulse/dt;
  const equivalent=run.forceWindow.push(ground*dt+impulse,dt);
  run.currentEquivalentGroundForceN=equivalent;
  run.peakRawEquivalentGroundForceN=Math.max(run.peakRawEquivalentGroundForceN,rawEquivalent);
  // Match the integrator's midpoint mass for gravity, and retain the actual
  // endpoint velocity. A constant-mass impulse audit uses this whole interval,
  // never the 10 ms peak-envelope chart or the fractionally timed first stop.
  const massBefore=run.previousMass,gasBefore=run.previousGas;
  run.totalGravityImpulseNs-=(massBefore+sim.mass)*.5*Math.max(0,sim.params.gravity)*dt;
  run.finalMass=sim.mass;run.finalVelocityY=sim.state.vel.y;
  const noExtraVerticalForce=sim.totalThrust<1e-9&&Math.abs(sim.fanForce)<1e-9&&sim.airDragN<1e-9&&
    sim.params.roadRoughness===0&&sim.obstacles.length===0;
  run.constantMassAuditValid &&= noExtraVerticalForce&&Math.abs(sim.mass-run.initialMass)<1e-9;
  if(run.touchdownTime===null)run.freeFallConditionsValid &&= noExtraVerticalForce&&
    Math.abs(sim.params.gravity-run.parameters.gravity)<1e-12&&Math.abs(sim.mass-run.initialMass)<1e-9;
  const acceleration=sim.resolvedAcceleration.clone();acceleration.y+=sim.params.gravity;
  const properG=equivalent/Math.max(.001,sim.mass*sim.params.gravity);
  const touching=ground>0||impulse>0;
  if(touching&&run.touchdownTime===null){
    run.touchdownTime=run.elapsed-dt;
    run.touchdownSpeed=Math.max(0,-sim.preStepVelocityY);
    run.touchdownMass=massBefore;
    run.touchdownKineticEnergyJ=.5*massBefore*run.touchdownSpeed**2;
    run.touchdownGasUsed=run.initialGas-gasBefore;
    if(run.propulsionKind==='air-breathing-jet')run.touchdownFuelUsedKg=run.touchdownGasUsed;
  }
  run.peakGroundForceN=Math.max(run.peakGroundForceN,ground);
  run.peakEquivalentGroundForceN=Math.max(run.peakEquivalentGroundForceN,equivalent);
  run.peakG=Math.max(run.peakG,properG);
  if(run.touchdownTime!==null)run.contactPeakG=Math.max(run.contactPeakG,properG);
  run.totalGroundImpulseNs+=ground*dt+impulse;
  run.correctionImpulseNs+=impulse;
  if(run.touchdownTime!==null&&run.contactDuration===null){
    run.groundImpulseNs+=ground*dt+impulse;run.impactCorrectionImpulseNs+=impulse;
    if(sim.state.vel.y>=0||Math.abs(sim.state.vel.y)<.01){
      // groundImpulseNs already integrates the entire resolved step, including
      // any instantaneous end-of-step ground correction. Record that same
      // endpoint instead of pretending the impulse has a fractional duration.
      // This is the first near-stop/rebound sample at 2 ms resolution, not an
      // analytic v=0 time. Keep its residual velocity so the interval is auditable.
      run.contactEndTime=run.elapsed;
      run.contactEndVelocityY=sim.state.vel.y;
      run.contactDuration=run.contactEndTime-run.touchdownTime;
    }
  }
  const compression=Math.max(0,...sim.wheels.map(w=>w.compression));
  run.maxCompression=Math.max(run.maxCompression,compression);
  run.bottomedOut ||= compression>(sim.params.suspensionTravel??.18);
  run.bodyStrike ||= sim.bodyGroundContacts>0||impulse>0;
  const clearance=landingClearance(sim);
  if(run.touchdownTime!==null)run.reboundHeight=Math.max(run.reboundHeight,clearance);
  run.gasUsed=run.initialGas-sim.state.gas;
  if(run.propulsionKind==='air-breathing-jet')run.fuelUsedKg=run.gasUsed;
  // Preserve the full 10 ms contact trace, while long high-altitude approaches
  // use bounded sparse samples. Every 2 ms step still contributes to all peaks.
  const nearContact=run.touchdownTime!==null||clearance<=Math.max(2,-sim.state.vel.y*.3);
  const sampleInterval=nearContact?.01:run.precontactSampleInterval;
  const springState=landingSpringState(sim);
  const sample={time:run.elapsed,sampleInterval,clearance,velocity:sim.state.vel.y,groundForceN:ground,
    equivalentGroundForceN:equivalent,rawEquivalentGroundForceN:rawEquivalent,gLoad:properG,thrustN:sim.totalThrust,
    // compression retains the force-evaluation value for backwards compatibility;
    // stateCompression and springEnergyJ both belong to this end-state pose.
    compression,stateCompression:springState.stateCompression,gasKg:sim.state.gas,correctionImpulseNs:impulse,manualLift:run.manualLiftActive?1:0,
    // Stored translational / gravitational / linear-spring energy only: this
    // excludes rotation, nonlinear bump stops, dissipation and expelled gas.
    // It is not a closed-system conservation sum during thrust or contact.
    massKg:sim.mass,kineticEnergyJ:.5*sim.mass*sim.state.vel.lengthSq(),
    potentialEnergyJ:sim.mass*sim.params.gravity*(sim.state.pos.y-run.energyDatumY),
    springEnergyJ:springState.springEnergyJ};
  const bucket=sampleInterval+':'+Math.floor((run.elapsed+1e-9)/sampleInterval);
  if(bucket!==run.sampleBucket){run.samples.push(sample);run.sampleBucket=bucket;}
  else{
    const last=run.samples.at(-1);
    last.groundForceN=Math.max(last.groundForceN,ground);
    last.equivalentGroundForceN=Math.max(last.equivalentGroundForceN,equivalent);
    last.rawEquivalentGroundForceN=Math.max(last.rawEquivalentGroundForceN,rawEquivalent);
    last.manualLift=Math.max(last.manualLift,sample.manualLift);
    last.gLoad=Math.max(last.gLoad,properG);last.correctionImpulseNs+=impulse;
  }
  run.previousMass=sim.mass;run.previousGas=sim.state.gas;
  if(run.touchdownTime!==null){
    const settled=Math.abs(sim.state.vel.y)<.025&&sim.state.omega.length()<.03&&sim.contactCount>=3;
    run.settledFor=settled?run.settledFor+dt:0;
    const after=run.elapsed-run.touchdownTime;
    run.settled=run.settledFor>=.3;
    if(after>=3||(after>=1.5&&run.settled))complete(run,run.settled?'landed':'unsettled');
  }else if(run.elapsed>=run.flightTimeout-1e-9)complete(run,'timeout');
  return run;
}


/** The preparation controller is independent of the selected landing method.
 * Identical ground resets therefore produce an identical real hover checkpoint. */
function jetRunInput(run,sim,manualLift,off){
  const running={...off,jetEnabled:true,jetLiftOnly:true,stabilize:true};
  const stopped={...off,jetEnabled:false,jetCutoff:true,jetLiftOnly:true};
  run.manualLiftActive=!!manualLift&&!run.done&&run.phase==='landing'&&run.touchdownTime===null;
  if(run.done||run.touchdownTime!==null)return stopped;
  if(run.phase!=='landing'){
    return {...running,verticalAcceleration:jetHeightAcceleration(sim,run.requestedHeight)};
  }
  if(run.manualLiftActive)return {...running,lift:1};
  if(run.method==='free')return stopped;
  const gap=landingClearance(sim),velocity=sim.state.vel.y,g=sim.params.gravity;
  if(run.method==='brake'){
    if(gap<=run.brakeHeight)run.braking=true;
    // Keep the turbine lit at idle while descending; do not simulate an
    // instantaneous relight at the trigger height.
    if(!run.braking)return {...running,verticalAcceleration:-g};
    const futureGap=Math.max(.05,gap+Math.min(0,velocity)*.35);
    const needed=Math.max(0,(velocity*velocity-run.targetSpeed*run.targetSpeed)/(2*futureGap));
    return {...running,verticalAcceleration:clamp(velocity<-run.targetSpeed?needed:2*(-run.targetSpeed-velocity),-g,1.1*g)};
  }
  if(run.method==='eco'){
    run.braking=true;run.autoBrakeHeight??=Math.max(0,gap);run.ecoCoastTime??=0;
    return {...running,verticalAcceleration:jetDescentAcceleration(gap,velocity,run.targetSpeed,run.jetLandingProfile??{})};
  }
  return {...running,verticalAcceleration:jetDescentAcceleration(gap,velocity,run.targetSpeed,{cruiseSpeed:Math.min(.35,run.targetSpeed*.7)})};
}

export function jetReleaseState(sim){
  return {time:sim.state.time,clearanceM:landingClearance(sim),massKg:sim.mass,
    position:sim.state.pos.toArray(),velocity:sim.state.vel.toArray(),quaternion:sim.state.q.toArray(),
    angularVelocity:sim.state.omega.toArray(),fuelKg:sim.state.gas,
    thrustN:sim.totalThrust,fuelChemicalEnergyJ:sim.state.fuelChemicalEnergyJ,
    engines:sim.thrusters.map(t=>t.jetState?{...t.jetState}:null)};
}

function beginJetLanding(run,sim){
  const gap=landingClearance(sim);
  run.phase='landing';run.preparationComplete=true;run.startTime=sim.state.time;run.elapsed=0;
  run.preparationTime=sim.state.time-run.missionStartTime;
  run.preparationFuelUsedKg=run.missionInitialFuelKg-sim.state.gas;
  run.actualReleaseHeight=gap;run.initialVelocityY=sim.state.vel.y;run.releaseState=jetReleaseState(sim);
  run.initialMass=sim.mass;run.initialGas=run.initialFuelKg=sim.state.gas;run.finalFuelKg=sim.state.gas;
  run.previousMass=sim.mass;run.previousGas=sim.state.gas;run.finalMass=sim.mass;
  run.energyDatumY=sim.state.pos.y-gap;run.initialPotentialEnergyJ=sim.mass*sim.params.gravity*gap;
  run.freeFallConditionsValid=false;run.constantMassAuditValid=false;
  run.initialKineticEnergyJ=.5*sim.mass*sim.state.vel.lengthSq();
  if(run.method==='eco'){
    const start=performance.now(),plan=planEconomyLanding(sim,gap,run.targetSpeed);
    Object.assign(run,{ecoPlanTimeMs:performance.now()-start,ecoPlannedBrakeHeight:plan.brakeHeight,
      ecoPredictedTouchdownSpeed:plan.predictedSpeed,ecoPredictedGas:plan.predictedGas,
      ecoPredictedTouchdownGas:plan.predictedTouchdownGas,ecoPlanFeasible:plan.feasible,
      ecoProfile:plan.profile,ecoMinimumCoastTime:0,jetLandingProfile:plan.jetProfile});
  }
}

function updateJetPreparation(run,sim,dt){
  const gap=landingClearance(sim),upY=1-2*(sim.state.q.x**2+sim.state.q.z**2);
  run.preparationPeakHeight=Math.max(run.preparationPeakHeight,gap);
  run.preparationTime=run.missionElapsed;run.preparationFuelUsedKg=run.missionFuelUsedKg;
  const stable=Math.abs(gap-run.requestedHeight)<=run.hoverHeightToleranceM&&Math.abs(sim.state.vel.y)<run.hoverSpeedToleranceMps&&
    sim.state.omega.length()<.04&&upY>.999&&sim.contactCount===0;
  run.phase=stable?'hovering':'ascending';run.hoverStableTime=stable?run.hoverStableTime+dt:0;
  if(run.hoverStableTime>=run.hoverDwell){beginJetLanding(run,sim);return;}
  if(run.preparationTime>=run.preparationTimeout||sim.state.gas<=1e-9||
    !Number.isFinite(gap)||Math.abs(sim.state.pos.x)>20||Math.abs(sim.state.pos.z)>20){
    run.phase='failed';run.preparationFailure=sim.state.gas<=1e-9?'fuel-exhausted':'hover-not-established';
    // No landing took place. Do not export zero fuel/force as a successful
    // landing; mission/preparation use remains available for failed trials.
    run.fuelUsedKg=null;run.gasUsed=null;run.peakEquivalentGroundForceN=null;
    run.finalFuelKg=sim.state.gas;complete(run,'preparation-failed');
  }
}

/** Slow jet-compatible height hold. Target is unloaded tire clearance in metres. */
export function jetHeightAcceleration(sim,targetClearance){
  const gap=landingClearance(sim),velocity=sim.state.vel.y;
  const targetVelocity=clamp(.65*(targetClearance-gap),-.65,1);
  return clamp(1.7*(targetVelocity-velocity),-1.5,1.5);
}
