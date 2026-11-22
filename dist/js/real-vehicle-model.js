import * as THREE from 'three';
import {vehiclePaintRule,prepareVehiclePaint} from './vehicle-paint.js?v=20261111-paint1';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {createVehicle} from './vehicle.js?v=20261118-model154';
import {createHypothesisCatalogEntry,hypothesisExplosionStage} from './parts-catalog.js?v=20261118-model154';
import {transformedGeometry,splitWheelGeometry,matchesSource} from './model-geometry.js?v=20261118-city151';
import {straightenWheelAxes} from './wheel-alignment.js?v=20261109-wheel1';

const ids=['wheel-fl','wheel-fr','wheel-rl','wheel-rr'];
const labels=['앞 왼쪽','앞 오른쪽','뒤 왼쪽','뒤 오른쪽'];
const hardware=['tank','suspension','thrusters','wing','engine-assembly'];

// Keep a small set of actual underside vertices. Copying the lowest bolt or
// sill height to the four extreme bumper corners creates phantom ground hits
// whenever a car pitches or rolls on its suspension.
function undersideSamples(records,bounds){
  const length=Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x)),width=Math.max(Math.abs(bounds.min.z),Math.abs(bounds.max.z));
  if(!(length>0&&width>0))return null;
  const bins=Array.from({length:4},()=>Array(6).fill(null));
  for(const record of records){
    if(record.wheel>=0)continue;
    const vertices=record.geometry.attributes.position;
    for(let i=0;i<vertices.count;i++){
      const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i);
      const quadrant=bins[(x>=0?2:0)+(z>=0?1:0)];
      const slot=2*Math.min(2,Math.floor(3*Math.abs(x)/length))+Math.min(1,Math.floor(2*Math.abs(z)/width));
      if(!quadrant[slot]||y<quadrant[slot][1])quadrant[slot]=[x,y,z];
    }
  }
  return bins.map(quadrant=>quadrant.filter(Boolean));
}
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

// The concept asset uses straight chords around the tire shoulder. Split only
// exterior arcs; keep the artist's rim, sidewall graphics, and wheel pivot.
function roundCybertruckTire(geometry,radius){
  const position=geometry.attributes.position,index=geometry.index;
  if(!index||geometry.groups.length>1)return;
  const channels=Object.entries(geometry.attributes).map(([name,attr])=>({
    name,attr,values:Array.from({length:attr.count*attr.itemSize},(_,i)=>
      attr.getComponent(Math.floor(i/attr.itemSize),i%attr.itemSize))
  }));
  const coordinates=channels.find(channel=>channel.name==='position').values;
  const splitEdges=new Map(),triangles=[];
  function midpoint(a,b){
    const key=Math.min(a,b)*position.count+Math.max(a,b);
    if(splitEdges.has(key))return splitEdges.get(key);
    const ax=position.getX(a),ay=position.getY(a),bx=position.getX(b),by=position.getY(b);
    const ra=Math.hypot(ax,ay),rb=Math.hypot(bx,by);
    if(Math.min(ra,rb)<.95*radius)return -1;
    const x=(ax+bx)/2,y=(ay+by)/2,chord=Math.hypot(x,y),arc=(ra+rb)/2;
    const cosAngle=(ax*bx+ay*by)/(ra*rb);
    // Preserve radial facets and avoid spanning concave tread cutouts.
    if(cosAngle>.9976||cosAngle<.925)return -1;
    const id=coordinates.length/3;
    for(const {attr,values} of channels){
      for(let k=0;k<attr.itemSize;k++)values.push((attr.getComponent(a,k)+attr.getComponent(b,k))/2);
    }
    coordinates[id*3]=x*arc/chord;coordinates[id*3+1]=y*arc/chord;
    splitEdges.set(key,id);
    return id;
  }
  for(let i=0;i<index.count;i+=3){
    const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
    const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);
    if(ab<0&&bc<0&&ca<0){triangles.push(a,b,c);continue;}
    if(ab>=0&&bc>=0&&ca>=0){
      triangles.push(a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca);
      continue;
    }
    // Rotate the triangle so the first edge is split. Preserve winding
    // without adding face-center vertices that bias the fitted tire axis.
    let corners=[a,b,c],edges=[ab,bc,ca];
    for(let turn=0;turn<3;turn++){
      if(edges[0]>=0&&edges[2]<0)break;
      corners.push(corners.shift());edges.push(edges.shift());
    }
    const [v0,v1,v2]=corners,[m0,m1]=edges;
    triangles.push(v0,m0,v2);
    if(m1>=0)triangles.push(m0,v1,m1,m0,m1,v2);
    else triangles.push(m0,v1,v2);
  }
  for(const {name,attr,values} of channels)geometry.setAttribute(name,new THREE.Float32BufferAttribute(values,attr.itemSize));
  const materialIndex=geometry.groups[0]?.materialIndex??0;
  geometry.setIndex(triangles);geometry.clearGroups();geometry.addGroup(0,triangles.length,materialIndex);
  geometry.normalizeNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
}

export function adaptRealVehicle(source,profile,{exteriorOnly=false}={}){
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
      const triangleRoles=profile.adapter.wheelTriangles?.[o.name];
      if(triangleRoles){
        const pieces=splitWheelGeometry(geometry,profile.adapter.splitX,profile.adapter.splitZ,null,triangleRoles);
        for(const piece of pieces)records.push({...piece,original:o,materialNames:names,tire:false,brake:false});
        geometry.dispose();return;
      }
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
  // A reviewed mixed-material mesh can have rim edges just outside the tire's
  // sampled bounds. Expand only its selection boxes, never the tire radius or
  // collision shape; the profile value is a fraction of the tire's radius.
  const detailBoxes=boxes.map(box=>box.clone().expandByScalar((box.max.y-box.min.y)*.5*(profile.adapter?.wheelDetailPadding||0)));
  for(const record of mixedWheelDetails){
    for(const piece of splitWheelGeometry(record.geometry,0,0,detailBoxes))records.push({...record,...piece});
    record.geometry.dispose();
  }
  const neutralWheelAxes=straightenWheelAxes(records,boxes);
  const centers=boxes.map(b=>b.getCenter(new THREE.Vector3()));
  const axleFront=(centers[0].x+centers[1].x)/2,axleRear=(centers[2].x+centers[3].x)/2;
  const scale=profile.wheelbase/(axleFront-axleRear);
  if(!Number.isFinite(scale)||scale<=0)throw new Error('차체 축척 오류');
  const center=new THREE.Vector3((axleFront+axleRear)/2,centers.reduce((s,c)=>s+c.y,0)/4,centers.reduce((s,c)=>s+c.z,0)/4);
  const alignment=new THREE.Matrix4().makeTranslation(0,-.24,0).multiply(new THREE.Matrix4().makeScale(scale,scale,scale)).multiply(new THREE.Matrix4().makeTranslation(-center.x,-center.y,-center.z));
  // On these source ACCs the sprung body is exported before the XML's
  // static front/rear ride heights are applied. Tires stay on their own hubs.
  const heights=profile.adapter?.axleRideHeights;
  const ride=heights?new THREE.Matrix4().makeTranslation(0,(heights[0]+heights[1])/2-.24,0)
    .multiply(new THREE.Matrix4().makeRotationZ(Math.atan2(heights[0]-heights[1],profile.wheelbase)))
    .multiply(new THREE.Matrix4().makeTranslation(0,.24,0)):null;
  const bodyAlignment=ride?ride.clone().multiply(alignment):alignment;
  const cockpitPoint=point=>ride&&point?new THREE.Vector3(...point).applyMatrix4(ride).toArray():point;
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
    r.geometry.applyMatrix4(r.wheel<0?bodyAlignment:alignment);r.geometry.computeBoundingBox();
    const center=r.geometry.boundingBox.getCenter(new THREE.Vector3());
    const interior=r.materialNames.some(n=>/leather|interior|carpet/i.test(n));
    const glazing=r.materialNames.some(n=>/glass|lens/i.test(n));
    const sourceNames=[r.original.name,r.original.parent?.name,...r.materialNames].join(' ');
    const engineMesh=/\bengine\b|engine[_-](?:block|cover|head)|(?:piston|crankshaft|camshaft|cylinder[_-]?head|intake[_-]?manifold|exhaust[_-]?manifold)/i.test(sourceNames);
    const category=r.wheel>=0?'wheels':interior?'interior':glazing?'glazing':engineMesh?'powertrain':'exterior';
    const id='model-'+String(index).padStart(3,'0');
    const title=r.wheel>=0?labels[r.wheel]+' '+(r.tire?'타이어':r.brake?'캘리퍼':r.fixed?'현가장치':'휠·브레이크'):(r.materialNames[0]===profile.paint?'차체 도장':interior?'실내':engineMesh?'원본 엔진 부품':glazing?'유리·렌즈':'외장')+' '+String(index+1).padStart(2,'0');
    const obj=new THREE.Mesh(r.geometry,Array.isArray(r.original.material)?r.original.material.map(m=>material(m,r)):material(r.original.material,r));
    obj.name=r.original.name;obj.castShadow=true;obj.receiveShadow=true;
    obj.userData={partId:id,kind:'model',basePosition:new THREE.Vector3(),explodeOffset:new THREE.Vector3(center.x*.15,glazing?.45:.15,Math.sign(center.z)*.3),explodeStage:[.35,.9]};
    if(r.wheel>=0){r.geometry.translate(-anchors[r.wheel].x,-anchors[r.wheel].y,-anchors[r.wheel].z);
      if(!exteriorOnly&&profile.id==='tesla-cybertruck'&&r.tire)roundCybertruckTire(r.geometry,(boxes[r.wheel].max.y-boxes[r.wheel].min.y)*scale/2);
      (r.brake||r.fixed?wheels[r.wheel]:wheels[r.wheel].userData.spinGroup).add(obj);}
    else{hullBounds.union(r.geometry.boundingBox);(interior?cabin:body).add(obj);}
    detailParts.set(id,obj);catalog.push({id,title,kind:'model',category,categoryLabel:{wheels:'바퀴·브레이크',interior:'실내',glazing:'유리·렌즈',powertrain:'동력계',exterior:'외장'}[category],sourceName:r.original.name,sourceObjectName:r.original.parent?.name||r.original.name,materialNames:r.materialNames,sourceUrl:profile.source});
  });
  const cityWheelGeometry=anchors.map(({x,y,z},i)=>({x,y,z,radius:(boxes[i].max.y-boxes[i].min.y)*scale/2}));
  // Traffic and race actors animate only this exterior. Avoid constructing
  // and discarding the experiment chassis and per-wheel suspension rig.
  if(exteriorOnly)return {root,parts,wheels,paintMaterials,cityWheelGeometry};
  const fallback=createVehicle({suspensionAnchors:anchors,suspensionProfileId:profile.id});
  for(const id of hardware){
    const part=fallback.parts.get(id);if(!part)continue;
    const entry=createHypothesisCatalogEntry(id,profile.id);
    root.add(part);parts.set(id,part);part.userData.kind=entry.kind;part.userData.explodeStage=hypothesisExplosionStage(id);
    part.traverse(o=>{if(o.isMesh)o.userData.partId=id;});detailParts.set(id,part);catalog.push(entry);
  }
  // Dispose the unused procedural shell. Hardware has already been detached.
  disposeVehicle(fallback,root);
  const radius=cityWheelGeometry.reduce((sum,w)=>sum+w.radius,0)/4;
  const width=anchors.reduce((s,a)=>s+Math.abs(a.z),0)/2;
  const size=hullBounds.getSize(new THREE.Vector3());
  // Envelope spans symmetric axle origin. Tires are handled by wheel contacts.
  const geometryParams={wheelbase:profile.wheelbase,trackWidth:width,wheelRadius:radius,bodyLength:2*Math.max(Math.abs(hullBounds.min.x),Math.abs(hullBounds.max.x)),bodyWidth:size.z,bodyHeight:size.y,bodyCenterY:(hullBounds.min.y+hullBounds.max.y)/2};
  return {root,parts,detailParts,catalog,wheels,paintMaterials,geometryParams,cityWheelGeometry,cityGroundSupports:undersideSamples(records,hullBounds),profileId:profile.id,sourceMeshCount:records.length,
    wing:parts.get('wing'),tank:parts.get('tank'),compressor:fallback.compressor,battery:parts.get('battery'),fans:fallback.fans,jetMounts:fallback.jetMounts,gimbalNozzles:fallback.gimbalNozzles,driveRotors:fallback.driveRotors,engineSection:fallback.engineSection,valveIndicators:fallback.valveIndicators,
    cockpitEye:cockpitPoint(profile.cockpitEye),cockpitWheel:cockpitPoint(profile.cockpitWheel),cockpitStyle:profile.cockpitStyle,
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

export async function loadRealVehicle(profile,options){
  const draco=new DRACOLoader();draco.setDecoderPath(new URL('../vendor/addons/libs/draco/gltf/',import.meta.url).href);
  const loader=new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
  try{const gltf=await loader.loadAsync(new URL(profile.url,import.meta.url).href);return adaptRealVehicle(gltf.scene,profile,options);}finally{draco.dispose();}
}
