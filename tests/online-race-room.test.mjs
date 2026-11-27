import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {OnlineRaceRoom} from '../dist/js/online-race-room.js';

const next=()=>new Promise(resolve=>setImmediate(resolve));
const flush=async()=>{await next();await next();await next();};
const pose=x=>({x,y:1,z:0,qx:0,qy:0,qz:0,qw:1,progress:x});
function signalNetwork(){
  const peers=new Map();
  class Link extends EventEmitter{
    constructor(peer,options){super();this.peer=peer;Object.assign(this,options);}
    send(message){if(this.open)queueMicrotask(()=>this.other.open&&this.other.emit('data',structuredClone(message)));}
    close(){
      if(!this.open)return;
      this.open=this.other.open=false;
      queueMicrotask(()=>{this.emit('close');this.other.emit('close');});
    }
  }
  class Peer extends EventEmitter{
    constructor(id){super();this.id=id;peers.set(id,this);setImmediate(()=>this.emit('open',id));}
    connect(id,options){
      const local=new Link(id,options),remote=new Link(this.id,options);
      local.other=remote;remote.other=local;
      if(!peers.has(id)){setImmediate(()=>this.emit('error',{type:'peer-unavailable'}));return local;}
      const other=peers.get(id);
      setImmediate(()=>{
        other.emit('connection',remote);
        local.open=remote.open=true;
        local.emit('open');remote.emit('open');
      });
      return local;
    }
    destroy(){peers.delete(this.id);}
  }
  return id=>new Peer(id);
}

test('all drivers load the host course before a clock-corrected start, real poses relay and ranked finishes agree',async t=>{
  const createPeer=signalNetwork();
  let clock=10_000,release;
  const make=(offset,prepare)=>{
    const events={poses:[],starts:[],finishes:[]};
    const room=new OnlineRaceRoom({createPeer,now:()=>clock+offset,onPrepare:prepare,onPose:p=>events.poses.push(p),
      onStart:s=>events.starts.push(s),onFinish:r=>events.finishes.push(r)});
    t.after(()=>room.leave());return {room,events};
  };
  const h=make(0),a=make(13000,()=>new Promise(resolve=>{release=resolve;})),b=make(-8000);
  const {code}=await h.room.host({name:'방장',courseId:'metro'});
  assert.equal(h.room.start(),false);
  await a.room.join({name:'게스트 1',code:code.toLowerCase()});await b.room.join({name:'게스트 2',code});
  await flush();
  assert.deepEqual(a.room.state.players.map(p=>p.slot),[0,1,2]);
  assert.equal(h.room.start(),true);
  await flush();
  assert.deepEqual(h.room.state.players.map(p=>p.ready),[true,false,true]);
  assert.equal(h.room.state.phase,'preparing');assert.equal(a.room.state.courseId,'metro');
  release();await flush();
  assert.equal(h.events.starts[0].startAt,clock+3000);
  assert.equal(a.events.starts[0].startAt,clock+13000+3000);
  assert.equal(b.events.starts[0].startAt,clock-8000+3000);
  clock+=4000;
  a.room.sendPose(pose(40));a.room.sendPose(pose(55));await flush();
  assert.deepEqual(h.events.poses.map(p=>p.x),[40]);assert.deepEqual(b.events.poses.map(p=>p.x),[40]);
  assert.equal(a.events.poses.length,0);
  b.room.finish();await flush();clock+=12;a.room.finish();await flush();clock+=31;h.room.finish();await flush();
  assert.equal(a.room.state.phase,'finished');
  const standings=h.room.state.players.map(p=>[p.name,p.elapsedMs,p.rank]);
  assert.deepEqual(standings,[['방장',1043,3],['게스트 1',1012,2],['게스트 2',1000,1]]);
  assert.deepEqual(a.room.state.players,h.room.state.players);
  assert.equal(h.room.finish(),false);assert.equal(b.events.finishes.length,3);
});

test('admission enforces four slots, open lobby slot reuse, room locking and host departure',async t=>{
  const createPeer=signalNetwork();
  const rooms=Array.from({length:5},()=>new OnlineRaceRoom({createPeer}));
  t.after(()=>rooms.forEach(r=>r.leave()));
  const [host,a,b,c,extra]=rooms;
  const {code}=await host.host({courseId:'metro'});
  for(const room of [a,b,c])await room.join({code});
  await assert.rejects(extra.join({code}),/가득/);
  b.leave();await flush();await extra.join({code});await flush();
  assert.equal(host.state.players.find(p=>p.id===extra.state.selfId).slot,2);
  host.start();await flush();
  await assert.rejects(b.join({code}),/시작/);
  a.leave();await flush();assert.equal(host.state.players.filter(p=>p.disconnected).length,1);
  host.leave();await flush();assert.equal(c.state.phase,'idle');assert.match(c.state.message,/방장/);
  await assert.rejects(a.join({code:'123'}),/여섯/);
  await assert.rejects(a.join({code}),/찾을 수/);
});

test('cancelling a pending room and reconnecting signaling cannot revive or replace an active room',async t=>{
  const createPeer=signalNetwork();let resolve,disposed=false;
  const late=new OnlineRaceRoom({createPeer:()=>new Promise(r=>{resolve=r;})});
  const pending=late.host({courseId:'metro'});await flush();late.leave();
  await assert.rejects(pending,/취소/);resolve({destroy(){disposed=true;}});await flush();
  assert.ok(disposed);assert.equal(late.state.phase,'idle');
  const host=new OnlineRaceRoom({createPeer}),guest=new OnlineRaceRoom({createPeer});t.after(()=>{host.leave();guest.leave();});
  const {code}=await host.host({courseId:'metro'});await guest.join({code});await flush();
  host.peer.emit('open',host.state.selfId);guest.peer.emit('open',guest.state.selfId);await flush();
  assert.equal(host.state.players.length,2);assert.equal(guest.state.players.length,2);
});
