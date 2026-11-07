import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
// Only called on the fixed environment before a vehicle or stage is attached.
// Transparent overlays and animated/instanced/shader objects retain their own draw.
export function batchStaticEnvironment(root){
 root.updateMatrixWorld(true);const groups=new Map();
 root.traverse(o=>{const m=o.material;if(!o.isMesh||o.isInstancedMesh||Array.isArray(m)||m.transparent||m.isShaderMaterial)return;
  const key=[m.type,m.color?.getHex(),m.emissive?.getHex(),m.emissiveIntensity,m.roughness,m.metalness,m.map?.uuid,m.normalMap?.uuid,m.side,o.castShadow,o.receiveShadow,Object.keys(o.geometry.attributes).sort().join(',')].join('|');
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);
 });
 let saved=0;for(const objects of groups.values()){
  if(objects.length<2)continue;
  const inverse=root.matrixWorld.clone().invert();
  const geometries=objects.map(o=>o.geometry.clone().applyMatrix4(inverse.clone().multiply(o.matrixWorld)));
  const merged=mergeGeometries(geometries,false);for(const g of geometries)g.dispose();if(!merged)continue;
  const first=objects[0],mesh=new THREE.Mesh(merged,first.material);mesh.name='fixed environment batch';mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;
  root.add(mesh);for(const o of objects)o.removeFromParent();saved+=objects.length-1;
 }
 return saved;
}
