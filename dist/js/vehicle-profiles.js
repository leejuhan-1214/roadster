// Visual replicas, not OEM CAD. Published reference dimensions and masses are
// separate from the shared experimental electric/cold-gas conversion assumptions.
export const VEHICLES = Object.freeze([
  {id:'roadster', title:'Tesla Roadster 2020', short:'Roadster 2020', brand:'Tesla', model:'Roadster',
    author:'metarex.4d', license:'CC BY 4.0', licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
    source:'https://sketchfab.com/3d-models/tesla-roadster-2020-1fbf29e297bd4a17ac39a00a378441d8',
    reference:'2020 콘셉트 · 가정 치수', dryMass:1900},
  {id:'ferrari', title:'Ferrari 458 Spider', short:'458 Spider', brand:'Ferrari', model:'458 Spider',
    author:'vicent091036', license:'CC BY 4.0', licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
    source:'https://sketchfab.com/3d-models/ferrari-458-italia-57bf6cc56931426e87494f554df1dab6',
    url:'../assets/vehicles/ferrari.glb', yaw:-Math.PI/2, paint:'Body_Color',
    reference:'4.527 m · 축간 2.650 m', length:4.527,width:1.937,height:1.211,wheelbase:2.650,
    dryMass:1685, referenceMass:1535, rigMass:150},
  {id:'bmw', title:'BMW M3 E30', short:'M3 E30', brand:'BMW', model:'M3 E30',
    author:'Martin Trafas', license:'CC BY 4.0', licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
    source:'https://sketchfab.com/3d-models/free-bmw-m3-e30-ac3c7013434e403e8faff87948caf422',
    url:'../assets/vehicles/bmw.glb', yaw:Math.PI/2, paint:'BMW_E30_M3_PAINT',
    reference:'4.345 m · 축간 2.562 m', length:4.345,width:1.680,height:1.370,wheelbase:2.562,
    dryMass:1350, referenceMass:1200, rigMass:150},
]);
export function vehicleProfile(id){const profile=VEHICLES.find(v=>v.id===id);if(!profile)throw new Error('알 수 없는 차종');return profile;}

export function vehiclePhysics(profile, geometry, defaults){
  if(profile.id==='roadster')return {...defaults};
  const m=profile.dryMass, l=profile.length,w=profile.width,h=profile.height;
  return {...defaults,...geometry,dryMass:m,
    // Box-inertia estimate, not measured OEM inertia. Same spring/damper/rig.
    inertiaRoll:m*(w*w+h*h)/12,inertiaYaw:m*(l*l+w*w)/12,inertiaPitch:m*(l*l+h*h)/12};
}
