import {contactFraction,landingSpringState} from './landing-measurement.js?v=20261118-physics146';
import {planEconomyLanding,economyAcceleration} from './landing-economy.js?v=20261118-audit148';

// A controlled comparison of a hypothetical common landing rig, not OEM crash data.
// All measurement updates run at the simulation's fixed 2 ms step. Force samples
// retain the maximum in each 10 ms chart bin; the summary never uses render rate.
export const LANDING_STEP=.002;
export const LANDING_MODEL_VERSION='1.46.0';
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
    springK:finite(options.springK,75000,30000,150000),
    damperC:finite(options.damperC,6000,1000,15000),
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
  return Math.min(...sim.wheels.map(w=>w.pos.clone().applyQuaternion(sim.state.q).y+sim.state.pos.y-sim.params.wheelRadius-(w.surfaceY??0)));
}

/** Resets the supplied vehicle using shared controlled environmental conditions. */
export function releaseLandingVehicle(sim,options={}){
  const config=landingSettings(options);
  Object.assign(sim.params,{springK:config.springK,damperC:config.damperC,
    gravity:9.80665,windX:0,windZ:0,roadRoughness:0,aeroEnabled:false,
    contactEnabled:true,friction:1.15,rollingResistance:.015,
    // Fixed level, centred loading isolates mass and chassis geometry differences.
    cgX:0,cgY:0,cgZ:0});
  sim.setObstacles([]);sim.reset('ground');
  sim.state.pos.set(0,.31+sim.params.wheelRadius+config.height,0);
  sim.state.vel.set(0,0,0);sim.state.q.identity();sim.state.omega.set(0,0,0);
  sim.contactCount=sim.lastContactCount=0;
  for(const w of sim.wheels){w.grounded=false;w.compression=0;w.load=0;w.omega=0;}
  return config;
}

export function createLandingRun(sim,options={}){
  const config=releaseLandingVehicle(sim,options);
  const planStart=config.method==='eco'?performance.now():0;
  const economy=config.method==='eco'?planEconomyLanding(sim,landingClearance(sim),config.targetSpeed):null;
  const ecoPlanTimeMs=economy?performance.now()-planStart:null;
  return recordLandingRelease(sim,config,economy,ecoPlanTimeMs);
}

export function recordLandingRelease(sim,config,economy,ecoPlanTimeMs){
  // A fixed 15 s deadline silently discarded high drops before first contact.
  // Keep that failure guard at ordinary heights, but scale it with free fall
  // and the gentle controller's 2.5 m/s cruise reference for larger releases.
  const freeFallTime=Math.sqrt(config.height)*Math.sqrt(2/9.80665);
  const flightTimeout=Math.max(15,freeFallTime*2+10,['gentle','eco'].includes(config.method)?config.height/2.5+10:0);
  const precontactSampleInterval=Math.max(.01,flightTimeout/4000);
  return {...config,modelVersion:LANDING_MODEL_VERSION,config:Object.freeze({...config}),startTime:sim.state.time,
    initialMass:sim.mass,initialGas:sim.state.gas,tankVolume:sim.params.tankVolume,
    tankPressureMPa:sim.params.tankPressureMPa,initialTemperature:sim.params.initialTemperature,
    // The energy datum is the CG height at level, unloaded tire contact.
    // After compression, gravitational energy relative to this datum can be negative.
    energyDatumY:sim.state.pos.y-config.height,initialPotentialEnergyJ:sim.mass*sim.params.gravity*config.height,
    previousMass:sim.mass,previousGas:sim.state.gas,previousClearance:config.height,finalMass:sim.mass,finalVelocityY:0,
    touchdownMass:null,touchdownKineticEnergyJ:null,touchdownGasUsed:null,
    totalGravityImpulseNs:0,constantMassAuditValid:true,freeFallConditionsValid:true,
    parameters:Object.freeze({...sim.params}),flightTimeout,precontactSampleInterval,elapsed:0,done:false,status:'running',
    braking:false,manualLiftActive:false,manualLiftUsed:false,manualLiftDuration:0,
    ecoPlannedBrakeHeight:economy?.brakeHeight??null,ecoPredictedTouchdownSpeed:economy?.predictedSpeed??null,
    ecoPredictedGas:economy?.predictedGas??null,ecoPlanFeasible:economy?.feasible??null,
    ecoPredictedTouchdownGas:economy?.predictedTouchdownGas??null,ecoProfile:economy?.profile??null,
    ecoCoastOnly:economy?.coastOnly??false,autoBrakeHeight:null,autoBrakeTime:null,ecoCoastTime:null,
    ecoMinimumCoastTime:economy?.minimumCoastTime??null,
    ecoPlanTimeMs,
    touchdownTime:null,touchdownSpeed:null,contactDuration:null,contactEndTime:null,contactEndVelocityY:null,
    peakGroundForceN:0,peakEquivalentGroundForceN:0,peakG:0,contactPeakG:0,
    groundImpulseNs:0,totalGroundImpulseNs:0,correctionImpulseNs:0,impactCorrectionImpulseNs:0,
    maxCompression:0,bottomedOut:false,bodyStrike:false,reboundHeight:0,
    gasUsed:0,samples:[],sampleBucket:-1,settledFor:0,settled:false,result:null};
}

/** Feed into PhysicsSim.step(.002, ...), then call updateLandingRun. */
export function landingRunInput(run,sim,manualLift=false){
  const off={stabilize:false,lift:0,altHold:false,fan:false,wing:false,boost:false,
    throttle:0,brake:0,steer:0,coastRegen:false};
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
      run.braking=true;run.autoBrakeHeight=Math.max(0,gap);run.autoBrakeTime=run.elapsed;run.ecoCoastTime=run.elapsed;
    }
    if(!run.braking)return off;
    return {...off,stabilize:true,verticalAcceleration:economyAcceleration(gap,velocity,run.targetSpeed,g,sim.params.valveTau)};
  }
  if(run.method==='brake'&&!run.braking&&gap<=run.brakeHeight){
    run.braking=true;run.autoBrakeHeight=Math.max(0,gap);run.autoBrakeTime=run.elapsed;
  }
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
  const {config,startTime,done,result,sampleBucket,settledFor,braking,previousMass,previousGas,previousClearance,...data}=run;
  run.result={...data,samples:run.samples.map(s=>({...s})),config:{...config}};
}

/** Summary peaks use every step, including body-ground correction impulses.
 * peakGroundForceN is the continuous suspension/skid force. The equivalent peak
 * additionally divides a numerical contact impulse by 2 ms: a discretized load,
 * NOT a resolved material stress or physically instantaneous impact-force peak.
 */
export function updateLandingRun(run,sim,dt=LANDING_STEP){
  if(run.done)return run;
  if(Math.abs(dt-LANDING_STEP)>1e-10||Math.abs(sim.stepDuration-LANDING_STEP)>1e-10||
    Math.abs(sim.state.time-run.startTime-run.elapsed-LANDING_STEP)>1e-9)
    throw new RangeError('Landing measurements require fixed 0.002 s physics steps.');
  run.elapsed=sim.state.time-run.startTime;
  if(run.manualLiftActive){run.manualLiftUsed=true;run.manualLiftDuration+=dt;}
  const ground=Math.max(0,sim.groundForceN),impulse=Math.max(0,sim.groundCorrectionImpulseNs);
  const equivalent=ground+impulse/dt;
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
  const properG=acceleration.length()/Math.max(.001,sim.params.gravity);
  const clearance=landingClearance(sim);
  if(run.touchdownTime===null&&sim.params.contactEnabled){
    // Locate first geometric contact before numerical position projection.
    const unprojectedClearance=clearance+(sim.unprojectedPositionY-sim.state.pos.y);
    let fraction=null;
    if(ground>0)fraction=0;
    else if(unprojectedClearance<=0)fraction=contactFraction(run.previousClearance,unprojectedClearance,sim.state.acceleration.y,dt);
    else if(impulse>0)fraction=1; // tilted hull contacted first
    if(fraction!==null){
      run.touchdownTime=run.elapsed-dt+fraction*dt;
      run.touchdownSpeed=Math.max(0,-(sim.preStepVelocityY+fraction*sim.state.acceleration.y*dt));
      run.touchdownMass=massBefore+fraction*(sim.mass-massBefore);
      run.touchdownKineticEnergyJ=.5*run.touchdownMass*run.touchdownSpeed**2;
      run.touchdownGasUsed=run.initialGas-(gasBefore+fraction*(sim.state.gas-gasBefore));
    }
  }
  run.peakGroundForceN=Math.max(run.peakGroundForceN,ground);
  run.peakEquivalentGroundForceN=Math.max(run.peakEquivalentGroundForceN,equivalent);
  run.peakG=Math.max(run.peakG,properG);
  if(run.touchdownTime!==null)run.contactPeakG=Math.max(run.contactPeakG,properG);
  run.totalGroundImpulseNs+=ground*dt+impulse;
  run.correctionImpulseNs+=impulse;
  if(run.touchdownTime!==null&&run.contactDuration===null){
    run.groundImpulseNs+=ground*dt+impulse;run.impactCorrectionImpulseNs+=impulse;
    if(run.groundImpulseNs>0&&run.elapsed>run.touchdownTime&&(sim.state.vel.y>=0||Math.abs(sim.state.vel.y)<.01)){
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
  run.bottomedOut ||= compression>.22;
  run.bodyStrike ||= sim.bodyGroundContacts>0||impulse>0;
  run.previousClearance=clearance;
  if(run.touchdownTime!==null)run.reboundHeight=Math.max(run.reboundHeight,clearance);
  run.gasUsed=run.initialGas-sim.state.gas;
  // Preserve the full 10 ms contact trace, while long high-altitude approaches
  // use bounded sparse samples. Every 2 ms step still contributes to all peaks.
  const nearContact=run.touchdownTime!==null||clearance<=Math.max(2,-sim.state.vel.y*.3);
  const sampleInterval=nearContact?.01:run.precontactSampleInterval;
  // Start a fresh bin at contact: a landing reaction must never be attached
  // to a sample of the airborne vehicle. Each maximum carries the endpoint
  // of the 2 ms measurement step that actually produced it.
  const bucket=(run.touchdownTime===null?'flight:':'contact:')+sampleInterval+':'+Math.floor((run.elapsed+1e-9)/sampleInterval);
  if(bucket!==run.sampleBucket){
    const springState=landingSpringState(sim);
    run.samples.push({time:run.elapsed,sampleInterval,clearance,velocity:sim.state.vel.y,
      groundForceN:ground,groundForcePeakTime:run.elapsed,
      equivalentGroundForceN:equivalent,equivalentGroundForcePeakTime:run.elapsed,
      gLoad:properG,gLoadPeakTime:run.elapsed,thrustN:sim.totalThrust,
      // compression comes from force evaluation; energy and stateCompression
      // describe the end-state pose at time, independently of the bin maxima.
      compression,stateCompression:springState.stateCompression,gasKg:sim.state.gas,correctionImpulseNs:impulse,manualLift:run.manualLiftActive?1:0,
      massKg:sim.mass,kineticEnergyJ:.5*sim.mass*sim.state.vel.lengthSq(),
      potentialEnergyJ:sim.mass*sim.params.gravity*(sim.state.pos.y-run.energyDatumY),
      springEnergyJ:springState.springEnergyJ});
    run.sampleBucket=bucket;
  }else{
    const last=run.samples.at(-1);
    if(ground>last.groundForceN){last.groundForceN=ground;last.groundForcePeakTime=run.elapsed;}
    if(equivalent>last.equivalentGroundForceN){last.equivalentGroundForceN=equivalent;last.equivalentGroundForcePeakTime=run.elapsed;}
    if(properG>last.gLoad){last.gLoad=properG;last.gLoadPeakTime=run.elapsed;}
    if(run.manualLiftActive)last.manualLift=1;
    last.correctionImpulseNs+=impulse;
  }
  run.previousMass=sim.mass;run.previousGas=sim.state.gas;
  if(run.touchdownTime!==null){
    const settled=sim.state.vel.length()<.025&&sim.state.omega.length()<.03&&sim.contactCount>=3;
    run.settledFor=settled?run.settledFor+dt:0;
    const after=run.elapsed-run.touchdownTime;
    run.settled=run.settledFor>=.3;
    if(after>=3||(after>=1.5&&run.settled))complete(run,run.settled?'landed':'unsettled');
  }else if(run.elapsed>=run.flightTimeout-1e-9)complete(run,'timeout');
  return run;
}
