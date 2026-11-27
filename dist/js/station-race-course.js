// Purpose-built station GP course, in metres. The 4.381 km target and
// 14-corner count use the Hungaroring as a scale reference. Survey points
// below describe our own circuit, in X/Z with +X along the starting straight.
import {AIR_GATE_LAYOUT,AIR_APPROACH} from './station-race-air.js?v=20261127-race20';

import {CIRCUIT_LAYOUTS} from './circuit-layouts.js?v=20261127-race20';

const originalTurns = [
  [450, 0, 55], [515, -125, 30], [345, -215, 57], [307, -315, 45],
  [390, -425, 43], [265, -555, 60], [-200, -555, 52], [-230, -380, 46],
  [-50, -315, 39], [-125, -207, 37], [-265, -260, 63], [-345, -190, 45],
  [-460, -200, 43], [-465, 0, 52]
];

const tau = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (v, period) => (v % period + period) % period;
// Offset (m), lateral displacement (m) and centre height (m) at each ring.
const patterns=[
  [[-153,0,4.2],[-72,3.2,6.8],[12,-2.4,7.6],[99,1.8,4.8]],
  [[-165,-1.4,4.1],[-88,2.9,5.8],[-9,-2,7.8],[69,3,6.7],[149,0,4.2]],
  [[-147,1.3,4.5],[-48,3.1,6.7],[48,-2.9,8.2],[148,-1.1,4.5]],
  [[-182,-1.2,4],[-109,2.8,6.2],[-34,-2.9,7.4],[42,2.5,7.1],[122,-2.6,6.1],[200,0,4.3]],
  [[-135,0,4.4],[-42,-3.1,7.8],[52,3.1,6.3],[147,0,4.4]]
];

function buildCourse({id,name,targetLength,width,turns,theme,accent,airPattern,mirrored=false}) {
  const corners = turns.map(([x,z,radius], i) => {
    const [ax,az] = turns[(i + turns.length - 1) % turns.length];
    const [bx,bz] = turns[(i + 1) % turns.length];
    const entry = Math.atan2(az-z,x-ax), exit = Math.atan2(z-bz,bx-x);
    const sweep = Math.atan2(Math.sin(exit-entry),Math.cos(exit-entry));
    const tangent=Math.tan(Math.abs(sweep)/2);
    const inset = id==='station-gp'?radius*tangent:
      Math.min(radius*tangent,.43*Math.hypot(x-ax,z-az),.43*Math.hypot(bx-x,bz-z));
    radius=inset/tangent;
    return {entry,sweep,radius,
      x:x-inset*Math.cos(entry),z:z+inset*Math.sin(entry),
      endX:x+inset*Math.cos(exit),endZ:z-inset*Math.sin(exit)};
  });
  const straights = corners.map((c,i)=>{
    const prior=corners[(i+corners.length-1)%corners.length];
    return Math.hypot(c.x-prior.endX,c.z-prior.endZ);
  });
  const scale = targetLength / corners.reduce((n,c,i)=>n+straights[i]+c.radius*Math.abs(c.sweep),0);
  const segments = [];
  const bends = [];
  let total = 0;
  function append(x,z,heading,length,curvature=0,turn=0){
    const s={x,z,heading,length,curvature,turn,start:total};
    const end=segmentPose(s,length),sag=curvature?Math.abs((1-Math.cos(curvature*length/2))/curvature):0;
    s.minX=Math.min(x,end.x)-sag;s.maxX=Math.max(x,end.x)+sag;
    s.minZ=Math.min(z,end.z)-sag;s.maxZ=Math.max(z,end.z)+sag;
    segments.push(s);total+=length;
    if(turn)bends.push(s);
  }
  for(let i=0;i<corners.length;i++){
    const c=corners[i],prior=corners[(i+corners.length-1)%corners.length];
    const x=i?prior.endX*scale:0,z=i?prior.endZ*scale:0;
    append(x,z,c.entry,Math.hypot(c.x*scale-x,c.z*scale-z));
    append(c.x*scale,c.z*scale,c.entry,c.radius*scale*Math.abs(c.sweep),Math.sign(c.sweep)/(c.radius*scale),i+1);
  }
  const last=corners.at(-1);
  append(last.endX*scale,last.endZ*scale,0,-last.endX*scale);
  const length=total;

  function segmentPose(s,d){
    const h=s.heading,k=s.curvature;
    if(!k)return {x:s.x+d*Math.cos(h),z:s.z-d*Math.sin(h),heading:h};
    const a=h+k*d;
    return {x:s.x+(Math.sin(a)-Math.sin(h))/k,z:s.z+(Math.cos(a)-Math.cos(h))/k,heading:a};
  }
  function segmentAt(d){
    let lo=0,hi=segments.length-1;
    while(lo<hi){
      const mid=(lo+hi)>>1,s=segments[mid];
      if(d<s.start+s.length)hi=mid;else lo=mid+1;
    }
    return segments[lo];
  }
  function sampleCourse(distance,lateral=0){
    const d=wrap(distance,length),s=segmentAt(d),p=segmentPose(s,d-s.start);
    return {x:p.x+Math.sin(p.heading)*lateral,z:p.z+Math.cos(p.heading)*lateral,heading:p.heading,distance};
  }
  // Three.js cars face +X and point toward -Z as yaw increases: left is positive.
  function courseCurvature(distance){return segmentAt(wrap(distance,length)).curvature;}

  function projectToCourse(point){
    let squared=Infinity,distance=0,lateral=0;
    for(const s of segments){
      const bx=Math.max(s.minX-point.x,0,point.x-s.maxX),bz=Math.max(s.minZ-point.z,0,point.z-s.maxZ);
      if(bx*bx+bz*bz>=squared)continue;
      const dx=point.x-s.x,dz=point.z-s.z,k=s.curvature,h=s.heading;
      let along;
      if(k){
        const aim=Math.atan2(dx*k+Math.sin(h),dz*k+Math.cos(h));
        const mid=h+k*s.length*.5;
        along=(mid+wrap(aim-mid+Math.PI,tau)-Math.PI-h)/k;
      }else along=dx*Math.cos(h)-dz*Math.sin(h);
      const a=clamp(along,0,s.length),p=segmentPose(s,a);
      const ex=point.x-p.x,ez=point.z-p.z,error=ex*ex+ez*ez;
      if(error<squared){
        squared=error;distance=s.start+a;lateral=ex*Math.sin(p.heading)+ez*Math.cos(p.heading);
      }
    }
    return {distance,error:Math.sqrt(squared),lateral};
  }

  // Widen the outside escape area before turn-in and taper after corner exit.
  function runoffWidth(distance,side){
    const d=wrap(distance,length);let extra=0;
    for(const b of bends){
      if(Math.sign(b.curvature)!==side)continue;
      const beyond=Math.max(0,b.start-d,d-b.start-b.length);
      if(beyond>=75)continue;
      const t=1-beyond/75;
      extra=Math.max(extra,Math.min(22,10+Math.abs(b.length*b.curvature)*5)*t*t*(3-2*t));
    }
    return 2.4+extra;
  }

  // The back straight between turns 6 and 7 has room for ascent and touchdown.
  // Keep regular timing gates out of the flight approach and landing zone.
  const backStraight=id==='station-gp'?segments[segments.indexOf(bends[5])+1]:
    segments.filter((seg,i)=>!seg.turn&&i>0&&i<segments.length-1).reduce((longest,seg)=>seg.length>longest.length?seg:longest);
  const airLayout=airPattern===undefined?AIR_GATE_LAYOUT:patterns[airPattern].map(([offset,lateral,height])=>({
    offset,aperture:{lateral:mirrored?-lateral:lateral,halfWidth:3.6,minY:height-2.5,maxY:height+2.5}
  }));
  const airSectionDistance=backStraight.start+backStraight.length*(id==='station-gp'?.53:.49);
  const gateDistances=Array.from({length:12},(_,i)=>i*length/12)
    .filter(d=>d<airSectionDistance+airLayout[0].offset-AIR_APPROACH||
      d>airSectionDistance+airLayout.at(-1).offset+95)
    .map(distance=>({distance}));
  for(const [airOrdinal,{offset,aperture}] of airLayout.entries()){
    gateDistances.push({distance:airSectionDistance+offset,air:true,airOrdinal,aperture});
  }
  const gates=gateDistances.sort((a,b)=>a.distance-b.distance).map((g,index)=>({...g,index,...sampleCourse(g.distance)}));
  const extent=segments.reduce((b,s)=>({minX:Math.min(b.minX,s.minX),maxX:Math.max(b.maxX,s.maxX),minZ:Math.min(b.minZ,s.minZ),maxZ:Math.max(b.maxZ,s.maxZ)}),{minX:0,maxX:0,minZ:0,maxZ:0});


  // Bound the chord error on curves; sparse straight stations keep GPU vertices
  // and physics prisms proportional to bends instead of total circuit length.
  const stations=[0];
  for(const s of segments){
    const step=s.curvature?Math.min(10,Math.sqrt(.35/Math.abs(s.curvature))):28;
    const n=Math.ceil(s.length/step);
    for(let i=1;i<=n;i++)stations.push(s.start+s.length*i/n);
  }
  const airGates=gates.filter(g=>g.air);
  function gridPose(slot=0){
    const lane=Number.isInteger(slot)&&slot>=0?slot:0;
    return sampleCourse(-6-9*Math.floor(lane/2),lane%2?3.15:-3.15);
  }
  return Object.freeze({id,name,theme,accent,length,width,laps:2,gates,airGates,bends,extent,airSectionDistance,airLayout,
    sample:sampleCourse,project:projectToCourse,curvature:courseCurvature,runoffWidth,stations,gridPose});
}

export const RACE_COURSE=buildCourse({id:'station-gp',name:'스테이션 그랑프리',targetLength:4381,width:16,
  turns:originalTurns,theme:'metropolis',accent:0x5cf2cb});
export const RACE_COURSES=Object.freeze([RACE_COURSE,...CIRCUIT_LAYOUTS.map(buildCourse)]);
export const getRaceCourse=id=>RACE_COURSES.find(course=>course.id===id)||RACE_COURSE;
export const {sample:sampleCourse,project:projectToCourse,curvature:courseCurvature,runoffWidth,stations:circuitStations}=RACE_COURSE;
