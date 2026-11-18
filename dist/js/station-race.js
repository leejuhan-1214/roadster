import {advanceRival, createRivalGrid, normalizeRaceDifficulty, recordRivalAirGate, rivalHasFinishedCourse, setRivalDifficulty} from './race-rivals.js?v=20261119-ai158';
export {RACE_DIFFICULTIES, normalizeRaceDifficulty} from './race-rivals.js?v=20261119-ai158';
import {resolveRivalContact,resolveRivalPair} from './race-contact.js?v=20261118-model154';
import {AIR_CEILING, AIR_APPROACH, AIR_RESTART_RUNUP, insideRaceEnvelope, throughAirGate} from './station-race-air.js?v=20261119-ai158';

import {RACE_COURSE,sampleCourse,projectToCourse} from './station-race-course.js?v=20261119-ai158';
export {RACE_COURSE,sampleCourse} from './station-race-course.js?v=20261119-ai158';
const {length,width:WIDTH,laps:LAP_COUNT,gates}=RACE_COURSE;
const GATE_COUNT=gates.length,COUNTDOWN=3;
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(n,hi));
const wrap=(value,period)=>((value%period)+period)%period;

const airGates=gates.filter(gate=>gate.air);
const firstAir=airGates[0],lastAir=airGates[airGates.length-1];
function gateDistance(ordinal) {
  return Math.floor(ordinal/GATE_COUNT)*length+gates[wrap(ordinal,GATE_COUNT)].distance;
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
  if(gate.air && Math.abs(lateral)<=WIDTH/2+1.5)
    return {fraction,air:throughAirGate(gate,lateral,y)};
  return !gate.air && y<=AIR_CEILING && Math.abs(lateral)<=WIDTH/2 ? {fraction,air:false} : null;
}

const finishDistance = length * LAP_COUNT;

function advanceField(race,dt,start,sim) {
  const cars=race.rivals;
  for(let t=0;t<dt-1e-9;){
    const h=Math.min(.025,dt-t);
    if(sim)sim.rivalSupport=false;
    for(const car of cars){
      car.previousDistance=car.distance;
      car.previousHeave=car.heave;
      car.previousLateral=car.lateral;
      advanceRival(car,h);
    }
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
    for(const car of cars)recordRivalAirGate(car);
    for(const car of cars)if(car.finishTime==null&&car.distance>=finishDistance&&rivalHasFinishedCourse(car)){
      const fraction=clamp((finishDistance-car.previousDistance)/Math.max(1e-9,car.distance-car.previousDistance),0,1);
      car.finishTime=start+t+fraction*h;
    }
    t+=h;
  }
}

export class StationRace {
  constructor({difficulty='normal'}={}) {
    this.phase = 'countdown';
    this.countdown = COUNTDOWN;
    this.elapsed = 0;
    this.finishTime = null;
    this.startPose = sampleCourse(-6, -3.15);
    this.difficulty = normalizeRaceDifficulty(difficulty);
    this.rivals = createRivalGrid(this.difficulty);
    this.collisionCount=0;
    this.rivalSupport=false;
    this.lastCollision=null;
    this._pairActivity=new Map();
    this._ordinal = 0;
    this.airGatesPassed = 0;
    this.airGatesThisLap = 0;
    this.bestAirLap = 0;
    this.recoveryReason = null;
    this._missedAt = -Infinity;
    this._liftDeltaV = 0;
    this._progress = this.startPose.distance;
    this._previous = this.startPose;
    this._leftAt = null;
    this._offTrackTime = 0;
  }
  setDifficulty(value) {
    const difficulty=normalizeRaceDifficulty(value);
    if(this.difficulty===difficulty)return;
    this.difficulty=difficulty;
    for(const car of this.rivals)setRivalDifficulty(car,difficulty);
  }
  get nextGate() { return this._ordinal % GATE_COUNT; }
  get completedGates() { return this._ordinal; }
  get progress() { return this._progress; }
  get lap() { return clamp(Math.floor((this._ordinal - 1) / GATE_COUNT) + 1, 1, LAP_COUNT); }
  get airGateDistance() {
    const gate=gates[this.nextGate];
    if(this.airGatesThisLap===airGates.length)return null;
    return (this.lap-1)*length+(gate.air?gate.distance:firstAir.distance)-this.progress;
  }
  get airSectionStatus() {
    if(this.phase!=='racing')return 'away';
    if(this.elapsed-this._missedAt<3)return 'missed';
    const local=this.progress-(this.lap-1)*length;
    if(this.airGatesThisLap===airGates.length)return local<lastAir.distance+100?'clear':'away';
    if(!gates[this.nextGate].air||this.airGateDistance>AIR_APPROACH)return 'away';
    return this._liftDeltaV>=1?'flying':'approach';
  }
  get rank() {
    if (this.finishTime != null) return 1 + this.rivals.filter(car => car.finishTime != null && car.finishTime < this.finishTime).length;
    return 1 + this.rivals.filter(car => Math.min(car.distance,car.retryGateDistance??Infinity) > this._progress).length;
  }
  recover(reason=null) {
    let distance=this._ordinal===0?this.startPose.distance:gateDistance(this._ordinal-1)+1.5;
    const gate=gates[this.nextGate];
    const runup=(this.lap-1)*length+firstAir.distance-AIR_RESTART_RUNUP;
    // Once committed to the air section, retry all flight gates from a level
    // launch straight. A recovery never awards space or progress beyond it.
    if(gate.air&&(reason==='air-gate'||this.progress>=runup)){
      this._ordinal-=this.airGatesThisLap;
      this.airGatesPassed-=this.airGatesThisLap;
      this.airGatesThisLap=0;
      distance=runup;
    }
    this.recoveryReason=reason;
    if(reason==='air-gate')this._missedAt=this.elapsed;
    this._liftDeltaV=0;
    const pose=sampleCourse(distance,-3.15);
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
    // Store delivered vertical nozzle impulse per unit mass, including a
    // ballistic coast after the lift valves close. Hovering on another car or
    // simply intersecting a ring at its height cannot qualify.
    const nearAir=projection.distance>=firstAir.distance-AIR_APPROACH && projection.distance<=lastAir.distance+AIR_APPROACH;
    const supported=!!sim&&(sim.contactCount>0||sim.bodyGroundContacts>0||sim.rivalSupport);
    if(!nearAir||!sim||supported)this._liftDeltaV=0;
    else if(sim.massFlowKgS>0&&sim.mass>0)this._liftDeltaV+=Math.max(0,sim.verticalThrustN)/sim.mass*dt;
    let previousFraction = -1;
    for (let i = 0; i < GATE_COUNT; i++) {
      const crossing = crossingFraction(from, to, gates[this.nextGate]);
      if (!crossing || crossing.fraction <= previousFraction) break;
      const {fraction,air}=crossing;
      if(gates[this.nextGate].air&&(!air||this._liftDeltaV<1||supported))return this.recover('air-gate');
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
    const passed=gateDistance(this._ordinal-1),next=gateDistance(this._ordinal);
    const offset=wrap(projection.distance-passed+length/2,length)-length/2;
    this._progress=Math.min(passed+offset,next-.001);
    return null;
  }
}
