// Ground-driving controls for the city. Pedal release requests modest blended
// braking, so a full battery still slows the car using the wheel brakes.
// All speed changes continue through tire forces and the rigid-body solver.
export const CITY_DRIVE_PARAMS=Object.freeze({
  friction:1.15,rollingResistance:.015,aeroEnabled:true,dragScale:1,
  roadRoughness:.15,windX:0,windZ:0,tractionControl:true,absEnabled:true,
  springK:75000,damperC:6000,
  tankPressureMPa:.101325,
});
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const approach=(value,target,amount)=>value+clamp(target-value,-amount,amount);
const held=(keys,...codes)=>codes.some(code=>keys.has(code));

export class DrivingController {
  constructor(){this.reset();}
  reset(){this.throttle=0;this.steer=0;this.brake=.2;this.gear='D';}
  update(keys,sim,dt){
    const step=clamp(Number.isFinite(dt)?dt:0,0,.1),q=sim.state.q;
    // Quaternion-rotated local +X, projected onto actual world velocity.
    const forward={x:1-2*(q.y*q.y+q.z*q.z),y:2*(q.x*q.y+q.w*q.z),z:2*(q.x*q.z-q.w*q.y)};
    const velocity=sim.state.vel,speed=velocity.x*forward.x+velocity.y*forward.y+velocity.z*forward.z;
    const go=held(keys,'KeyW','ArrowUp'),back=held(keys,'KeyS','ArrowDown');
    const hardBrake=held(keys,'Space','KeyB')||(go&&back),direction=Number(go)-Number(back);
    const changingDirection=direction!==0&&direction*speed<-.3;
    let throttle=0,brake=0;
    if(hardBrake||changingDirection)brake=1;
    else if(direction){throttle=direction;this.gear=direction>0?'D':'R';}
    else brake=Math.abs(speed)<.4?.2:.1;
    // Reverse uses a low-speed torque governor, never a velocity clamp.
    if(direction<0&&!changingDirection&&!hardBrake&&speed<-6){
      throttle=-clamp((8+speed)/2,0,1);
      if(speed<-8)brake=.1;
    }
    // Brake has immediate priority; releasing a brake never leaves drive torque
    // opposed to it during a transition to reverse or forwards.
    this.brake=approach(this.brake,brake,step*10);
    this.throttle=brake>0?0:approach(this.throttle,throttle,step*8);
    if(throttle!==0&&this.brake<.001)this.brake=0;
    if(this.brake>0)this.throttle=0;
    const turn=Number(held(keys,'KeyA','ArrowLeft'))-Number(held(keys,'KeyD','ArrowRight'));
    const magnitude=Math.abs(speed),baseSteer=.52/(1+magnitude/28);
    // Keyboard steering follows a usable curve: full parking lock, then a
    // target lateral acceleration of 0.7g. This does not add yaw or lateral grip.
    const steeringLimit=Math.min(1,Math.atan(.7*sim.params.gravity*sim.params.wheelbase/Math.max(1,magnitude*magnitude))/baseSteer);
    this.steer=approach(this.steer,turn*steeringLimit,step*(turn?5:8));
    return {throttle:this.throttle,brake:this.brake,steer:this.steer,
      stabilize:false,fan:false,wing:false,coastRegen:false,lift:0,boost:false};
  }
}
