import {TREE_COLLISION_PROFILE} from './city-tree-profile.js?v=20261111-trees2';
import {SPECIES_COLLISION_PROFILES} from './city-species-profiles.js?v=20261111-trees2';
import {TREE_BASE_Y,resolveTreePlacement,treeLinearTransform} from './city-tree-mix.js?v=20261111-trees2';
export {TREE_COLLISION_PROFILE};
export {TREE_BASE_Y};
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function hull(points){
 const sorted=[...new Map(points.map(p=>[p.join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const half=ps=>{const h=[];for(const p of ps){while(h.length>1&&cross(h.at(-2),h.at(-1),p)<=1e-12)h.pop();h.push(p);}return h;};
 return [...half(sorted).slice(0,-1),...half([...sorted].reverse()).slice(0,-1)];
}
/** Solid stem/forks for the exact rendered species, variant and stance.
 * No species means the original scanned-asset path, with explicit placement height.
 * Leaves and thin twigs are permeable. Profiles stay static during cosmetic wind. */
export function treeColliders(placement,{origin=[0,0],id='tree-'+placement.x+'-'+placement.z,profile=null}={}){
 const p=placement.species?resolveTreePlacement(placement):placement;
 const {x,z,height}=p,rotation=p.rotation??0;
 if(![x,z,height,rotation,...origin].every(Number.isFinite)||height<=0||origin.length!==2)throw new TypeError('Tree placement needs finite coordinates, yaw and positive height.');
 const scanned=!placement.species||p.species==='small';
 profile??=scanned?TREE_COLLISION_PROFILE:SPECIES_COLLISION_PROFILES[p.species+':'+p.variantIndex];
 if(!profile||!Number.isFinite(profile.height)||profile.height<=0||!Array.isArray(profile.pieces))throw new TypeError('Missing tree collision profile.');
 const m=treeLinearTransform(p,profile.height,{scanned}),worldX=x+origin[0],worldZ=z+origin[1];
 return profile.pieces.map((piece,index)=>{
  const points=piece.footprint.flatMap(([px,pz])=>[piece.bottom,piece.top].map(y=>[m[0]*px+m[1]*y+m[2]*pz,m[3]*px+m[4]*y+m[5]*pz,m[6]*px+m[7]*y+m[8]*pz]));
  // A tilted slice's complete convex projection retains the visible fork across tile seams.
  const footprint=hull(points.map(p=>[p[0],p[2]])).map(p=>[worldX+p[0],worldZ+p[1]]);
  const xs=footprint.map(p=>p[0]),zs=footprint.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  const bottom=TREE_BASE_Y+Math.min(...points.map(p=>p[1])),top=TREE_BASE_Y+Math.max(...points.map(p=>p[1]));
  return {id:id+'-'+index,treeId:id,category:'tree',kind:'prism',footprint,center:[(minX+maxX)/2,(bottom+top)/2,(minZ+maxZ)/2],size:[maxX-minX,top-bottom,maxZ-minZ]};
 });
}
