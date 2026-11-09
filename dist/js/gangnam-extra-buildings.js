import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const ASSETS=new URL('../assets/city-buildings/',import.meta.url);
let pending;

/** Load original exterior reconstructions placed on the OSM landmark footprints. */
export function loadExtraGangnamBuildings(){
  if(!pending)pending=Promise.all([
    new GLTFLoader().loadAsync(new URL('extra-landmarks.glb',ASSETS).href),
    fetch(new URL('extra-landmarks.json',ASSETS)).then(r=>{if(!r.ok)throw new Error('Gangnam landmark metadata: '+r.status);return r.json();})
  ]).then(([gltf,manifest])=>{
    const root=gltf.scene;root.name='Gangnam original landmark reconstructions';
    root.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;node.frustumCulled=true;}});
    root.userData={...root.userData,source:'Original exterior reconstructions from public references',modelCount:manifest.modelCount,triangles:manifest.triangles};
    return {root,replacedBuildingIds:new Set(manifest.replacedBuildingIds),removedBuildingIds:manifest.removedBuildingIds,buildingHeightOverrides:manifest.buildingHeightOverrides,additionalBuildings:manifest.additionalBuildings,collisionSolids:manifest.collisionSolids,skipCollisionBuildingIds:manifest.skipCollisionBuildingIds,manifest};
  }).catch(error=>{pending=undefined;throw error;});
  return pending;
}
