import {nozzle, ATMOSPHERE} from './physics.js?v=20261111-calibration1';

const G = 1.4, R = 287, STEP = .002;
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
    const acceleration = economyAcceleration(gap, velocity, target, g, tau, profile);
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
    const requested=(dryMass+gas)*Math.max(0,g+economyAcceleration(gap,velocity,target,g,tau,profile));
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

/** Feedback requests acceleration; only PhysicsSim applies forces and motion. */
export function economyAcceleration(gap, velocity, target, gravity, valveTau, profile='brake') {
  const futureGap = Math.max(.015, gap + velocity * Math.max(.001, valveTau) * 2);
  if(profile==='gentle'){
    const approachSpeed=Math.sqrt(target*target+4*futureGap);
    const desired=-Math.min(2.5,approachSpeed);
    const feedForward=approachSpeed<2.5?-2*velocity/approachSpeed:0;
    return clamp(feedForward+6*(desired-velocity),-gravity,1.1*gravity);
  }
  const needed = .5*(velocity/futureGap)*velocity-.5*target*target/futureGap;
  return clamp(velocity < -target ? needed : 5 * (-target - velocity), -gravity, 1.1 * gravity);
}

export function planEconomyLanding(sim, height, targetSpeed) {
  const p = sim.params, s = sim.state;
  const initial = {height:Math.max(0, height), gravity:p.gravity, dryMass:p.dryMass,
    tankVolume:p.tankVolume, valveTau:p.valveTau, feedLossCoefficient:Math.max(0,p.feedLossCoefficient),
    gas:s.gas, temperature:s.temp, pressure:s.pressure,
    area:sim.thrusters.slice(0,4).reduce((sum,t)=>sum+t.area,0)};
  const freeSpeed = Math.sqrt(initial.height)*Math.sqrt(2*initial.gravity);
  if (height <= 0 || freeSpeed <= targetSpeed) return {brakeHeight:0, predictedSpeed:freeSpeed, predictedGas:0, feasible:true, coastOnly:true};
  const full = nozzle(initial.pressure, initial.temperature, initial.area);
  if (full.force <= 0 || initial.gas <= 0) return {brakeHeight:0, predictedSpeed:freeSpeed, predictedGas:0, feasible:false, coastOnly:true};
  const acceptable = p => p.complete && p.speed <= targetSpeed + .025;
  let best = null, previousTrigger = 0, bracket = null;
  const candidates=[];
  // Scan a bounded set first: finite tanks can make the outcome non-monotone.
  for (let i = 1; i <= 12; i++) {
    const trigger = initial.height * (i / 12);
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
  candidates.push(gentle);
  if(acceptable(gentle)&&(!best||gentle.gasUsed<best.gasUsed))best=gentle;
  // When pressure/mass cannot meet the requested speed, do not spend more gas
  // than gentle descent chasing a tiny further speed reduction. Prefer its
  // lower-speed alternatives within the same forecast gas budget.
  const affordable=candidates.filter(p=>p.complete&&p.gasUsed<=gentle.gasUsed+1e-8);
  const fallback=(affordable.length?affordable:candidates).reduce((a,b)=>b.speed<a.speed?b:a);
  const chosen = best || fallback;
  return {brakeHeight:chosen.trigger, predictedSpeed:chosen.complete?chosen.speed:null,
    predictedGas:chosen.complete?chosen.gasUsed:null,
    predictedTouchdownGas:chosen.complete?chosen.touchdownGasUsed:null,
    profile:chosen.profile,feasible:!!best, coastOnly:false};
}
