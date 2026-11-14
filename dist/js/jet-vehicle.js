import {VEHICLES as BODY_PROFILES,vehiclePhysics as bodyPhysics} from './vehicle-profiles.js';
import {JET_PARAMS,JET_RIG_MASS} from './jet-engine.js?v=20261115-jet1';
// App-facing air-breathing experiment. Archived cold-gas profiles remain available
// for reproducible older numerical studies; no compressed-air tank is used here.
export const VEHICLES=Object.freeze(BODY_PROFILES.map(p=>Object.freeze({...p,
 propulsionKind:'air-breathing-jet',rigMass:JET_RIG_MASS.total,
 fuelCapacityKg:JET_PARAMS.fuelCapacityKg,dryMass:p.referenceMass+JET_RIG_MASS.total})));
export function vehicleProfile(id){const p=VEHICLES.find(v=>v.id===id);if(!p)throw Error('알 수 없는 차종');return p;}
export function vehiclePhysics(profile,geometry={},defaults={}){
 const p=bodyPhysics({...profile,dryMass:profile.referenceMass},geometry,defaults);
 const g=geometry||{},x=g.liftX??p.liftX,z=g.liftZ??p.liftZ,y=g.liftY??p.liftY;
 const m=JET_RIG_MASS.total,l=profile.length??4.7,w=profile.width??2.2,h=profile.height??1.27;
 // Fixed principal inertias: original-body box plus evenly distributed rig.
 // Fuel is centrally carried; geometry/mass distribution are stated assumptions.
 return {...p,...JET_PARAMS,...g,dryMass:profile.dryMass,propulsionKind:'air-breathing-jet',
 inertiaRoll:profile.referenceMass*(w*w+h*h)/12+m*(z*z+y*y),
 inertiaYaw:profile.referenceMass*(l*l+w*w)/12+m*(x*x+z*z),
 inertiaPitch:profile.referenceMass*(l*l+h*h)/12+m*(x*x+y*y)};
}
