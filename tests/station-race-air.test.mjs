import assert from 'node:assert/strict';
import test from 'node:test';
import {AIR_CEILING,AIR_GATES,airLaneOffset,insideRaceEnvelope,throughAirGate} from '../dist/js/station-race-air.js';
import {RACE_COURSE,StationRace,sampleCourse} from '../dist/js/station-race.js';
import {createStationRaceWorld} from '../dist/js/station-race-world.js';

function runLaps(altitude){
  const race=new StationRace();
  race.update(3,race.startPose);
  for(let distance=-5;distance<2*RACE_COURSE.length+2&&race.phase==='racing';distance++){
    const lane=airLaneOffset(distance,RACE_COURSE.length);
    const lateral=altitude>2.5 && lane!==null?lane:-3.15;
    const point={...sampleCourse(distance,lateral),y:altitude};
    assert.equal(race.update(.05,point),null,'legal course at '+distance);
  }
  return race;
}

test('legal flight and ground driving complete identical ordered laps with separate air timing',()=>{
  const road=runLaps(.6),flying=runLaps(6);
  assert.equal(road.phase,'finished');assert.equal(flying.phase,'finished');
  assert.equal(road.completedGates,25);assert.equal(flying.completedGates,25);
  assert.equal(road.airGatesPassed,0);assert.equal(flying.airGatesPassed,6);
  assert.equal(road.bestAirLap,0);assert.equal(flying.airGatesThisLap,3);assert.equal(flying.bestAirLap,3);
  assert.equal(road.finishTime,flying.finishTime);
});

test('the infield branch opens at the air gate altitude and stays closed to shortcuts elsewhere',()=>{
  const middle=RACE_COURSE.gates[6],branch={distance:middle.distance,error:14,lateral:-14};
  assert.equal(insideRaceEnvelope(branch,.7,RACE_COURSE),false);
  assert.equal(insideRaceEnvelope(branch,6,RACE_COURSE),true);
  assert.equal(insideRaceEnvelope(branch,16,RACE_COURSE),false);
  assert.equal(insideRaceEnvelope({...branch,lateral:14},6,RACE_COURSE),false);
  assert.equal(insideRaceEnvelope({...branch,distance:0},6,RACE_COURSE),false);
  assert.equal(insideRaceEnvelope({...branch,error:2,lateral:2},AIR_CEILING+1,RACE_COURSE),true);
  assert.equal(throughAirGate(6,-11,.6),false);
  assert.equal(throughAirGate(6,3,6),false);
  assert.equal(throughAirGate(6,-11,6),true);
});

test('a roll above timing height stays airborne; a high gate crossing requires a new lower forward pass',()=>{
  const race=new StationRace();race.update(3,race.startPose);
  const step=(x,y,dt=.12)=>race.update(dt,{...sampleCourse(x,-3.15),y});
  assert.equal(step(-1,36),null);
  assert.equal(step(-1,36,2),null,'holding above the road does not reset the car');
  // Cross at 30 m, then descend to 18 m before the end of this step.
  assert.equal(step(2,18),null);assert.equal(race.nextGate,0);
  assert.equal(step(3,4),null);assert.equal(race.completedGates,0);
  assert.equal(step(-1,4),null);assert.equal(race.completedGates,0,'reverse crossing is unscored');
  assert.equal(step(1,4),null);assert.equal(race.nextGate,1);
  assert.equal(race.airGatesPassed,0);
});

test('recovery cannot double-count an air gate and a ground-only second lap preserves the first-lap best',()=>{
  const race=new StationRace();race.update(3,race.startPose);
  const ground=(d)=>({...sampleCourse(d,-3),y:.6});
  const fly=(d)=>({...sampleCourse(d,airLaneOffset(d,RACE_COURSE.length)??-3),y:6});
  for(let d=-5;d<244;d++)race.update(.05,fly(d));
  assert.equal(race.airGatesThisLap,2);
  const reset=race.recover();
  race.update(.05,ground(reset.distance-1));
  race.update(.05,ground(reset.distance-2));
  for(let d=Math.floor(reset.distance);d<2*RACE_COURSE.length+2;d++){
    const w=Math.min(1,Math.max(0,(d-reset.distance)/14));
    const lane=-3+((airLaneOffset(d,RACE_COURSE.length)??-3)+3)*w;
    const point=d<RACE_COURSE.length-1?{...sampleCourse(d,lane),y:.6+5.4*w}:ground(d);
    assert.equal(race.update(.05,point),null);
  }
  assert.equal(race.phase,'finished');
  assert.equal(race.airGatesPassed,3);assert.equal(race.bestAirLap,3);assert.equal(race.airGatesThisLap,0);
});

test('air-gate meshes use the exact positions and clear opening used by course timing',()=>{
  const world=createStationRaceWorld();
  for(const timing of AIR_GATES){
    const gate=world.root.getObjectByName('Air gate '+timing.index);
    const p=sampleCourse(RACE_COURSE.gates[timing.index].distance,timing.lateral);
    assert.equal(gate.position.x,p.x);assert.equal(gate.position.z,p.z);
    assert.equal(gate.rotation.y,p.heading);
    const geometry=gate.getObjectByName('Air timing aperture').geometry;geometry.computeBoundingBox();
    const b=geometry.boundingBox;
    assert.ok(b.min.y<timing.minY&&b.max.y>timing.maxY);
    assert.ok(b.min.z< -timing.halfWidth&&b.max.z>timing.halfWidth);
  }
  world.dispose();
});
