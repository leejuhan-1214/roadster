import * as THREE from 'three';
import {createTreeGroves,TREE_TILE_SIZE} from './city-trees.js?v=20261111-species1';
const fallbacks={ground:{color:0xffffff,roughness:1},road:{side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4},walk:{side:THREE.DoubleSide},paint:{side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-8},wall:{roughness:.68},glass:{roughness:.24,metalness:.28,envMapIntensity:.9},roof:{roughness:.9},green:{roughness:1},water:{roughness:.3,metalness:.12},furniture:{roughness:.55,metalness:.55}};
/** One bounded BufferGeometry or <=24 spatially grouped tree instances per step. Shared resources survive eviction. */
export function createCityTileHydrator(payload,{materials=new Map(),treeAsset=null}={}){
 const root=new THREE.Group();root.name='Seoul OSM tile '+payload.id;root.position.set(payload.origin[0],0,payload.origin[1]);root.userData.stats=payload.stats;
 const treeCells=new Map();for(const p of payload.trees){const key=Math.floor(p.x/TREE_TILE_SIZE)+'_'+Math.floor(p.z/TREE_TILE_SIZE);if(!treeCells.has(key))treeCells.set(key,[]);treeCells.get(key).push(p);}const treeBatches=[];for(const group of treeCells.values())for(let i=0;i<group.length;i+=24)treeBatches.push(group.slice(i,i+24));
 const ownedGeometry=new Set(),ownedMaterials=new Set(),fallbackCache=new Map();let meshIndex=0,treeIndex=0,disposed=false;
 const materialFor=m=>{const shared=materials instanceof Map?materials.get(m.name):materials[m.name];if(shared)return shared;if(!fallbackCache.has(m.kind)){const mat=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.9,...fallbacks[m.kind]});fallbackCache.set(m.kind,mat);ownedMaterials.add(mat);}return fallbackCache.get(m.kind);};
 const done=()=>disposed||(meshIndex>=payload.meshes.length&&(!treeAsset||treeIndex>=treeBatches.length));
 return {root,obstacles:payload.obstacles,roads:payload.roads,get done(){return done();},step(){
  if(done())return true;
  if(meshIndex<payload.meshes.length){const part=payload.meshes[meshIndex++],geometry=new THREE.BufferGeometry();for(const [key,size]of [['position',3],['normal',3],['uv',2],['color',3]])geometry.setAttribute(key,new THREE.BufferAttribute(part[key],size));
   geometry.boundingBox=new THREE.Box3(new THREE.Vector3(...part.bounds.min),new THREE.Vector3(...part.bounds.max));geometry.boundingSphere=new THREE.Sphere();geometry.boundingBox.getBoundingSphere(geometry.boundingSphere);ownedGeometry.add(geometry);
   const mesh=new THREE.Mesh(geometry,materialFor(part));mesh.name=part.name;mesh.receiveShadow=true;mesh.castShadow=['wall','glass','roof','furniture'].includes(part.kind);root.add(mesh);
  }else if(treeAsset){root.add(createTreeGroves(treeAsset,treeBatches[treeIndex++]));}
  return done();
 },dispose(){if(disposed)return;disposed=true;root.removeFromParent();root.traverse(o=>{if(o.isInstancedMesh)o.dispose();});for(const g of ownedGeometry)g.dispose();for(const m of ownedMaterials)m.dispose();ownedGeometry.clear();ownedMaterials.clear();root.clear();}};
}
