import * as THREE from 'three';
import {vehiclePaintRule,prepareVehiclePaint} from './vehicle-paint.js?v=20261111-paint1';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {createVehicle} from './vehicle.js?v=20261107-drive2';
import {createHypothesisCatalogEntry,hypothesisExplosionStage} from './parts-catalog.js';
import {transformedGeometry,splitWheelGeometry,matchesSource} from './model-geometry.js?v=20261109-wheel2';
import {straightenWheelAxes} from './wheel-alignment.js?v=20261109-wheel1';

const ids=['wheel-fl','wheel-fr','wheel-rl','wheel-rr'];
const labels=['앞 왼쪽','앞 오른쪽','뒤 왼쪽','뒤 오른쪽'];
const hardware=['tank','battery','suspension','thrusters','wing','drive-front','drive-rear-left','drive-rear-right','power-electronics'];
function wheelRoot(object,profile){
  for(let n=object;n;n=n.parent){
    if(profile.id==='ferrari'&&/^wheel_(fl|fr|rl|rr)$/.test(n.name))return n;
    if(profile.id==='bmw'&&/^(BMW_E30_M3_(RIM|TIRE)|Brake_disc|Brembo_Calipers)/.test(n.name))return n;
  }return null;
}
function group(root,parts,id,position,offset){
  const g=new THREE.Group();g.name=id;g.userData.partId=id;g.position.copy(position);
  g.userData.basePosition=position.clone();g.userData.explodeOffset=new THREE.Vector3(...offset);
  root.add(g);parts.set(id,g);return g;
}

export function adaptRealVehicle(source,profile){
  // Undo the artist's parked steering pose, preserving the body proportions.
  if(profile.id==='bmw')source.traverse(o=>{if(wheelRoot(o,profile)===o)o.quaternion.identity();});
  source.updateMatrixWorld(true);
  const orient=new THREE.Matrix4().makeRotationY(profile.yaw), records=[],mixedWheelDetails=[],boxes=ids.map(()=>new THREE.Box3());
  source.traverse(o=>{
    if(!o.isMesh)return;
    if(matchesSource(o,profile.adapter,'exclude'))return;
    const geometry=transformedGeometry(o.geometry,new THREE.Matrix4().multiplyMatrices(orient,o.matrixWorld));
    const wr=wheelRoot(o,profile),point=wr?wr.getWorldPosition(new THREE.Vector3()).applyMatrix4(orient):null;
    const wheel=point?(point.x>0?0:2)+(point.z>0?1:0):-1;
    const names=(Array.isArray(o.material)?o.material:[o.material]).map(m=>m.name);
    if(profile.adapter){
      if(matchesSource(o,profile.adapter,'wheelDetail')){mixedWheelDetails.push({geometry,original:o,materialNames:names,tire:false,brake:false});return;}
      const isWheel=matchesSource(o,profile.adapter,'wheel'),tire=matchesSource(o,profile.adapter,'tire'),brake=matchesSource(o,profile.adapter,'brake');
      const fixed=matchesSource(o,profile.adapter,'fixedWheel');
      const pieces=isWheel?splitWheelGeometry(geometry,profile.adapter.splitX||0,profile.adapter.splitZ||0):[{geometry,wheel:-1}];
      for(const piece of pieces){if(piece.wheel>=0&&tire)boxes[piece.wheel].union(piece.geometry.boundingBox);records.push({...piece,original:o,materialNames:names,tire,brake,fixed});}
      if(isWheel)geometry.dispose();return;
    }
    const tire=names.some(n=>/tire/i.test(n));
    if(wheel>=0&&tire)boxes[wheel].union(geometry.boundingBox);
    records.push({geometry,original:o,materialNames:names,wheel,tire,brake:/caliper/i.test(wr?.name||'')});
  });
  if(boxes.some(b=>b.isEmpty()))throw new Error('네 바퀴의 형상을 확인하지 못했습니다.');
  for(const record of mixedWheelDetails){
    for(const piece of splitWheelGeometry(record.geometry,0,0,boxes))records.push({...record,...piece});
    record.geometry.dispose();
  }
  const neutralWheelAxes=straightenWheelAxes(records,boxes);
  const centers=boxes.map(b=>b.getCenter(new THREE.Vector3()));
  const axleFront=(centers[0].x+centers[1].x)/2,axleRear=(centers[2].x+centers[3].x)/2;
  const scale=profile.wheelbase/(axleFront-axleRear);
  if(!Number.isFinite(scale)||scale<=0)throw new Error('차체 축척 오류');
  const center=new THREE.Vector3((axleFront+axleRear)/2,centers.reduce((s,c)=>s+c.y,0)/4,centers.reduce((s,c)=>s+c.z,0)/4);
  const alignment=new THREE.Matrix4().makeTranslation(0,-.24,0).multiply(new THREE.Matrix4().makeScale(scale,scale,scale)).multiply(new THREE.Matrix4().makeTranslation(-center.x,-center.y,-center.z));
  const anchors=centers.map(c=>c.clone().applyMatrix4(alignment));
  const root=new THREE.Group(),parts=new Map(),detailParts=new Map(),catalog=[],paintMaterials=[],materials=new Map(),tireMaterials=new Map();
  root.name=profile.title;root.userData.visualOnly=true;
  const body=group(root,parts,'body',new THREE.Vector3(),[0,.7,0]);
  const cabin=group(root,parts,'cabin',new THREE.Vector3(),[0,1.5,0]);
  const wheels=anchors.map((a,i)=>{const g=group(root,parts,ids[i],a,[a.x*.3,0,Math.sign(a.z)*.9]);g.userData.spinGroup=new THREE.Group();g.add(g.userData.spinGroup);return g;});
  function material(original,record){
    const isTire=record.tire,paintRule=vehiclePaintRule(profile,record.original,original,record.wheel>=0);
    const rubber=isTire&&profile.id!=='tesla-cybertruck',cache=rubber?tireMaterials:materials;
    const key=original.uuid+'|'+(paintRule?JSON.stringify(paintRule):'original');
    if(cache.has(key))return cache.get(key);
    const m=original.clone(),paintedBody=!!paintRule&&!rubber;
    if(paintedBody){prepareVehiclePaint(m,paintRule);paintMaterials.push(m);}
    if(profile.id==='ferrari'){
      if(/Leather|Interior|Carpet|Carbon_Fiber|plastic_gray/.test(original.name)){m.color.set(original.name==='Leather_red'?0x552027:0x171c22);m.metalness=.12;m.roughness=.7;}
      if(original.name==='metal_chrome'||original.name==='metal_gray'){m.color.set(0x8d969c);m.metalness=.85;m.roughness=.25;}
      if(original.name==='Tires'){m.color.set(0x111315);m.metalness=0;m.roughness=.95;}
    }
    if(profile.id==='ferrari'&&original.name==='Glass_Gray'){m.color.set(0x25404b);m.metalness=.1;m.transparent=true;m.opacity=.4;m.roughness=.15;m.depthWrite=false;}
    // Some artist exports share transmission maps with body paint (e.g. Urus).
    // Body paint remains opaque; only glazing uses the cheaper alpha substitute.
    if(m.transmission>0){const opaqueBody=paintedBody||(profile.id==='lamborghini-urus'&&original.name==='body');m.transmission=0;m.transparent=!opaqueBody;m.opacity=opaqueBody?1:.38;m.depthWrite=opaqueBody;}
    // The C190 source uses the uninformative name Material for its windows
    // (Object_36, alpha blend); it otherwise reflects as a white painted panel.
    const windowGlass=/glass|windscreen|windshield/i.test(original.name)||(profile.id==='mercedes-benz-amg-gt'&&original.name==='Material');
    if(windowGlass){m.color.set(0x567884);m.metalness=0;m.roughness=.12;m.transparent=true;m.opacity=.42;m.depthWrite=false;m.envMapIntensity=.6;}
    if(profile.id==='mercedes-benz-amg-gt'&&original.name==='Material'){m.color.set(0x14242d);m.opacity=.84;m.envMapIntensity=.25;}
    if(rubber){m.metalness=0;m.roughness=.88;}
    cache.set(key,m);return m;
  }
  const hullBounds=new THREE.Box3();
  records.forEach((r,index)=>{
    r.geometry.applyMatrix4(alignment);r.geometry.computeBoundingBox();
    const center=r.geometry.boundingBox.getCenter(new THREE.Vector3());
    const interior=r.materialNames.some(n=>/leather|interior|carpet/i.test(n));
    const glazing=r.materialNames.some(n=>/glass|lens/i.test(n));
    const category=r.wheel>=0?'wheels':interior?'interior':glazing?'glazing':'exterior';
    const id='model-'+String(index).padStart(3,'0');
    const title=r.wheel>=0?labels[r.wheel]+' '+(r.tire?'타이어':r.brake?'캘리퍼':r.fixed?'현가장치':'휠·브레이크'):(r.materialNames[0]===profile.paint?'차체 도장':interior?'실내':glazing?'유리·렌즈':'외장')+' '+String(index+1).padStart(2,'0');
    const obj=new THREE.Mesh(r.geometry,Array.isArray(r.original.material)?r.original.material.map(m=>material(m,r)):material(r.original.material,r));
    obj.name=r.original.name;obj.castShadow=true;obj.receiveShadow=true;
    obj.userData={partId:id,kind:'model',basePosition:new THREE.Vector3(),explodeOffset:new THREE.Vector3(center.x*.15,glazing?.45:.15,Math.sign(center.z)*.3),explodeStage:[.35,.9]};
    if(r.wheel>=0){r.geometry.translate(-anchors[r.wheel].x,-anchors[r.wheel].y,-anchors[r.wheel].z);(r.brake||r.fixed?wheels[r.wheel]:wheels[r.wheel].userData.spinGroup).add(obj);}
    else{hullBounds.union(r.geometry.boundingBox);(interior?cabin:body).add(obj);}
    detailParts.set(id,obj);catalog.push({id,title,kind:'model',category,categoryLabel:{wheels:'바퀴·브레이크',interior:'실내',glazing:'유리·렌즈',exterior:'외장'}[category],sourceName:r.original.name,sourceObjectName:r.original.parent?.name||r.original.name,materialNames:r.materialNames,sourceUrl:profile.source});
  });
  const fallback=createVehicle();
  for(const id of hardware){const part=fallback.parts.get(id);root.add(part);parts.set(id,part);part.userData.kind='hypothesis';part.userData.explodeStage=hypothesisExplosionStage(id);part.traverse(o=>{if(o.isMesh)o.userData.partId=id;});detailParts.set(id,part);catalog.push(createHypothesisCatalogEntry(id));}
  // Dispose the unused procedural shell. Hardware has already been detached.
  disposeVehicle(fallback,root);
  const radius=boxes.reduce((s,b)=>s+(b.max.y-b.min.y)*scale/2,0)/4;
  const width=anchors.reduce((s,a)=>s+Math.abs(a.z),0)/2;
  const size=hullBounds.getSize(new THREE.Vector3());
  // Envelope spans symmetric axle origin. Tires are handled by wheel contacts.
  const geometryParams={wheelbase:profile.wheelbase,trackWidth:width,wheelRadius:radius,bodyLength:2*Math.max(Math.abs(hullBounds.min.x),Math.abs(hullBounds.max.x)),bodyWidth:size.z,bodyHeight:size.y,bodyCenterY:(hullBounds.min.y+hullBounds.max.y)/2};
  return {root,parts,detailParts,catalog,wheels,paintMaterials,geometryParams,profileId:profile.id,sourceMeshCount:records.length,
    wing:parts.get('wing'),tank:parts.get('tank'),battery:parts.get('battery'),fans:fallback.fans,jetMounts:fallback.jetMounts,gimbalNozzles:fallback.gimbalNozzles,driveRotors:fallback.driveRotors,valveIndicators:fallback.valveIndicators,
    assetInfo:{title:profile.title,author:profile.author,license:profile.license,neutralWheelAxes}};
}

export function disposeVehicle(vehicle,retainedRoot=null){
  const geometry=new Set(),materials=new Set(),textures=new Set();
  vehicle.root.traverse(o=>{if(o.geometry)geometry.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])materials.add(m);});
  if(retainedRoot)retainedRoot.traverse(o=>{if(o.geometry)geometry.delete(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])materials.delete(m);});
  // Retained hardware can share materials with the discarded prototype shell.
  for(const g of geometry)g.dispose();
  for(const m of materials){for(const v of Object.values(m))if(v?.isTexture)textures.add(v);m.dispose();}
  for(const t of textures)t.dispose();
}

export async function loadRealVehicle(profile){
  const draco=new DRACOLoader();draco.setDecoderPath(new URL('../vendor/addons/libs/draco/gltf/',import.meta.url).href);
  const loader=new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
  try{const gltf=await loader.loadAsync(new URL(profile.url,import.meta.url).href);return adaptRealVehicle(gltf.scene,profile);}finally{draco.dispose();}
}
