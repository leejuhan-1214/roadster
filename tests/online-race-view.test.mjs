import test from 'node:test';
import assert from 'node:assert/strict';
import {RaceGhosts} from '../dist/js/online-race-view.js';

const course={gridPose:slot=>({x:-6-slot*6,z:0,heading:0,distance:-6-slot*6}),sample:d=>({x:d,z:0,heading:0})};
const me={id:'me',name:'유나',slot:0},other={id:'other',name:'민재',slot:1};
const packet=x=>({id:other.id,x,y:0,z:0,qx:0,qy:0,qz:0,qw:1,progress:x});
test('remote grid, interpolated movement and recovery use other drivers only',()=>{
  const view=new RaceGhosts(course);
  view.setRoster([me,other],me.id);
  assert.equal(view.cars.length,1);assert.equal(view.cars[0].x,-12);
  view.receive(packet(10),100);view.receive(packet(18),200);view.update(250);
  assert.equal(view.cars[0].x,14);
  view.receive(packet(110),300);view.update(305);
  assert.equal(view.cars[0].x,110);
  view.setRoster([me,{...other,disconnected:true}],me.id);
  assert.equal(view.cars.length,0);assert.equal(view.entries.size,0);
});
test('live positions become official places and times when the room publishes results',()=>{
  const view=new RaceGhosts(course),race={progress:2},state={players:[me,other],selfId:me.id};
  view.setRoster(state.players,me.id);view.receive(packet(5),100);
  assert.equal(view.standings(state,race,1000,2500).rank,2);
  const finished={...state,players:[{...me,rank:1,elapsedMs:22800,finished:true},other]};
  assert.deepEqual([view.standings(finished,race,1000,27100).rank,view.standings(finished,race,1000,27100).elapsed],[1,22.8]);
});
