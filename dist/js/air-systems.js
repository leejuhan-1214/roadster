import {airState,airDensity,airTemperature} from './air-eos.js?v=20261115-calibrated1';
/** Reference refill station: BAUER PE300-TE (300 L/min FAD, 7.5 kW,
 * 3 stages, maximum330bar). It is an external stationary source, not a
 * fictitious300kW vehicle-mounted compressor. See docs/v143-air-calibration.md.
 */
export const AIR_SYSTEM_DEFAULTS=Object.freeze({
 realGas:true, compressorExternalPower:true, compressorPowerKW:7.5,
 compressorEfficiency:.65,compressorFreeAirLMin:300,compressorMaxFlowKgS:.0061,
 compressorStages:3,ambientTemperature:293.15,aftercoolerApproachK:10,
 tankWallHeatCapacityJK:46080,tankGasWallWPerK:80,tankWallAmbientWPerK:30,
 tankCoolingWPerK:30,activeTankCoolingWPerK:0,activeTankCoolingMaxKW:0,compressorCoolingPowerKW:0,
 compressorTargetFraction:.99,fanPowerKW:80,fanArea:2.2,fanEfficiency:.65,batteryMaxDischargeKW:800,
});
export const AIR_R=287,AIR_GAMMA=1.4,AIR_CV=AIR_R/(AIR_GAMMA-1),AIR_CP=AIR_CV*AIR_GAMMA,AIR_AMBIENT_PA=101325;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const numeric=(x,fallback,a=0,b=Infinity)=>clamp(Number.isFinite(Number(x))?Number(x):fallback,a,b);
export function gasProperties(gas,volume,temp,params={}){
 if(params.realGas===true&&gas>1e-12)return airState(gas/volume,temp);
 return {pressure:gas*AIR_R*temp/volume,u:AIR_CV*temp,h:AIR_CP*temp,cv:AIR_CV,cp:AIR_CP,z:1};
}
export function gasTemperature(gas,volume,totalU,params={},guess=293.15){
 if(!(gas>1e-12))return numeric(params.ambientTemperature,293.15);
 return params.realGas===true?airTemperature(gas/volume,totalU/gas,guess):totalU/(gas*AIR_CV);
}
export function nominalAirMass(params){
 const p=numeric(params.tankPressureMPa,25.101325)*1e6,t=numeric(params.initialTemperature,293.15),v=numeric(params.tankVolume,.108);
 return v*(params.realGas===true?airDensity(p,t):p/(AIR_R*t));
}
/** Two finite thermal stores. Positive tankHeatOutJ leaves gas and enters wall;
 * ambientHeatOutJ leaves the wall. No below-ambient forced cooling or free heat.
 * The coefficients are declared sensitivity assumptions, not cylinder test data.
 */
export function exchangeTankHeat(state,params,dt){
 const v=numeric(params.tankVolume,.108,.001,2),ambient=numeric(params.ambientTemperature,293.15,150,500);
 const initial=gasProperties(state.gas,v,state.temp,params),wallC=numeric(params.tankWallHeatCapacityJK,46080);
 const oldWall=Number.isFinite(state.tankWallTemp)?state.tankWallTemp:ambient;
 const gasC=Math.max(1e-9,state.gas*initial.cv),u0=state.gas*initial.u;
 let gasHeat=0,ambientHeat=0,wallTemp=oldWall;
 if(wallC>0&&state.gas>1e-12){
  const reduced=gasC*wallC/(gasC+wallC),ua=numeric(params.tankGasWallWPerK,80);
  gasHeat=(state.temp-oldWall)*reduced*(-Math.expm1(-ua*dt/reduced));
  wallTemp=oldWall+gasHeat/wallC;
  ambientHeat=(wallTemp-ambient)*wallC*(-Math.expm1(-numeric(params.tankWallAmbientWPerK,30)*dt/wallC));
  wallTemp-=ambientHeat/wallC;
 }else if(state.gas>1e-12){
  gasHeat=(state.temp-ambient)*gasC*(-Math.expm1(-numeric(params.tankCoolingWPerK,30)*dt/gasC));ambientHeat=gasHeat;
 }
 const temp=gasTemperature(state.gas,v,u0-gasHeat,params,state.temp),end=gasProperties(state.gas,v,temp,params);
 const exactGasHeat=u0-state.gas*end.u;
 if(wallC>0)wallTemp+=(exactGasHeat-gasHeat)/wallC;else ambientHeat=exactGasHeat;
 return {gas:state.gas,temp,pressure:end.pressure,tankWallTemp:wallTemp,tankHeatOutJ:exactGasHeat,ambientHeatOutJ:ambientHeat,wallEnergyJ:wallC*wallTemp};
}
export function compressorSpecificWork(pressure,params={}){
 const t=numeric(params.ambientTemperature,293.15,150,500),eta=numeric(params.compressorEfficiency,.65,.05,1),n=numeric(params.compressorStages,3,1,12);
 const ratio=Math.max(1.01,pressure/AIR_AMBIENT_PA);
 return n*AIR_CP*t*(ratio**((AIR_GAMMA-1)/(AIR_GAMMA*n))-1)/eta;
}
export function rechargeAirTank(state,params,dt,{enabled=false,blockReason=null,capacityKg=Infinity,powerBudgetW=Infinity}={}){
 const ambient=numeric(params.ambientTemperature,293.15,150,500);
 const empty={heatAdvanced:false,addedKg:0,powerW:0,batteryPowerW:0,externalPowerW:0,compressionPowerW:0,coolingPowerW:0,inletEnthalpyJ:0,tankHeatOutJ:0,ambientHeatOutJ:0,aftercoolerHeatJ:0,
  gas:state.gas,temp:state.temp,pressure:state.pressure,tankWallTemp:state.tankWallTemp??ambient,status:'off'};
 if(!enabled||!(dt>0))return empty;if(blockReason)return {...empty,status:blockReason};
 if(state.gas>=capacityKg-1e-10)return {...empty,status:'full'};
 const targetFraction=numeric(params.compressorTargetFraction,.99,.5,1),targetKg=capacityKg*targetFraction;
 if(state.gas>=targetKg-1e-10)return {...empty,status:'ready'};
 const external=params.compressorExternalPower===true,rated=numeric(params.compressorPowerKW,7.5)*1000;
 const budget=external?rated:Math.min(rated,Math.max(0,state.batteryJ||0)/dt,powerBudgetW);
 if(!(budget>1e-8)||!(rated>0))return {...empty,status:'battery'};
 const volume=numeric(params.tankVolume,.108,.001,2),pressureLimit=numeric(params.tankPressureMPa,25.101325,.101325,80)*1e6;
 const cooled=exchangeTankHeat(state,params,dt),cooledU=cooled.gas*gasProperties(cooled.gas,volume,cooled.temp,params).u;
 const ambientDensity=params.realGas===true?airDensity(AIR_AMBIENT_PA,ambient):AIR_AMBIENT_PA/(AIR_R*ambient);
 const nominalFlow=Math.min(numeric(params.compressorMaxFlowKgS,.0061),numeric(params.compressorFreeAirLMin,300)*1e-3/60*ambientDensity);
 const nominalMass=Math.max(0,Math.min(targetKg-state.gas,nominalFlow*dt*budget/rated));
 const requestedMass=Math.min(nominalMass,budget*dt/compressorSpecificWork(pressureLimit,params));
 const inletTemp=ambient+numeric(params.aftercoolerApproachK,10,0,50),inletPressure=Math.max(AIR_AMBIENT_PA,cooled.pressure);
 const inletH=params.realGas===true?airState(airDensity(inletPressure,inletTemp),inletTemp).h:AIR_CP*inletTemp;
 const trial=dm=>{const gas=state.gas+dm,U=cooledU+dm*inletH,temp=gasTemperature(gas,volume,U,params,cooled.temp);return {gas,temp,pressure:gasProperties(gas,volume,temp,params).pressure};};
 let addedKg=requestedMass,end=trial(addedKg),pressureLimited=false;
 if(end.pressure>pressureLimit){
  pressureLimited=true;let lo=0,hi=addedKg,plo=cooled.pressure,phi=end.pressure;
  if(cooled.pressure>=pressureLimit)hi=0;
  // Safeguarded secant reaches the small pressure-cap correction in a few
  // evaluations; bisection is retained if the secant hugs a bracket edge.
  for(let i=0;i<12&&hi-lo>1e-12;i++){
   let mid=lo+(hi-lo)*(pressureLimit-plo)/(phi-plo);
   if(!(mid>lo&&mid<hi))mid=(lo+hi)/2;
   const pm=trial(mid).pressure;
   if(pm<=pressureLimit){lo=mid;plo=pm;if(pressureLimit-pm<.001)break;}else{hi=mid;phi=pm;}
  }
  addedKg=lo;end=trial(addedKg);
 }
 // The motor nameplate bounds input; pressure-limited stop/start is represented
 // by duty fraction. This is a conservative energy estimate, not a measured map.
 const energy=nominalFlow>0?addedKg/nominalFlow*rated:0,powerW=energy/dt;
 const inletEnthalpyJ=addedKg*inletH;
 const intakeH=params.realGas===true?airState(ambientDensity,ambient).h:AIR_CP*ambient;
 const rejected=energy+addedKg*intakeH-inletEnthalpyJ;
 const status=end.gas>=targetKg-1e-10?'ready':pressureLimited?'cooling':'charging';
 return {...empty,...end,heatAdvanced:true,addedKg,powerW,batteryPowerW:external?0:powerW,externalPowerW:external?powerW:0,compressionPowerW:powerW,
  inletEnthalpyJ,tankHeatOutJ:cooled.tankHeatOutJ,ambientHeatOutJ:cooled.ambientHeatOutJ,tankWallTemp:cooled.tankWallTemp,
  aftercoolerHeatJ:rejected,status};
}
/** Same live mass/energy equations on a copy. A coarse 30s integration is used
 * for UI estimates; the audit compares against a0.1s fill and reports error.
 */
export function estimateRecharge(state,params,{capacityKg,powerBudgetW=Infinity,targetFraction=params.compressorTargetFraction??.99,stepSeconds=30,maxSeconds=28800}={}){
 const fraction=numeric(targetFraction,.99,.5,1),targetKg=capacityKg*fraction;
 const result={seconds:null,energyJ:null,targetFraction:fraction,targetKg,reason:'limit'};
 if(!(capacityKg>0)||!Number.isFinite(capacityKg))return result;
 if(state.gas>=targetKg-1e-10)return {...result,seconds:0,energyJ:0,reason:'ready'};
 const p={...params,compressorTargetFraction:fraction},dt=numeric(stepSeconds,30,.05,30);
 let next={...state},elapsed=0,energy=0;
 while(elapsed<maxSeconds){
  const h=Math.min(dt,maxSeconds-elapsed),r=rechargeAirTank(next,p,h,{enabled:true,capacityKg,powerBudgetW});
  if(r.status==='battery')return {...result,reason:'battery',energyJ:energy};
  next={gas:r.gas,temp:r.temp,pressure:r.pressure,tankWallTemp:r.tankWallTemp,batteryJ:Math.max(0,(next.batteryJ||0)-r.batteryPowerW*h)};
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
