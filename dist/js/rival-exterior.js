import * as THREE from 'three';
import {loadRealVehicle,disposeVehicle} from './real-vehicle-model.js?v=20261118-model154';
import {vehicleProfile} from './vehicle-profiles.js?v=20261118-model154';
import {copyVehiclePaint} from './vehicle-paint.js?v=20261111-paint1';
import {RIVAL_LENGTH} from './race-contact.js?v=20261118-model154';

const profile=vehicleProfile('nissan-proto');
export function loadRivalExterior(){return loadRealVehicle(profile).then(rivalExteriorTemplate);}

// The three opponents use one licensed Z Proto geometry and texture set.
// Their lap positions, headings and collision envelope remain in race metres.
export function rivalExteriorTemplate(vehicle){
  const prototype=new THREE.Group(),shell=[vehicle.parts.get('body'),vehicle.parts.get('cabin')];
  prototype.add(...shell,...vehicle.wheels);
  disposeVehicle(vehicle,prototype); // release the experimental inspection hardware
  prototype.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(prototype,true);
  const centre=bounds.getCenter(new THREE.Vector3()),scale=RIVAL_LENGTH/(bounds.max.x-bounds.min.x);
  const floor=Math.min(...vehicle.cityWheelGeometry.map(w=>w.y-w.radius));
  const paint=new Set(vehicle.paintMaterials);
  return {create(color){
    const root=new THREE.Group(),paints=new Map(),wheels=[];
    root.name='Nissan Z Proto · Lexyc16';root.userData.source=profile.source;
    root.scale.setScalar(scale);root.position.set(-centre.x*scale,-floor*scale,-centre.z*scale);
    function appearance(m){
      if(!paint.has(m))return m;
      if(!paints.has(m)){
        const own=copyVehiclePaint(m,m.clone());own.color.setHex(color);paints.set(m,own);
      }
      return paints.get(m);
    }
    function copy(part){
      // Copy the rigid transforms only. The inspector's userData references its
      // entire wheel hierarchy, which should never be cloned for a race rival.
      const child=part.isMesh?new THREE.Mesh(part.geometry,Array.isArray(part.material)?part.material.map(appearance):appearance(part.material)):new THREE.Group();
      child.position.copy(part.position);child.quaternion.copy(part.quaternion);child.scale.copy(part.scale);
      child.name=part.name;child.castShadow=part.castShadow;child.receiveShadow=part.receiveShadow;
      for(const item of part.children)child.add(copy(item));
      return child;
    }
    for(const group of shell)root.add(copy(group));
    vehicle.wheels.forEach((original,i)=>{
      const pivot=copy(original),spin=pivot.children[original.children.indexOf(original.userData.spinGroup)];
      const radius=vehicle.cityWheelGeometry[i].radius*scale;
      root.add(pivot);wheels.push({pivot,spin,radius,front:i<2});
    });
    return {root,wheels,dispose(){root.removeFromParent();for(const mat of paints.values())mat.dispose();}};
  },dispose(){disposeVehicle({root:prototype});prototype.clear();}};
}
