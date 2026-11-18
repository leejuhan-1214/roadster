import {resolveRivalContact,resolveRivalPair} from './race-contact.js?v=20261118-flight153';
import {AIR_CEILING, insideRaceEnvelope, throughAirGate} from './station-race-air.js?v=20261118-flight1531';

const TURN_RADIUS = 32;
const QUARTER_TURN = Math.PI * TURN_RADIUS / 2;
const FULL_TURN = Math.PI * 2;
const WIDTH = 19;
const GATE_COUNT = 12;
const LAP_COUNT = 2;
const COUNTDOWN = 3;

// Centreline distance is measured from the start stripe. Three.js cars face local
// +X, so increasing yaw turns the nose towards -Z.
const segments = [];
let length = 0;
let endX = 0;
let endZ = 0;
let endHeading = 0;
function segmentPose(segment, along) {
  const {x, z, heading} = segment;
  if (!segment.turn) return {x: x + Math.cos(heading) * along, z: z - Math.sin(heading) * along, heading};
  const yaw = heading + along / TURN_RADIUS;
  return {
    x: x + TURN_RADIUS * (Math.sin(yaw) - Math.sin(heading)),
    z: z + TURN_RADIUS * (Math.cos(yaw) - Math.cos(heading)),
    heading: yaw
  };
}
for (const [metres, turn] of [[53, false], [QUARTER_TURN, true], [34, false], [QUARTER_TURN, true],
  [106, false], [QUARTER_TURN, true], [34, false], [QUARTER_TURN, true], [53, false]]) {
  const segment = {x: endX, z: endZ, heading: endHeading, start: length, length: metres, turn};
  segments.push(segment);
  const end = segmentPose(segment, metres);
  endX = end.x; endZ = end.z; endHeading = end.heading;
  length += metres;
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(n, hi));
function wrap(value, period) {
  return ((value % period) + period) % period;
}
function segmentFor(distance) {
  const along = wrap(distance, length);
  return segments.find(s => along < s.start + s.length) || segments[segments.length - 1];
}
export function sampleCourse(distance, lateral = 0) {
  const along = wrap(distance, length);
  const segment = segmentFor(along);
  const {x, z, heading} = segmentPose(segment, along - segment.start);
  return {x: x + Math.sin(heading) * lateral, z: z + Math.cos(heading) * lateral, heading, distance};
}
const gates = Array.from({length: GATE_COUNT}, (_, index) => ({
  index, ...sampleCourse(index * length / GATE_COUNT)
}));
export const RACE_COURSE = {length, width: WIDTH, laps: LAP_COUNT, gates};

function projectToCourse(point) {
  let bestSquared = Infinity;
  let distance = 0;
  let lateral = 0;
  for (const segment of segments) {
    const dx = point.x - segment.x;
    const dz = point.z - segment.z;
    let along;
    if (segment.turn) {
      const radiusX = dx + TURN_RADIUS * Math.sin(segment.heading);
      const radiusZ = dz + TURN_RADIUS * Math.cos(segment.heading);
      // Unwrap around the middle of this 90-degree arc, so endpoints are
      // correctly compared on either side of the 2π angle discontinuity.
      const middle = segment.heading + Math.PI / 4;
      const angle = middle + wrap(Math.atan2(radiusX, radiusZ) - middle + Math.PI, FULL_TURN) - Math.PI;
      along = (angle - segment.heading) * TURN_RADIUS;
    } else {
      along = dx * Math.cos(segment.heading) - dz * Math.sin(segment.heading);
    }
    along = clamp(along, 0, segment.length);
    const p = segmentPose(segment, along);
    const squared = (p.x - point.x) ** 2 + (p.z - point.z) ** 2;
    if (squared < bestSquared) {
      bestSquared = squared;
      distance = segment.start + along;
      lateral = (point.x-p.x)*Math.sin(p.heading)+(point.z-p.z)*Math.cos(p.heading);
    }
  }
  return {distance, error: Math.sqrt(bestSquared), lateral};
}

function crossingFraction(a, b, gate) {
  const cos = Math.cos(gate.heading), sin = Math.sin(gate.heading);
  const before = (a.x - gate.x) * cos - (a.z - gate.z) * sin;
  const after = (b.x - gate.x) * cos - (b.z - gate.z) * sin;
  if (before > 1e-7 || after < -1e-7 || after - before < 1e-7) return null;
  const fraction = clamp(-before / (after - before), 0, 1);
  const x = a.x + (b.x - a.x) * fraction;
  const z = a.z + (b.z - a.z) * fraction;
  const lateral=(x-gate.x)*sin+(z-gate.z)*cos;
  const y=(a.y??0)+((b.y??0)-(a.y??0))*fraction;
  if(y>AIR_CEILING)return null;
  const air=throughAirGate(gate.index,lateral,y);
  return air||Math.abs(lateral)<=WIDTH/2 ? {fraction,air} : null;
}

const grid = [
  {id: 'apex', name: '에이펙스', color: 0xffb34e, distance: -4, lateral: 3.15, lane: 4.6, top: 24, corner: 13.5, acceleration: 4.1},
  {id: 'nova', name: '노바', color: 0x5acdf3, distance: -12, lateral: -3.15, lane: -4.6, top: 21.8, corner: 14.8, acceleration: 4.9},
  {id: 'comet', name: '코멧', color: 0xa99aff, distance: -14, lateral: 3.15, lane: 0, top: 23.5, corner: 13.2, acceleration: 4.6}
];
const finishDistance = length * LAP_COUNT;
function advanceRival(car, dt) {
  const segment=segmentFor(car.distance), parking=finishDistance+42+car.lane;
  const remaining=segment.start+segment.length-wrap(car.distance,length);
  const next=segments[(segments.indexOf(segment)+1)%segments.length];
  const approach=remaining+(next.turn?0:next.length);
  const cruise=segment.turn?car.corner:Math.min(car.top,Math.sqrt(car.corner**2+2*5.5*approach));
  const target=Math.min(cruise,Math.sqrt(2*5.5*Math.max(0,parking-car.distance)));
  const aligned=Math.max(.15,Math.cos(car.yawOffset));
  const speed=car.speed+clamp(target-car.speed,-5.7*dt,car.acceleration*aligned*dt);
  const oldHeading=car.heading;
  car.trackScale=segment.turn?1+car.lateral/TURN_RADIUS:1;
  let travel=(car.speed+speed)*.5*dt;
  car.speed=speed;
  if(car.finishTime!=null&&car.distance<=parking&&car.distance+travel/car.trackScale>=parking){
    travel=(parking-car.distance)*car.trackScale;
    car.speed=0;
  }
  car.distance+=travel/car.trackScale;
  car.wheelDistance+=travel;

  // A hit changes actual longitudinal progress, lateral motion and yaw. The
  // driver returns to its intended lane with finite grip/torque over time.
  const entry=clamp(car.distance/30,0,1);
  const nominal=car.gridLateral+(car.lane-car.gridLateral)*entry**2*(3-2*entry);
  const slope=(car.lane-car.gridLateral)*6*entry*(1-entry)/30;
  car.slipSpeed+=clamp(-3.5*car.laneOffset-3*car.slipSpeed,-6,6)*dt;
  car.laneOffset+=car.slipSpeed*dt;
  car.yawSlipRate+=clamp(-8*Math.sin(car.yawOffset)-4.8*car.yawSlipRate,-4.5,4.5)*dt;
  car.yawOffset+=car.yawSlipRate*dt;
  // Reserve the physical width of the rotated GT inside the outer barriers.
  const reach=2.18*Math.abs(Math.sin(car.yawOffset))+.99*Math.abs(Math.cos(car.yawOffset));
  const edge=WIDTH/2+.5-reach;
  const desired=nominal+car.laneOffset;
  car.lateral=clamp(desired,-edge,edge);
  if(desired!==car.lateral){
    car.laneOffset=car.lateral-nominal;
    if(car.slipSpeed*car.lateral>0)car.slipSpeed*=-.08;
  }
  const pose=sampleCourse(car.distance,car.lateral);
  car.x=pose.x;car.z=pose.z;car.trackHeading=pose.heading;
  car.heading=pose.heading-Math.atan(slope)+car.yawOffset;
  car.yawRate=Math.atan2(Math.sin(car.heading-oldHeading),Math.cos(car.heading-oldHeading))/dt;
  const side=car.slipSpeed+slope*car.speed/car.trackScale;
  const c=Math.cos(pose.heading),s=Math.sin(pose.heading);
  car.vx=c*car.speed+s*side;car.vz=-s*car.speed+c*side;
  // Vertical impulses act on a grounded sprung mass. Slow roof contact carries
  // sustained weight into the tires; a hard landing also reaches the bump stop.
  car.vy+=(-120*car.heave-16*car.vy)*dt;
  car.heave+=car.vy*dt;
  if(car.heave<-.18){car.heave=-.18;car.vy=Math.max(0,car.vy);}
}

function advanceField(race,dt,start,sim) {
  const cars=race.rivals;
  for(let t=0;t<dt-1e-9;){
    const h=Math.min(.025,dt-t);
    if(sim)sim.rivalSupport=false;
    for(const car of cars){car.previousDistance=car.distance;advanceRival(car,h);}
    let contact;
    for(let pass=0;pass<3;pass++){
      let hit=false;
      for(let i=0;i<cars.length;i++){
        const a=cars[i];
        if(sim&&(contact=resolveRivalContact(sim,a,h))){
          hit=true;race.noteContact('player',a.id,contact,start+t+h);
          if(contact.normal.y>.72 && Math.abs(sim.state.vel.y-a.vy)<.45)sim.rivalSupport=true;
        }
        for(let j=i+1;j<cars.length;j++){
          const b=cars[j];
          if((contact=resolveRivalPair(a,b,h))){
            hit=true;race.noteContact(a.id,b.id,contact,start+t+h);
          }
        }
      }
      if(!hit)break;
    }
    race.rivalSupport=sim?.rivalSupport===true;
    for(const car of cars)if(car.finishTime==null&&car.distance>=finishDistance){
      const fraction=clamp((finishDistance-car.previousDistance)/Math.max(1e-9,car.distance-car.previousDistance),0,1);
      car.finishTime=start+t+fraction*h;
    }
    t+=h;
  }
}

export class StationRace {
  constructor() {
    this.phase = 'countdown';
    this.countdown = COUNTDOWN;
    this.elapsed = 0;
    this.finishTime = null;
    this.startPose = sampleCourse(-6, -3.15);
    this.rivals = grid.map((car,i) => {
      const pose=sampleCourse(car.distance,car.lateral);
      const mass=[1510,1420,1580][i]; // model parameters for the three GT opponents
      return {...car,...pose,mass,yawInertia:mass*(4.36**2+1.98**2)/12,gridLateral:car.lateral,
        trackHeading:pose.heading,trackScale:1,speed:0,vx:0,vy:0,vz:0,heave:0,yawRate:0,
        laneOffset:0,slipSpeed:0,yawOffset:0,yawSlipRate:0,wheelDistance:0,finishTime:null};
    });
    this.collisionCount=0;
    this.rivalSupport=false;
    this.lastCollision=null;
    this._pairActivity=new Map();
    this._ordinal = 0;
    this.airGatesPassed = 0;
    this.airGatesThisLap = 0;
    this.bestAirLap = 0;
    this._progress = this.startPose.distance;
    this._previous = this.startPose;
    this._leftAt = null;
    this._offTrackTime = 0;
  }
  get nextGate() { return this._ordinal % GATE_COUNT; }
  get completedGates() { return this._ordinal; }
  get progress() { return this._progress; }
  get lap() { return clamp(Math.floor((this._ordinal - 1) / GATE_COUNT) + 1, 1, LAP_COUNT); }
  get rank() {
    if (this.finishTime != null) return 1 + this.rivals.filter(car => car.finishTime != null && car.finishTime < this.finishTime).length;
    return 1 + this.rivals.filter(car => car.distance > this._progress).length;
  }
  recover() {
    const distance = this._ordinal === 0 ? this.startPose.distance : (this._ordinal - 1) * length / GATE_COUNT + 1.5;
    const pose = sampleCourse(distance, -3.15);
    this._previous = pose;
    this._progress = distance;
    this._leftAt = null;
    this._offTrackTime = 0;
    return pose;
  }
  noteContact(a,b,contact,time) {
    const key=a+'|'+b;
    let episode=this._pairActivity.get(key);
    if(!episode||time-episode.time>.12){
      episode={time,event:null};this._pairActivity.set(key,episode);
    }
    episode.time=time;
    if(contact.speed>.5){
      if(!episode.event){
        this.collisionCount++;
        episode.event={a,b,speed:contact.speed,impulse:contact.impulse,time};
        this.lastCollision=episode.event;
      }else{
        episode.event.speed=Math.max(episode.event.speed,contact.speed);
        episode.event.impulse=Math.max(episode.event.impulse,contact.impulse);
      }
    }
  }
  update(dt, player, sim=null) {
    if (!Number.isFinite(dt) || dt <= 0 || this.phase === 'finished') return null;
    if (this.phase === 'countdown') {
      const wait = Math.min(dt, this.countdown);
      this.countdown -= wait;
      dt -= wait;
      if (this.countdown > 1e-8) return null;
      this.countdown = 0;
      this.phase = 'racing';
      if (dt <= 1e-9) return null;
    }
    const start = this.elapsed;
    this.elapsed += dt;
    advanceField(this,dt,start,sim);
    if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.z)) return this.recover();
    const from = this._previous;
    const to = {x: player.x, y: player.y??0, z: player.z};
    const travel = Math.hypot(to.x - from.x, to.z - from.z);
    if (travel > Math.max(5, 125 * dt + .75)) return this.recover();
    const projection = projectToCourse(to);
    let onCourse = insideRaceEnvelope(projection,to.y,RACE_COURSE);
    // Check the swept path too. A single long frame across a hairpin cannot
    // bridge the infield without leaving the course.
    for (let along = 6; onCourse && along < travel; along += 6) {
      const t = along / travel;
      const sample=projectToCourse({x:from.x+(to.x-from.x)*t,z:from.z+(to.z-from.z)*t});
      onCourse = insideRaceEnvelope(sample,(from.y??0)+(to.y-(from.y??0))*t,RACE_COURSE);
    }
    this._previous = to;
    if (!onCourse) {
      if (!this._leftAt) this._leftAt = from;
      this._offTrackTime += dt;
      return this._offTrackTime >= 1.25 ? this.recover() : null;
    }
    if (this._leftAt) {
      if (Math.hypot(to.x - this._leftAt.x, to.z - this._leftAt.z) > 13) return this.recover();
      this._leftAt = null;
      this._offTrackTime = 0;
      return null;
    }
    let previousFraction = -1;
    for (let i = 0; i < GATE_COUNT; i++) {
      const crossing = crossingFraction(from, to, gates[this.nextGate]);
      if (!crossing || crossing.fraction <= previousFraction) break;
      const {fraction,air}=crossing;
      previousFraction = fraction;
      this._ordinal++;
      if(this._ordinal===GATE_COUNT+1)this.airGatesThisLap=0;
      if(air){
        this.airGatesPassed++;
        this.airGatesThisLap++;
        this.bestAirLap=Math.max(this.bestAirLap,this.airGatesThisLap);
      }
      if (this._ordinal > LAP_COUNT * GATE_COUNT) {
        this.phase = 'finished';
        this.finishTime = start + fraction * dt;
        this.elapsed = this.finishTime;
        this._progress = finishDistance;
        return null;
      }
    }
    const passed = (this._ordinal - 1) * length / GATE_COUNT;
    const offset = wrap(projection.distance - passed + length / 2, length) - length / 2;
    this._progress = passed + Math.min(offset, length / GATE_COUNT - .001);
    return null;
  }
}
