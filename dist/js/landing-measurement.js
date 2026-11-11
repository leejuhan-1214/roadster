/** Read spring compression at the current pose against each wheel's sampled
 * contact surface. The solver's wheel.compression belongs to force evaluation
 * at the start of the last step, and must not be mixed with end-state energy.
 * These values describe the linear spring only, not damping or bump stops.
 */
export function landingSpringState(sim){
  const {state,params}=sim;
  let stateCompression=0,squaredCompression=0;
  const compressions=sim.wheels.map(wheel=>{
    const worldY=wheel.pos.clone().applyQuaternion(state.q).y+state.pos.y;
    const surfaceY=Number.isFinite(wheel.surfaceY)?wheel.surfaceY:0;
    const normalY=Number.isFinite(wheel.normalY)?Math.max(0,wheel.normalY):1;
    const compression=params.contactEnabled===false?0:Math.max(0,params.wheelRadius-(worldY-surfaceY)*normalY);
    stateCompression=Math.max(stateCompression,compression);
    squaredCompression+=compression*compression;
    return compression;
  });
  return {compressions,stateCompression,springEnergyJ:.5*params.springK*squaredCompression};
}
