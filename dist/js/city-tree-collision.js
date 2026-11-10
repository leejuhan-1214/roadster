import {TREE_COLLISION_PROFILE} from './city-tree-profile.js?v=20261111-trees1';
export {TREE_COLLISION_PROFILE} from './city-tree-profile.js?v=20261111-trees1';

// Keep this planted origin identical to the instanced model transform.
export const TREE_BASE_Y=.006;

/** Convex stem/fork slices in world coordinates. The profile follows the bundled
 * curved trunk mesh. Separate twig cards and leaves are intentionally permeable.
 * Placements may be tile-local; origin translates them exactly once into world space.
 */
export function treeColliders(placement,{origin=[0,0],id='tree-'+placement.x+'-'+placement.z,profile=TREE_COLLISION_PROFILE}={}){
  const {x,z,height}=placement,rotation=placement.rotation??0;
  if(![x,z,height,rotation,...origin].every(Number.isFinite)||height<=0||origin.length!==2)
    throw new TypeError('Tree placement needs finite coordinates, yaw and positive height.');
  if(!Number.isFinite(profile.height)||profile.height<=0||!Array.isArray(profile.pieces))
    throw new TypeError('Tree collision profile needs a positive source height and convex pieces.');
  const scale=height/profile.height,c=Math.cos(rotation),s=Math.sin(rotation),worldX=x+origin[0],worldZ=z+origin[1];
  return profile.pieces.map((piece,index)=>{
    const footprint=piece.footprint.map(([px,pz])=>[worldX+scale*(c*px+s*pz),worldZ+scale*(-s*px+c*pz)]);
    const xs=footprint.map(p=>p[0]),zs=footprint.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
    const bottom=TREE_BASE_Y+piece.bottom*scale,top=TREE_BASE_Y+piece.top*scale;
    return {id:id+'-'+index,treeId:id,category:'tree',kind:'prism',footprint,
      center:[(minX+maxX)/2,(bottom+top)/2,(minZ+maxZ)/2],size:[maxX-minX,top-bottom,maxZ-minZ]};
  });
}
