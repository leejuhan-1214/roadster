// Both comparisons use the same 20 m/s initial condition and five simulated seconds.
export function createFrictionRun(kind,sim){
 return {kind:kind==='brake'?'brake':'coast',startTime:sim.state.time,elapsed:0,distance:0,previous:sim.state.pos.clone(),done:false,mu:sim.params.friction,crr:sim.params.rollingResistance,aero:sim.params.aeroEnabled,roughness:sim.params.roadRoughness||0,speed:20};
}
export function frictionRunInput(run){return {coastRegen:false,throttle:0,brake:run.kind==='brake'?1:0,steer:0,lift:0,boost:0,stabilize:false,altHold:false,fan:false,wing:false};}
export function updateFrictionRun(run,sim){
 if(run.done)return run;
 run.elapsed=sim.state.time-run.startTime;
 run.distance+=Math.hypot(sim.state.pos.x-run.previous.x,sim.state.pos.z-run.previous.z);run.previous.copy(sim.state.pos);
 run.speed=Math.hypot(sim.state.vel.x,sim.state.vel.z);
 run.done=run.elapsed>=5-1e-9;
 return run;
}
