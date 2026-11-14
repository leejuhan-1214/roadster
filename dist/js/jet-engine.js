/** JetCat P1000-PRO reference units in an explicitly hypothetical lift rig.
 * Source endpoints: 2025 V1.2 datasheet; spool time/start energy: 2023 manual.
 * Installation loss, interpolation, starting fuel schedule, and grouped layout
 * are modelling assumptions, not a measured aircraft/automobile installation.
 */
export const JET_RIG_MASS=Object.freeze({engines:770,ancillaries:206,total:976});
export const JET_PARAMS=Object.freeze({
 propulsionKind:'air-breathing-jet',jetEnginesPerLift:16,jetEnginesPerAux:1,
 fuelCapacityKg:150,fuelDensityKgL:.8,jetFuelLHVJkg:43e6,
 jetMaximumThrustN:1100,jetIdleThrustN:45,jetMaximumAirflowKgS:1.8,
 jetIdleRPM:19000,jetMaximumRPM:61500,
 jetIdleFuelLMin:.55,jetMaximumFuelLMin:3.2,
 jetInstallationEfficiency:.85,jetSpoolUpSeconds:5,jetSpoolDownSeconds:5,
 // 400 mAh at 12 V = 17.28 kJ. A 220 W capped starter cannot supply
 // that energy in 30 s; use the conservative energy/power lower bound.
 jetStartupSeconds:17280/220,jetStartupEnergyJ:17280,jetStarterPeakW:220,
});
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const value=(p,key)=>Number.isFinite(p?.[key])?p[key]:JET_PARAMS[key];
export const isJetProfile=p=>p?.propulsionKind==='air-breathing-jet';
export const jetEngineCount=(p,group='lift')=>Math.max(0,value(p,group==='lift'?'jetEnginesPerLift':'jetEnginesPerAux'));
export function jetDensityRatio(altitude=0){
 const h=Math.max(0,Number(altitude)||0);
 return h<=11000?Math.max(0,1-.0065*h/288.15)**4.25588:
  .2970756*Math.exp(-(h-11000)/6341.62);
}
export function createJetEngineState({idle=false}={}){
 return {phase:idle?'running':'off',spool:0,startElapsed:0,starterEnergyJ:idle?JET_PARAMS.jetStartupEnergyJ:0};
}
export function jetNozzle(p={},group='lift',{densityRatio=1,axialSpeed=0}={}){
 const count=jetEngineCount(p,group),rho=clamp(densityRatio,0,1.2);
 const gross=value(p,'jetMaximumThrustN')*value(p,'jetInstallationEfficiency')*rho*count;
 const air=value(p,'jetMaximumAirflowKgS')*rho*count;
 const fuel=value(p,'jetMaximumFuelLMin')*value(p,'fuelDensityKgL')/60*count;
 const force=gross-air*axialSpeed;
 return {force,mdot:fuel,ve:air+fuel>0?gross/(air+fuel):0,pe:101325,
  regime:'air-breathing-jet',effectiveVelocity:fuel>0?force/fuel:0,
  grossThrustN:gross,airMassFlowKgS:air,engineCount:count};
}

/** Pure per-group step shared by actual dynamics and landing prediction.
 * Incoming atmospheric air passes through: it is never added to stored fuel.
 * Gross exhaust momentum is reduced by air intake momentum ONCE. The returned
 * scalar force uses axialSpeed; 3-D callers may apply the returned gross force
 * and full intake-velocity vector instead. Only fuel is vehicle mass loss.
 * fuel cutoff extinguishes thrust; rotor spin-down is retained and a restart
 * must complete the normal start sequence. Residual hot-gas thrust is omitted.
 */
export function advanceJetEngine(previous,p={},command=0,dt=0,options={}){
 const state={...createJetEngineState(),...previous};
 const seconds=Math.max(0,Number(dt)||0),count=Math.max(0,options.engineCount??1);
 const rho=clamp(options.densityRatio??1,0,1.2),axial=Number(options.axialSpeed)||0;
 const enabled=!!options.enabled&&!options.cutoff;
 const availableFuel=Math.max(0,options.fuelAvailableKg??Infinity);
 const availableBattery=Math.max(0,options.batteryAvailableJ??Infinity);
 const powerBudget=Math.max(0,options.powerBudgetW??Infinity);
 const fMax=value(p,'jetMaximumThrustN'),fIdle=value(p,'jetIdleThrustN');
 const efficiency=clamp(value(p,'jetInstallationEfficiency'),0,1);
 const idleFlow=value(p,'jetIdleFuelLMin')*value(p,'fuelDensityKgL')/60;
 const fullFlow=value(p,'jetMaximumFuelLMin')*value(p,'fuelDensityKgL')/60;
 const startJ=Math.max(0,value(p,'jetStartupEnergyJ'));
 const startPower=Math.max(0,value(p,'jetStarterPeakW'));
 const startSeconds=Math.max(value(p,'jetStartupSeconds'),startPower>0?startJ/startPower:Infinity);
 let starterEnergyJ=0,grossThrustN=0,airMassFlowKgS=0,fuelFlowKgS=0;
 if(!enabled||availableFuel<=0){
  state.phase=state.spool>0?'stopping':'off';
  state.spool=Math.max(0,state.spool-seconds/Math.max(.001,value(p,'jetSpoolDownSeconds')));
  if(state.spool<=0)state.phase='off';
  state.startElapsed=0;state.starterEnergyJ=0;
 }else{
  if(state.phase==='off'||state.phase==='stopping'){
   state.phase='starting';state.spool=0;state.startElapsed=0;state.starterEnergyJ=0;
  }
  if(state.phase==='starting'){
   const remaining=Math.max(0,startJ-state.starterEnergyJ)*count;
   starterEnergyJ=Math.min(remaining,availableBattery,powerBudget*seconds,startPower*count*seconds);
   state.starterEnergyJ+=count>0?starterEnergyJ/count:0;
   const progress=Math.min(1,state.starterEnergyJ/Math.max(1,startJ));
   state.startElapsed+=seconds;
   // Starting airflow follows the assumed starter-driven RPM ramp. This is
   // through-flow, never a store that can later be refilled or discharged.
   airMassFlowKgS=count*value(p,'jetMaximumAirflowKgS')*value(p,'jetIdleRPM')/value(p,'jetMaximumRPM')*progress*rho;
   // Assumed ignition schedule: no fuel in the first half of the start cycle,
   // then a linear ramp to idle. Start time/energy constraints remain explicit.
   fuelFlowKgS=count*idleFlow*clamp(2*progress-1,0,1);
   if(state.startElapsed+1e-9>=startSeconds&&state.starterEnergyJ+1e-6>=startJ){
    state.phase='running';state.spool=0;
   }
  }else if(state.phase==='running'){
   const requested=clamp(command,0,1);
   const target=clamp((requested*fMax-fIdle)/Math.max(1,fMax-fIdle),0,1);
   const before=clamp(state.spool,0,1),limit=seconds/Math.max(.001,value(p,target>before?'jetSpoolUpSeconds':'jetSpoolDownSeconds'));
   state.spool=before+clamp(target-before,-limit,limit);
   const mid=(before+state.spool)/2;
   grossThrustN=count*(fIdle+(fMax-fIdle)*mid)*efficiency*rho;
   const rpmRatio=(value(p,'jetIdleRPM')+(value(p,'jetMaximumRPM')-value(p,'jetIdleRPM'))*mid)/value(p,'jetMaximumRPM');
   airMassFlowKgS=count*value(p,'jetMaximumAirflowKgS')*rpmRatio*rho;
   fuelFlowKgS=count*(idleFlow+(fullFlow-idleFlow)*mid);
  }
 }
 const requestedFuel=fuelFlowKgS*seconds,fuelUsedKg=Math.min(availableFuel,requestedFuel);
 const fraction=requestedFuel>0?fuelUsedKg/requestedFuel:1;
 grossThrustN*=fraction;airMassFlowKgS*=fraction;fuelFlowKgS*=fraction;
 if(fraction<1){state.phase='stopping';state.startElapsed=0;state.starterEnergyJ=0;}
 const ramDragN=airMassFlowKgS*axial,forceN=grossThrustN-ramDragN;
 const exhaustMassFlowKgS=airMassFlowKgS+fuelFlowKgS;
 const running=state.phase==='running';
 const rpm=running?value(p,'jetIdleRPM')+(value(p,'jetMaximumRPM')-value(p,'jetIdleRPM'))*state.spool:
  state.phase==='starting'?value(p,'jetIdleRPM')*Math.min(1,state.starterEnergyJ/Math.max(1,startJ)):
  value(p,'jetMaximumRPM')*state.spool;
 return {state,forceN,grossThrustN,ramDragN,fuelUsedKg,fuelFlowKgS,airMassFlowKgS,exhaustMassFlowKgS,
  exhaustVelocityMps:exhaustMassFlowKgS>0?grossThrustN/exhaustMassFlowKgS:0,
  chemicalEnergyJ:fuelUsedKg*value(p,'jetFuelLHVJkg'),starterEnergyJ,
  starterPowerW:seconds>0?starterEnergyJ/seconds:0,rpm,running,
  opening:running?(fIdle+(fMax-fIdle)*state.spool)/fMax:0};
}
