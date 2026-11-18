import {isRocketProfile} from './rocket-layout.js?v=20261115-capacity375';
import {nozzle} from './physics.js?v=20261118-review149';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const upY=q=>1-2*(q.x*q.x+q.z*q.z);
export const ROCKET_ROLL_MIN_HEIGHT=8;
export const ROCKET_ROLL_MIN_UPWARD_SPEED=7;
// Conservative control envelope, not a proof of collision-free flight. Evaluate
// the real fitted lever arm and current cold-gas force before committing.
export function rocketRollAuthority(sim){
  const s=sim.state,lift=sim.thrusters.filter(t=>t.group==='lift');
  let positive=0,negative=0,force=0;
  for(const t of lift){const f=nozzle(s.pressure,s.temp,t.area).force;
    const moment=-t.pos.z*f;force+=f;positive+=Math.max(0,moment);negative+=Math.max(0,-moment);}
  const angularAcceleration=Math.min(positive,negative)/sim.inertia.x;
  const thrustToWeight=force/(sim.mass*Math.max(.001,sim.params.gravity));
  return {angularAcceleration,thrustToWeight,sufficient:angularAcceleration>=8&&thrustToWeight>=1.5};
}

// A controller, not an animation: outputs torque/acceleration requests only.
// The solver alone changes pose, velocity and tank state. The roll axis is the
// car's longitudinal axis (a barrel roll, as opposed to a nose-over somersault).
export class RocketRollController {
  constructor(){this.reset();}
  reset(){this.phase='idle';this.status='idle';this.angle=0;this.lastTime=null;this.startTime=0;this.keyHeld=false;}
  get active(){return ['prepare','rolling','recovering'].includes(this.phase);}
  update({key,abort,sim,clearance,supported}){
    const s=sim.state,t=s.time,step=this.lastTime===null?0:clamp(t-this.lastTime,0,.1);
    this.lastTime=t;
    if(this.phase==='rolling'||this.phase==='recovering')this.angle+=s.omega.x*step;
    if(key&&!this.keyHeld&&!this.active){
      this.angle=0;
      if(!isRocketProfile(sim.params))this.status='profile';
      else if(supported||clearance<ROCKET_ROLL_MIN_HEIGHT-1e-6)this.status='height';
      else if(s.gas<sim.initialGas*.55||s.pressure<sim.params.tankPressureMPa*1e6*.43)this.status='gas';
      // Acquire upward momentum with the actual launch before spending the roll reserve.
      else if(s.vel.y<ROCKET_ROLL_MIN_UPWARD_SPEED)this.status='momentum';
      else if(upY(s.q)<.94||s.omega.length()>.5)this.status='attitude';
      else if(!rocketRollAuthority(sim).sufficient)this.status='thrust';
      else {this.phase='prepare';this.status='prepare';this.startTime=t;}
    }
    this.keyHeld=!!key;
    if(!this.active)return null;
    if(abort||supported||s.pressure<150000||t-this.startTime>7){
      this.phase='idle';this.status=abort?'cancelled':supported?'contact':'unavailable';return null;
    }
    if(this.phase==='prepare'){
      if(s.vel.y>=7&&upY(s.q)>.97){this.phase='rolling';this.status='rolling';}
      else return {verticalAcceleration:1.1*sim.params.gravity,rollRateTarget:0,pitchRateTarget:0};
    }
    if(this.phase==='rolling'){
      const remaining=Math.max(0,2*Math.PI-this.angle);
      if(remaining<.045&&Math.abs(s.omega.x)<.25){this.phase='recovering';this.status='recovering';}
      else return {verticalAcceleration:-sim.params.gravity,
        rollRateTarget:Math.min(5.2,3.6*remaining),pitchRateTarget:0};
    }
    if(upY(s.q)>.99995&&s.omega.length()<.05&&this.angle>2*Math.PI-.012){this.phase='idle';this.status='complete';return {complete:true};}
    // Upright capture is also performed by finite thruster torque. No Euler or
    // quaternion reset, and no velocity cancellation, occurs here.
    return {verticalAcceleration:clamp(-8*s.vel.y,-sim.params.gravity,1.1*sim.params.gravity)};
  }
}
