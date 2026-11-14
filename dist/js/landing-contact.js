/** Common educational landing rig. Published spring scale is not an OEM fitment.
 * Compression is the combined massless tire/suspension coordinate, from full droop.
 * Progressive bump force is conservative; viscous damping can only dissipate.
 */
export const CONTACT_DEFAULTS=Object.freeze({
  springK:70000, damperC:4000, bumpStopStart:.12, suspensionTravel:.18,
  bumpStopK:1e6, bumpStopExponent:1.5, bodyContactK:420000,
  bodyContactC:6500, bodyContactSkin:.006, groundRestitution:.05,
});
const val=(p,k)=>Number.isFinite(p[k])?Math.max(0,p[k]):CONTACT_DEFAULTS[k];
export function suspensionResponse(compression,compressionRate,params={}){
  const x=Math.max(0,compression),k=val(params,'springK'),c=val(params,'damperC');
  const start=val(params,'bumpStopStart'),travel=Math.max(start+.001,val(params,'suspensionTravel'));
  const length=travel-start,over=Math.max(0,x-start),exponent=Math.max(1,val(params,'bumpStopExponent'));
  const stiffness=val(params,'bumpStopK'),bumpForce=stiffness*length*(over/length)**exponent;
  const springForce=k*x+bumpForce,viscous=c*compressionRate;
  const force=x>0?Math.max(0,springForce+viscous):0;
  return {force,springForce,bumpForce,linearEnergyJ:.5*k*x*x,
    bumpEnergyJ:stiffness*length*length/(exponent+1)*(over/length)**(exponent+1),
    // Clamp-on-rebound can remove all normal support but never creates adhesion.
    dissipationW:x>0?Math.max(0,(force-springForce)*compressionRate):0,
    beyondTravel:x>travel};
}
export function suspensionStaticCompression(load,params={}){
  if(!(load>0))return 0;
  let low=0,high=.1;
  while(suspensionResponse(high,0,params).force<load&&high<10)high*=2;
  for(let i=0;i<64;i++){const mid=(low+high)/2;if(suspensionResponse(mid,0,params).force<load)low=mid;else high=mid;}
  return (low+high)/2;
}
