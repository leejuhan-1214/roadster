import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {prepareLandmarkDetail,prepareExtraLandmarkDetail} from '../dist/js/city-landmark-detail.js';

const dir=new URL('../dist/assets/city-buildings/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',dir),'utf8'));
const glb=await readFile(new URL('original-landmarks.glb',dir));
const jsonLength=glb.readUInt32LE(12),gltf=JSON.parse(glb.subarray(20,20+jsonLength).toString());
const binary=glb.subarray(20+jsonLength+8);

async function parseScene(bytes){
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'')).scene;
}

test('distant landmarks keep the GT wave and stepped Samsung towers within six drawing batches',async()=>{
  const scene=await parseScene(glb),update=prepareLandmarkDetail(scene,manifest.buildings);
  const triangleCount=()=>{
    let count=0;
    scene.traverseVisible(mesh=>{if(mesh.isMesh)count+=Math.min(mesh.geometry.index.count,mesh.geometry.drawRange.count)/3;});
    return count;
  };
  update(4000,4000,75);
  const farCount=triangleCount(),far=scene.getObjectByName('Distant landmark glass');
  assert.ok(farCount<1100&&farCount>500);assert.ok(far.visible);
  const frame=manifest.buildings[0].modelFrame,positions=far.geometry.attributes.position;
  const uniqueOffsets=new Set();
  for(let i=0;i<positions.count;i++){
    if(positions.getZ(i)>50||positions.getY(i)<9||positions.getY(i)>128)continue;
    const dx=positions.getX(i)-frame.center[0],dz=positions.getZ(i)-frame.center[1];
    const u=dx*Math.cos(frame.angle)+dz*Math.sin(frame.angle);
    uniqueOffsets.add(Math.round((Math.abs(u)-frame.width/2)*10)/10);
  }
  assert.ok(uniqueOffsets.size>=9,'the far tower still curves between its extrema');
  let nearGlass;scene.traverse(mesh=>{if(mesh.material?.name==='Architectural blue reflective glass')nearGlass=mesh;});
  for(const building of manifest.buildings){
    // A tiny radius isolates one building; resetting also clears hysteresis.
    update(4000,4000,1);update(...building.modelFrame.center,1);
    assert.equal(nearGlass.geometry.drawRange.count,building.detailRanges.glass[1]);
    assert.ok(triangleCount()>farCount&&triangleCount()<manifest.geometry.triangles);
  }
  update(0,0,1000);
  assert.equal(triangleCount(),manifest.geometry.triangles);assert.equal(far.visible,false);
  update(4000,4000,75);assert.equal(triangleCount(),farCount);
  let meshes=0;scene.traverse(m=>{if(m.isMesh)meshes++;});assert.equal(meshes,6);
});

test('Kyobo and Boutique Monaco switch trim independently while the facade mass stays visible',async()=>{
  const bytes=await readFile(new URL('extra-landmarks.glb',dir)),scene=await parseScene(bytes);
  const {models}=JSON.parse(await readFile(new URL('extra-landmarks.json',dir),'utf8'));
  const update=prepareExtraLandmarkDetail(scene,models);
  const counts=()=>scene.children.map(group=>{
    let trim=0,body=0;group.traverseVisible(mesh=>{
      if(mesh.isMesh){if(mesh.material.name==='Window frames')trim++;else body++;}
    });return [trim,body];
  });
  update(4000,4000,50);
  for(const [trim,body] of counts()){assert.equal(trim,0);assert.ok(body>0);}
  for(let i=0;i<models.length;i++){
    update(...models[i].center,50);
    assert.equal(counts()[i][0],1);assert.equal(counts()[1-i][0],0);
  }
});
function accessor(index){
  const a=gltf.accessors[index],b=gltf.bufferViews[a.bufferView],components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
  const Type={5123:Uint16Array,5125:Uint32Array,5126:Float32Array}[a.componentType];
  return new Type(binary.buffer,binary.byteOffset+(b.byteOffset||0)+(a.byteOffset||0),a.count*components);
}

test('landmarks ship as bounded original GLB meshes with explicit provenance',()=>{
  assert.equal(glb.readUInt32LE(0),0x46546c67);assert.equal(glb.readUInt32LE(4),2);assert.equal(glb.readUInt32LE(8),glb.length);
  assert.equal(createHash('sha256').update(glb).digest('hex'),manifest.geometry.sha256);
  assert.equal(gltf.images,undefined,'source photographs must not be redistributed');
  assert.equal(manifest.buildings.length,4);assert.equal(manifest.geometry.drawCalls,5);
  let count=0;
  for(const mesh of gltf.meshes)for(const p of mesh.primitives){
    const positions=accessor(p.attributes.POSITION),normals=accessor(p.attributes.NORMAL),indices=accessor(p.indices);
    assert.ok(positions.every(Number.isFinite));assert.ok(normals.every(Number.isFinite));
    assert.ok(indices.every(i=>i<positions.length/3));count+=indices.length/3;
  }
  assert.equal(count,manifest.geometry.triangles);assert.ok(count<80000&&glb.length<6_000_000);
});

test('GT facade follows its documented diagonal wave rather than a box extrusion',()=>{
  const gt=manifest.buildings.find(b=>b.id===301605795),frame=gt.modelFrame,c=Math.cos(frame.angle),s=Math.sin(frame.angle);
  const glass=gltf.meshes.flatMap(m=>m.primitives).find(p=>gltf.materials[p.material].name==='Architectural blue reflective glass');
  const positions=accessor(glass.attributes.POSITION);
  for(const y of [8.2,20.2,32.2,44.2,56.2,68.2,80.2,92.2,104.2,116.2,128.2]){
    let u=0,v=0,n=0;
    for(let i=0;i<positions.length;i+=3){
      if(Math.abs(positions[i+1]-y)>.0001||positions[i+2]>50)continue;
      const dx=positions[i]-frame.center[0],dz=positions[i+2]-frame.center[1];u+=dx*c+dz*s;v+=-dx*s+dz*c;n++;
    }
    assert.ok(n>100,'complete perimeter exists at wave sample');
    const wave=Math.sin((y-8.2)/120*Math.PI*5);
    assert.ok(Math.abs(u/n-1.8*wave)<.001);assert.ok(Math.abs(v/n-2.4*wave)<.001);
  }
});

test('all Samsung multipolygon rings and matching stepped collision masses survive',()=>{
  assert.equal(manifest.additionalBuildings.length,7,'2 Life +1 C&T +4 Electronics rings');
  const ids=manifest.additionalBuildings.map(b=>b.id);assert.equal(new Set(ids).size,ids.length);
  for(const b of manifest.additionalBuildings){
    assert.match(b.id,/^r831118[345](?:p[234])?$/);assert.equal(b.type,'relation');
    assert.ok(b.points.length>=4);assert.deepEqual(b.points[0],b.points.at(-1));
    assert.ok(manifest.replacedBuildingIds.includes(b.id));assert.ok(manifest.skipCollisionBuildingIds.includes(b.id));
  }
  assert.ok(manifest.collisionSolids.length>100);
  for(const solid of manifest.collisionSolids){
    assert.ok(solid.center.every(Number.isFinite)&&solid.size.every(n=>Number.isFinite(n)&&n>0));
    assert.ok(solid.center[1]-solid.size[1]/2>=-.0001,'raised volumes retain their real base elevation');
  }
  const electronics=manifest.collisionSolids.filter(s=>s.id.startsWith('landmark-r8311185-'));
  assert.ok(electronics.some(s=>s.center[1]-s.size[1]/2>100),'bridge is not extruded to the street');
  assert.ok(electronics.some(s=>s.center[1]+s.size[1]/2<45),'long podium stays low instead of becoming a 203 m wall');
});
