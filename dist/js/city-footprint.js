import {ShapeUtils,Vector2} from '../vendor/three.module.js';
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0))*.5;
function hull(points){
  const p=[...new Map(points.map(a=>[a.join(','),a])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const half=items=>{const h=[];for(const a of items){while(h.length>1&&cross(h.at(-2),h.at(-1),a)<=1e-10)h.pop();h.push(a);}return h;};
  return [...half(p).slice(0,-1),...half([...p].reverse()).slice(0,-1)];
}

/** Exact footprint coverage, with convex pieces rather than recessed AABB strips.
 * Merge adjacent triangles only when their convex hull has the same area: the
 * missing corner of an L-shaped building/courtyard must remain driveable.
 */
export function buildingColliders(building){
  const openRing=ring=>{const p=ring.map(a=>[a[0],a[1]]);if(p.length>1&&p[0][0]===p.at(-1)[0]&&p[0][1]===p.at(-1)[1])p.pop();return p;};
  const outer=openRing(building.points),holes=(building.holes||[]).map(openRing).filter(r=>r.length>=3);
  const points=[...outer,...holes.flat()];
  let pieces=ShapeUtils.triangulateShape(outer.map(p=>new Vector2(...p)),holes.map(r=>r.map(p=>new Vector2(...p))))
    .map(ids=>ids.map(i=>points[i])).filter(p=>area(p)>1e-8);
  let merged=true;
  while(merged){merged=false;
    outer:for(let i=0;i<pieces.length;i++)for(let j=i+1;j<pieces.length;j++){
      const shared=pieces[i].filter(a=>pieces[j].some(b=>a[0]===b[0]&&a[1]===b[1]));
      if(shared.length<2)continue;
      const combined=hull([...pieces[i],...pieces[j]]);
      if(Math.abs(area(combined)-area(pieces[i])-area(pieces[j]))>1e-6)continue;
      pieces[i]=combined;pieces.splice(j,1);merged=true;break outer;
    }
  }
  return pieces.map((footprint,i)=>{
    const xs=footprint.map(p=>p[0]),zs=footprint.map(p=>p[1]);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
    return {id:'building-'+building.id+'-'+i,kind:'prism',footprint,
      center:[(minX+maxX)/2,building.height/2,(minZ+maxZ)/2],size:[maxX-minX,building.height,maxZ-minZ]};
  });
}

export function containsFootprint(points,x,z){
  let positive=false,negative=false;
  for(let i=0;i<points.length;i++){
    const c=cross(points[i],points[(i+1)%points.length],[x,z]);
    positive ||= c>1e-8;negative ||= c< -1e-8;
    if(positive&&negative)return false;
  }
  return true;
}

