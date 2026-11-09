import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

/** Original geometry, bundled as a real GLB rather than generated at runtime. */
export async function loadGangnamLandmarks(){
  const [gltf,response]=await Promise.all([
    new GLTFLoader().loadAsync(new URL('../assets/city-buildings/original-landmarks.glb',import.meta.url).href),
    fetch(new URL('../assets/city-buildings/manifest.json',import.meta.url)),
  ]);
  if(!response.ok)throw new Error('강남 랜드마크의 배치 정보를 불러오지 못했습니다.');
  const manifest=await response.json(),root=gltf.scene;
  root.name='Gangnam landmarks · original reconstruction';
  root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  root.userData.landmarks=manifest.buildings;
  return {root,manifest,replacedBuildingIds:manifest.replacedBuildingIds,
    buildingHeightOverrides:manifest.buildingHeightOverrides,
    additionalBuildings:manifest.additionalBuildings,removedBuildingIds:manifest.removedBuildingIds,
    collisionSolids:manifest.collisionSolids,skipCollisionBuildingIds:manifest.skipCollisionBuildingIds};
}
