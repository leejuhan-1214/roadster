const AVENUES=new Set(['motorway','trunk','primary','secondary']);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const widthOf=road=>road.width>2&&road.width<55?road.width:road.lanes>0&&road.lanes<15?road.lanes*3.15+.8:({trunk:15,primary:13,secondary:11,tertiary:9,residential:6.2,unclassified:6.2,living_street:5,service:4.5})[road.type]||6;

/** Straight pieces of the given roads, pointing the way traffic flows on a one-way street. */
export function roadSegments(roads){
  const segments=[];
  for(const road of roads){
    const points=road.onewayDirection===-1?road.points.slice().reverse():road.points,width=widthOf(road);
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.2)continue;
      segments.push({road,width,a,b,dx:dx/length,dz:dz/length,length});
    }
  }
  return segments;
}
export const pointOn=(s,t,offset=0)=>[s.a[0]+s.dx*t-s.dz*offset,s.a[1]+s.dz*t+s.dx*offset];
// The opposite carriageway of a divided avenue, found on the driver's left.
function sibling(s,segments){
  const mx=(s.a[0]+s.b[0])/2,mz=(s.a[1]+s.b[1])/2;let best=null;
  for(const c of segments){
    if(c.road===s.road||c.road.id===s.road.id||!c.road.oneway||c.road.name!==s.road.name||c.dx*s.dx+c.dz*s.dz>-.6)continue;
    const t=clamp((mx-c.a[0])*c.dx+(mz-c.a[1])*c.dz,0,c.length),qx=c.a[0]+c.dx*t-mx,qz=c.a[1]+c.dz*t-mz;
    const lateral=qx*s.dz-qz*s.dx,along=qx*s.dx+qz*s.dz;
    if(lateral>3&&lateral<46&&Math.abs(along)<14&&(!best||lateral<best.distance))best={segment:c,distance:lateral};
  }
  return best;
}

// Use the same road strips and end caps to draw the centre pavement and to
// keep generated roadside fixtures off it. Wide medians retain their verge.
export function planMedianPavement(segments,inside=()=>true){
  const plan={fills:[],patches:[],lines:[]};
  for(const s of segments){
    if(!s.road.oneway||!s.road.name||!AVENUES.has(s.road.type)||!inside((s.a[0]+s.b[0])/2,(s.a[1]+s.b[1])/2))continue;
    const other=sibling(s,segments);if(!other)continue;
    const half=s.width/2,centre=other.distance/2;
    // A real, wide median (more than 7.5 m of it on this side) is left unpaved.
    if(centre-half>7.5)continue;
    if(centre>half+.05){
      plan.fills.push({s,from:-centre-.03,to:-half+.05});
      for(const t of [0,s.length])plan.patches.push({p:pointOn(s,t,-centre),radius:centre});
    }
    // One of the two ways draws the double centre line.
    if(String(s.road.id)<String(other.segment.road.id))for(const side of [-1,1])plan.lines.push({s,from:-centre+side*.14-.06,to:-centre+side*.14+.06,color:'yellow'});
    if(s.road.name.includes('강남대로'))plan.lines.push({s,from:-centre+3.21,to:-centre+3.39,color:'blue'});
  }
  return plan;
}

export function pavedMedianMask(roads){
  const eligible=roads.filter(r=>r.oneway&&r.name&&AVENUES.has(r.type)&&r.tunnel!==true&&r.tunnel!=='yes'&&!(Number(r.layer)<0));
  const byName=new Map();
  for(const road of eligible){
    if(!byName.has(road.name))byName.set(road.name,[]);
    byName.get(road.name).push(road);
  }
  const fills=[],patches=[];
  for(const ways of byName.values()){
    const plan=planMedianPavement(roadSegments(ways));
    fills.push(...plan.fills);patches.push(...plan.patches);
  }
  return (x,z)=>{
    for(const {s,from,to} of fills){
      const dx=x-s.a[0],dz=z-s.a[1],along=dx*s.dx+dz*s.dz,across=-dx*s.dz+dz*s.dx;
      if(along>=0&&along<=s.length&&across>=from&&across<=to)return true;
    }
    return patches.some(({p,radius})=>(x-p[0])**2+(z-p[1])**2<=radius*radius);
  };
}
