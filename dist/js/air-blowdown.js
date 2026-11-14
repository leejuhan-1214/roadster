import {AIR_CV,AIR_AMBIENT_PA,gasProperties,gasTemperature,exchangeTankHeat} from './air-systems.js?v=20261115-calibrated1';
/** Finite rigid-tank outflow. Midpoint enthalpy advances tank energy; the
 * accepted gas mass is returned so force/impulse can use the same mass.
 * Reference hardware has a declared minimum medium operating temperature.
 * Reaching that limit closes delivery; it never reheats or refills the tank.
 */
export function advanceAirDischarge(state,params,requestedKg,dt,{heat:enableHeat=true}={}){
 const volume=params.tankVolume,m0=Math.max(0,state.gas),legacy=params.realGas!==true;
 const heat=!enableHeat||(legacy&&!params.calibratedHardware)?{...state,tankHeatOutJ:0,ambientHeatOutJ:0}:exchangeTankHeat(state,params,dt);
 const t0=heat.temp,U0=m0*gasProperties(m0,volume,t0,params).u;
 const request=Math.max(0,Math.min(requestedKg,m0*(1-1e-12))),minT=params.minimumGasTemperatureK??params.minimumGasOperatingTemperature??263.15;
 const restartDelta=params.thermalRestartDeltaK??params.thermalRestartDelta??2,latched=!legacy&&((state.thermalLimited&&t0<minT+restartDelta)||t0<=minT);
 const base={gas:m0,temp:t0,pressure:heat.pressure,tankWallTemp:heat.tankWallTemp,tankHeatOutJ:heat.tankHeatOutJ,ambientHeatOutJ:heat.ambientHeatOutJ,
  removedKg:0,removedRatio:requestedKg>0?0:1,expelledEnthalpyJ:0,thermalLimited:!!latched};
 if(!(request>0)||!(m0>1e-12)||heat.pressure<=AIR_AMBIENT_PA)return base;
 if(legacy){
  const removable=m0*(1-(AIR_AMBIENT_PA/heat.pressure)**(1/1.4)),accepted=Math.min(request,removable);
  const gas=m0-accepted,temp=t0*(gas/m0)**.4,pressure=gasProperties(gas,volume,temp,params).pressure;
  return {...base,gas,temp,pressure,removedKg:accepted,removedRatio:accepted/requestedKg,expelledEnthalpyJ:U0-gas*AIR_CV*temp};
 }
 if(latched)return base;
 const floorResidual=dm=>{
  const gas=m0-dm,midMass=m0-dm/2,h=gasProperties(midMass,volume,(t0+minT)/2,params).h;
  return gas*gasProperties(gas,volume,minT,params).u+dm*h-U0;
 };
 let dm=request,thermalLimited=false;
 if(floorResidual(dm)>0){
  thermalLimited=true;let lo=0,hi=dm,flo=floorResidual(0),fhi=floorResidual(dm);
  for(let i=0;i<16&&hi-lo>1e-12;i++){
   let mid=lo+(hi-lo)*(-flo)/(fhi-flo);if(!(mid>lo&&mid<hi))mid=(lo+hi)/2;
   const f=floorResidual(mid);if(f<=0){lo=mid;flo=f;if(Math.abs(f)<1e-7)break;}else{hi=mid;fhi=f;}
  }
  dm=lo;
 }
 const trial=removed=>{
  const gas=m0-removed;let temp=Math.max(minT,t0*(gas/m0)**.4);
  for(let i=0;i<12;i++){
   const h=gasProperties((m0+gas)/2,volume,(t0+temp)/2,params).h;
   const next=gasTemperature(gas,volume,U0-removed*h,params,temp);
   if(Math.abs(next-temp)<1e-9){temp=next;break;}temp=next;
  }
  const properties=gasProperties(gas,volume,temp,params);return {gas,temp,pressure:properties.pressure,u:properties.u};
 };
 let result=trial(dm);
 if(result.pressure<AIR_AMBIENT_PA){
  let lo=0,hi=dm;for(let i=0;i<30;i++){const mid=(lo+hi)/2;if(trial(mid).pressure>=AIR_AMBIENT_PA)lo=mid;else hi=mid;}
  dm=lo;result=trial(dm);
 }
 const {gas,temp,pressure}=result,expelledEnthalpyJ=U0-gas*result.u;
 return {...base,gas,temp,pressure,removedKg:dm,removedRatio:dm/requestedKg,expelledEnthalpyJ,thermalLimited};
}
