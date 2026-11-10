import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

export const TREE_LOD_DISTANCES=[0,85,280];
export const TREE_TILE_SIZE=96;

// All groves share one clock. Only these uniforms change each frame: leaves
// remain instanced and their vertex buffers are never rebuilt on the CPU.
export function createTreeWind(){
  return {time:{value:0},strength:{value:1},direction:{value:new THREE.Vector2(1,.4).normalize()}};
}
export function updateTreeWind(asset,timeSeconds,windX=1.4,windZ=.6){
  if(!asset?.wind)return;
  const {wind}=asset;
  wind.time.value=Number.isFinite(timeSeconds)?timeSeconds:0;
  const speed=Number.isFinite(windX)&&Number.isFinite(windZ)?Math.hypot(windX,windZ):0;
  wind.strength.value=Math.min(2.5,speed/1.5);
  if(speed>0)wind.direction.value.set(windX/speed,windZ/speed);
}

/** Modest visual bending, not a tree biomechanics or aerodynamic simulation. */
export function configureTreeWindMaterial(material,wind,height,leaf=false){
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{uTreeTime:wind.time,uTreeStrength:wind.strength,uTreeDirection:wind.direction});
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
uniform float uTreeTime;
uniform float uTreeStrength;
uniform vec2 uTreeDirection;`);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
vec3 treeOrigin = vec3(0.0);
vec2 treeDirection = uTreeDirection;
#ifdef USE_INSTANCING
  treeOrigin = (modelMatrix*vec4(instanceMatrix[3].xyz,1.0)).xyz;
  // Rotate the global breeze into the tree's local frame. Matrices use uniform scale.
  treeDirection = vec2(dot(uTreeDirection,normalize(instanceMatrix[0].xz)),dot(uTreeDirection,normalize(instanceMatrix[2].xz)));
#endif
float treePhase = dot(treeOrigin.xz,vec2(0.137,0.193));
float treeHeight = clamp(position.y / ${Number(Math.max(.01,height)).toFixed(7)},0.0,1.0);
float treeBend = treeHeight*treeHeight;
float treeGust = sin(uTreeTime*0.83+treePhase)+0.35*sin(uTreeTime*1.37+treePhase*1.7);
transformed.xz += treeDirection*(treeBend*treeGust*0.055*uTreeStrength);
${leaf?`float leafPhase=dot(position,vec3(2.7,1.9,3.1));
float leafFlutter=sin(uTreeTime*3.7+treePhase+leafPhase)*0.018*treeHeight*uTreeStrength;
transformed += normal*leafFlutter;`:''}`);
  };
  material.customProgramCacheKey=()=>`roadster-tree-wind-v2-${leaf?'leaf':'wood'}-${height}`;
  material.needsUpdate=true;
  return material;
}

export async function loadCityTreeAsset(){
  const gltf=await new GLTFLoader().loadAsync(new URL('../assets/trees/tree-small-02.gltf?v=20261110-seoul1',import.meta.url).href);
  gltf.scene.updateMatrixWorld(true);
  const levels=[0,1].map(index=>{
    const source=gltf.scene.getObjectByName('TreeSmall02_LOD'+index);
    if(!source)throw new Error('나무 모델의 상세도 데이터를 찾지 못했습니다.');
    const parts=[];
    source.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld),material=mesh.material;
      material.roughness=.88;material.metalness=0;material.envMapIntensity=.5;
      if(material.alphaTest>0){material.normalScale.set(.55,.55);material.roughness=.72;}
      if(material.alphaTest>0){material.transparent=false;material.depthWrite=true;material.alphaToCoverage=true;material.side=THREE.DoubleSide;}
      for(const texture of [material.map,material.normalMap])if(texture)texture.anisotropy=4;
      parts.push({geometry,material});
    });
    return parts;
  });
  const bounds=new THREE.Box3();
  for(const part of levels[0]){part.geometry.computeBoundingBox();bounds.union(part.geometry.boundingBox);}
  for(const level of levels)for(const part of level){part.geometry.translate(0,-bounds.min.y,0);part.geometry.computeBoundingSphere();}
  const height=bounds.max.y-bounds.min.y,wind=createTreeWind(),depthMaterials=new Map();
  for(const level of levels)for(const part of level){
    const {material}=part,leaf=material.alphaTest>0;
    if(!depthMaterials.has(material)){
      configureTreeWindMaterial(material,wind,height,leaf);
      // The shadow silhouette uses the same cutout and deformation as the visible leaf.
      const depth=configureTreeWindMaterial(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,
        map:material.map,alphaTest:material.alphaTest,side:material.side}),wind,height,leaf);
      depthMaterials.set(material,depth);
      material.addEventListener('dispose',()=>depth.dispose());
    }
    part.depthMaterial=depthMaterials.get(material);
    // Wind vertices stay inside a conservative expanded culling bound.
    part.geometry.boundingSphere.radius+=.25;
  }
  gltf.scene.traverse(mesh=>{if(mesh.geometry)mesh.geometry.dispose();});
  return {levels,height,wind,source:'https://polyhaven.com/a/tree_small_02',license:'CC0-1.0'};
}

// Share geometry/textures inside local tiles, rather than one map-wide bound.
// THREE.LOD updates from the camera, so distant groves stop submitting leaves.
export function createTreeGroves(asset,placements){
  const root=new THREE.Group();root.name='Poly Haven Tree Small 02 · CC0';
  if(!asset||!placements.length)return root;
  const tiles=new Map(),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0),position=new THREE.Vector3(),scale=new THREE.Vector3(),tint=new THREE.Color();
  for(const p of placements){const key=Math.floor(p.x/TREE_TILE_SIZE)+','+Math.floor(p.z/TREE_TILE_SIZE);if(!tiles.has(key))tiles.set(key,[]);tiles.get(key).push(p);}
  for(const [key,items]of tiles){
    const [tx,tz]=key.split(',').map(Number),cx=(tx+.5)*TREE_TILE_SIZE,cz=(tz+.5)*TREE_TILE_SIZE,lod=new THREE.LOD();
    lod.name='tree grove '+key;lod.position.set(cx,0,cz);
    for(const [level,parts]of asset.levels.entries()){
      const group=new THREE.Group();group.name='tree LOD '+level;
      for(const [index,part]of parts.entries()){
        const mesh=new THREE.InstancedMesh(part.geometry,part.material,items.length);mesh.name='tree LOD '+level+' material '+index;
        if(part.depthMaterial)mesh.customDepthMaterial=part.depthMaterial;
        items.forEach((p,i)=>{const s=p.height/asset.height;position.set(p.x-cx,.006,p.z-cz);q.setFromAxisAngle(up,p.rotation);scale.setScalar(s);matrix.compose(position,q,scale);mesh.setMatrixAt(i,matrix);
          // Stable per-tree tone, shared between LODs, avoids identical repeated crowns.
          const variation=(Math.sin(p.x*12.9898+p.z*78.233)*43758.5453)%1,amount=Math.abs(variation);
          tint.setRGB(.88+.12*amount,.94+.06*amount,.84+.16*amount);mesh.setColorAt(i,tint);
        });
        mesh.instanceColor.needsUpdate=true;
        mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
      }
      lod.addLevel(group,TREE_LOD_DISTANCES[level],.12);
    }
    lod.addLevel(new THREE.Group(),TREE_LOD_DISTANCES[2],.12);root.add(lod);
  }
  root.userData.treeCount=placements.length;root.userData.tileCount=tiles.size;
  return root;
}
