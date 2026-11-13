import {landingSpringState} from './landing-measurement.js?v=20261111-calibration1';
import {planEconomyLanding,economyAcceleration} from './landing-economy.js?v=20261113-economy1';

// A controlled comparison of a hypothetical common landing rig, not OEM crash data.
// All measurement updates run at the simulation's fixed 2 ms step. Force samples
// retain the maximum in each 10 ms chart bin; the summary never uses render rate.
export const LANDING_STEP=.002;
export const LANDING_METHODS=Object.freeze([
  {id:'free',label:'자유낙하'},
  {id:'brake',label:'지정 높이에서 분사'},
  {id:'gentle',label:'완만한 하강 제어'},
]);
export const BRAKE_HEIGHT_FRACTIONS=Object.freeze([.1,.25,.5,.75,1]);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const finite=(value,fallback,min,max)=>clamp(Number.isFinite(Number(value))?Number(value):fallback,min,max);

export function landingSettings(options={}){
  const height=finite(options.height,3,0,Number.MAX_VALUE);
  return {...options,height,
    method:options.method==='eco'||LANDING_METHODS.some(m=>m.id===options.method)?options.method:'free',
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
  if(kind==='methods')return LANDING_METHODS.map(item=>({vehicleId:active.id,method:item.id}));
  if(kind==='economy')return [...LANDING_METHODS,{id:'eco'}].map(item=>({vehicleId:active.id,method:item.id}));
  if(kind==='vehicles')return fleet.filter(vehicle=>settings.vehicleIds?.includes(vehicle.id)).map(vehicle=>({vehicleId:vehicle.id,method}));
  return [{vehicleId:active.id,method}];
}

/** Minimum unloaded tire-to-ground gap, unaffected by static spring sag. */
export function landingClearance(sim){
  return Math.min(...sim.wheels.map(w=>w.pos.clone().applyQuaternion(sim.state.q).y+sim.state.pos.y-sim.params.wheelRadius));
}

/** Resets the supplied vehicle using shared controlled environmental conditions. */
export function createLandingRun(sim,options={}){
  const config=landingSettings(options);
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
  sim.state.pos.set(0,.31+sim.params.wheelRadius+config.height,0);
  sim.state.vel.set(0,0,0);sim.state.q.identity();sim.state.omega.set(0,0,0);
  sim.contactCount=sim.lastContactCount=0;
  for(const w of sim.wheels){w.grounded=false;w.compression=0;w.load=0;w.omega=0;}
  const planStart=config.method==='eco'?performance.now():0;
  const economy=config.method==='eco'?planEconomyLanding(sim,landingClearance(sim),config.targetSpeed):null;
  const ecoPlanTimeMs=economy?performance.now()-planStart:null;
  return {...config,config:Object.freeze({...config}),startTime:sim.state.time,
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
    // Manual thrust changes the planned trajectory. On release, use feedback
    // immediately; measurements retain the manual-input marker for fair comparison.
    if(!run.braking&&(gap<=run.ecoPlannedBrakeHeight||run.manualLiftUsed)){
      run.braking=true;run.autoBrakeHeight=Math.max(0,gap);run.ecoCoastTime=run.elapsed;
    }
    if(!run.braking)return off;
    return {...off,stabilize:true,verticalAcceleration:economyAcceleration(gap,velocity,run.targetSpeed,g,sim.params.valveTau,run.ecoProfile)};
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
  const {config,startTime,done,result,sampleBucket,settledFor,braking,previousMass,previousGas,...data}=run;
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
  const touching=ground>0||impulse>0;
  if(touching&&run.touchdownTime===null){
    run.touchdownTime=run.elapsed-dt;
    run.touchdownSpeed=Math.max(0,-sim.preStepVelocityY);
    run.touchdownMass=massBefore;
    run.touchdownKineticEnergyJ=.5*massBefore*run.touchdownSpeed**2;
    run.touchdownGasUsed=run.initialGas-gasBefore;
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
  run.bottomedOut ||= compression>.22;
  run.bodyStrike ||= sim.bodyGroundContacts>0||impulse>0;
  const clearance=landingClearance(sim);
  if(run.touchdownTime!==null)run.reboundHeight=Math.max(run.reboundHeight,clearance);
  run.gasUsed=run.initialGas-sim.state.gas;
  // Preserve the full 10 ms contact trace, while long high-altitude approaches
  // use bounded sparse samples. Every 2 ms step still contributes to all peaks.
  const nearContact=run.touchdownTime!==null||clearance<=Math.max(2,-sim.state.vel.y*.3);
  const sampleInterval=nearContact?.01:run.precontactSampleInterval;
  const springState=landingSpringState(sim);
  const sample={time:run.elapsed,sampleInterval,clearance,velocity:sim.state.vel.y,groundForceN:ground,
    equivalentGroundForceN:equivalent,gLoad:properG,thrustN:sim.totalThrust,
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
