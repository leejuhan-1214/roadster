import * as THREE from 'three';
import {tireAxle} from './wheel-alignment.js?v=20261109-wheel1';

// Reviewed artist interiors already shipped with the corresponding exterior.
// Select precise wheel objects: a material called "steer" can also be reused
// by door trim, and a whole-cabin mesh must never rotate with the wheel.
export const SOURCE_COCKPITS=Object.freeze({
  roadster:{wheel:/^roadster014_Metal_-_Black_rough_0$/,rim:/^roadster014_/,eyeBack:.78,eyeLift:.38,mirror:'roadster011_mirror_0'},
  ferrari:{wheel:/^steering_(?!column)/,rim:/^steering_leather$/,eyeLift:.28},
  'ford-mustang':{wheel:/^GT500Steer_leather_0$/,rim:/^GT500Steer_leather_0$/,eyeLift:.28,pitch:-.10},
  'tesla-model':{wheel:/^movsteer_10_/,rim:/^movsteer_10_movsteer_100_0$/,display:'LCDs_LCDs0_0'},
  'mazda-miata-mx-5':{wheel:/^RLA_miata_steeringwheel_a_/,rim:/^RLA_miata_steeringwheel_a_RLA_miata_alcantara_0$/},
  'aston-martin-db11':{wheel:/^amdb11_steer_/,rim:/^amdb11_steer_amdb11_leather_0$/},
  'audi-q7':{wheel:/^q7-15_driving_wheel_/,rim:/^q7-15_driving_wheel_sits_leather_0$/},
  'audi-tt':{wheel:/^tt_cc15_driving_wheel_/,rim:/^tt_cc15_driving_wheel_sits_leather_0$/},
  'hyundai-tucson':{wheel:/^tucson-15_driving_wheel_/,rim:/^tucson-15_driving_wheel_sits_leather_0$/},
  'lamborghini-gallardo-lp560':{wheel:/^gallardo_steer_/,rim:/^gallardo_steer_gallardo_steeringwheel_0$/,eyeLift:.36},
  'mini-countryman':{wheel:/^countryman-17_driving_wheel_/,rim:/^countryman-17_driving_wheel_sits_leather_0$/},
  'renault-duster':{wheel:/^duster-11_driving_wheel_/,rim:/^duster-11_driving_wheel_sits_leather_0$/},
});
const clamp=THREE.MathUtils.clamp;
const GLASS=/glass|window|windscreen|windshield|glas|tint/i;

function assemblyMatrix(object,root,basePositions){
  const matrix=new THREE.Matrix4();
  for(let node=object;node&&node!==root;node=node.parent){
    const local=new THREE.Matrix4().compose(basePositions.get(node)||node.position,node.quaternion,node.scale);
    matrix.premultiply(local);
  }
  return matrix;
}
// Fit the existing LCD surface; this is metadata only, never a replacement for
// the artist's original mapped dashboard. The display faces the driver (-X).
function displaySurface(record){
  if(!record)return null;
  const geometry=record.object.geometry.clone().applyMatrix4(record.matrix);
  const normal=tireAxle([geometry]);
  if(!normal){geometry.dispose();return null;}
  if(normal.x>0)normal.negate();
  if(normal.x>-.7){geometry.dispose();return null;}
  const up=new THREE.Vector3(0,1,0).addScaledVector(normal,-normal.y).normalize();
  const right=new THREE.Vector3().crossVectors(up,normal).normalize();
  const p=geometry.attributes.position,point=new THREE.Vector3();
  const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<p.count;i++){
    point.fromBufferAttribute(p,i);const v=[point.dot(right),point.dot(up),point.dot(normal)];
    for(let a=0;a<3;a++){low[a]=Math.min(low[a],v[a]);high[a]=Math.max(high[a],v[a]);}
  }
  geometry.dispose();const width=high[0]-low[0],height=high[1]-low[1];
  if(width<.1||width>.7||height<.05||height>.45)return null;
  const position=right.clone().multiplyScalar((low[0]+high[0])*.5).addScaledVector(up,(low[1]+high[1])*.5).addScaledVector(normal,high[2]+.002);
  const quaternion=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,normal));
  return {meshName:record.object.name,position,size:new THREE.Vector2(width,height),normal,quaternion};
}
function onRoadWheel(object,wheels){for(let n=object;n;n=n.parent)if(wheels.includes(n))return true;return false;}

/**
 * Returns an independent cabin instance, or null when no inspected interior is
 * present. All positions are body-local (+X forward,+Y up,+Z right).
 * Mesh geometry/textures are shared read-only except the mirror face, which
 * owns a geometry copy for live-view UVs. Cloned materials and that UV copy
 * are released here; dispose() must run before the source vehicle LRU disposal.
 */
export function createSourceCockpit(vehicle){
  const modelId=vehicle.profileId||(vehicle.actualRoadster?'roadster':null);
  const spec=SOURCE_COCKPITS[modelId];if(!spec)return null;
  const root=new THREE.Group();root.name='original '+modelId+' interior';
  const basePositions=new Map();
  for(const entry of vehicle.fitLayout?.assembly||[])basePositions.set(entry.object,entry.basePosition);
  for(const entry of vehicle.fitLayout?.entries||[])basePositions.set(entry.object,entry.basePosition);
  const materialCache=new Map(),ownedMaterials=new Set(),ownedGeometries=new Set(),paintMaterials=[];
  const originalPaint=new Set(vehicle.paintMaterials||[]),records=[],wheelRecords=[],rimRecords=[];
  const bodyBounds=new THREE.Box3();let glazingCount=0;
  function cloneMaterial(original,mesh){
    const glass=GLASS.test(original.name+' '+mesh.name),key=original.uuid+'|'+glass;
    if(materialCache.has(key))return materialCache.get(key);
    const material=original.clone();material.side=THREE.DoubleSide;
    // The Roadster artist's unmapped interior is medium-grey metal; the
    // concept reference has a dark, nonmetallic dashboard. Keep seats intact.
    if(modelId==='roadster'&&original.name==='interior'){material.color.set('#15191c');material.metalness=0;material.roughness=.86;}
    if(glass){
      // Exterior tinted/reflection maps must not act like opaque panels from
      // the driver's side. The original material is left untouched.
      material.transparent=true;material.opacity=.075;material.depthWrite=false;
      material.metalness=0;material.roughness=.06;
      if('transmission'in material)material.transmission=0;
      glazingCount++;
    }
    materialCache.set(key,material);ownedMaterials.add(material);
    if(originalPaint.has(original))paintMaterials.push(material);
    return material;
  }
  vehicle.root.traverse(object=>{
    if(!object.isMesh||object.userData.kind!=='model'||onRoadWheel(object,vehicle.wheels||[]))return;
    const matrix=assemblyMatrix(object,vehicle.root,basePositions);
    const clone=new THREE.Mesh(object.geometry,Array.isArray(object.material)?object.material.map(m=>cloneMaterial(m,object)):cloneMaterial(object.material,object));
    clone.name=object.name;clone.matrixAutoUpdate=false;clone.matrix.copy(matrix);clone.castShadow=false;clone.receiveShadow=false;
    clone.userData={sourcePartId:object.userData.partId,sharedSourceGeometry:true};
    const bounds=new THREE.Box3().setFromBufferAttribute(object.geometry.attributes.position).applyMatrix4(matrix);
    bodyBounds.union(bounds);const record={object:clone,matrix,bounds};records.push(record);
    if(spec.wheel.test(object.name)){wheelRecords.push(record);if(spec.rim.test(object.name))rimRecords.push(record);}
    else root.add(clone);
  });
  if(!wheelRecords.length){for(const m of ownedMaterials)m.dispose();return null;}
  const rim= rimRecords.length?rimRecords:wheelRecords;
  const wheelBounds=rim.reduce((b,r)=>b.union(r.bounds),new THREE.Box3());
  const wheelCenter=wheelBounds.getCenter(new THREE.Vector3()),wheelSize=wheelBounds.getSize(new THREE.Vector3());
  const wheelRadius=Math.max(wheelSize.y,wheelSize.z)*.5;
  // Reject accidentally matched cabin-wide/seat meshes rather than rotate them.
  if(wheelRadius<.11||wheelRadius>.34||wheelSize.x>.55||Math.abs(wheelCenter.z)<.15){
    for(const m of ownedMaterials)m.dispose();return null;
  }
  const axisGeometry=rim.map(r=>r.object.geometry.clone().applyMatrix4(r.matrix));
  let steeringAxis=tireAxle(axisGeometry)||new THREE.Vector3(1,0,0);
  for(const geometry of axisGeometry)geometry.dispose();
  if(steeringAxis.x<0)steeringAxis.negate();
  if(steeringAxis.x<.4)steeringAxis.set(1,0,0);
  const steering=new THREE.Group();steering.name='original steering wheel';steering.position.copy(wheelCenter);root.add(steering);
  const toWheel=new THREE.Matrix4().makeTranslation(-wheelCenter.x,-wheelCenter.y,-wheelCenter.z);
  for(const r of wheelRecords){r.object.matrix.copy(toWheel).multiply(r.matrix);steering.add(r.object);}
  const size=bodyBounds.getSize(new THREE.Vector3());
  // Camera calibration follows the artist wheel, not nominal exterior roof
  // height. These are visual seat coordinates, not OEM seating measurements.
  const eye=wheelCenter.clone().add(new THREE.Vector3(-(spec.eyeBack??.58),spec.eyeLift??.36,0));
  eye.y=clamp(eye.y,wheelCenter.y+.20,bodyBounds.max.y-.075);
  const seat={width:size.z,length:size.x,eye,source:true,pitch:spec.pitch??-.16};
  const display=displaySurface(records.find(r=>r.object.name===spec.display));
  let mirrorSurface=null;
  const mirrorRecord=records.find(r=>r.object.name===spec.mirror),mirrorBasis=displaySurface(mirrorRecord);
  if(mirrorRecord&&mirrorBasis){
    // Preserve the exact rounded mirror-face silhouette. Its source UVs were
    // authored for an unmapped metallic material, so only this copy gets a
    // planar UV layer for the live optical rear-view texture.
    mirrorSurface=mirrorRecord.object;
    const geometry=mirrorSurface.geometry.clone(),positions=geometry.attributes.position,uv=new Float32Array(positions.count*2);
    const right=new THREE.Vector3(1,0,0).applyQuaternion(mirrorBasis.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(mirrorBasis.quaternion),point=new THREE.Vector3();
    for(let i=0;i<positions.count;i++){
      point.fromBufferAttribute(positions,i).applyMatrix4(mirrorRecord.matrix).sub(mirrorBasis.position);
      uv[i*2]=point.dot(right)/mirrorBasis.size.x+.5;uv[i*2+1]=point.dot(up)/mirrorBasis.size.y+.5;
    }
    geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));ownedGeometries.add(geometry);mirrorSurface.geometry=geometry;
    const material=new THREE.MeshBasicMaterial({color:0x678087,side:THREE.DoubleSide,toneMapped:false,fog:false});ownedMaterials.add(material);mirrorSurface.material=material;
    mirrorSurface.userData.sharedSourceGeometry=false;mirrorSurface.userData.ownedSourceGeometry=true;mirrorSurface.userData.mirrorBasis=mirrorBasis;
  }
  return {root,seat,steering,kind:'source',modelId,wheelCenter,wheelRadius,steeringAxis,paintMaterials,display,mirrorSurface,
    sourceMeshCount:records.length,wheelMeshCount:wheelRecords.length,glazingCount,bodyBounds,
    dispose(){root.removeFromParent();root.clear();for(const material of ownedMaterials)material.dispose();ownedMaterials.clear();for(const geometry of ownedGeometries)geometry.dispose();ownedGeometries.clear();},
  };
}
