import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createModelCatalogEntry, modelObjectExplosion, createHypothesisCatalogEntry, hypothesisExplosionStage } from './parts-catalog.js';

// Licensed visual asset only. Geometry never supplies mass, inertia or aerodynamics.
// Runtime alignment adapts it to the explicitly hypothetical simulation chassis.
const normalized = s => String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const WHEEL_IDS = ['wheel-fl','wheel-fr','wheel-rl','wheel-rr'];
const WHEEL_TOKENS = ['ftl','ftr','bkl','bkr'];
const ANCHORS = [[1.4,-.24,-.94],[1.4,-.24,.94],[-1.4,-.24,-.94],[-1.4,-.24,.94]];

function wheelIndex(object) {
  for(let node=object;node;node=node.parent){
    const name=normalized(node.name);
    if(name.includes('trdefwheel'))return WHEEL_TOKENS.findIndex(t=>name.includes(t));
  }
  return -1;
}
function isBrake(object) {
  for(let node=object;node;node=node.parent)if(normalized(node.name).includes('wheelbrake'))return true;
  return false;
}
function groupPart(root,parts,id,offset) {
  const group=new THREE.Group();group.name=id;group.userData.partId=id;
  group.userData.basePosition=new THREE.Vector3();group.userData.explodeOffset=new THREE.Vector3(...offset);
  root.add(group);parts.set(id,group);return group;
}

export function adaptRoadsterScene(source,fallback,sourceParser={}) {
  source.updateMatrixWorld(true);
  const records=[],wheelBoxes=Array.from({length:4},()=>new THREE.Box3());
  const orient=new THREE.Matrix4().makeRotationY(Math.PI/2);
  source.traverse(object=>{
    if(!object.isMesh)return;
    const geometry=object.geometry.clone();geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(orient,object.matrixWorld));geometry.computeBoundingBox();
    const wheel=wheelIndex(object),brake=isBrake(object);
    if(wheel>=0&&!brake)wheelBoxes[wheel].union(geometry.boundingBox);
    const association=sourceParser.associations?.get(object);
    const sourceAncestry=[];
    for(let parent=object.parent;parent;parent=parent.parent)sourceAncestry.unshift(parent.userData.name||parent.name||'(unnamed)');
    const sourceName=sourceParser.json?.meshes?.[association?.meshes]?.name||object.userData.name||object.name;
    const materialNames=(Array.isArray(object.material)?object.material:[object.material]).map(m=>m.name||'(unnamed material)');
    records.push({geometry,material:object.material,originalName:object.name,wheel,brake,
      index:association?.meshes??records.length,sourceName,sourceAncestry,materialNames,
      sourceObjectName:sourceAncestry.at(-1)||sourceName,sourceObjectKey:sourceAncestry.join('/')});
  });
  if(records.length<10||wheelBoxes.some(b=>b.isEmpty()))throw new Error('Roadster 바퀴 그룹을 확인하지 못했습니다.');
  const centers=wheelBoxes.map(b=>b.getCenter(new THREE.Vector3()));
  const frontX=(centers[0].x+centers[1].x)/2,rearX=(centers[2].x+centers[3].x)/2;
  const leftZ=(centers[0].z+centers[2].z)/2,rightZ=(centers[1].z+centers[3].z)/2;
  const centerY=centers.reduce((sum,c)=>sum+c.y,0)/4;
  const averageRadius=wheelBoxes.reduce((sum,b)=>sum+(b.max.y-b.min.y)/2,0)/4;
  const sx=2.8/(frontX-rearX),sy=.36/averageRadius,sz=1.88/(rightZ-leftZ);
  if(![sx,sy,sz].every(x=>Number.isFinite(x)&&x>.1&&x<10))throw new Error('Roadster 시각 축척을 검증하지 못했습니다.');
  const alignment=new THREE.Matrix4().makeTranslation(0,-.24,0)
    .multiply(new THREE.Matrix4().makeScale(sx,sy,sz))
    .multiply(new THREE.Matrix4().makeTranslation(-(frontX+rearX)/2,-centerY,-(leftZ+rightZ)/2));
  // Keep tires circular and centered on the simulated wheel axes after chassis alignment.
  const wheelTransforms=wheelBoxes.map((box,i)=>{
    const aligned=box.clone().applyMatrix4(alignment),center=aligned.getCenter(new THREE.Vector3()),size=aligned.getSize(new THREE.Vector3());
    return new THREE.Matrix4().makeScale(.72/size.x,.72/size.y,1)
      .multiply(new THREE.Matrix4().makeTranslation(-center.x,-center.y,-center.z));
  });

  const root=new THREE.Group();root.name='Tesla Roadster 2020 visual · metarex.4d · CC BY 4.0';
  const parts=new Map();const body=groupPart(root,parts,'body',[0,.75,0]);
  const cabin=groupPart(root,parts,'cabin',[0,1.65,0]);
  const wheels=ANCHORS.map((anchor,i)=>{
    const side=Math.sign(anchor[2]);const group=groupPart(root,parts,WHEEL_IDS[i],[anchor[0]*.3,0,side*.95]);
    group.position.fromArray(anchor);group.userData.basePosition=group.position.clone();
    const spinGroup=new THREE.Group();spinGroup.name='wheel spin only';group.add(spinGroup);group.userData.spinGroup=spinGroup;return group;
  });
  const detailParts=new Map(),catalog=[],sourceObjects=new Map();
  for(const record of records){
    record.geometry.applyMatrix4(alignment);record.geometry.computeBoundingBox();
    if(!sourceObjects.has(record.sourceObjectKey))sourceObjects.set(record.sourceObjectKey,{records:[],bounds:new THREE.Box3()});
    const object=sourceObjects.get(record.sourceObjectKey);object.records.push(record);object.bounds.union(record.geometry.boundingBox);
  }
  for(const object of sourceObjects.values()){
    const objectMaterialNames=[...new Set(object.records.flatMap(record=>record.materialNames))];
    for(const record of object.records){record.objectMeshCount=object.records.length;record.objectMaterialNames=objectMaterialNames;}
    const first=object.records[0],entry=createModelCatalogEntry(first);
    object.explosion=modelObjectExplosion(first,object.bounds.getCenter(new THREE.Vector3()).toArray(),entry.category);
  }
  const paintMaterials=[],materialCache=new Map();
  function materialFor(original) {
    if(materialCache.has(original))return materialCache.get(original);
    let mat=original.clone();const name=normalized(original.name);
    if(name.includes('carmainpaint')){
      mat=new THREE.MeshPhysicalMaterial({color:0xca2338,map:original.map,normalMap:original.normalMap,metalness:.68,roughness:.23,clearcoat:1,clearcoatRoughness:.12});
      mat.name=original.name;paintMaterials.push(mat);
    }else if(name.includes('glass')){
      mat.transparent=true;mat.depthWrite=false;mat.roughness=.09;mat.metalness=.17;
      if(name.includes('mid')||name.includes('tint')){mat.color.set(0x172c38);mat.opacity=name.includes('max')?.72:.48;}
      if(name.includes('rearlights')){mat.emissive=new THREE.Color(0xff153b);mat.emissiveIntensity=1.6;}
    }else if(name.includes('headlight')||name.includes('licenceplatelight')){
      mat.emissive=new THREE.Color(0xd8f4ff);mat.emissiveIntensity=1.8;
    }else if(name.includes('rearlight')){
      mat.emissive=new THREE.Color(0xff153b);mat.emissiveIntensity=1.6;
    }
    materialCache.set(original,mat);return mat;
  }
  for(const record of records){
    const materials=Array.isArray(record.material)?record.material.map(materialFor):materialFor(record.material);
    const obj=new THREE.Mesh(record.geometry,materials);obj.name=record.originalName;obj.castShadow=true;obj.receiveShadow=true;
    const entry=createModelCatalogEntry(record),explosion=sourceObjects.get(record.sourceObjectKey).explosion;
    if(detailParts.has(entry.id))throw new Error(`중복 원본 메시 식별자: ${entry.id}`);
    obj.userData.partId=entry.id;obj.userData.basePosition=obj.position.clone();
    obj.userData.explodeOffset=new THREE.Vector3(...explosion.offset);obj.userData.explodeStage=[...explosion.stage];
    obj.userData.sourceObjectKey=record.sourceObjectKey;obj.userData.sourceAncestry=[...record.sourceAncestry];
    obj.userData.sourceMeshIndex=record.index;obj.userData.sourceName=record.sourceName;
    obj.userData.materialNames=[...record.materialNames];obj.userData.kind='model';
    detailParts.set(entry.id,obj);catalog.push(entry);
    if(record.wheel>=0){
      const group=wheels[record.wheel];record.geometry.applyMatrix4(wheelTransforms[record.wheel]);
      // Calipers follow steering but do not spin. The disc follows the hub.
      (record.brake?group:group.userData.spinGroup).add(obj);
    }else{
      const matNames=(Array.isArray(record.material)?record.material:[record.material]).map(m=>normalized(m.name)).join(' ');
      const center=record.geometry.boundingBox.getCenter(new THREE.Vector3());
      const interior=/interior|seats/.test(matNames)||(/glasstint|glassmidtint/.test(matNames)&&center.x>-1.6&&center.x<1.6);
      const destination=interior?cabin:body;destination.add(obj);
    }
  }
  // Retain openly hypothetical educational hardware, never substitute an invented shell.
  for(const id of ['tank','battery','suspension','thrusters','wing']){
    const part=fallback.parts.get(id);if(part){
      root.add(part);parts.set(id,part);part.userData.hypothetical=true;part.userData.kind='hypothesis';
      part.userData.basePosition=part.userData.basePosition.clone();part.userData.explodeStage=hypothesisExplosionStage(id);
      part.traverse(object=>{if(object.isMesh)object.userData.partId=id;});
      detailParts.set(id,part);catalog.push(createHypothesisCatalogEntry(id));
    }
  }
  root.userData.source='metarex.4d / Tesla Roadster 2020 / CC BY 4.0';
  root.userData.visualOnly=true;root.userData.alignment='Adapted to assumed 2.8 m wheelbase, 1.88 m track, 0.36 m wheel radius; not measured Tesla dimensions.';
  root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  catalog.sort((a,b)=>a.kind===b.kind?a.id.localeCompare(b.id):a.kind==='model'?-1:1);
  return {root,parts,detailParts,catalog,wheels,paintMaterials,fans:fallback.fans,wing:parts.get('wing'),tank:parts.get('tank'),battery:parts.get('battery'),jetMounts:fallback.jetMounts,
    bounds:{length:bounds.x,width:bounds.z,height:bounds.y},actualRoadster:true,sourceMeshCount:records.length,
    sourceObjectCount:sourceObjects.size,
    assetInfo:{title:'Tesla Roadster 2020',author:'metarex.4d',license:'CC BY 4.0',yearScope:'2017 concept / artist 2020 label; not the 2026 Rocket',alignment:root.userData.alignment,objectCount:sourceObjects.size}};
}

export async function loadRoadsterVehicle(fallback,onProgress) {
  const url=new URL('../assets/tesla-roadster-2020/scene.gltf',import.meta.url).href;
  const gltf=await new GLTFLoader().loadAsync(url,onProgress);
  return adaptRoadsterScene(gltf.scene,fallback,gltf.parser);
}
