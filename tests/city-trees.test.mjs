import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createTreeGroves,TREE_LOD_DISTANCES} from '../dist/js/city-trees.js';
import {createCityWorld} from '../dist/js/city-world.js';
const dir=new URL('../dist/assets/trees/',import.meta.url);
const gltf=JSON.parse(await readFile(new URL('tree-small-02.gltf',dir),'utf8'));
const binary=await readFile(new URL('tree-small-02.bin',dir));
function accessor(index){const a=gltf.accessors[index],view=gltf.bufferViews[a.bufferView],stride={SCALAR:1,VEC2:2,VEC3:3}[a.type],C=a.componentType===5126?Float32Array:Uint32Array;return new C(binary.buffer,binary.byteOffset+(view.byteOffset||0)+(a.byteOffset||0),a.count*stride);}
function asset(){return {height:4.583358,levels:gltf.meshes.map(mesh=>mesh.primitives.map(p=>{
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(accessor(p.attributes.POSITION).slice(),3));geometry.setIndex(new THREE.BufferAttribute(accessor(p.indices).slice(),1));
 return {geometry,material:new THREE.MeshStandardMaterial()};
}))};}

test('bundled tree is a bounded two-level model with verified original-asset provenance',async()=>{
 const provenance=JSON.parse(await readFile(new URL('provenance.json',dir),'utf8'));
 assert.equal(provenance.license,'CC0-1.0');assert.equal(provenance.source,'https://polyhaven.com/a/tree_small_02');
 assert.equal(gltf.meshes.length,2);assert.equal(gltf.buffers[0].byteLength,binary.length);
 for(const [level,mesh]of gltf.meshes.entries()){
  const triangles=mesh.primitives.reduce((n,p)=>n+gltf.accessors[p.indices].count/3,0);assert.ok(triangles>(level?2500:10000)&&triangles<(level?4000:12000));
  for(const p of mesh.primitives){const positions=accessor(p.attributes.POSITION),indices=accessor(p.indices);assert.ok(positions.every(Number.isFinite));assert.ok(indices.every(i=>i<positions.length/3));}
 }
 const leaves=gltf.materials[1];assert.equal(leaves.alphaMode,'MASK');assert.ok(leaves.alphaCutoff>.1&&leaves.alphaCutoff<.8);
 const png=await readFile(new URL('leaves-rgba.png',dir));assert.equal(png[25],6,'the leaf atlas retains its RGBA cutout mask');
 let bytes=0;
 for(const file of provenance.runtimeFiles){const b=await readFile(new URL(file.file,dir));bytes+=b.length;assert.equal(createHash('sha256').update(b).digest('hex'),file.sha256);}
 assert.ok(bytes<3_000_000,'all geometry and maps must remain below the city download budget');
});

test('tree groves instance nearby models and stop drawing geometry beyond the far LOD',()=>{
 const model=asset(),groves=createTreeGroves(model,[{x:0,z:0,height:6,rotation:0},{x:5,z:10,height:7,rotation:1},{x:400,z:0,height:6,rotation:2}]);
 assert.equal(groves.children.length,2);assert.equal(groves.userData.treeCount,3);
 const grove=groves.children[0],camera=new THREE.PerspectiveCamera();groves.updateMatrixWorld(true);
 camera.position.set(grove.position.x,4,grove.position.z);camera.updateMatrixWorld(true);grove.update(camera);
 assert.equal(grove.getCurrentLevel(),0);
 for(const mesh of grove.levels[0].object.children){assert.ok(mesh.isInstancedMesh);assert.equal(mesh.count,2);assert.ok(mesh.castShadow&&mesh.receiveShadow);}
 camera.position.x+=TREE_LOD_DISTANCES[1]+25;camera.updateMatrixWorld(true);grove.update(camera);assert.equal(grove.getCurrentLevel(),1);
 camera.position.x+=TREE_LOD_DISTANCES[2]+50;camera.updateMatrixWorld(true);grove.update(camera);assert.equal(grove.getCurrentLevel(),2);assert.equal(grove.levels[2].object.children.length,0);
 for(const level of model.levels)for(const part of level){part.geometry.dispose();part.material.dispose();}
});

test('real trees replace primitive crowns while retaining roadside collision trunks',async()=>{
 const data=JSON.parse(await readFile(new URL('../dist/assets/city/gangnam.json',import.meta.url),'utf8')),city=createCityWorld(data,{treeAsset:asset()});
 try{
  assert.ok(city.treePlacements.length>100);assert.equal(city.treeGroves.userData.treeCount,city.treePlacements.length);
  assert.equal(city.root.getObjectByName('tree crowns'),undefined);
  const colliders=city.obstacles.filter(o=>o.id.startsWith('tree-'));assert.equal(colliders.length,city.treePlacements.length);
  for(const t of city.treePlacements)assert.ok(t.height>=5.8&&t.height<=7.2);
 }finally{city.dispose();}
});
