import {Quaternion,Vector3} from 'three';

const colors=[0xff815e,0x51d7f1,0xf4cf65,0xb59bff];
const up=new Vector3(0,1,0);
const snapshot=(x,y,z,q,progress,time)=>({position:new Vector3(x,y,z),q,progress,time});

// Opponent samples are interpolated in render time. A change of checkpoint
// after recovery snaps the ghost to the new pose instead of drawing a shortcut.
export class RaceGhosts {
  constructor(course){
    this.course=course;
    this.entries=new Map();
    this.cars=[];
  }
  setRoster(players,selfId){
    this.cars=[];
    for(const p of players){
      if(p.id===selfId||p.disconnected)continue;
      if(!this.entries.has(p.id)){
        const start=this.course.gridPose(p.slot);
        const q=new Quaternion().setFromAxisAngle(up,start.heading);
        const initial=snapshot(start.x,0,start.z,q,start.distance,0);
        const car={id:p.id,slot:p.slot,name:p.name,color:colors[p.slot],x:start.x,y:0,z:start.z,
          quaternion:q.clone(),heading:start.heading,heave:0,distance:start.distance,lateral:start.lateral||0,
          wheelDistance:0,steerAngle:0,liftAcceleration:0};
        this.entries.set(p.id,{car,previous:initial,current:initial});
      }
      this.cars.push(this.entries.get(p.id).car);
    }
    for(const id of this.entries.keys())if(!this.cars.some(car=>car.id===id))this.entries.delete(id);
  }
  receive(p,time=performance.now()){
    const entry=this.entries.get(p.id);
    if(!entry)return;
    const next=snapshot(p.x,p.y,p.z,new Quaternion(p.qx,p.qy,p.qz,p.qw),p.progress,time);
    const last=entry.current;
    const jump=last.time===0||next.position.distanceToSquared(last.position)>1600||time-last.time>1000;
    entry.previous=jump?next:last;
    entry.current=next;
  }
  update(time=performance.now()){
    for(const {car,previous:a,current:b} of this.entries.values()){
      const t=b.time===a.time?1:Math.max(0,Math.min(1,(time-100-a.time)/(b.time-a.time)));
      car.x=a.position.x+(b.position.x-a.position.x)*t;
      car.z=a.position.z+(b.position.z-a.position.z)*t;
      car.y=a.position.y+(b.position.y-a.position.y)*t;
      car.heave=car.y;
      car.quaternion.slerpQuaternions(a.q,b.q,t);
      const q=car.quaternion;
      car.heading=Math.atan2(2*(q.w*q.y-q.x*q.z),1-2*(q.y*q.y+q.z*q.z));
      car.distance=a.progress+(b.progress-a.progress)*t;
      car.wheelDistance=car.distance;
      const road=this.course.sample(car.distance);
      car.lateral=(car.x-road.x)*Math.sin(road.heading)+(car.z-road.z)*Math.cos(road.heading);
    }
  }
  standings(state,race,startAt,now=Date.now()){
    const self=state.players.find(p=>p.id===state.selfId);
    let ahead=0;
    for(const p of state.players){
      if(p.id===state.selfId||p.disconnected)continue;
      const distance=this.entries.get(p.id)?.current.progress??-Infinity;
      if(p.finished||distance>race.progress||(distance===race.progress&&p.slot<(self?.slot??0)))ahead++;
    }
    return {selfId:state.selfId,players:state.players,rank:self?.rank??ahead+1,
      elapsed:self?.elapsedMs!=null?self.elapsedMs/1000:startAt?Math.max(0,(now-startAt)/1000):0};
  }
}
