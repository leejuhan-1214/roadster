import {Vector3,Quaternion} from 'three';
const wheelFields=['compression','steer','omega','spinAngle','load','surfaceY','forceX','forceY','forceZ'];
const pose=()=>({time:0,pos:new Vector3(),q:new Quaternion(),vel:new Vector3(),bodyPosition:new Vector3(),wheels:[],thrusters:[]});
function capture(out,sim){
 out.time=sim.state.time;out.pos.copy(sim.state.pos);out.q.copy(sim.state.q);out.vel.copy(sim.state.vel);out.bodyPosition.copy(sim.bodyPosition);
 for(let i=0;i<sim.wheels.length;i++){const w=sim.wheels[i],t=out.wheels[i]||(out.wheels[i]={pos:new Vector3()});t.pos.copy(w.pos);for(const key of wheelFields)t[key]=w[key]||0;}
 for(let i=0;i<sim.thrusters.length;i++){const t=sim.thrusters[i],r=out.thrusters[i]||(out.thrusters[i]={pos:new Vector3(),dir:new Vector3()});r.pos.copy(t.pos);r.dir.copy(t.dir);r.force=t.force;r.opening=t.opening||0;}
 return out;
}
export class RenderStateBuffer{
 constructor(sim){this.previous=pose();this.current=pose();this.output=pose();this.reset(sim);}
 reset(sim){capture(this.previous,sim);capture(this.current,sim);return this.sample(1);}
 beforeStep(){const swap=this.previous;this.previous=this.current;this.current=swap;}
 afterStep(sim){capture(this.current,sim);}
 sample(alpha){
  const a=Math.max(0,Math.min(1,alpha)),p=this.previous,c=this.current,o=this.output;
  o.time=p.time+(c.time-p.time)*a;o.pos.lerpVectors(p.pos,c.pos,a);o.vel.lerpVectors(p.vel,c.vel,a);o.q.slerpQuaternions(p.q,c.q,a);o.bodyPosition.lerpVectors(p.bodyPosition,c.bodyPosition,a);
  for(let i=0;i<c.wheels.length;i++){const x=p.wheels[i],y=c.wheels[i],w=o.wheels[i]||(o.wheels[i]={pos:new Vector3()});w.pos.lerpVectors(x.pos,y.pos,a);for(const key of wheelFields)w[key]=x[key]+(y[key]-x[key])*a;}
  for(let i=0;i<c.thrusters.length;i++){const x=p.thrusters[i],y=c.thrusters[i],t=o.thrusters[i]||(o.thrusters[i]={pos:new Vector3(),dir:new Vector3()});t.pos.lerpVectors(x.pos,y.pos,a);t.dir.lerpVectors(x.dir,y.dir,a).normalize();t.force=x.force+(y.force-x.force)*a;t.opening=x.opening+(y.opening-x.opening)*a;}
  return o;
 }
}
