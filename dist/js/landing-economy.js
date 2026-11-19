import {dragConstant,freeDrop} from './landing-aerodynamics.js?v=20261119-air161';
import {nozzle, ATMOSPHERE, R, GAMMA} from './air-nozzle.js?v=20261118-audit148';
import {contactFraction} from './landing-measurement.js?v=20261118-physics146';

const STEP = .002;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** A bounded, one-dimensional forecast, never a replacement for the live solver.
 * It shares the nozzle equation and reproduces valve lag, feed loss, adiabatic
 * cooling, changing mass and the solver's acceleration/pressure limits. */
function forecast(initial, trigger, target, profile='brake') {
  const {gravity:g, dryMass, tankVolume, valveTau, feedLossCoefficient, area} = initial;
  const distance = Math.max(0, initial.height - trigger);
  // A release from hover carries open valves and residual flow. Integrate
  // their decay during the coast; only a cold release has a ballistic shortcut.
  const fromHover=initial.valveOpening>0;
  const drag=initial.dragConstant??0;
  // Step the coast as in the live integrator at ordinary experiment heights.
  // For a long, unpowered cold coast, jump to the trigger using its exact
  // quadratic-drag trajectory so the bounded planner remains responsive.
  const coast=freeDrop(distance,g,drag/(dryMass+initial.gas));
  const stepCoast=fromHover||(drag>0&&coast.time<=20);
  let steps = stepCoast?0:Math.ceil(coast.time/STEP);
  let gap = initial.height - .5 * g * (STEP*steps)**2;
  let velocity = (initial.releaseVelocityY||0)-g * STEP * steps;
  if(!stepCoast&&drag>0){
    const overshoot=steps*STEP-coast.time;
    velocity=-coast.speed+(drag*coast.speed**2/(dryMass+initial.gas)-g)*overshoot;
    gap=trigger+.5*(velocity-coast.speed)*overshoot;
  }
  let gas = initial.gas, temperature = initial.temperature, pressure = initial.pressure;
  let opening = initial.valveOpening||0, flow = initial.flowKgS||0, elapsed = 0;
  let braking=!stepCoast||profile==='gentle';
  let contactVelocity=gap<=0?-freeDrop(initial.height,g,drag/(dryMass+initial.gas)).speed:velocity,contactGas=gas;
  const tau = Math.max(.001, valveTau), decay = Math.exp(-STEP / tau);
  const meanDecay = -Math.expm1(-STEP/tau)/(STEP/tau);
  // At very high heights the bounded search can report infeasibility without
  // freezing a frame. Live physics still runs the requested experiment.
  for (let i = 0; gap > 0 && i < 12000; i++) {
    const mass = dryMass + gas;
    const manifold = Math.max(ATMOSPHERE, pressure - feedLossCoefficient * flow * flow);
    const full = nozzle(manifold, temperature, area);
    const acceleration = profile==='gentle'?gentleForecastAcceleration(gap,velocity,target,g,tau):economyAcceleration(gap,velocity,target,g,tau);
    if(!braking&&gap<=trigger)braking=true;
    if(!braking)steps++;
    const requested = braking?mass * Math.max(0, g + acceleration):0;
    const command = full.force > 0 ? clamp(requested / full.force, 0, 1) : 0;
    const meanOpening = command + (opening - command) * meanDecay;
    opening = command + (opening - command) * decay;
    flow = full.mdot * meanOpening;
    const removable = pressure > ATMOSPHERE ? gas * (1 - (ATMOSPHERE / pressure) ** (1 / GAMMA)) : 0;
    const dm = Math.min(flow * STEP, Math.max(0, removable));
    const scale = flow > 0 ? dm / (flow * STEP) : 0;
    const force = full.force * meanOpening * scale;
    flow *= scale;
    const nextGas = Math.max(0, gas - dm);
    if (gas > 0 && nextGas > 0) temperature *= (nextGas / gas) ** (GAMMA - 1);
    gas = nextGas;
    pressure = gas * R * temperature / tankVolume;
    const netAcceleration=(force-drag*velocity*Math.abs(velocity))/Math.max(1,mass-dm*.5)-g;
    const oldGap=gap,oldVelocity=velocity;
    velocity += netAcceleration*STEP;
    gap += .5*(oldVelocity+velocity)*STEP;
    if(gap<=0){
      const fraction=contactFraction(oldGap,gap,netAcceleration,STEP);
      contactVelocity=oldVelocity+fraction*netAcceleration*STEP;
      contactGas=gas+(1-fraction)*dm;
    }
    elapsed += STEP;
    if (![gap, velocity, gas, temperature, pressure].every(Number.isFinite)) break;
  }
  const touchdownGasUsed=initial.gas-contactGas;
  // Commands close at first contact, but the real valves continue expelling gas.
  // Include that finite tail when choosing the cheaper profile.
  for(let i=0;i<Math.min(5000,Math.ceil(16*tau/STEP))&&opening>1e-9;i++){
    const full=nozzle(Math.max(ATMOSPHERE,pressure-feedLossCoefficient*flow*flow),temperature,area);
    const meanOpening=opening*meanDecay;opening*=decay;
    flow=full.mdot*meanOpening;
    const removable=pressure>ATMOSPHERE?gas*(1-(ATMOSPHERE/pressure)**(1/GAMMA)):0;
    const dm=Math.min(flow*STEP,Math.max(0,removable));
    flow=dm/STEP;
    const nextGas=Math.max(0,gas-dm);
    if(gas>0&&nextGas>0)temperature*=(nextGas/gas)**(GAMMA-1);
    gas=nextGas;pressure=gas*R*temperature/tankVolume;
  }
  return {trigger, profile, speed:Math.max(0,gap<=0?-contactVelocity:-velocity), gasUsed:initial.gas - gas,touchdownGasUsed,
    complete:gap <= 0, coastTime:steps * STEP, burnTime:elapsed-(stepCoast?steps*STEP:0)};
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

export function economyInitialState(sim, height) {
  const p = sim.params, s = sim.state;
  return {height:Math.max(0, height), gravity:p.gravity, dragConstant:dragConstant(p), dryMass:sim.loadedDryMass,
    tankVolume:p.tankVolume, valveTau:p.valveTau, feedLossCoefficient:Math.max(0,p.feedLossCoefficient),
    gas:s.gas, temperature:s.temp, pressure:s.pressure,
    area:sim.thrusters.slice(0,4).reduce((sum,t)=>sum+t.area,0)};
}

export function planEconomyLanding(sim,height,targetSpeed){
  return planEconomyFromState(economyInitialState(sim,height),targetSpeed);
}

export function measureEconomyPlan(initial,targetSpeed){
  const start=performance.now();
  const economy=planEconomyFromState(initial,targetSpeed);
  return {economy,elapsedMs:performance.now()-start};
}

export function planEconomyFromState(initial,targetSpeed){
  const freeSpeed = freeDrop(initial.height,initial.gravity,(initial.dragConstant??0)/(initial.dryMass+initial.gas)).speed;
  if (initial.height <= 0 || freeSpeed <= targetSpeed) return {brakeHeight:0, predictedSpeed:freeSpeed, predictedGas:0, feasible:true, coastOnly:true};
  const full = nozzle(initial.pressure, initial.temperature, initial.area);
  if (full.force <= 0 || initial.gas <= 0) return {brakeHeight:0, predictedSpeed:freeSpeed, predictedGas:0, feasible:false, coastOnly:true};
  const acceptable = p => p.complete && p.speed <= targetSpeed + 1e-9;
  // Every powered automatic economy run starts with a genuine unpowered fall.
  // Scale the short minimum with the available free-fall time at low heights.
  const minimumCoastTime=Math.max(1,Math.ceil(Math.min(.12,Math.sqrt(initial.height)*Math.sqrt(2/initial.gravity)*.15)/STEP))*STEP;
  const coastSteps=Math.round(minimumCoastTime/STEP);
  const maximumTrigger=Math.max(0,initial.height-.5*initial.gravity*(STEP*coastSteps)**2-1e-9);
  let best = null, previousTrigger = 0, bracket = null;
  const candidates=[];
  // Scan a bounded set first: finite tanks can make the outcome non-monotone.
  for (let i = 1; i <= 12; i++) {
    const trigger = Math.min(maximumTrigger,initial.height * (i / 12));
    const candidate = forecast(initial, trigger, targetSpeed);
    candidates.push(candidate);
    if (acceptable(candidate) && (!best || candidate.gasUsed < best.gasUsed)) {
      best = candidate;
      bracket = [previousTrigger, trigger];
    }
    previousTrigger = trigger;
  }
  if (best && bracket) {
    let [low, high] = bracket;
    for (let i = 0; i < 10; i++) {
      const middle = (low + high) * .5;
      const candidate = forecast(initial, middle, targetSpeed);
      if (acceptable(candidate)) {
        high = middle;
        if (candidate.gasUsed < best.gasUsed) best = candidate;
      } else low = middle;
    }
  }
  const gentle=forecast(initial,initial.height,targetSpeed,'gentle');
  // When pressure/mass cannot meet the requested speed, do not spend more gas
  // than gentle descent chasing a tiny further speed reduction. Prefer its
  // lower-speed alternatives within the same forecast gas budget.
  const affordable=candidates.filter(p=>p.complete&&p.gasUsed<=gentle.gasUsed+1e-8);
  const fallback=(affordable.length?affordable:candidates).reduce((a,b)=>b.speed<a.speed?b:a);
  const chosen = best || fallback;
  return {brakeHeight:chosen.trigger, predictedSpeed:chosen.complete?chosen.speed:null,
    predictedGas:chosen.complete?chosen.gasUsed:null,
    predictedTouchdownGas:chosen.complete?chosen.touchdownGasUsed:null,
    profile:'brake',minimumCoastTime,feasible:!!best, coastOnly:false};
}
