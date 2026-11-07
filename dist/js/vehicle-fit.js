import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const Z=new THREE.Vector3(0,0,1),UP=new THREE.Vector3(0,1,0);
const smooth=t=>t*t*(3-2*t);

function rootBounds(object,root){
  object.updateWorldMatrix(true,true);root.updateWorldMatrix(true,false);
  const inverse=root.matrixWorld.clone().invert(),box=new THREE.Box3();
  object.traverse(node=>{if(!node.isMesh||!node.geometry)return;
    node.geometry.computeBoundingBox();
    box.union(node.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,node.matrixWorld)));
  });return box;
}

function skinMeshes(vehicle){
  const result=[];
  for(const entry of vehicle.catalog||[]){
    if(entry.kind!=='model'||['wheels','interior','glazing'].includes(entry.category))continue;
    const part=vehicle.detailParts.get(entry.id);part?.traverse(node=>{if(node.isMesh)result.push(node);});
  }
  return result;
}

// A mesh intersection determines the local body surface, not another vehicle's
// nominal dimensions. The source shells remain intact and OEM-neutral.
function surfaceHit(meshes,origin,direction,fallback){
  const previous=new Map();
  for(const mesh of meshes)for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
    if(!previous.has(material)){previous.set(material,material.side);material.side=THREE.DoubleSide;}
  }
  let hit;
  try{hit=new THREE.Raycaster(origin,direction,0,30).intersectObjects(meshes,false)[0];}
  finally{for(const [material,side]of previous)material.side=side;}
  return hit?hit.point.clone():fallback.clone();
}

function hatch(parent,position,outward,size,material,index){
  const frame=new THREE.Group();frame.name='recessed nozzle hatch '+index;
  frame.position.copy(position);frame.quaternion.setFromUnitVectors(Z,outward);parent.add(frame);
  const hinge=new THREE.Group();hinge.position.x=-size/2;frame.add(hinge);
  const panel=new THREE.Mesh(new THREE.BoxGeometry(size,size,.012),material);
  panel.position.x=size/2;panel.castShadow=true;panel.receiveShadow=true;hinge.add(panel);
  const borderMaterial=new THREE.MeshStandardMaterial({color:0x141b22,roughness:.58,metalness:.2});
  for(const [width,height,x,y]of [[size+.014,.012,0,size/2],[size+.014,.012,0,-size/2],[.012,size+.014,size/2,0],[.012,size+.014,-size/2,0]]){
    const border=new THREE.Mesh(new THREE.BoxGeometry(width,height,.009),borderMaterial);
    border.position.set(x,y,-.008);border.userData.hatchFrame=true;frame.add(border);
  }
  frame.traverse(n=>{n.userData.partId='thrusters';});
  return {frame,hinge,index,opening:0};
}

function batchHatchFrames(rig,covers){
  rig.updateWorldMatrix(true,true);
  const inverse=rig.matrixWorld.clone().invert(),pieces=[],originals=[];
  for(const cover of covers)for(const child of cover.frame.children)if(child.userData.hatchFrame){
    pieces.push(child.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,child.matrixWorld)));
    originals.push(child);
  }
  if(!pieces.length)return;
  const material=originals[0].material,merged=new THREE.Mesh(mergeGeometries(pieces),material);
  merged.name='batched flush aperture frames';merged.userData.partId='thrusters';rig.add(merged);
  const unusedMaterials=new Set();
  for(const mesh of originals){mesh.removeFromParent();mesh.geometry.dispose();if(mesh.material!==material)unusedMaterials.add(mesh.material);}
  for(const geometry of pieces)geometry.dispose();for(const m of unusedMaterials)m.dispose();
}

function fitNozzles(vehicle){
  const rig=vehicle.parts.get('thrusters');if(!rig)return {};
  const meshes=skinMeshes(vehicle),bounds=new THREE.Box3();
  for(const mesh of meshes)bounds.union(rootBounds(mesh,vehicle.root));
  if(bounds.isEmpty())bounds.set(new THREE.Vector3(-2.2,-.4,-.95),new THREE.Vector3(2.2,.8,.95));
  const size=bounds.getSize(new THREE.Vector3());
  const halfWidth=Math.max(.45,Math.min(Math.abs(bounds.min.z),Math.abs(bounds.max.z)));
  const halfLength=Math.max(1,Math.min(Math.abs(bounds.min.x),Math.abs(bounds.max.x)));
  const liftX=clamp((vehicle.geometryParams?.wheelbase||2.8)*.29,.55,halfLength*.65);
  const liftZ=clamp(halfWidth*.62,.30,.78);
  const bottom=[];
  for(const x of [liftX,-liftX])for(const z of [-liftZ,liftZ])bottom.push(surfaceHit(meshes,new THREE.Vector3(x,bounds.min.y-2,z),UP,new THREE.Vector3(x,bounds.min.y,z)));
  // Shared planar mount preserves the allocator's symmetric geometry. The
  // concealed exits can extend down to their independently sampled skin points.
  const liftY=Math.max(...bottom.map(p=>p.y))+.085;
  const covers=[],paint=vehicle.paintMaterials?.[0];
  const coverMaterial=new THREE.MeshStandardMaterial({color:paint?.color?.clone()||new THREE.Color(0x26313b),metalness:.6,roughness:.32});
  if(paint)vehicle.paintMaterials.push(coverMaterial);
  for(let i=0;i<4;i++){
    const pivot=vehicle.gimbalNozzles?.[i];if(!pivot)continue;
    const mount=pivot.parent;mount.position.set(i<2?liftX:-liftX,liftY,i%2?liftZ:-liftZ);
    mount.name='body fitted lift mount '+i;
    const exitY=bottom[i].y+.018,depth=liftY-exitY;
    // Bell remains inside the sampled skin even at the 25° gimbal limit.
    pivot.scale.setScalar(.68);pivot.position.y=0;
    // Keep every swivel at the shared physics force point. Exhaust exits extend
    // along that same swivel axis to the independently sampled body opening.
    pivot.userData.exitOffset=new THREE.Vector3(0,-depth/pivot.scale.y,0);
    vehicle.jetMounts[i]={pos:new THREE.Vector3(mount.position.x,exitY,mount.position.z),dir:UP.clone()};
    covers.push(hatch(rig,new THREE.Vector3(mount.position.x,bottom[i].y+.004,mount.position.z),new THREE.Vector3(0,-1,0),.30,coverMaterial,i));
  }
  const boostY=clamp(bounds.min.y+size.y*.25,bounds.min.y+.16,bounds.max.y-.18),boostZ=clamp(halfWidth*.45,.25,.65);
  const rear=[];
  for(const z of [-boostZ,boostZ])rear.push(surfaceHit(meshes,new THREE.Vector3(bounds.min.x-2,boostY,z),new THREE.Vector3(1,0,0),new THREE.Vector3(bounds.min.x,boostY,z)));
  const boostX=Math.max(...rear.map(p=>p.x))+.075;
  // Original rig's first four groups are lift mounts, followed by two boosts.
  const boosts=rig.children.filter(n=>n.isGroup&&!vehicle.gimbalNozzles?.some(p=>p.parent===n)&&!vehicle.fans?.includes(n)).slice(0,2);
  boosts.forEach((mount,i)=>{
    mount.name='body fitted rear nozzle '+i;mount.position.set(boostX,boostY,i?boostZ:-boostZ);mount.scale.setScalar(.70);
    vehicle.jetMounts[4+i]={pos:new THREE.Vector3(rear[i].x+.006,boostY,mount.position.z),dir:new THREE.Vector3(1,0,0)};
    covers.push(hatch(rig,new THREE.Vector3(rear[i].x+.004,boostY,mount.position.z),new THREE.Vector3(-1,0,0),.16,coverMaterial,4+i));
  });
  const nominalYawX=clamp(halfLength*.58,.7,1.55),yawY=boostY;
  let yawX=nominalYawX,sidePoints=[],bestClearance=-Infinity;
  // A wheel arch can expose an internal rail to the ray. Move both symmetric
  // port pairs toward the sill until every ray reaches the outer body shell.
  for(const factor of [1,.9,.8,.7,.6]){
    const candidateX=nominalYawX*factor,points=[];
    for(const [x,side]of [[candidateX,1],[-candidateX,-1],[candidateX,-1],[-candidateX,1]]){
      points.push(surfaceHit(meshes,new THREE.Vector3(x,yawY,side*(halfWidth+2)),new THREE.Vector3(0,0,-side),new THREE.Vector3(x,yawY,side*halfWidth)));
    }
    const clearance=Math.min(...points.map((p,i)=>p.z*(i===0||i===3?1:-1)));
    if(clearance>bestClearance){bestClearance=clearance;yawX=candidateX;sidePoints=points;}
    if(clearance>=halfWidth*.65)break;
  }
  const yawZ=Math.max(.25,Math.min(...sidePoints.map(p=>Math.abs(p.z)))-.07);
  sidePoints.forEach((surface,i)=>{
    const side=Math.sign(surface.z),position=new THREE.Vector3(i%2?-yawX:yawX,yawY,side*yawZ);
    const nozzle=new THREE.Mesh(new THREE.CylinderGeometry(.025,.040,.045,12,1,true),new THREE.MeshStandardMaterial({color:0x4c5863,metalness:.8,roughness:.35}));
    nozzle.name='body fitted attitude nozzle '+i;nozzle.position.copy(position);nozzle.quaternion.setFromUnitVectors(UP,new THREE.Vector3(0,0,-side));nozzle.userData.partId='thrusters';rig.add(nozzle);
    vehicle.jetMounts[6+i]={pos:surface.clone().add(new THREE.Vector3(0,0,-side*.006)),dir:new THREE.Vector3(0,0,-side)};
    covers.push(hatch(rig,surface.clone().add(new THREE.Vector3(0,0,-side*.004)),new THREE.Vector3(0,0,side),.11,coverMaterial,6+i));
  });
  for(let i=0;i<(vehicle.fans?.length||0);i++)vehicle.fans[i].position.set(-liftX,bounds.min.y+.09,(i?1:-1)*liftZ*.62);
  batchHatchFrames(rig,covers);
  vehicle.nozzleCovers=covers;vehicle.nozzleFit={skinBounds:bounds.clone(),liftSurfaces:bottom.map(v=>v.toArray()),rearSurfaces:rear.map(v=>v.toArray()),sideSurfaces:sidePoints.map(v=>v.toArray())};
  return {liftX,liftY,liftZ,boostX,boostY,boostZ,yawX,yawY,yawZ};
}

/** Called once after each source model has been adapted to chassis coordinates. */
export function configureVehicleFit(vehicle,profile={}){
  if(vehicle.fitLayout)return vehicle.geometryParams;
  vehicle.root.updateMatrixWorld(true);
  Object.assign(vehicle.geometryParams??={},fitNozzles(vehicle));
  vehicle.root.updateMatrixWorld(true);
  const entries=[];
  for(const entry of vehicle.catalog||[]){
    const object=vehicle.detailParts?.get(entry.id);if(!object)continue;
    const bounds=rootBounds(object,vehicle.root);if(bounds.isEmpty())continue;
    const size=bounds.getSize(new THREE.Vector3());
    // The entire assumed device remains one catalog component. Allow its hatch
    // and internal rotors to move within a conservative component envelope.
    if(entry.kind==='hypothesis')size.addScalar(.72);
    entries.push({id:entry.id,kind:entry.kind,object,bounds,size,center:bounds.getCenter(new THREE.Vector3()),basePosition:object.position.clone()});
  }
  const gap=.22,area=entries.reduce((sum,e)=>sum+(Math.max(.1,e.size.x)+gap)*(Math.max(.1,e.size.y)+gap),0);
  const width=clamp(Math.sqrt(area)*1.25,9,26);
  entries.sort((a,b)=>b.size.y-a.size.y||b.size.x-a.size.x||a.id.localeCompare(b.id));
  let x=0,y=0,rowHeight=0;
  for(const entry of entries){
    const w=Math.max(.10,entry.size.x),h=Math.max(.10,entry.size.y);
    if(x>0&&x+w>width){x=0;y+=rowHeight+gap;rowHeight=0;}
    entry.target=new THREE.Vector3(x+w/2,y+h/2,0);x+=w+gap;rowHeight=Math.max(rowHeight,h);
  }
  const bounds=new THREE.Box3();
  for(const entry of entries)bounds.union(new THREE.Box3().setFromCenterAndSize(entry.target,entry.size));
  const center=bounds.getCenter(new THREE.Vector3());
  // Raise the inspection board clear of the test pad. A centered board would
  // hide its lower rows beneath the opaque ground at maximum disassembly.
  const shift=new THREE.Vector3(-center.x,.15-bounds.min.y,-center.z);
  for(const entry of entries){entry.target.add(shift);entry.delta=entry.target.clone().sub(entry.center);}
  bounds.translate(shift);
  vehicle.explosionBounds=bounds;
  vehicle.fitLayout={entries,assembly:[...vehicle.parts.values()].map(object=>({object,basePosition:object.userData.basePosition?.clone()||object.position.clone()})),profileId:profile.id,gap};
  return vehicle.geometryParams;
}

/** Readable end-state layout; changing progress never mutates physical state. */
export function updateVehicleExplosion(vehicle,progress,{inspect=false}={}){
  const layout=vehicle.fitLayout;if(!layout)return;
  if(!inspect&&progress===0&&layout.lastProgress===0&&layout.lastInspect===false)return;
  layout.lastProgress=progress;layout.lastInspect=inspect;
  const t=smooth(clamp(progress,0,1));
  for(const {object,basePosition} of layout.assembly){
    const wheel=vehicle.wheels?.includes(object);
    if(!wheel||inspect)object.position.copy(basePosition);
    if(wheel&&inspect){object.rotation.set(0,0,0);object.userData.spinGroup?.rotation.set(0,0,0);}
  }
  for(const entry of layout.entries)entry.object.position.copy(entry.basePosition);
  vehicle.root.updateMatrixWorld(true);
  if(t>0)for(const entry of layout.entries){
    const object=entry.object,parent=object.parent;
    const origin=object.getWorldPosition(new THREE.Vector3());
    const delta=entry.delta.clone().transformDirection(vehicle.root.matrixWorld).multiplyScalar(entry.delta.length()*t);
    object.position.copy(parent.worldToLocal(origin.add(delta)));object.updateMatrixWorld(true);
  }
  vehicle.root.updateMatrixWorld(true);
}

export function updateNozzleCovers(vehicle,thrusters=[],inspecting=false){
  for(const cover of vehicle.nozzleCovers||[]){
    const amount=inspecting?1:clamp((thrusters[cover.index]?.opening||0)*8,0,1);
    cover.opening=amount;cover.hinge.rotation.y=amount?-amount*Math.PI*.48:0;
  }
}
