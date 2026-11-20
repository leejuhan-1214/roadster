import {ATMOSPHERE,nozzle} from './air-nozzle.js?v=20261118-audit148';
import {LANDING_STEP,landingClearance,recordLandingRelease,releaseLandingVehicle} from './landing-experiment.js?v=20261120-basemass';
import {economyInitialState,measureEconomyPlan} from './landing-economy.js?v=20261120-basemass';

export const STUDY_HOVER_SECONDS=1;

// Start the timed window already hovering: four level, balanced jets carry
// the weight. Solve the initial flow and line pressure together. No ascent
// or valve spin-up from a stationary ground launch belongs to this protocol.
function trimInitialLift(sim,jets,area){
  const {state:s,params:p}=sim,weight=sim.mass*p.gravity;
  let flow=0,full,opening;
  for(let i=0;i<20;i++){
    const inlet=Math.max(ATMOSPHERE,s.pressure-p.feedLossCoefficient*flow*flow);
    full=nozzle(inlet,s.temp,area);
    if(full.force<weight)throw new RangeError('초기 탱크 추력으로 차체의 무게를 지탱할 수 없습니다.');
    opening=weight/full.force;
    const nextFlow=opening*full.mdot;
    if(Math.abs(nextFlow-flow)<1e-10)break;
    flow=nextFlow;
  }
  for(const jet of jets){
    jet.opening=jet.command=opening;
    jet.mdot=full.mdot*opening*jet.area/area;
    jet.force=weight*jet.area/area;
  }
}

function holdHeight(sim,duration,dt){
  if(duration===0)return;
  const jets=sim.thrusters.slice(0,4),area=jets.reduce((sum,jet)=>sum+jet.area,0);
  const {params:p,state:s}=sim;
  trimInitialLift(sim,jets,area);
  const ratio=dt/Math.max(.001,p.valveTau);
  const memory=-Math.expm1(-ratio)/ratio;
  for(let i=0;i<Math.round(duration/dt);i++){
    const oldFlow=jets.reduce((sum,jet)=>sum+jet.mdot,0);
    const full=nozzle(Math.max(ATMOSPHERE,s.pressure-p.feedLossCoefficient*oldFlow*oldFlow),s.temp,area);
    // Required average opening solves T = (m_before - dm/2) g.
    // Invert the first-order actuator for the command, not for the force:
    // PhysicsSim still integrates every valve, mass/enthalpy loss and impulse.
    const oldOpening=jets.reduce((sum,jet)=>sum+jet.area*jet.opening,0)/area;
    const mean=sim.mass*p.gravity/(full.force+.5*dt*full.mdot*p.gravity);
    const command=(mean-memory*oldOpening)/(1-memory);
    if(!(command>=0&&command<=1))throw new RangeError('탱크의 남은 추력으로 설정한 부양 시간을 유지할 수 없습니다.');
    sim.step(dt,{stabilize:true,thrusterCommands:[command,command,command,command]});
  }
}

export function startHoverLandingRun(sim,options={}){
  const duration=options.hoverSeconds??STUDY_HOVER_SECONDS;
  const dt=LANDING_STEP;
  if(!Number.isFinite(duration)||duration<0||Math.abs(duration/dt-Math.round(duration/dt))>1e-8)
    throw new RangeError('부양 시간은 0 이상의 2 ms 단위여야 합니다.');
  sim.params.unlimitedRaceGas=false;
  const config=releaseLandingVehicle(sim,{...options,hoverSeconds:duration});
  const startGasKg=sim.state.gas;
  holdHeight(sim,duration,dt);
  const height=landingClearance(sim);
  const hover={durationS:duration,startGasKg,releaseGasKg:sim.state.gas,gasUsedKg:startGasKg-sim.state.gas,
    releaseHeightM:height,releaseVelocityY:sim.state.vel.y,releasePressurePa:sim.state.pressure,
    releaseTemperatureK:sim.state.temp,releaseMassKg:sim.mass};
  let plan=null;
  if(config.method==='eco'){
    const initial=economyInitialState(sim,height);
    if(duration>0){
      const jets=sim.thrusters.slice(0,4);
      initial.releaseVelocityY=sim.state.vel.y;
      initial.valveOpening=jets.reduce((sum,jet)=>sum+jet.area*jet.opening,0)/initial.area;
      initial.flowKgS=sim.massFlowKgS;
    }
    plan=measureEconomyPlan(initial,config.targetSpeed);
  }
  const run=recordLandingRelease(sim,config,plan?.economy??null,plan?.elapsedMs??null);
  run.tankPressureMPa=sim.state.pressure/1e6;
  run.initialTemperature=sim.state.temp;
  run.hover=hover;
  return run;
}

export function landingPhaseAir(run){
  const hoverKg=run.hover.gasUsedKg,landingKg=run.gasUsed;
  return {hoverKg,landingKg,totalKg:hoverKg+landingKg};
}
