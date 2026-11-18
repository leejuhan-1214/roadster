import {RACE_COURSE as course, courseCurvature, sampleCourse} from './station-race-course.js?v=20261118-circuit155';
import {rivalAirPath, throughAirGate} from './station-race-air.js?v=20261118-circuit155';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const grid = [
  {id:'apex', name:'에이펙스', color:0xffb34e, distance:-4, lateral:3.15, lane:4.6, mass:1510, top:64, acceleration:6.5, power:335000, grip:11.8, braking:10.0},
  {id:'nova', name:'노바', color:0x5acdf3, distance:-12, lateral:-3.15, lane:-4.6, mass:1420, top:58.5, acceleration:7.2, power:310000, grip:12.6, braking:10.7},
  {id:'comet', name:'코멧', color:0xa99aff, distance:-14, lateral:3.15, lane:0, mass:1580, top:61, acceleration:6.8, power:335000, grip:11.6, braking:9.8}
];

// Sample the complete, closed lap once per driver. Propagate corner limits
// upstream using v1² = v2² + 2 a ds, including the turn across the finish.
// This keeps look-ahead work out of the 500 Hz physics loop.
const samples = Math.ceil(course.length / 3);
const spacing = course.length / samples;
const airGates=course.gates.filter(gate=>gate.air);
const requiredAirGates=airGates.length*course.laps;
const rivalComHeight=.63; // same datum as the compound collision shell
function laneScale(curvature, lateral) { return 1 + curvature * lateral; }
function brakingPlan(driver) {
  const limit = new Float64Array(samples);
  const ds = new Float64Array(samples), curvature = new Float64Array(samples);
  for (let i=0; i<samples; i++) {
    const k=courseCurvature(i*spacing), scale=laneScale(k,driver.lane);
    curvature[i]=Math.abs(k/scale);
    ds[i]=spacing*scale;
    limit[i]=Math.min(driver.top**2, .94*driver.grip/Math.max(1e-8,curvature[i]));
  }
  for(let i=2*samples-1;i>=0;i--){
    const j=i%samples, next=limit[(j+1)%samples];
    const lateral=Math.min(.94,Math.min(limit[j],next)*curvature[j]/driver.grip);
    const deceleration=driver.braking*Math.sqrt(1-lateral*lateral)*.90;
    limit[j]=Math.min(limit[j],next+2*deceleration*ds[j]);
  }
  return limit;
}
const plans=grid.map(brakingPlan);
function targetSpeed(car) {
  const local=((car.distance%course.length)+course.length)%course.length;
  const at=local/spacing, i=Math.min(samples-1,Math.floor(at)), t=at-i;
  const a=car.speedPlan[i], b=car.speedPlan[(i+1)%samples];
  return Math.sqrt(a+(b-a)*t);
}

export function createRivalGrid() {
  return grid.map((spec,i)=>{
    const pose=sampleCourse(spec.distance,spec.lateral);
    return {...spec,...pose, speedPlan:plans[i], gridLateral:spec.lateral,
      yawInertia:spec.mass*(4.36**2+1.98**2)/12,trackHeading:pose.heading,trackScale:1,
      speed:0,vx:0,vy:0,vz:0,heave:0,yawRate:0,laneOffset:0,slipSpeed:0,
      yawOffset:0,yawSlipRate:0,wheelDistance:0,wheelSpeed:0,airGatesPassed:0,flightActive:false,
      retryGateDistance:null,finishTime:null};
  });
}

export function rivalHasFinishedCourse(car) { return car.airGatesPassed===requiredAirGates; }

export function recordRivalAirGate(car) {
  if(rivalHasFinishedCourse(car))return;
  const gate=airGates[car.airGatesPassed%airGates.length];
  const station=Math.floor(car.airGatesPassed/airGates.length)*course.length+gate.distance;
  if(car.previousDistance>station||car.distance<station||car.distance<=car.previousDistance)return;
  const fraction=(station-car.previousDistance)/(car.distance-car.previousDistance);
  const lateral=car.previousLateral+fraction*(car.lateral-car.previousLateral);
  const height=rivalComHeight+car.previousHeave+fraction*(car.heave-car.previousHeave);
  if(throughAirGate(gate,lateral,height)){
    car.airGatesPassed++;
    car.retryGateDistance=null;
  }else car.retryGateDistance=station;
}

function moveVertical(car, dt) {
  const guide=rivalAirPath(car.distance,course);
  car.flightActive=guide.height>0||(car.flightActive&&car.heave>.015);
  if(car.flightActive){
    // Closed-loop powered lift, with gravity and finite thrust. A roof impact
    // or a collision still changes the actual position and vertical velocity.
    const desiredVy=(guide.slope||0)*car.speed/car.trackScale;
    const lift=clamp(9.80665+9*(guide.height-car.heave)+6*(desiredVy-car.vy),0,22);
    car.vy+=(lift-9.80665)*dt;
    car.liftAcceleration=lift;
  }else{
    car.vy+=(-120*car.heave-16*car.vy)*dt;
    car.liftAcceleration=0;
  }
  car.heave+=car.vy*dt;
  if(car.heave<-.18){car.heave=-.18;car.vy=Math.max(0,car.vy);}
}

export function advanceRival(car,dt) {
  const curvature=courseCurvature(car.distance);
  car.trackScale=laneScale(curvature,car.lateral);
  const lateralUse=Math.min(.98,Math.abs(curvature/car.trackScale)*car.speed**2/car.grip);
  const longitudinalGrip=Math.sqrt(1-lateralUse*lateralUse);
  const parking=course.length*course.laps+280+car.lane;
  let target=Math.min(targetSpeed(car),Math.sqrt(2*car.braking*Math.max(0,parking-car.distance)));
  // If a collision knocked the car outside the timing aperture, brake, reverse
  // and fly the same gate again. Neither distance nor finish time is teleported.
  if(car.retryGateDistance!==null){
    if(car.distance<car.retryGateDistance-8)car.retryGateDistance=null;
    else target=-8;
  }
  const aligned=Math.max(.15,Math.cos(car.yawOffset));
  // Wheel power in W and drag area ~0.72 m²; these are game parameters for
  // the three Z-bodied opponents. At high speed available acceleration falls.
  const powerLimit=(car.power/Math.max(1,Math.abs(car.speed))-.44*car.speed**2)/car.mass-.14;
  const gain=Math.max(0,Math.min(car.acceleration*longitudinalGrip,powerLimit))*aligned;
  const slowing=car.speed<=0&&target<0?Math.min(3.3,gain):car.braking*longitudinalGrip;
  const speed=car.speed+clamp(target-car.speed,-slowing*dt,gain*dt);
  const oldHeading=car.heading;
  let travel=(car.speed+speed)*.5*dt;
  car.speed=speed;
  if(car.finishTime!=null&&car.distance<=parking&&car.distance+travel/car.trackScale>=parking){
    travel=(parking-car.distance)*car.trackScale;
    car.speed=0;
  }
  car.distance+=travel/car.trackScale;

  // A hit changes longitudinal progress, lateral motion and yaw. Steering
  // recentres gradually, even if a rival is pushed out of its preferred lane.
  const entry=clamp(car.distance/35,0,1);
  const nominal=car.gridLateral+(car.lane-car.gridLateral)*entry**2*(3-2*entry);
  const slope=(car.lane-car.gridLateral)*6*entry*(1-entry)/35;
  car.slipSpeed+=clamp(-3.5*car.laneOffset-3*car.slipSpeed,-6,6)*dt;
  car.laneOffset+=car.slipSpeed*dt;
  car.yawSlipRate+=clamp(-8*Math.sin(car.yawOffset)-4.8*car.yawSlipRate,-4.5,4.5)*dt;
  car.yawOffset+=car.yawSlipRate*dt;
  const reach=2.18*Math.abs(Math.sin(car.yawOffset))+.99*Math.abs(Math.cos(car.yawOffset));
  const edge=course.width/2+.5-reach;
  const desired=nominal+car.laneOffset;
  car.lateral=clamp(desired,-edge,edge);
  if(desired!==car.lateral){
    car.laneOffset=car.lateral-nominal;
    if(car.slipSpeed*car.lateral>0)car.slipSpeed*=-.08;
  }
  const pose=sampleCourse(car.distance,car.lateral);
  car.x=pose.x;car.z=pose.z;car.trackHeading=pose.heading;
  car.heading=pose.heading-Math.atan(slope/car.trackScale)+car.yawOffset;
  car.yawRate=Math.atan2(Math.sin(car.heading-oldHeading),Math.cos(car.heading-oldHeading))/dt;
  const side=car.slipSpeed+slope*car.speed/car.trackScale;
  const c=Math.cos(pose.heading),s=Math.sin(pose.heading);
  car.vx=c*car.speed+s*side;car.vz=-s*car.speed+c*side;
  car.steerAngle=Math.atan(2.55*car.yawRate/Math.max(1,Math.abs(car.speed)));
  moveVertical(car,dt);
  car.wheelSpeed=car.heave>.05?car.wheelSpeed*Math.exp(-dt*.08):car.speed;
  car.wheelDistance+=car.wheelSpeed*dt;
}
