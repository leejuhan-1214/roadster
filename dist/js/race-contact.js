import {Vector3} from 'three';

const axes = [new Vector3(1,0,0),new Vector3(0,1,0),new Vector3(0,0,1)];
const v = (x=0,y=0,z=0) => new Vector3(x,y,z);
const clamp = (n,lo,hi) => Math.min(hi,Math.max(lo,n));

// Two convex volumes follow the AI GT's bodywork and glazed cabin. The lower
// bonnet and rear deck remain available to a vehicle descending from above.
export const RIVAL_LENGTH=4.36;
// The bundled Z Proto is uniformly fitted to the common race envelope.
// Its highest roof vertex is 1.38153 m above its four tyre contact patches.
export const RIVAL_ROOF_HEIGHT=1.382;
const rivalShells = [
  {x:0, y:.65, half:[RIVAL_LENGTH/2,.35,.99]},
  {x:-.39, y:RIVAL_ROOF_HEIGHT-.235, half:[.99,.235,.72]}
];
const shell = (center, directions, half) => ({center, axes:directions, half});
const span = (box,axis) => box.half.reduce((r,h,i)=>r+h*Math.abs(axis.dot(box.axes[i])),0);

function clip(points, axis, bound) {
  if (!points.length) return [];
  const next=[];
  let previous=points[points.length-1], d0=axis.dot(previous)-bound;
  for(const current of points){
    const d1=axis.dot(current)-bound;
    if((d0>0)!==(d1>0)) next.push(previous.clone().lerp(current,d0/(d0-d1)));
    if(d1<=0) next.push(current);
    previous=current; d0=d1;
  }
  return next;
}

function edgeEnds(box, edge, direction) {
  const p=box.center.clone();
  for(let i=0;i<3;i++){
    if(i!==edge) p.addScaledVector(box.axes[i],Math.sign(box.axes[i].dot(direction))*box.half[i]);
  }
  return [p.clone().addScaledVector(box.axes[edge],-box.half[edge]),
    p.addScaledVector(box.axes[edge],box.half[edge])];
}

function edgePoint(a,ia,b,ib,normal) {
  const [p1,q1]=edgeEnds(a,ia,normal.clone().negate()),[p2,q2]=edgeEnds(b,ib,normal);
  const u=q1.sub(p1),w=q2.sub(p2),r=p1.clone().sub(p2);
  const uu=u.lengthSq(),ww=w.lengthSq(),uw=u.dot(w),ur=u.dot(r),wr=w.dot(r);
  const determinant=uu*ww-uw*uw;
  let s=determinant>1e-12?clamp((uw*wr-ww*ur)/determinant,0,1):0;
  const t=clamp((uw*s+wr)/ww,0,1);
  s=clamp((uw*t-ur)/uu,0,1);
  return p1.addScaledVector(u,s).lerp(p2.addScaledVector(w,t),.5);
}

// Clip the opposing face to the reference face's four edges. The centre of
// the resulting patch gives a shared point (and meaningful off-centre torque)
// even when a narrow car strikes just one side of a broader bumper.
function facePoint(ref, incident, face, outward) {
  const normal=ref.axes[face].clone().multiplyScalar(Math.sign(ref.axes[face].dot(outward)));
  const refLimit=normal.dot(ref.center)+ref.half[face];
  let index=0;
  for(let i=1;i<3;i++) if(Math.abs(incident.axes[i].dot(normal))>Math.abs(incident.axes[index].dot(normal)))index=i;
  const y=(index+1)%3,z=(index+2)%3;
  const anchor=incident.center.clone().addScaledVector(incident.axes[index],-Math.sign(incident.axes[index].dot(normal))*incident.half[index]);
  let points=[[1,1],[1,-1],[-1,-1],[-1,1]].map(([u,w])=>anchor.clone()
    .addScaledVector(incident.axes[y],u*incident.half[y]).addScaledVector(incident.axes[z],w*incident.half[z]));
  for(let i=0;i<3;i++) if(i!==face){
    const a=ref.axes[i], d=a.dot(ref.center);
    points=clip(points,a,d+ref.half[i]);
    points=clip(points,a.clone().negate(),-d+ref.half[i]);
  }
  points=clip(points,normal,refLimit+1e-7);
  if(!points.length)return anchor;
  const result=points.reduce((sum,p)=>sum.add(p),v()).multiplyScalar(1/points.length);
  return result.addScaledVector(normal,(refLimit-normal.dot(result))*.5);
}

function intersect(a,b) {
  const delta=a.center.clone().sub(b.center);
  let depth=Infinity,normal,reference,face,otherEdge;
  const check=(axis,source,idx,edge)=>{
    const size=axis.lengthSq();
    if(size<1e-12) return true;
    const n=size<.9999999||size>1.0000001?axis.clone().multiplyScalar(1/Math.sqrt(size)):axis;
    const dot=delta.dot(n), overlap=span(a,n)+span(b,n)-Math.abs(dot);
    if(overlap<=0)return false;
    if(overlap<depth-1e-7){depth=overlap;normal=n.clone().multiplyScalar(dot<0?-1:1);reference=source;face=idx;otherEdge=edge;}
    return true;
  };
  for(let i=0;i<3;i++) if(!check(a.axes[i],a,i)||!check(b.axes[i],b,i))return null;
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(!check(v().crossVectors(a.axes[i],b.axes[j]),null,i,j))return null;
  let point;
  if(reference===a) point=facePoint(a,b,face,normal.clone().negate());
  else if(reference===b) point=facePoint(b,a,face,normal);
  else point=edgePoint(a,face,b,otherEdge,normal);
  return {normal,point,depth};
}

function playerBody(sim) {
  const {pos,q,vel,omega}=sim.state,invQ=q.clone().invert(), mass=sim.mass;
  const directions=axes.map(axis=>axis.clone().applyQuaternion(q));
  const center=sim.bodyBoxCenter.clone().sub(sim.cg).applyQuaternion(q).add(pos);
  const invInertia=torque=>torque.clone().applyQuaternion(invQ).divide(sim.inertia).applyQuaternion(q);
  return {shapes:[shell(center,directions,sim.bodyHalf)],com:pos,invMass:1/mass,invInertia,
    velocity:r=>vel.clone().add(v().crossVectors(omega.clone().applyQuaternion(q),r)),
    push(j,r){vel.addScaledVector(j,1/mass);omega.add(v().crossVectors(r,j).applyQuaternion(invQ).divide(sim.inertia));},
    translate:n=>pos.add(n)};
}

function rivalBody(car) {
  const c=Math.cos(car.heading),s=Math.sin(car.heading),directions=[v(c,0,-s),axes[1],v(s,0,c)];
  const ground=car.heave||0;
  const com=v(car.x,ground+.63,car.z);
  const mass=car.mass??1450;
  const invI=1/(car.yawInertia??mass*(4.36**2+1.98**2)/12);
  const trackYaw=car.trackHeading??car.heading, cf=Math.cos(trackYaw),sf=Math.sin(trackYaw);
  const shapes=rivalShells.map(part=>shell(v(car.x+c*part.x,ground+part.y,car.z-s*part.x),directions,part.half));
  return {shapes,com,invMass:1/mass,invInertia:j=>v(0,j.y*invI,0),
    velocity:r=>v((car.vx??car.speed*c)+(car.yawRate||0)*r.z,car.vy||0,
      (car.vz??-car.speed*s)-(car.yawRate||0)*r.x),
    push(j,r){
      const dx=j.x/mass,dz=j.z/mass,dw=(r.z*j.x-r.x*j.z)*invI;
      car.vx=(car.vx??car.speed*c)+dx; car.vz=(car.vz??-car.speed*s)+dz;
      car.vy=(car.vy||0)+j.y/mass;
      car.speed+=dx*cf-dz*sf;
      car.slipSpeed=(car.slipSpeed||0)+dx*sf+dz*cf;
      car.yawSlipRate=(car.yawSlipRate||0)+dw; car.yawRate=(car.yawRate||0)+dw;
    },
    translate(n){
      car.x+=n.x;car.z+=n.z;car.heave=(car.heave||0)+n.y;
      const ds=(n.x*cf-n.z*sf)/(car.trackScale||1), dl=n.x*sf+n.z*cf;
      car.distance=(car.distance??0)+ds;car.lateral=(car.lateral??0)+dl;car.laneOffset=(car.laneOffset||0)+dl;
    }};
}

function solve(a,b,dt) {
  let contact=null;
  for(const aBox of a.shapes)for(const bBox of b.shapes){
    const hit=intersect(aBox,bBox);
    if(hit&&(!contact||hit.depth>contact.depth))contact=hit;
  }
  if(!contact)return null;
  const {normal,point,depth}=contact,ra=point.clone().sub(a.com),rb=point.clone().sub(b.com);
  const inverseMass=a.invMass+b.invMass;
  const inverseEffectiveMass=n=>{
    const armA=v().crossVectors(ra,n), armB=v().crossVectors(rb,n);
    return inverseMass+armA.dot(a.invInertia(armA))+armB.dot(b.invInertia(armB));
  };
  const relative=()=>a.velocity(ra).sub(b.velocity(rb));
  const pairImpulse=j=>{a.push(j,ra);b.push(j.clone().negate(),rb);};
  const closing=Math.max(0,-relative().dot(normal));
  let impulse=0;
  if(closing>0){
    const restitution=closing>1.2?.12:0;
    impulse=(1+restitution)*closing/inverseEffectiveMass(normal);
    pairImpulse(normal.clone().multiplyScalar(impulse));
    const tangent=relative();tangent.addScaledVector(normal,-tangent.dot(normal));
    const tangentialSpeed=tangent.length();
    if(tangentialSpeed>1e-8){
      tangent.multiplyScalar(1/tangentialSpeed);
      const friction=Math.min(.42*impulse,tangentialSpeed/inverseEffectiveMass(tangent));
      pairImpulse(tangent.multiplyScalar(-friction));
    }
  }
  // Split penetration correction by inverse mass. Keeping it out of the
  // velocity solver prevents a stationary, overlapping pair acquiring energy.
  const correction=Math.min(Math.max(0,depth-.0002)*.75,dt*12)/inverseMass;
  a.translate(normal.clone().multiplyScalar(correction*a.invMass));
  b.translate(normal.clone().multiplyScalar(-correction*b.invMass));
  return {speed:closing,impulse,normal,point};
}

export function resolveRivalContact(sim,rival,dt) {
  const p=sim.state.pos;
  if(Math.abs(p.x-rival.x)>7||Math.abs(p.z-rival.z)>7||Math.abs(p.y-(rival.heave||0))>6)return null;
  return solve(playerBody(sim),rivalBody(rival),dt);
}

export function resolveRivalPair(a,b,dt) {
  if(Math.abs(a.x-b.x)>5||Math.abs(a.z-b.z)>5)return null;
  return solve(rivalBody(a),rivalBody(b),dt);
}
