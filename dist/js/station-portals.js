import {CITY_MAP_SCALE} from './city-minimap.js?v=20261118-race152';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const GATE_HALF_WIDTH=3.2;
const labelFor=(station,ref)=>[station?(station.endsWith('역')?station:station+'역'):'지하철역',ref?ref+'번 출구':'출입구'].join(' ');
const idFor=(x,z)=>x+','+z;

/** The exit itself may be indoors or behind a stairwell. Put its driving gate
 * on the near kerb of a mapped surface road, facing from the road to the exit.
 * The existing stairwell also accepts cars entering its open end. */
export function planStationPortal(entry,segments,shelter,blocked=()=>false,existing=[]){
  const [ex,ez,ref,station]=entry;
  const roads=[];
  for(const s of segments){
    if(s.road.tunnel===true||s.road.tunnel==='yes'||Number(s.road.layer)<0)continue;
    const t=clamp((ex-s.a[0])*s.dx+(ez-s.a[1])*s.dz,0,s.length);
    const x=s.a[0]+s.dx*t,z=s.a[1]+s.dz*t,distance=Math.hypot(ex-x,ez-z);
    roads.push({s,t,distance});
  }
  if(!roads.length)return null;
  roads.sort((a,b)=>a.distance-b.distance);
  const candidates=[];
  for(const {s,t,distance} of roads){
    if(distance>roads[0].distance+48)break;
    const side=(ex-s.a[0])*(-s.dz)+(ez-s.a[1])*s.dx>=0?1:-1;
    const dx=-s.dz*side,dz=s.dx*side,kerb=Math.max(.9,s.width/2-.5);
    const positions=new Set([0,4,-4,8,-8,12,-12,18,-18,25,-25].map(shift=>clamp(t+shift,0,s.length)));
    for(const at of positions){
      const x=s.a[0]+s.dx*at+dx*kerb,z=s.a[1]+s.dz*at+dz*kerb;
      // A longer segment keeps the arch clear of the middle of an intersection.
      const score=Math.hypot(x-ex,z-ez)+Math.max(0,3-Math.min(at,s.length-at))*.8;
      candidates.push({x,z,dx,dz,at,s,side,score});
    }
  }
  candidates.sort((a,b)=>a.score-b.score);
  let first;
  for(const candidate of candidates){
    const {x,z,dx,dz,at,s,side}=candidate,direction=s.road.oneway?1:side;
    const rejoinAt=clamp(at+direction*7,0,s.length),lane=Math.max(0,s.width/2-2.2);
    candidate.returnPose={position:[s.a[0]+s.dx*rejoinAt+dx*lane,0,s.a[1]+s.dz*rejoinAt+dz*lane],heading:Math.atan2(-s.dz*direction,s.dx*direction)};
    if(existing.some(g=>Math.hypot(g.x-x,g.z-z)<7.5))continue;
    first??=candidate;
    const [rx,,rz]=candidate.returnPose.position;
    if(!blocked(x-dx*2,z-dz*2,dx,dz,5.5,1.55)&&!blocked(rx,rz,s.dx,s.dz,3.5,1.55)){first=candidate;break;}
  }
  const {x,z,dx,dz,returnPose}=first||candidates[0];
  const gate={id:idFor(ex,ez),label:labelFor(station,ref),x,z,dx,dz,heading:Math.atan2(-dz,dx),
    returnPose};
  if(shelter)gate.mouth={x:ex+shelter.dx*3.5,z:ez+shelter.dz*3.5,dx:-shelter.dx,dz:-shelter.dz};
  return gate;
}

/** Clearance of the whole parked or swept car rectangle against a solid
 * footprint, including thin masts that a handful of point samples can miss. */
export function blocksStationApproach(solids,x,z,dx,dz,length,width){
  const reachX=Math.abs(dx)*length+Math.abs(dz)*width,reachZ=Math.abs(dz)*length+Math.abs(dx)*width;
  for(const o of solids){
    const [ox,oy,oz]=o.center,[w,h,d]=o.size;
    if(oy-h/2>2.8||oy+h/2<.1||Math.abs(x-ox)>reachX+w/2||Math.abs(z-oz)>reachZ+d/2)continue;
    const points=o.footprint||[[ox-w/2,oz-d/2],[ox+w/2,oz-d/2],[ox+w/2,oz+d/2],[ox-w/2,oz+d/2]];
    const separated=(nx,nz)=>{
      let min=Infinity,max=-Infinity;
      for(const [px,pz] of points){const projection=(px-x)*nx+(pz-z)*nz;min=Math.min(min,projection);max=Math.max(max,projection);}
      const radius=length*Math.abs(dx*nx+dz*nz)+width*Math.abs(-dz*nx+dx*nz);
      return min>radius||max< -radius;
    };
    if(separated(dx,dz)||separated(-dz,dx))continue;
    if(!points.some((a,i)=>{const b=points[(i+1)%points.length];return separated(a[1]-b[1],b[0]-a[0]);}))return true;
  }
  return false;
}

export function portalFurniture(gate){
  const {x,z,dx,dz,heading}=gate,boxes=[];
  const box=(along,y,side,w,h,d,color)=>boxes.push({
    x:x+dx*along-dz*side,y,z:z+dz*along+dx*side,w,h,d,angle:heading,color
  });
  const gold=0xffc14c,dark=0x162a33,white=0xfff5dc;
  // A painted entry line and two chevrons point into the gate.
  box(0,.048,0,.26,.027,GATE_HALF_WIDTH*2,gold);
  for(const side of [-1,1]){
    box(0,1.82,side*(GATE_HALF_WIDTH+.15),.22,3.64,.22,dark);
    box(0,2.55,side*(GATE_HALF_WIDTH+.15),.23,1.6,.23,gold);
    for(let i=0;i<3;i++)box(-.7-i*.29,.05,side*(.22+i*.37),.35,.025,.54,gold);
  }
  box(0,3.7,0,.24,.31,GATE_HALF_WIDTH*2+.52,dark);
  for(let i=0;i<12;i++)for(let row=0;row<2;row++)if((i+row)%2===0){
    box(0,3.62+row*.15,(i-5.5)*.48,.25,.145,.48,white);
  }
  return boxes;
}

function crosses(previous,current,gate,halfWidth){
  const ax=previous.x-gate.x,az=previous.z-gate.z;
  const sx=current.x-previous.x,sz=current.z-previous.z;
  const start=ax*gate.dx+az*gate.dz,delta=sx*gate.dx+sz*gate.dz;
  // Ignore merely passing along the street and approaching from behind.
  if(start>=0||start+delta<0||delta<=Math.hypot(sx,sz)*.12)return false;
  const t=-start/delta,y=previous.y+(current.y-previous.y)*t;
  return y>=-.3&&y<=2.5&&Math.abs(-(ax+t*sx)*gate.dz+(az+t*sz)*gate.dx)<=halfWidth;
}

export function createStationPortals(cells,entrances=[]){
  let suppressed=null;
  const distant=entrances.map(([x,z,ref,station])=>({x,z,id:idFor(x,z),label:labelFor(station,ref)}));
  function nearest(x,z){
    let best=null,dist2=Infinity;
    for(const cell of cells.values())for(const gate of cell.gates){
      const distance=(gate.x-x)**2+(gate.z-z)**2;
      if(distance<dist2){best=gate;dist2=distance;}
    }
    // Outside the built cells, guide the driver to the next mapped exit
    // until its road geometry and exact gate position stream into view.
    if(!best||dist2>350**2)for(const gate of distant){
      const distance=(gate.x-x)**2+(gate.z-z)**2;
      if(distance<dist2){best=gate;dist2=distance;}
    }
    return best?{...best,distance:Math.sqrt(dist2)}:null;
  }
  return {
    nearest,reset(){suppressed=null;},suppress(gate){suppressed=gate;},
    crossing(previous,current){
      if(!previous||!current)return null;
      if(suppressed&&Math.hypot(current.x-suppressed.x,current.z-suppressed.z)>18)suppressed=null;
      if(previous.x===current.x&&previous.z===current.z)return null;
      const minX=Math.min(previous.x,current.x)-GATE_HALF_WIDTH,maxX=Math.max(previous.x,current.x)+GATE_HALF_WIDTH;
      const minZ=Math.min(previous.z,current.z)-GATE_HALF_WIDTH,maxZ=Math.max(previous.z,current.z)+GATE_HALF_WIDTH;
      const hits=(p,width)=>p&&p.x>=minX&&p.x<=maxX&&p.z>=minZ&&p.z<=maxZ&&crosses(previous,current,p,width);
      for(const cell of cells.values())for(const gate of cell.gates){
        if(gate.id===suppressed?.id)continue;
        if(hits(gate,GATE_HALF_WIDTH)||hits(gate.mouth,1.4)){suppressed=gate;return gate;}
      }
      return null;
    },
    drawMap(ctx,x,z){
      const {width,height}=ctx.canvas,halfW=width/2,halfH=height/2;
      ctx.save();
      for(const cell of cells.values())for(const gate of cell.gates){
        const px=halfW+(gate.x-x)*CITY_MAP_SCALE,pz=halfH+(gate.z-z)*CITY_MAP_SCALE;
        if(px<4||pz<4||px>width-4||pz>height-4)continue;
        ctx.fillStyle='#fbc45b';ctx.strokeStyle='#17252d';ctx.lineWidth=1.5;
        ctx.beginPath();ctx.moveTo(px,pz-5);ctx.lineTo(px+5,pz);ctx.lineTo(px,pz+5);ctx.lineTo(px-5,pz);ctx.closePath();ctx.fill();ctx.stroke();
      }
      const target=nearest(x,z);
      if(target){
        const u=(target.x-x)*CITY_MAP_SCALE,v=(target.z-z)*CITY_MAP_SCALE;
        const ratio=Math.max(Math.abs(u)/(halfW-9),Math.abs(v)/(halfH-9));
        if(ratio>1){ctx.translate(halfW+u/ratio,halfH+v/ratio);ctx.rotate(Math.atan2(v,u));ctx.fillStyle='#fbc45b';ctx.beginPath();ctx.moveTo(6,0);ctx.lineTo(-4,-4.5);ctx.lineTo(-4,4.5);ctx.closePath();ctx.fill();}
      }
      ctx.restore();
    }
  };
}
