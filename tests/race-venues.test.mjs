import assert from 'node:assert/strict';
import test from 'node:test';
import {RACE_COURSE,RACE_COURSES,getRaceCourse} from '../dist/js/station-race-course.js';
import {rivalAirPath} from '../dist/js/station-race-air.js';
import {StationRace} from '../dist/js/station-race.js';
import {createStationRaceWorld} from '../dist/js/station-race-world.js';
import {FlightScene} from '../dist/js/scene.js';
import {Group, Scene} from 'three';

test('twenty independently surveyed circuits close at the line, with clear, straight flight approaches',()=>{
  assert.equal(RACE_COURSES.length,20);
  assert.equal(new Set(RACE_COURSES.map(c=>c.id)).size,20);
  assert.equal(getRaceCourse('unknown'),RACE_COURSE);
  const outlines=new Set();
  for(const c of RACE_COURSES){
    assert.equal(getRaceCourse(c.id),c);
    assert.ok(c.airGates.length>=4&&c.airGates.length<=6);
    assert.ok(c.gates.every((g,i)=>!i||g.distance>c.gates[i-1].distance));
    const previous=c.sample(-.005),following=c.sample(.005);
    assert.ok(Math.hypot(previous.x-following.x,previous.z-following.z)<.011,c.id+' timing line discontinuity');
    for(let d=0;d<c.length;d+=6){
      const p=c.sample(d,2.7),on=c.project(p);
      const offset=Math.abs(d-on.distance);
      assert.ok(Math.min(offset,Math.abs(c.length-offset))<.01,c.id+' projection at '+d);
      assert.ok(Math.abs(on.lateral-2.7)<.001,c.id+' overlapping track');
    }
    for(let d=c.airGates[0].distance-105;d<c.airGates.at(-1).distance+95;d+=5){
      assert.equal(c.curvature(d),0,c.id+' ring approach straights');
    }
    outlines.add(c.bends.map(b=>Math.round(b.curvature*b.length*100)).join(','));
  }
  assert.equal(outlines.size,20);
});

test('each venue runs a full two-lap player and AI race with its own ring and timing planes',()=>{
  for(const c of RACE_COURSES){
    const race=new StationRace({courseId:c.id});
    race.update(3,race.startPose);
    let d=race.startPose.distance;
    const sim={contactCount:0,bodyGroundContacts:0,rivalSupport:false,verticalThrustN:14500,massFlowKgS:3,mass:1000};
    // The physical collision solver needs a full car whenever AI is present.
    // Exercise the AI field against the unoccupied start while the player
    // timing planes use the same flown path in a separate online race.
    const player=new StationRace({courseId:c.id,online:true,playerSlot:2});
    assert.equal(player.rivals.length,0);assert.deepEqual(player.startPose,c.gridPose(2));
    player.update(3,player.startPose);d=player.startPose.distance;
    for(let tick=0;tick<6000&&player.phase!=='finished';tick++){
      d+=3;
      const guide=rivalAirPath(d,c),pose=c.sample(d,guide.lateral);
      const recovery=player.update(.05,{...pose,y:.63+guide.height},sim);
      assert.equal(recovery,null,c.id+' rejected driven corridor at '+d);
    }
    assert.equal(player.phase,'finished',c.id);
    assert.equal(player.airGatesPassed,c.airGates.length*c.laps);
    for(let tick=0;tick<4000&&race.rivals.some(r=>r.finishTime===null);tick++){
      race.update(.1,race.startPose);
    }
    assert.ok(race.rivals.every(r=>r.finishTime>0&&r.airGatesPassed===c.airGates.length*c.laps),c.id+' unfinished AI field');
  }
});

test('changed venue renders its asphalt and actual timing rings, and hides disconnected online cars',()=>{
  const c=getRaceCourse('solar-field'),world=createStationRaceWorld(null,null,{course:c,loadExterior:null});
  try{
    const race=new StationRace({courseId:c.id,online:true});
    assert.equal(world.course,c);
    const v=world.root.getObjectByName('Track asphalt').geometry.getAttribute('position');
    assert.equal(v.count,2*c.stations.length);
    for(const g of c.airGates){
      const p=c.sample(g.distance,g.aperture.lateral),ring=world.root.getObjectByName('Air gate '+g.index);
      assert.ok(ring&&Math.hypot(ring.position.x-p.x,ring.position.z-p.z)<1e-6);
    }
    const pose=c.gridPose(2);
    race.remoteCars=[{...pose,id:'peer',name:'동료',slot:2,color:0x44ccff,heave:2,steerAngle:.1,wheelDistance:4,lateral:0}];
    world.update(race);
    const body=world.root.getObjectByName('동료');assert.ok(body.visible);assert.equal(body.position.y,2);
    race.remoteCars=[];world.update(race);assert.equal(body.visible,false);
  }finally{world.dispose();}
});

test('switching circuits detaches the old world before releasing its compiling shader materials',async()=>{
  const scene=new Scene(),root=new Group();
  scene.add(root);
  let done,disposals=0;
  const view=Object.assign(Object.create(FlightScene.prototype),{scene,
    raceWorld:{course:RACE_COURSE,root,dispose(){disposals++;}},
    raceShaders:new Promise(resolve=>{done=resolve;}),raceEntryReady:true});
  view.chooseRaceCourse(getRaceCourse('river-arc'));
  assert.equal(root.parent,null);
  assert.equal(view.raceEntryReady,false);
  assert.equal(disposals,0);
  done();await Promise.resolve();assert.equal(disposals,1);
});
