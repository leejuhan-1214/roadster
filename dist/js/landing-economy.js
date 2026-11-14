import {isJetProfile,advanceJetEngine,jetNozzle,jetEngineCount,jetDensityRatio} from './jet-engine.js?v=20261115-jet1';
import {nozzle, thrusterNozzle, ATMOSPHERE} from './physics.js?v=20261115-jet1';
import {advanceAirDischarge} from './air-blowdown.js?v=20261115-calibrated1';

const G = 1.4, R = 287, STEP = .002;
const calibratedPlanCache=new Map();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** A bounded, one-dimensional forecast, never a replacement for the live solver.
 * It shares the nozzle equation and reproduces valve lag, feed loss, adiabatic
 * cooling, changing mass and the solver's acceleration/pressure limits. */
function forecast(initial, trigger, target, profile='brake') {
  const {gravity:g, dryMass, tankVolume, valveTau, feedLossCoefficient, area} = initial;
  const distance = Math.max(0, initial.height - trigger);
  const steps = Math.ceil(Math.hypot(.5,Math.sqrt(distance)*Math.sqrt(2/g)/STEP)-.5);
  let gap = initial.height - .5 * g * STEP * STEP * steps * (steps + 1);
  let velocity = -g * STEP * steps;
  let gas = initial.gas, temperature = initial.temperature, pressure = initial.pressure;
  let opening = 0, flow = 0, elapsed = 0;
  const tau = Math.max(.001, valveTau), decay = Math.exp(-STEP / tau), halfDecay = Math.exp(-STEP / (2 * tau));
  // At very high heights the bounded search can report infeasibility without
  // freezing a frame. Live physics still runs the requested experiment.
  for (let i = 0; gap > 0 && i < 12000; i++) {
    const mass = dryMass + gas;
    const manifold = Math.max(ATMOSPHERE, pressure - feedLossCoefficient * flow * flow);
    const full = nozzle(manifold, temperature, area);
    const acceleration = profile==='gentle'?gentleForecastAcceleration(gap,velocity,target,g,tau):economyAcceleration(gap,velocity,target,g,tau);
    const requested = mass * Math.max(0, g + acceleration);
    const command = full.force > 0 ? clamp(requested / full.force, 0, 1) : 0;
    const midpoint = command + (opening - command) * halfDecay;
    opening = command + (opening - command) * decay;
    flow = full.mdot * midpoint;
    const removable = pressure > ATMOSPHERE ? gas * (1 - (ATMOSPHERE / pressure) ** (1 / G)) : 0;
    const dm = Math.min(flow * STEP, Math.max(0, removable));
    const scale = flow > 0 ? dm / (flow * STEP) : 0;
    const force = full.force * midpoint * scale;
    flow *= scale;
    const nextGas = Math.max(0, gas - dm);
    if (gas > 0 && nextGas > 0) temperature *= (nextGas / gas) ** (G - 1);
    gas = nextGas;
    pressure = gas * R * temperature / tankVolume;
    velocity += (force / Math.max(1, mass - dm * .5) - g) * STEP;
    gap += velocity * STEP;
    elapsed += STEP;
    if (![gap, velocity, gas, temperature, pressure].every(Number.isFinite)) break;
  }
  const touchdownGasUsed=initial.gas-gas;
  // Touchdown is detected after a live physics step. Its pre-step speed above
  // is the measurement, while its command still opens the valve for one step.
  if(gap<=0){
    const full=nozzle(Math.max(ATMOSPHERE,pressure-feedLossCoefficient*flow*flow),temperature,area);
    const acceleration=profile==='gentle'?gentleForecastAcceleration(gap,velocity,target,g,tau):economyAcceleration(gap,velocity,target,g,tau);
    const requested=(dryMass+gas)*Math.max(0,g+acceleration);
    const command=full.force>0?clamp(requested/full.force,0,1):0;
    const midpoint=command+(opening-command)*halfDecay;
    opening=command+(opening-command)*decay;flow=full.mdot*midpoint;
    const removable=pressure>ATMOSPHERE?gas*(1-(ATMOSPHERE/pressure)**(1/G)):0;
    const dm=Math.min(flow*STEP,Math.max(0,removable));flow=dm/STEP;
    const nextGas=Math.max(0,gas-dm);
    if(gas>0&&nextGas>0)temperature*=(nextGas/gas)**(G-1);
    gas=nextGas;pressure=gas*R*temperature/tankVolume;
  }
  // Commands close at first contact, but the real valves continue expelling gas.
  // Include that finite tail when choosing the cheaper profile.
  for(let i=0;i<Math.min(5000,Math.ceil(16*tau/STEP))&&opening>1e-9;i++){
    const full=nozzle(Math.max(ATMOSPHERE,pressure-feedLossCoefficient*flow*flow),temperature,area);
    const midpoint=opening*halfDecay;opening*=decay;
    flow=full.mdot*midpoint;
    const removable=pressure>ATMOSPHERE?gas*(1-(ATMOSPHERE/pressure)**(1/G)):0;
    const dm=Math.min(flow*STEP,Math.max(0,removable));
    flow=dm/STEP;
    const nextGas=Math.max(0,gas-dm);
    if(gas>0&&nextGas>0)temperature*=(nextGas/gas)**(G-1);
    gas=nextGas;pressure=gas*R*temperature/tankVolume;
  }
  return {trigger, profile, speed:Math.max(0, -velocity), gasUsed:initial.gas - gas,touchdownGasUsed,
    complete:gap <= 0, coastTime:steps * STEP, burnTime:elapsed};
}

/** Real-gas reference-hardware forecast. It advances only copied scalar state;
 * live pose, pressure, gas and measured results are never replaced by this plan.
 * Four separately metered outlets are essential: one valve feeding their summed
 * area would give a completely different flow limit. */
function calibratedForecast(initial,trigger,target,profile='brake',dt=.01){
  const p=initial.params,g=initial.gravity;
  const distance=Math.max(0,initial.height-trigger);
  const steps=Math.ceil(Math.hypot(.5,Math.sqrt(distance)*Math.sqrt(2/g)/STEP)-.5);
  let gap=initial.height-.5*g*STEP*STEP*steps*(steps+1),velocity=-g*STEP*steps;
  // Upward-only jets cannot beat the no-thrust time to contact. Abort this
  // bounded prediction immediately when even that lower bound exceeds 24 s.
  const freeRemaining=gap>0?2*gap/(Math.sqrt(velocity*velocity+2*g*gap)-velocity):0;
  if(freeRemaining>24)return {trigger,profile,speed:Math.max(0,-velocity),gasUsed:0,touchdownGasUsed:0,complete:false,coastTime:steps*STEP,burnTime:0};
  let state={gas:initial.gas,temp:initial.temperature,pressure:initial.pressure,tankWallTemp:initial.tankWallTemp,thermalLimited:initial.thermalLimited};
  let opening=0,elapsed=0;
  const cache=initial.dischargeCache??(initial.dischargeCache=new Map());
  const discharge=(state,requested,h)=>{
    const key=[state.gas,state.temp,state.tankWallTemp,!!state.thermalLimited,requested,h].join('|');
    if(cache.has(key))return cache.get(key);
    const next=advanceAirDischarge(state,p,requested,h);
    if(cache.size<12000)cache.set(key,next);
    return next;
  };
  // Release experiments start at ambient equilibrium. For non-equilibrium
  // callers still evolve the same finite wall/gas heat state during the coast.
  const coastTime=steps*STEP;
  if(coastTime>0&&Math.abs(state.temp-(state.tankWallTemp??state.temp))>1e-8){
    if(coastTime>24)return {trigger,profile,speed:Math.max(0,-velocity),gasUsed:0,touchdownGasUsed:0,complete:false,coastTime,burnTime:0};
    for(let t=0;t<coastTime-1e-10;t+=dt)state=discharge(state,0,Math.min(dt,coastTime-t));
  }
  const full=()=>{
    if(initial.areas.every(a=>a===initial.areas[0])){
      const n=thrusterNozzle(state.pressure,state.temp,initial.areas[0],p,'lift');
      return {force:n.force*initial.areas.length,mdot:n.mdot*initial.areas.length};
    }
    return initial.areas.reduce((sum,area)=>{const n=thrusterNozzle(state.pressure,state.temp,area,p,'lift');return {force:sum.force+n.force,mdot:sum.mdot+n.mdot};},{force:0,mdot:0});
  };
  const advance=(contact=false,h=dt)=>{
    const mass=initial.dryMass+state.gas,n=full();
    const a=profile==='gentle'?gentleForecastAcceleration(gap,velocity,target,g,p.valveTau):economyAcceleration(gap,velocity,target,g,p.valveTau);
    const command=contact?0:n.force>0?clamp(mass*Math.max(0,g+a)/n.force,0,1):0;
    const tau=Math.max(.001,command>opening?(p.valveOpenTau??p.valveTau):(p.valveCloseTau??p.valveTau));
    const midpoint=command+(opening-command)*Math.exp(-h/(2*tau));
    opening=command+(opening-command)*Math.exp(-h/tau);
    const next=discharge(state,n.mdot*midpoint*h,h);
    const force=n.force*midpoint*next.removedRatio;
    state=next;
    if(!contact){velocity+=(force/Math.max(1,mass-next.removedKg*.5)-g)*h;gap+=velocity*h;elapsed+=h;}
  };
  for(let i=0;gap>0&&i<Math.ceil(24/dt);i++){
    advance();
    if(![gap,velocity,state.gas,state.temp,state.pressure].every(Number.isFinite))break;
  }
  const complete=gap<=0,touchdownGasUsed=initial.gas-state.gas,touchdownSpeed=Math.max(0,-velocity);
  // The live detector observes first contact one force-evaluation step later.
  // Retain that final opening interval before commanding closure.
  if(complete)advance(false,STEP);
  const tauClose=Math.max(.001,p.valveCloseTau??p.valveTau);
  // Motion/contact prediction stays at the requested step. The no-motion
  // closure tail only estimates gas cost, using 50 ms during candidate scans
  // and 25 ms for the final refined prediction.
  const tailStep=Math.max(dt,dt>STEP+1e-9?.05:.025);
  for(let i=0;complete&&i<Math.min(1000,Math.ceil(12*tauClose/tailStep))&&opening>1e-6;i++)advance(true,tailStep);
  return {trigger,profile,speed:touchdownSpeed,gasUsed:initial.gas-state.gas,touchdownGasUsed,complete,coastTime,burnTime:elapsed};
}

/** Public diagnostic for comparing a copied 1-D prediction with actual solver. */
export function predictCalibratedLanding(sim,height,trigger,targetSpeed,profile='brake',step=.002){
  const p=sim.params,s=sim.state;
  const initial={height:Math.max(0,height),gravity:p.gravity,dryMass:p.dryMass,
    gas:s.gas,temperature:s.temp,pressure:s.pressure,tankWallTemp:s.tankWallTemp,thermalLimited:s.thermalLimited,
    params:p,areas:sim.thrusters.slice(0,4).map(t=>t.area)};
  return calibratedForecast(initial,trigger,targetSpeed,profile,step);
}

/** Feedback requests acceleration; only PhysicsSim applies forces and motion. */
export function economyAcceleration(gap, velocity, target, gravity, valveTau) {
  const futureGap = Math.max(.015, gap + velocity * Math.max(.001, valveTau) * 2);
  const needed = .5*(velocity/futureGap)*velocity-.5*target*target/futureGap;
  return clamp(velocity < -target ? needed : 5 * (-target - velocity), -gravity, 1.1 * gravity);
}

// A reference gas budget only. The economy controller never executes this path.
function gentleForecastAcceleration(gap,velocity,target,gravity,valveTau){
  const futureGap=Math.max(.015,gap+velocity*Math.max(.001,valveTau)*2);
  const approachSpeed=Math.sqrt(target*target+4*futureGap);
  const desired=-Math.min(2.5,approachSpeed);
  const feedForward=approachSpeed<2.5?-2*velocity/approachSpeed:0;
  return clamp(feedForward+6*(desired-velocity),-gravity,1.1*gravity);
}

export function planEconomyLanding(sim, height, targetSpeed) {
  if(isJetProfile(sim.params))return planJetLanding(sim,height,targetSpeed);
  const p = sim.params, s = sim.state;
  const initial = {height:Math.max(0, height), gravity:p.gravity, dryMass:p.dryMass,
    tankVolume:p.tankVolume, valveTau:p.valveTau, feedLossCoefficient:Math.max(0,p.feedLossCoefficient),
    gas:s.gas, temperature:s.temp, pressure:s.pressure,
    area:sim.thrusters.slice(0,4).reduce((sum,t)=>sum+t.area,0),
    areas:sim.thrusters.slice(0,4).map(t=>t.area),params:p,tankWallTemp:s.tankWallTemp,thermalLimited:s.thermalLimited};
  const cacheKey=p.calibratedHardware?JSON.stringify([initial.height,targetSpeed,p,s.gas,s.temp,s.pressure,s.tankWallTemp,!!s.thermalLimited,initial.areas]):null;
  if(cacheKey&&calibratedPlanCache.has(cacheKey))return {...calibratedPlanCache.get(cacheKey)};
  const predict=(trigger,profile='brake',step=p.calibratedHardware?.01:STEP)=>p.calibratedHardware?calibratedForecast(initial,trigger,targetSpeed,profile,step):forecast(initial,trigger,targetSpeed,profile);
  const freeSpeed = Math.sqrt(initial.height)*Math.sqrt(2*initial.gravity);
  if (height <= 0 || freeSpeed <= targetSpeed) return {brakeHeight:0, predictedSpeed:freeSpeed, predictedGas:0, feasible:true, coastOnly:true};
  const full = p.calibratedHardware?{force:initial.areas.reduce((sum,area)=>sum+thrusterNozzle(initial.pressure,initial.temperature,area,p,'lift').force,0)}:nozzle(initial.pressure, initial.temperature, initial.area);
  if (full.force <= 0 || initial.gas <= 0) return {brakeHeight:0, predictedSpeed:freeSpeed, predictedGas:0, feasible:false, coastOnly:true};
  const acceptable = p => p.complete && p.speed <= targetSpeed + .025;
  // Every powered automatic economy run starts with a genuine unpowered fall.
  // Scale the short minimum with the available free-fall time at low heights.
  const minimumCoastTime=Math.max(1,Math.ceil(Math.min(.12,Math.sqrt(initial.height)*Math.sqrt(2/initial.gravity)*.15)/STEP))*STEP;
  const coastSteps=Math.round(minimumCoastTime/STEP);
  const maximumTrigger=Math.max(0,initial.height-.5*initial.gravity*STEP*STEP*coastSteps*(coastSteps+1)-1e-9);
  let best = null, previousTrigger = 0, bracket = null;
  const candidates=[];
  // Scan a bounded set first: finite tanks can make the outcome non-monotone.
  const candidateCount=p.calibratedHardware?8:12;
  for (let i = 1; i <= candidateCount; i++) {
    const trigger = Math.min(maximumTrigger,initial.height * (i / candidateCount));
    const candidate = predict(trigger);
    candidates.push(candidate);
    if (acceptable(candidate) && (!best || candidate.gasUsed < best.gasUsed)) {
      best = candidate;
      bracket = [previousTrigger, trigger];
    }
    previousTrigger = trigger;
  }
  if (best && bracket) {
    let [low, high] = bracket;
    for (let i = 0; i < (p.calibratedHardware?5:10); i++) {
      const middle = (low + high) * .5;
      const candidate = predict(middle);
      if (acceptable(candidate)) {
        high = middle;
        if (candidate.gasUsed < best.gasUsed) best = candidate;
      } else low = middle;
    }
  }
  const gentle=predict(initial.height,'gentle');
  // When pressure/mass cannot meet the requested speed, do not spend more gas
  // than gentle descent chasing a tiny further speed reduction. Prefer its
  // lower-speed alternatives within the same forecast gas budget.
  const affordable=candidates.filter(p=>p.complete&&p.gasUsed<=gentle.gasUsed+1e-8);
  const fallback=(affordable.length?affordable:candidates).reduce((a,b)=>b.speed<a.speed?b:a);
  let chosen = best || fallback;
  if(p.calibratedHardware)chosen=predict(chosen.trigger,'brake',STEP);
  const result={brakeHeight:chosen.trigger, predictedSpeed:chosen.complete?chosen.speed:null,
    predictedGas:chosen.complete?chosen.gasUsed:null,
    predictedTouchdownGas:chosen.complete?chosen.touchdownGasUsed:null,
    profile:'brake',minimumCoastTime,feasible:!!best&&acceptable(chosen), coastOnly:false};
  if(cacheKey){if(calibratedPlanCache.size>=32)calibratedPlanCache.delete(calibratedPlanCache.keys().next().value);calibratedPlanCache.set(cacheKey,{...result});}
  return result;
}


/** A jet descent reference. Commands change thrust only; the shared engine
 * integrator enforces its finite 5 s full-range spool slew and fuel supply. */
export function jetDescentAcceleration(gap,velocity,targetSpeed,profile={}){
  const cruise=profile.cruiseSpeed??Math.min(.35,targetSpeed*.7);
  const approach=profile.approachAcceleration??.25;
  const lead=profile.leadSeconds??.5;
  const futureGap=Math.max(0,gap+Math.min(0,velocity)*lead);
  const target=-Math.min(cruise,Math.sqrt(targetSpeed*targetSpeed+2*approach*futureGap));
  return clamp((profile.velocityGain??2)*(target-velocity),-3,5);
}

/** One-dimensional, copied-state forecast using exactly the live jet engine.
 * No ideal free-fall shortcut: the hover spool state carries into descent. */
export function predictJetLanding(sim,height,targetSpeed,profile={},dt=.01){
  const p=sim.params,s=sim.state,engines=sim.thrusters.slice(0,4);
  let states=engines.map(t=>({...t.jetState}));
  let fuel=s.gas,gap=height,velocity=s.vel.y,elapsed=0;
  const count=jetEngineCount(p,'lift'),initialFuel=fuel;
  const dryMass=p.dryMass,gravity=p.gravity,altitudeOffset=sim.state.pos.y-height-sim.restHeight;
  if(!states.every(x=>x.phase))return {complete:false,speed:null,fuelUsedKg:null,elapsed:0};
  const timeout=Math.min(90,Math.max(20,height/.2+10));
  if(!(height>=0)||!Number.isFinite(timeout)||height>1000)return {complete:false,speed:null,fuelUsedKg:null,elapsed:0};
  let contactSpeed=null,contactFuel=null;
  for(let i=0;gap>0&&elapsed<timeout&&i<Math.ceil(timeout/dt);i++){
    const mass=dryMass+fuel,acceleration=jetDescentAcceleration(gap,velocity,targetSpeed,profile);
    const densityRatio=jetDensityRatio(Math.max(0,gap+altitudeOffset));
    // Allocation uses installed static thrust, as in PhysicsSim. Intake ram
    // drag belongs to the force integration below, not to a second compensator.
    const available=jetNozzle(p,'lift',{densityRatio}).force;
    const command=available>0?clamp(mass*Math.max(0,gravity+acceleration)/(4*available),0,1):0;
    let force=0,used=0;
    for(let n=0;n<4;n++){
      const step=advanceJetEngine(states[n],p,command,dt,{enabled:true,engineCount:count,densityRatio,axialSpeed:velocity,fuelAvailableKg:Math.max(0,fuel-used)});
      states[n]=step.state;force+=step.forceN;used+=step.fuelUsedKg;
    }
    fuel=Math.max(0,fuel-used);
    velocity+=(force/Math.max(1,mass-used*.5)-gravity)*dt;
    gap+=velocity*dt;elapsed+=dt;
    if(gap<=0){contactSpeed=Math.max(0,-velocity);contactFuel=initialFuel-fuel;break;}
  }
  return {complete:gap<=0,speed:contactSpeed,fuelUsedKg:contactFuel,gasUsed:contactFuel,touchdownGasUsed:contactFuel,elapsed,profile:{...profile}};
}

/** Search a small declared set of descent schedules, not a global optimum. */
export function planJetLanding(sim,height,targetSpeed){
  const candidates=[];
  for(const cruiseSpeed of [targetSpeed,Math.max(.7,targetSpeed*1.3),Math.max(1,targetSpeed*1.8),Math.max(1.4,targetSpeed*2.4)]){
    for(const approachAcceleration of [.15,.35,.65]){
      const profile={cruiseSpeed,approachAcceleration,leadSeconds:.6,velocityGain:2};
      candidates.push(predictJetLanding(sim,height,targetSpeed,profile,.01));
    }
  }
  const completed=candidates.filter(x=>x.complete&&Number.isFinite(x.speed));
  const feasible=completed.filter(x=>x.speed<=targetSpeed+.025);
  let chosen=(feasible.length?feasible:completed).sort((a,b)=>feasible.length?a.fuelUsedKg-b.fuelUsedKg:a.speed-b.speed)[0];
  if(chosen)chosen=predictJetLanding(sim,height,targetSpeed,chosen.profile,.002);
  return {brakeHeight:height,predictedSpeed:chosen?.speed??null,predictedGas:chosen?.fuelUsedKg??null,
    predictedTouchdownGas:chosen?.fuelUsedKg??null,profile:'jet-descent',jetProfile:chosen?.profile??{cruiseSpeed:targetSpeed},
    minimumCoastTime:0,feasible:!!chosen?.complete&&chosen.speed<=targetSpeed+.025,coastOnly:false};
}
