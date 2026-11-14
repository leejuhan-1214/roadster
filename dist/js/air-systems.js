/** Educational air-system assumptions, not measured Tesla hardware specifications.
 * Compressor: four equal-ratio stages with ideal intercooling/aftercooling to
 * ambient temperature. Each stage uses isentropic work divided by efficiency.
 * Tank: rigid, well mixed ideal gas, inlet enthalpy and finite wall heat transfer.
 * Fan: bounded pressure differential over sealed area; fan affinity law gives
 * pressure proportional to power^(2/3). Leaking ground seal reduces pressure.
 */
export const AIR_SYSTEM_DEFAULTS = Object.freeze({
  compressorPowerKW:300, compressorEfficiency:.65, compressorMaxFlowKgS:.5,
  compressorStages:4, ambientTemperature:300, tankCoolingWPerK:200,
  activeTankCoolingWPerK:1500, activeTankCoolingMaxKW:40, compressorCoolingPowerKW:5, compressorTargetFraction:.99,
  fanPowerKW:80, fanArea:2.2, fanEfficiency:.65, batteryMaxDischargeKW:800,
});
export const AIR_R=287, AIR_GAMMA=1.4, AIR_CV=AIR_R/(AIR_GAMMA-1), AIR_CP=AIR_CV*AIR_GAMMA, AIR_AMBIENT_PA=101325;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const numeric=(x,fallback,a=0,b=Infinity)=>clamp(Number.isFinite(Number(x))?Number(x):fallback,a,b);

export function compressorSpecificWork(pressure,params={}){
  const t=numeric(params.ambientTemperature,300,150,500);
  const eta=numeric(params.compressorEfficiency,.65,.05,1);
  const n=numeric(params.compressorStages,4,1,12);
  // Small intake/filter overhead keeps powered filling finite near ambient.
  const ratio=Math.max(1.01,pressure/AIR_AMBIENT_PA);
  return n*AIR_CP*t*(ratio**((AIR_GAMMA-1)/(AIR_GAMMA*n))-1)/eta;
}

/** A single parked refill step. No external mutation; caller accounts for intake
 * momentum and shared battery budget. Cooling is part of this explicitly enabled
 * refill process, so inactive closed-tank blowdown experiments remain unchanged.
 */
export function rechargeAirTank(state,params,dt,{enabled=false,blockReason=null,capacityKg=Infinity,powerBudgetW=Infinity}={}){
  const empty={addedKg:0,powerW:0,compressionPowerW:0,coolingPowerW:0,inletEnthalpyJ:0,tankHeatOutJ:0,aftercoolerHeatJ:0,
    gas:state.gas,temp:state.temp,pressure:state.pressure,status:'off'};
  if(!enabled||!(dt>0))return empty;
  if(blockReason)return {...empty,status:blockReason};
  if(state.gas>=capacityKg-1e-10)return {...empty,status:'full'};
  const targetFraction=numeric(params.compressorTargetFraction,.99,.5,1),targetKg=capacityKg*targetFraction;
  // The operational cut-off leaves a declared one-percent reserve instead of
  // pretending that an asymptotic, ambient-temperature 100% fill takes finite time.
  if(state.gas>=targetKg-1e-10)return {...empty,status:'ready'};
  const battery=Math.max(0,state.batteryJ||0),rated=numeric(params.compressorPowerKW,300)*1000;
  if(!(battery>1e-8)||!(powerBudgetW>0)||!(rated>0))return {...empty,status:'battery'};
  const volume=numeric(params.tankVolume,.6,.02,2),ambient=numeric(params.ambientTemperature,300,150,500);
  const pressureLimit=numeric(params.tankPressureMPa,35.875,.101325,80)*1e6;
  const auxiliaryRated=numeric(params.compressorCoolingPowerKW,5)*1000;
  const inputBudget=Math.min(battery/dt,powerBudgetW,rated+auxiliaryRated);
  // Pumps/fans share the same finite battery budget. With a low power allowance
  // both systems derate, so a tiny remaining battery cannot provide free cooling.
  const auxiliaryPower=inputBudget*auxiliaryRated/(rated+auxiliaryRated);
  const compressionBudget=(inputBudget-auxiliaryPower)*dt;
  const coolingScale=auxiliaryRated>0?auxiliaryPower/auxiliaryRated:0;
  const oldU=state.gas*AIR_CV*state.temp,heatCapacity=state.gas*AIR_CV;
  const passive=numeric(params.tankCoolingWPerK,200);
  const passiveHeat=heatCapacity>0?(state.temp-ambient)*heatCapacity*(1-Math.exp(-passive*dt/heatCapacity)):0;
  const passivelyCooledU=oldU-passiveHeat;
  const active=numeric(params.activeTankCoolingWPerK,1500)*coolingScale;
  const activeHeat=heatCapacity>0?Math.min(Math.max(0,passivelyCooledU-heatCapacity*ambient)*(1-Math.exp(-active*dt/heatCapacity)),numeric(params.activeTankCoolingMaxKW,40)*1000*coolingScale*dt):0;
  const heatOut=passiveHeat+activeHeat,cooledU=oldU-heatOut;
  const maxPressureU=pressureLimit*volume/(AIR_GAMMA-1);
  const requestedMass=Math.max(0,Math.min(targetKg-state.gas,numeric(params.compressorMaxFlowKgS,.5)*dt));
  const pressureMass=Math.max(0,(maxPressureU-cooledU)/(AIR_CP*ambient));
  const maxAdded=Math.min(requestedMass,pressureMass);
  // End-pressure work is conservative quadrature: compression work is never
  // understated as the receiving tank pressure rises during the step.
  const workFor=dm=>dm*compressorSpecificWork((AIR_GAMMA-1)*(cooledU+dm*AIR_CP*ambient)/volume,params);
  let lo=0,hi=maxAdded;
  if(workFor(hi)>compressionBudget)for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(workFor(mid)<=compressionBudget)lo=mid;else hi=mid;}
  else lo=hi;
  const addedKg=lo,energy=workFor(addedKg),inletEnthalpyJ=addedKg*AIR_CP*ambient;
  const gas=state.gas+addedKg,newU=cooledU+inletEnthalpyJ;
  const status=gas>=targetKg-1e-10?'ready':pressureMass<requestedMass*.999?'cooling':'charging';
  return {addedKg,powerW:energy/dt+auxiliaryPower,compressionPowerW:energy/dt,coolingPowerW:auxiliaryPower,
    inletEnthalpyJ,tankHeatOutJ:heatOut,aftercoolerHeatJ:energy,gas,temp:gas>0?newU/(gas*AIR_CV):ambient,
    pressure:(AIR_GAMMA-1)*newU/volume,status};
}

/** Prediction only. Uses the same mass, heat, pressure and battery equations as
 * live filling; no live state is changed and no simulation-time scaling occurs.
 * UI callers should cache this estimate (about once per two simulation seconds).
 */
export function estimateRecharge(state,params,{capacityKg,powerBudgetW=Infinity,targetFraction=params.compressorTargetFraction??.99,stepSeconds=2,maxSeconds=14400}={}){
  const fraction=numeric(targetFraction,.99,.5,1),targetKg=capacityKg*fraction;
  const result={seconds:null,energyJ:null,targetFraction:fraction,targetKg,reason:'limit'};
  if(!(capacityKg>0)||!Number.isFinite(capacityKg))return result;
  if(state.gas>=targetKg-1e-10)return {...result,seconds:0,energyJ:0,reason:'ready'};
  const p={...params,compressorTargetFraction:fraction},dt=numeric(stepSeconds,2,.05,10);
  let next={gas:state.gas,temp:state.temp,pressure:state.pressure,batteryJ:state.batteryJ},elapsed=0,energy=0;
  while(elapsed<maxSeconds){
    const h=Math.min(dt,maxSeconds-elapsed),r=rechargeAirTank(next,p,h,{enabled:true,capacityKg,powerBudgetW});
    if(r.status==='battery')return {...result,reason:'battery',energyJ:energy};
    next={gas:r.gas,temp:r.temp,pressure:r.pressure,batteryJ:Math.max(0,next.batteryJ-r.powerW*h)};
    elapsed+=h;energy+=r.powerW*h;
    if(next.gas>=targetKg-1e-10)return {...result,seconds:elapsed,energyJ:energy,reason:'ready'};
    if(r.addedKg<=1e-12&&Math.abs(r.tankHeatOutJ)<=1e-9)return {...result,reason:'blocked',energyJ:energy};
  }
  return {...result,energyJ:energy};
}

export function poweredGroundFan({enabled=false,clearance=0,upY=1,batteryJ=0,dt=.002,powerBudgetW=Infinity},params={}){
  const none={forceN:0,powerW:0,pressurePa:0,airflowM3S:0,seal:0};
  if(!enabled||!(dt>0)||!(batteryJ>0)||clearance>=.6||!(upY>.5))return none;
  const rated=numeric(params.fanPowerKW,80)*1000;
  const powerW=Math.max(0,Math.min(rated,batteryJ/dt,powerBudgetW));
  if(!(rated>0)||!(powerW>0))return none;
  const area=numeric(params.fanArea,2.2,.1,20),eta=numeric(params.fanEfficiency,.65,.05,1);
  const ratedPressure=Math.min(numeric(params.fanMaxForce,18000)/area,.9*AIR_AMBIENT_PA);
  const seal=Math.exp(-Math.max(0,clearance)/.10)*clamp(upY,0,1)**6;
  const pressurePa=ratedPressure*(powerW/rated)**(2/3)*seal;
  // With an open seal most shaft power circulates air without useful underbody
  // suction. Airflow is nominal duct flow, not tank/nozzle mass flow.
  const airflowM3S=ratedPressure>0?eta*powerW/(ratedPressure*(powerW/rated)**(2/3)):0;
  return {forceN:pressurePa*area,powerW,pressurePa,airflowM3S,seal};
}
