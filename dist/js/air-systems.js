/** Educational air-system assumptions, not measured Tesla hardware specifications.
 * Compressor: four equal-ratio stages with ideal intercooling/aftercooling to
 * ambient temperature. Each stage uses isentropic work divided by efficiency.
 * Tank: rigid, well mixed ideal gas, inlet enthalpy and finite wall heat transfer.
 * Fan: bounded pressure differential over sealed area; fan affinity law gives
 * pressure proportional to power^(2/3). Leaking ground seal reduces pressure.
 */
export const AIR_SYSTEM_DEFAULTS = Object.freeze({
  compressorPowerKW:60, compressorEfficiency:.65, compressorMaxFlowKgS:.2,
  compressorStages:4, ambientTemperature:300, tankCoolingWPerK:200,
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
  const empty={addedKg:0,powerW:0,inletEnthalpyJ:0,tankHeatOutJ:0,aftercoolerHeatJ:0,
    gas:state.gas,temp:state.temp,pressure:state.pressure,status:'off'};
  if(!enabled||!(dt>0))return empty;
  if(blockReason)return {...empty,status:blockReason};
  const battery=Math.max(0,state.batteryJ||0),power=numeric(params.compressorPowerKW,60)*1000;
  if(!(battery>0)||!(powerBudgetW>0)||!(power>0))return {...empty,status:'battery'};
  const volume=numeric(params.tankVolume,.9,.02,2),ambient=numeric(params.ambientTemperature,300,150,500);
  const pressureLimit=numeric(params.tankPressureMPa,35.875,.101325,80)*1e6;
  if(state.gas>=capacityKg-1e-10)return {...empty,status:'full'};
  const oldU=state.gas*AIR_CV*state.temp;
  // Exact exponential relaxation with fixed pre-inlet mass avoids numerical
  // overshoot of ambient temperature even for large testing time steps.
  const cooling=numeric(params.tankCoolingWPerK,200);
  const heatOut=state.gas>0?(state.temp-ambient)*state.gas*AIR_CV*(1-Math.exp(-cooling*dt/(state.gas*AIR_CV))):0;
  const cooledU=oldU-heatOut;
  const maxPressureU=pressureLimit*volume/(AIR_GAMMA-1);
  const maxAdded=Math.max(0,Math.min(capacityKg-state.gas,(maxPressureU-cooledU)/(AIR_CP*ambient),numeric(params.compressorMaxFlowKgS,.2)*dt));
  const energyBudget=Math.min(battery,power*dt,powerBudgetW*dt);
  // End-pressure work is a conservative quadrature: it never understates the
  // compression work while pressure rises through this integration step.
  const workFor=dm=>dm*compressorSpecificWork((AIR_GAMMA-1)*(cooledU+dm*AIR_CP*ambient)/volume,params);
  let lo=0,hi=maxAdded;
  if(workFor(hi)>energyBudget)for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(workFor(mid)<=energyBudget)lo=mid;else hi=mid;}
  else lo=hi;
  const addedKg=lo,energy=workFor(addedKg),inletEnthalpyJ=addedKg*AIR_CP*ambient;
  const gas=state.gas+addedKg,newU=cooledU+inletEnthalpyJ;
  return {addedKg,powerW:energy/dt,inletEnthalpyJ,tankHeatOutJ:heatOut,
    aftercoolerHeatJ:energy,gas,temp:gas>0?newU/(gas*AIR_CV):ambient,
    pressure:(AIR_GAMMA-1)*newU/volume,status:addedKg>1e-12?'charging':'full'};
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
