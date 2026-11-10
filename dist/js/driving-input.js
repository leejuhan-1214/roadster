// Ground and cold-gas flight controls. Pedal release requests modest blended
// braking, so a full battery still slows the car using the wheel brakes.
// All speed changes continue through tire forces and the rigid-body solver.
export const CITY_DRIVE_PARAMS=Object.freeze({
  friction:1.15,rollingResistance:.015,aeroEnabled:true,dragScale:1,
  roadRoughness:.15,windX:0,windZ:0,tractionControl:true,absEnabled:true,
  springK:75000,damperC:6000,
  tankPressureMPa:35.875,
});
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const approach=(value,target,amount)=>value+clamp(target-value,-amount,amount);
const held=(keys,...codes)=>codes.some(code=>keys.has(code));

export class DrivingController {
  constructor(options={}){this.flightSteering='strafe';this.flightAssist=true;this.setOptions(options);this.reset();}
  setOptions(options={}){
    if(['turn','strafe'].includes(options.flightSteering))this.flightSteering=options.flightSteering;
    if(typeof options.flightAssist==='boolean')this.flightAssist=options.flightAssist;
    return this;
  }
  reset(){
    this.throttle=0;this.steer=0;this.brake=.2;this.gear='D';
    this.altHold=false;this.targetHeight=.8;this.airborne=false;this._holdKey=false;
    this.landingAssist=false;this.landingStatus='idle';
  }
  setAltitudeTarget(height){
    if(!Number.isFinite(height)||height<0)return false;
    this.landingAssist=false;this.landingStatus='idle';this.targetHeight=height;this.altHold=true;
    return true;
  }
  toggleLandingAssist(sim){
    this.landingAssist=!this.landingAssist;this.altHold=false;
    this.landingStatus=this.landingAssist?'descending':'idle';
    if(this.landingAssist&&sim.contactCount===4&&Math.abs(sim.state.vel.y)<.2&&Math.hypot(sim.state.vel.x,sim.state.vel.z)<.4){this.landingAssist=false;this.landingStatus='complete';}
    return this.landingAssist;
  }
  toggleAltitudeHold(sim){
    this.landingAssist=false;this.landingStatus='idle';
    this.altHold=!this.altHold;
    if(this.altHold)this.targetHeight=Math.max(.8,sim.state.pos.y-sim.restHeight);
    return this.altHold;
  }
  update(keys,sim,dt){
    const step=clamp(Number.isFinite(dt)?dt:0,0,.1),q=sim.state.q;
    const lift=Number(held(keys,'Space')),holdKey=held(keys,'KeyH');
    const activeManeuver=held(keys,'KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyF');
    const manualFlight=activeManeuver||!!lift||held(keys,'KeyB','KeyH')||(sim.contactCount>0&&held(keys,'ShiftLeft','ShiftRight'));
    if(this.landingAssist&&manualFlight){this.landingAssist=false;this.landingStatus='manual';}
    if(holdKey&&!this._holdKey)this.toggleAltitudeHold(sim);
    this._holdKey=holdKey;
    // Ignore momentary loss of one tire over road relief. Re-enter the ground
    // controls on contact; the solver still determines all support forces.
    if(sim.contactCount>0)this.airborne=false;
    else if(sim.state.pos.y-sim.restHeight>.08)this.airborne=true;
    // Quaternion-rotated local +X, projected onto actual world velocity.
    const forward={x:1-2*(q.y*q.y+q.z*q.z),y:2*(q.x*q.y+q.w*q.z),z:2*(q.x*q.z-q.w*q.y)};
    const velocity=sim.state.vel,speed=velocity.x*forward.x+velocity.y*forward.y+velocity.z*forward.z;
    if(this.landingAssist&&sim.contactCount===4&&Math.abs(velocity.y)<.2&&Math.hypot(velocity.x,velocity.z)<.4){this.landingAssist=false;this.landingStatus='complete';}
    const go=held(keys,'KeyW',...(this.airborne?[]:['ArrowUp'])),back=held(keys,'KeyS',...(this.airborne?[]:['ArrowDown']));
    const hardBrake=held(keys,'KeyB')||(go&&back)||this.landingAssist,direction=Number(go)-Number(back);
    const turn=Number(held(keys,'KeyA',...(this.airborne?[]:['ArrowLeft'])))-Number(held(keys,'KeyD',...(this.airborne?[]:['ArrowRight'])));
    const changingDirection=direction!==0&&direction*speed<-.3;
    const drifting=!this.airborne&&held(keys,'ShiftLeft','ShiftRight')&&!hardBrake&&!changingDirection&&!lift&&!this.altHold;
    const boosting=held(keys,'KeyF')&&!hardBrake&&!changingDirection&&!back;
    let throttle=0,brake=0;
    if(hardBrake||changingDirection)brake=1;
    else if(direction){throttle=direction;this.gear=direction>0?'D':'R';}
    else brake=drifting||boosting?0:Math.abs(speed)<.4?.2:.1;
    // Reverse uses a low-speed torque governor, never a velocity clamp.
    if(direction<0&&!changingDirection&&!hardBrake&&speed<-6){
      throttle=-clamp((8+speed)/2,0,1);
      if(speed<-8)brake=.1;
    }
    // Full keyboard throttle consumed most of the tire friction circle during
    // turns, so A/D lost much of its authority while the 650 kW drive accelerated.
    // Reserve grip for steering by reducing only the forward torque request;
    // tire forces still determine curvature, including reduced grip on ice.
    const corneringBlend=!this.airborne&&!drifting&&turn!==0&&throttle>0?clamp((speed-4)/8,0,1):0;
    throttle*=1-.55*corneringBlend;
    // Brake has immediate priority; releasing a brake never leaves drive torque
    // opposed to it during a transition to reverse or forwards.
    this.brake=approach(this.brake,brake,step*10);
    this.throttle=brake>0?0:approach(this.throttle,throttle,step*8);
    if(throttle!==0&&this.brake<.001)this.brake=0;
    if(this.brake>0)this.throttle=0;
    const magnitude=Math.abs(speed),baseSteer=.52/(1+magnitude/28);
    // Keyboard steering follows a usable curve: full parking lock, then a
    // nominal 0.7g cornering curve. Retain 30% of rack travel so a held key
    // still turns the actual tires at speed; grip limits the resulting path.
    // Handbrake drift allows the full rack for countersteering.
    const steeringLimit=drifting?1:Math.max(.30,Math.min(1,Math.atan(.7*sim.params.gravity*sim.params.wheelbase/Math.max(1,magnitude*magnitude))/baseSteer));
    this.steer=approach(this.steer,turn*steeringLimit,step*(turn?5:8));
    const airBrake=this.airborne&&held(keys,'KeyB');
    const turnInAir=this.airborne&&this.flightSteering==='turn';
    let airMoveForward=this.airborne?Number(go)-Number(back):0;
    let airMoveRight=this.airborne&&!turnInAir?-turn:0;
    if(airBrake||this.landingAssist){
      // Counter the measured horizontal motion with the same bounded nozzle
      // gimbals as WASD. It consumes gas and cannot instantly stop the car.
      const heading=Math.atan2(-forward.z,forward.x),c=Math.cos(heading),s=Math.sin(heading);
      airMoveForward=-clamp((velocity.x*c-velocity.z*s)/4,-1,1);
      airMoveRight=-clamp((velocity.x*s+velocity.z*c)/4,-1,1);
    }
    const holding=this.altHold&&!lift;
    const flight=this.airborne||!!lift||holding||this.landingAssist;
    // Steering linkage still turns unloaded front wheels in flight. Tire forces
    // require contact; the selected air mode uses yaw jets or lateral vectoring.
    const input={throttle:this.airborne?0:this.throttle,brake:this.brake,steer:this.steer,
      stabilize:flight,fan:false,wing:false,coastRegen:false,lift,
      boost:boosting,handbrake:drifting?1:0,
      airMoveForward,airMoveRight,altHold:holding,targetHeight:this.targetHeight,
      pitch:this.airborne?Number(held(keys,'ArrowDown'))-Number(held(keys,'ArrowUp')):0,
      roll:this.airborne?Number(held(keys,'ArrowRight'))-Number(held(keys,'ArrowLeft')):0,
      yaw:flight?clamp(Number(held(keys,'KeyQ'))-Number(held(keys,'KeyE'))+(turnInAir?turn:0),-1,1):0,
      airBrake,airborne:this.airborne,landingAssist:this.landingAssist,flightAssist:false,corneringAssist:corneringBlend>0,
    };
    // The existing actuator acceleration path supports a captured height above
    // 15 m as well. This is a force request, not a position/velocity assignment.
    if(this.landingAssist){
      const surface=sim.surfaceHeightAt?.(sim.state.pos.x,sim.state.pos.z,sim.state.pos.y-sim.restHeight)||0;
      const clearance=Math.max(0,sim.state.pos.y-sim.restHeight-surface);
      const targetVelocity=-(clearance<.35?.3:.6);
      if(sim.contactCount===4){
        // Once supported by all four tires, retain wheel braking without
        // unloading the suspension or spending tank gas to hover over the road.
        input.stabilize=false;input.verticalAcceleration=-sim.params.gravity;
      }else input.verticalAcceleration=clamp(8*(targetVelocity-velocity.y),-sim.params.gravity,1.1*sim.params.gravity);
    }
    else if(holding)input.verticalAcceleration=clamp(24*(this.targetHeight+sim.restHeight-sim.state.pos.y)-10*velocity.y,-sim.params.gravity,1.1*sim.params.gravity);
    else if(airBrake&&!lift)input.verticalAcceleration=clamp(-10*velocity.y,-sim.params.gravity,1.1*sim.params.gravity);
    else if(this.flightAssist&&this.airborne&&!lift&&activeManeuver){
      // Direction keys need carrier thrust: a gimbal angle alone produces no
      // translation when the four lift valves are closed. This bounded request
      // damps vertical speed while the user manoeuvres, using the same finite gas.
      input.verticalAcceleration=clamp(-8*velocity.y,-sim.params.gravity,1.1*sim.params.gravity);
      input.flightAssist=true;
    }
    return input;
  }
}
