// Source-bounded valve + convergent nozzle in series. Pressures are absolute Pa.
// Bürkert fluid calculator: Kv [m³/h], Qn [m³/h] at 0 °C / 1013 hPa.
// This empirical ideal-gas sizing correlation is not a real-gas flow calibration.
// See docs/v143-hardware-sources.md for ratings, assumptions and validity limits.
const positive=(value,fallback)=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):fallback;

export function valveMassFlow(inletPa,outletPa,temperature,kv=2.2,normalDensity=1.293){
  if(!(inletPa>outletPa)||!(outletPa>=0)||!(temperature>0)||!(kv>0)||!(normalDensity>0))return 0;
  const p1=inletPa/1e5,p2=outletPa/1e5;
  const qn=p2<=p1/2
    ?257*kv*p1/Math.sqrt(normalDensity*temperature)
    :514*kv*Math.sqrt((p1-p2)*p2/(normalDensity*temperature));
  return qn*normalDensity/3600;
}

/** A single rated valve feeds each nozzle. `nozzleFn` has the PhysicsSim nozzle
 * signature. Match pressure, not only mass flow: clipping mdot while retaining
 * full tank-pressure thrust would violate the serial flow path.
 * The valve stagnation temperature is kept equal to tank temperature (ideal
 * throttling approximation). A measured real-gas valve/nozzle map is unavailable.
 */
export function meteredNozzle(pressure,temperature,area,ambient,params={},nozzleFn){
  if(typeof nozzleFn!=='function')throw new TypeError('A nozzle function is required.');
  const ambientPa=positive(ambient,101325),ratingPa=positive(params.maxPressureMPa,25.101325)*1e6;
  const kv=Number.isFinite(Number(params.valveKv))?Math.max(0,Number(params.valveKv)):2.2;
  const rhoN=positive(params.valveNormalDensity,1.293);
  const cd=Number.isFinite(Number(params.nozzleDischargeCoefficient))?Math.min(1,Math.max(0,Number(params.nozzleDischargeCoefficient))):1;
  const throat=area*cd;
  const off=reason=>({...nozzleFn(ambientPa,temperature,Math.max(0,throat),ambientPa),
    regime:reason,inletPressure:pressure,nozzlePressure:ambientPa,valvePressureDrop:Math.max(0,pressure-ambientPa),valveMassFlow:0,valveKv:kv});
  if(![pressure,temperature,throat].every(Number.isFinite)||!(pressure>ambientPa)||!(temperature>0)||!(throat>0)||!(kv>0))return off('off');
  // A valve rating does not act as a lossless pressure regulator.
  if(pressure>ratingPa*(1+1e-9))return off('pressure-limit');
  const flowAt=p=>valveMassFlow(pressure,p,temperature,kv,rhoN);
  const full=nozzleFn(pressure,temperature,throat,ambientPa),capacity=flowAt(ambientPa);
  let downstream=pressure*capacity/full.mdot;
  // For a choked nozzle mdot is linear in stagnation pressure. When the valve
  // is also choked, this is the exact pressure match and avoids iterative work.
  let result=downstream>ambientPa&&downstream<=pressure*.5
    ?nozzleFn(downstream,temperature,throat,ambientPa):null;
  if(!result||result.regime!=='choked'){
    let low=ambientPa,high=pressure;
    for(let i=0;i<28;i++){
      const mid=(low+high)/2;
      if(flowAt(mid)>nozzleFn(mid,temperature,throat,ambientPa).mdot)low=mid;
      else high=mid;
    }
    downstream=(low+high)/2;
    result=nozzleFn(downstream,temperature,throat,ambientPa);
  }
  return {...result,inletPressure:pressure,nozzlePressure:downstream,
    valvePressureDrop:pressure-downstream,valveMassFlow:flowAt(downstream),valveKv:kv};
}
