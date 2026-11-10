import {ShapeUtils,Vector2,Vector3} from 'three';

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
  const points=building.points;
  let pieces=ShapeUtils.triangulateShape(points.map(p=>new Vector2(...p)),[])
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

export function preparePrism(box){
  const points=box.footprint;
  if(!Array.isArray(points)||points.length<3||!points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))||area(points)<1e-8)
    throw new TypeError('A prism needs a finite convex footprint.');
  const result=points.map(p=>[...p]);
  if(result.some(p=>!containsFootprint(result,...p)))throw new TypeError('Obstacle footprint must be convex.');
  return result;
}

/** SAT between the oriented car envelope and a vertical convex prism. */
export function prismContact(sim,obstacle){
  const {pos,q}=sim.state,half=sim.bodyHalf;
  const center=sim.bodyBoxCenter.clone().sub(sim.cg).applyQuaternion(q).add(pos);
  const radius=Math.hypot(...half);
  if(center.x+radius<obstacle.min.x||center.x-radius>obstacle.max.x||
     center.y+radius<obstacle.min.y||center.y-radius>obstacle.max.y||
     center.z+radius<obstacle.min.z||center.z-radius>obstacle.max.z)return null;
  const axes=[new Vector3(1,0,0),new Vector3(0,1,0),new Vector3(0,0,1)].map(a=>a.applyQuaternion(q));
  const points=obstacle.footprint,edges=[new Vector3(0,1,0)],faces=[new Vector3(0,1,0)];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],edge=new Vector3(b[0]-a[0],0,b[1]-a[1]).normalize();
    edges.push(edge);faces.push(new Vector3(-edge.z,0,edge.x));
  }
  const candidates=[...axes,...faces];
  for(const a of axes)for(const b of edges)candidates.push(new Vector3().crossVectors(a,b));
  let depth=Infinity,normal;
  for(const candidate of candidates){
    if(candidate.lengthSq()<1e-12)continue;
    const axis=candidate.clone().normalize(),c=center.dot(axis),r=axes.reduce((s,a,i)=>s+half[i]*Math.abs(a.dot(axis)),0);
    let low=Infinity,high=-Infinity;
    for(const p of points)for(const y of [obstacle.min.y,obstacle.max.y]){const d=p[0]*axis.x+y*axis.y+p[1]*axis.z;low=Math.min(low,d);high=Math.max(high,d);}
    const positive=high-(c-r),negative=(c+r)-low;
    if(positive<=0||negative<=0)return null;
    const overlap=Math.min(positive,negative);
    if(overlap<depth){depth=overlap;normal=axis.multiplyScalar(positive<negative?1:-1);}
  }
  const point=center.clone();
  axes.forEach((a,i)=>{const projection=normal.dot(a);if(Math.abs(projection)>1e-7)point.addScaledVector(a,-Math.sign(projection)*half[i]);});
  point.y=Math.max(obstacle.min.y,Math.min(obstacle.max.y,point.y));
  if(!containsFootprint(points,point.x,point.z)){
    let best=Infinity,nearest;
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],dx=b[0]-a[0],dz=b[1]-a[1];
      const t=Math.max(0,Math.min(1,((point.x-a[0])*dx+(point.z-a[1])*dz)/(dx*dx+dz*dz)));
      const x=a[0]+t*dx,z=a[1]+t*dz,d=(point.x-x)**2+(point.z-z)**2;
      if(d<best){best=d;nearest=[x,z];}
    }
    point.x=nearest[0];point.z=nearest[1];
  }
  return {normal,depth,point};
}
