import {Vector3,Quaternion} from 'three';
const pose=()=>({pos:new Vector3(),q:new Quaternion(),vel:new Vector3(),bodyPosition:new Vector3(),wheels:[]});
function capture(out,sim){out.pos.copy(sim.state.pos);out.q.copy(sim.state.q);out.vel.copy(sim.state.vel);out.bodyPosition.copy(sim.bodyPosition);for(let i=0;i<sim.wheels.length;i++){const w=sim.wheels[i],t=out.wheels[i]||(out.wheels[i]={pos:new Vector3()});t.pos.copy(w.pos);for(const key of ['compression','steer','omega','spinAngle','load','surfaceY'])t[key]=w[key]||0;}return out;}
export class RenderStateBuffer{
 constructor(sim){this.previous=pose();this.current=pose();this.output=pose();this.reset(sim);}
 reset(sim){capture(this.previous,sim);capture(this.current,sim);return this.sample(1);}
 beforeStep(){const swap=this.previous;this.previous=this.current;this.current=swap;}
 afterStep(sim){capture(this.current,sim);}
 sample(alpha){const a=Math.max(0,Math.min(1,alpha)),p=this.previous,c=this.current,o=this.output;o.pos.lerpVectors(p.pos,c.pos,a);o.vel.lerpVectors(p.vel,c.vel,a);o.q.slerpQuaternions(p.q,c.q,a);o.bodyPosition.lerpVectors(p.bodyPosition,c.bodyPosition,a);for(let i=0;i<c.wheels.length;i++){const x=p.wheels[i],y=c.wheels[i],w=o.wheels[i]||(o.wheels[i]={pos:new Vector3()});w.pos.lerpVectors(x.pos,y.pos,a);for(const key of ['compression','steer','omega','spinAngle','load','surfaceY'])w[key]=x[key]+(y[key]-x[key])*a;}return o;}
}
