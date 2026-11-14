import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Full-size external educational retrofit, not a Tesla/OEM installation.
// P1000-PRO dimensions are published; mount, plumbing and tank shapes are schematic.
export const JET_VISUAL_DIMENSIONS=Object.freeze({diameter:.234,length:.444,pitch:.26,liftPerPod:16,liftPods:4,totalEngines:70});
const UP=new THREE.Vector3(0,1,0),UNIT=new THREE.Vector3(1,1,1);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v,f)=>Number.isFinite(v)?v:f;
const matrix=new THREE.Matrix4(),quaternion=new THREE.Quaternion(),position=new THREE.Vector3();

function merge(parts){const geometry=mergeGeometries(parts);for(const p of parts)p.dispose();return geometry;}
function box(sx,sy,sz,x=0,y=0,z=0){return new THREE.BoxGeometry(sx,sy,sz).translate(x,y,z);}
function ring(radius,tube,y){return new THREE.TorusGeometry(radius,tube,6,24).rotateX(Math.PI/2).translate(0,y,0);}
function resources(){
  const r=JET_VISUAL_DIMENSIONS.diameter/2,L=JET_VISUAL_DIMENSIONS.length;
  const casing=merge([
    new THREE.CylinderGeometry(r,r,L,20,1,true),
    ring(r+.004,.006,L/2-.016),ring(r+.004,.006,-L/2+.016),ring(r+.003,.005,0),
  ]);
  const throat=merge([
    new THREE.CylinderGeometry(r*.88,r*.88,.07,20,1,true).translate(0,L/2-.035,0),
    new THREE.CylinderGeometry(r*.79,r*.69,.06,20,1,true).translate(0,-L/2+.025,0),
    new THREE.CylinderGeometry(r*.89,r*.89,.009,20).translate(0,L/2-.072,0),
  ]);
  const blades=[new THREE.ConeGeometry(.030,.040,12).translate(0,.010,0)];
  for(let i=0;i<9;i++)blades.push(box(.075,.008,.030,.054,0,0).rotateZ(-.18).rotateY(i*Math.PI*2/9));
  const rotor=merge(blades);
  // A transparent exhaust is a flow indicator, not a measured flame/thermal model.
  const plume=new THREE.ConeGeometry(r*.68,1,12,1,true).rotateX(Math.PI).translate(0,-.5,0);
  return {casing,throat,rotor,plume,metal:new THREE.MeshStandardMaterial({color:0x7b8992,metalness:.85,roughness:.32}),
    dark:new THREE.MeshStandardMaterial({color:0x10191f,metalness:.58,roughness:.54,side:THREE.DoubleSide}),
    blade:new THREE.MeshStandardMaterial({color:0xc0c8cb,metalness:.88,roughness:.24}),
    frame:new THREE.MeshStandardMaterial({color:0x3b4851,metalness:.8,roughness:.43}),
    tank:new THREE.MeshStandardMaterial({color:0xd1b96c,metalness:.52,roughness:.48}),
    glow:new THREE.MeshBasicMaterial({color:0x76bcff,transparent:true,opacity:.24,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending})};
}
function instances(geometry,material,offsets,name){
  const mesh=new THREE.InstancedMesh(geometry,material,offsets.length);mesh.name=name;
  mesh.castShadow=true;mesh.receiveShadow=true;
  offsets.forEach((p,i)=>{matrix.makeTranslation(p.x,p.y,p.z);mesh.setMatrixAt(i,matrix);});
  mesh.computeBoundingSphere();return mesh;
}
function makeGroup(index,count,forcePosition,direction,shared){
  const root=new THREE.Group();root.name=index<4?'external lift pod '+(index+1):index<8?'external rear jet '+(index-3):'external attitude jet '+(index-7);
  root.position.copy(forcePosition);root.quaternion.setFromUnitVectors(UP,direction);
  const offsets=[];for(let i=0;i<count;i++)offsets.push(count===16?new THREE.Vector3((i%4-1.5)*.26,0,(Math.floor(i/4)-1.5)*.26):new THREE.Vector3());
  const casing=instances(shared.casing,shared.metal,offsets,'70 full-size engine cases');
  const throat=instances(shared.throat,shared.dark,offsets,'open air intakes and exhaust throats');
  const rotor=instances(shared.rotor,shared.blade,offsets,'air intake compressor rotors');
  const exhaust=instances(shared.plume,shared.glow,offsets,'jet flow indicators');
  exhaust.castShadow=false;exhaust.receiveShadow=false;exhaust.visible=false;exhaust.frustumCulled=false;rotor.frustumCulled=false;
  root.add(casing,throat,rotor,exhaust);
  if(count===16){
    const pieces=[];for(const a of [-.52,.52])pieces.push(box(1.08,.04,.04,0,.115,a),box(.04,.04,1.08,a,.115,0));
    for(const a of [-.26,0,.26])pieces.push(box(1.04,.025,.018,0,.115,a),box(.018,.025,1.04,a,.115,0));
    const grid=new THREE.Mesh(merge(pieces),shared.frame);grid.name='schematic gimballed engine carrier';grid.castShadow=true;root.add(grid);
  }
  root.traverse(o=>{o.userData.partId='jet-rig';o.userData.jetGroup=index;o.userData.hypothetical=true;});
  return {root,index,count,offsets,rotor,exhaust,forcePosition:forcePosition.clone(),defaultDirection:direction.clone(),rotorAngle:0};
}

/** Fit once after configureVehicleFit. Flat coordinates are passed to physics unchanged. */
export function installJetRig(vehicle,profile={}){
  if(vehicle.jetRig)return vehicle.jetRig.geometryParams;
  if(!vehicle.root)throw new Error('Jet rig needs an adapted vehicle root');
  const p=vehicle.geometryParams||{},halfLength=finite(p.bodyLength,4.7)/2,halfWidth=finite(p.bodyWidth,1.95)/2;
  const skin=vehicle.nozzleFit?.skinBounds?.clone()||new THREE.Box3(new THREE.Vector3(-halfLength,-.4,-halfWidth),new THREE.Vector3(halfLength,.8,halfWidth));
  const outerWidth=Math.max(Math.abs(skin.min.z),Math.abs(skin.max.z));
  const wheelRadius=finite(p.wheelRadius,finite(profile.wheelRadius,.36));
  // The vehicle adapter puts unloaded wheel centres at y=-.31 m.
  const tireGround=-.31-wheelRadius;
  const liftX=Math.max(.94,finite(p.wheelbase,finite(profile.wheelbase,2.8))*.34),liftY=tireGround+.85,liftZ=outerWidth+.69;
  const boostX=skin.min.x-.35,boostY=tireGround+.58,boostZ=Math.max(.43,outerWidth*.78);
  const yawX=skin.max.x+.31,yawY=tireGround+.58,yawZ=outerWidth+.18;
  const root=new THREE.Group();root.name='external air-breathing experimental jet rig';root.userData.partId='jet-rig';root.userData.hypothetical=true;
  const shared=resources(),groups=[];
  for(let i=0;i<4;i++)groups.push(makeGroup(i,16,new THREE.Vector3(i<2?liftX:-liftX,liftY,i%2?liftZ:-liftZ),UP,shared));
  for(let i=0;i<4;i++)groups.push(makeGroup(i+4,1,new THREE.Vector3(boostX,boostY,[-1,-1/3,1/3,1][i]*boostZ),new THREE.Vector3(1,0,0),shared));
  for(let i=0;i<2;i++)groups.push(makeGroup(i+8,1,new THREE.Vector3(yawX,yawY,i===0?yawZ:-yawZ),new THREE.Vector3(0,0,i===0?-1:1),shared));
  groups.forEach(g=>root.add(g.root));
  const beams=[],beamY=tireGround+.36;
  for(const x of [-liftX,liftX])beams.push(box(.09,.09,2*liftZ,x,beamY,0));
  for(const z of [-outerWidth*.78,outerWidth*.78])beams.push(box(yawX-boostX,.09,.09,(yawX+boostX)/2,beamY,z));
  for(const g of groups)beams.push(box(.07,g.forcePosition.y-beamY,.07,g.forcePosition.x,(g.forcePosition.y+beamY)/2,g.forcePosition.z));
  beams.push(box(.08,.08,2*boostZ,boostX,boostY,0),box(.08,.08,2*yawZ,yawX,yawY,0));
  const frame=new THREE.Mesh(merge(beams),shared.frame);frame.name='schematic reinforced external mounting frame';frame.castShadow=true;root.add(frame);
  // 2 x 114 L external envelope accommodates 187.5 L fuel with structural margin.
  const fuelShape=box(.68,.58,.29),fuelOffsets=[new THREE.Vector3(0,tireGround+.63,outerWidth+.27),new THREE.Vector3(0,tireGround+.63,-outerWidth-.27)];
  const tanks=instances(fuelShape,shared.tank,fuelOffsets,'external liquid fuel tanks, 150 kg total usable capacity');root.add(tanks);
  root.traverse(o=>{o.userData.partId='jet-rig';o.userData.hypothetical=true;});
  vehicle.root.add(root);root.updateWorldMatrix(true,true);
  // Reserve the complete 25-degree gimbal sweep, excluding the non-solid plume.
  const angle=25*Math.PI/180;
  // Include a diagonal tilt, where both axes of a square pod lower one corner.
  const extent=.54+.54*(1-Math.cos(angle))/2+.222*Math.sin(angle);
  const verticalExtent=.54*Math.SQRT2*Math.sin(angle)+.222*Math.cos(angle);
  const sweptLow=liftY-verticalExtent;
  const physicalBounds=skin.clone().union(new THREE.Box3(
    new THREE.Vector3(Math.min(boostX-.222,-liftX-extent),Math.min(beamY-.045,sweptLow),-Math.max(liftZ+extent,yawZ+.222)),
    new THREE.Vector3(Math.max(yawX+.13,liftX+extent),Math.max(liftY+verticalExtent,skin.max.y),Math.max(liftZ+extent,yawZ+.222))));
  const geometryParams={liftX,liftY,liftZ,boostX,boostY,boostZ,yawX,yawY,yawZ,
    bodyLength:2*Math.max(Math.abs(physicalBounds.min.x),Math.abs(physicalBounds.max.x)),
    bodyWidth:2*Math.max(Math.abs(physicalBounds.min.z),Math.abs(physicalBounds.max.z)),
    bodyHeight:physicalBounds.max.y-physicalBounds.min.y,bodyCenterY:(physicalBounds.max.y+physicalBounds.min.y)/2};
  const info={engineCount:70,liftEngineCount:64,auxiliaryEngineCount:6,enginesPerLiftPod:16,engineDiameterM:.234,engineLengthM:.444,
    fuelCapacityKg:150,tireGroundY:tireGround,minimumSweptGroundClearanceM:sweptLow-tireGround,
    dimensionsSource:'https://www.jetcat.de/en/productdetails/produkte/jetcat/produkte/Professionell/P1000',
    assumption:'External experimental 70-engine retrofit; frame, fuel tanks and gimbals are schematic and not an OEM or certified aircraft design.'};
  const inspectionEntry={id:'jet-rig',title:'외장 제트 리프트 장치 · 70기',kind:'hypothesis',category:'propulsion',categoryLabel:'가상 실험 장치',
    description:'P1000-PRO 크기를 적용한 외장 장치: 리프트 64기와 보조 6기. 외기 흡입 → 압축·연소 → 배기. 150 kg 액체 연료; 지지대와 짐벌은 설계 가정입니다.'};
  Object.assign(geometryParams,{physicalBounds,info});
  vehicle.jetRig={root,groups,geometryParams,physicalBounds,info,inspectionEntry,shared};
  updateJetRig(vehicle,null,0);return geometryParams;
}

/** Display actual simulated group state. Never changes physics, fuel, or commands. */
export function updateJetRig(vehicle,sim,dt=0){
  const rig=vehicle.jetRig;if(!rig)return;
  const seconds=clamp(finite(dt,0),0,.1);
  for(const g of rig.groups){
    const t=sim?.thrusters?.[g.index];
    const dir=t?.dir;
    if(dir&&Number.isFinite(dir.x)&&Number.isFinite(dir.y)&&Number.isFinite(dir.z)&&dir.lengthSq()>1e-12)g.root.quaternion.setFromUnitVectors(UP,position.copy(dir).normalize());
    else g.root.quaternion.setFromUnitVectors(UP,g.defaultDirection);
    const rpm=Math.max(0,finite(t?.rpm,0));
    // Visual aliasing is capped; the true RPM remains in simulation/readouts.
    g.rotorAngle=(g.rotorAngle+seconds*Math.min(42,rpm/600))%(2*Math.PI);
    quaternion.setFromAxisAngle(UP,g.rotorAngle);
    const running=!!t?.running,force=Math.max(0,finite(t?.force,0));
    const power=clamp(force/(g.count*1100*.85),0,1.25),length=running&&force>0?.10+power*.95:0;
    g.exhaust.visible=length>0;
    for(let i=0;i<g.offsets.length;i++){
      position.copy(g.offsets[i]);position.y+=.444/2-.04;
      matrix.compose(position,quaternion,UNIT);g.rotor.setMatrixAt(i,matrix);
      position.copy(g.offsets[i]);position.y-=.444/2;
      matrix.makeScale(1,length,1);matrix.setPosition(position);g.exhaust.setMatrixAt(i,matrix);
    }
    g.rotor.instanceMatrix.needsUpdate=true;g.exhaust.instanceMatrix.needsUpdate=true;
    g.root.userData.engineState=t?.jetState?.phase||'off';g.root.userData.actualRPM=rpm;g.root.userData.actualThrustN=force;
  }
}
