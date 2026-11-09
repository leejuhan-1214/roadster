import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

export const TREE_LOD_DISTANCES=[0,85,280];
export const TREE_TILE_SIZE=96;

export async function loadCityTreeAsset(){
  const gltf=await new GLTFLoader().loadAsync(new URL('../assets/trees/tree-small-02.gltf',import.meta.url).href);
  gltf.scene.updateMatrixWorld(true);
  const levels=[0,1].map(index=>{
    const source=gltf.scene.getObjectByName('TreeSmall02_LOD'+index);
    if(!source)throw new Error('나무 모델의 상세도 데이터를 찾지 못했습니다.');
    const parts=[];
    source.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld),material=mesh.material;
      material.roughness=.88;material.metalness=0;material.envMapIntensity=.5;
      if(material.alphaTest>0){material.transparent=false;material.depthWrite=true;material.alphaToCoverage=true;material.side=THREE.DoubleSide;}
      for(const texture of [material.map,material.normalMap])if(texture)texture.anisotropy=4;
      parts.push({geometry,material});
    });
    return parts;
  });
  const bounds=new THREE.Box3();
  for(const part of levels[0]){part.geometry.computeBoundingBox();bounds.union(part.geometry.boundingBox);}
  for(const level of levels)for(const part of level){part.geometry.translate(0,-bounds.min.y,0);part.geometry.computeBoundingSphere();}
  gltf.scene.traverse(mesh=>{if(mesh.geometry)mesh.geometry.dispose();});
  return {levels,height:bounds.max.y-bounds.min.y,source:'https://polyhaven.com/a/tree_small_02',license:'CC0-1.0'};
}

// Share geometry/textures inside local tiles, rather than one map-wide bound.
// THREE.LOD updates from the camera, so distant groves stop submitting leaves.
export function createTreeGroves(asset,placements){
  const root=new THREE.Group();root.name='Poly Haven Tree Small 02 · CC0';
  if(!asset||!placements.length)return root;
  const tiles=new Map(),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0),position=new THREE.Vector3(),scale=new THREE.Vector3();
  for(const p of placements){const key=Math.floor(p.x/TREE_TILE_SIZE)+','+Math.floor(p.z/TREE_TILE_SIZE);if(!tiles.has(key))tiles.set(key,[]);tiles.get(key).push(p);}
  for(const [key,items]of tiles){
    const [tx,tz]=key.split(',').map(Number),cx=(tx+.5)*TREE_TILE_SIZE,cz=(tz+.5)*TREE_TILE_SIZE,lod=new THREE.LOD();
    lod.name='tree grove '+key;lod.position.set(cx,0,cz);
    for(const [level,parts]of asset.levels.entries()){
      const group=new THREE.Group();group.name='tree LOD '+level;
      for(const [index,part]of parts.entries()){
        const mesh=new THREE.InstancedMesh(part.geometry,part.material,items.length);mesh.name='tree LOD '+level+' material '+index;
        items.forEach((p,i)=>{const s=p.height/asset.height;position.set(p.x-cx,.006,p.z-cz);q.setFromAxisAngle(up,p.rotation);scale.setScalar(s);matrix.compose(position,q,scale);mesh.setMatrixAt(i,matrix);});
        mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
      }
      lod.addLevel(group,TREE_LOD_DISTANCES[level],.12);
    }
    lod.addLevel(new THREE.Group(),TREE_LOD_DISTANCES[2],.12);root.add(lod);
  }
  root.userData.treeCount=placements.length;root.userData.tileCount=tiles.size;
  return root;
}
