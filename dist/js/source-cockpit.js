import * as THREE from 'three';
import {copyVehiclePaint} from './vehicle-paint.js?v=20261111-paint1';
import {tireAxle} from './wheel-alignment.js?v=20261109-wheel1';

// Reviewed artist interiors already shipped with the corresponding exterior.
// Select precise wheel objects: a material called "steer" can also be reused
// by door trim, and a whole-cabin mesh must never rotate with the wheel.
// These converted ACC cars retain the named wheel pieces and cabin glazing.
// The right-hand-drive builds keep their original seat side.
const speedDreamsGT={wheel:/^gt_steering_/,rim:/^gt_steering_(?:STEERRIM|RIM001|STEERINGWH|VOLANT_s|SWALCANTARA)/,
  glassMaterial:/^glass_\d+$/,eyeBack:.54,eyeLift:.30};
export const SOURCE_COCKPITS=Object.freeze({
  roadster:{wheel:/^roadster014_Metal_-_Black_rough_0$/,rim:/^roadster014_/,eyeBack:.73,eyeLift:.315,pitch:-.09,mirror:'roadster011_mirror_0'},
  ferrari:{wheel:/^steering_(?!column)/,rim:/^steering_leather$/,eyeLift:.28},
  'ford-mustang':{wheel:/^GT500Steer_leather_0$/,rim:/^GT500Steer_leather_0$/,eyeBack:.44,eyeLift:.29,pitch:-.08},
  'tesla-model':{wheel:/^movsteer_10_/,rim:/^movsteer_10_movsteer_100_0$/,display:'LCDs_LCDs0_0',mirror:'mirror_inside_mirror_inside0_0'},
  'mazda-miata-mx-5':{wheel:/^RLA_miata_steeringwheel_a_/,rim:/^RLA_miata_steeringwheel_a_RLA_miata_alcantara_0$/,eyeLift:.31},
  'aston-martin-db11':{wheel:/^amdb11_steer_/,rim:/^amdb11_steer_amdb11_leather_0$/,eyeLift:.29,mirror:'amdb11_body_amdb11_mirror_0'},
  'audi-q7':{wheel:/^q7-15_driving_wheel_/,rim:/^q7-15_driving_wheel_sits_leather_0$/},
  'audi-tt':{wheel:/^tt_cc15_driving_wheel_/,rim:/^tt_cc15_driving_wheel_sits_leather_0$/,eyeLift:.29},
  'hyundai-tucson':{wheel:/^tucson-15_driving_wheel_/,rim:/^tucson-15_driving_wheel_sits_leather_0$/},
  'lamborghini-gallardo-lp560':{wheel:/^gallardo_steer_/,rim:/^gallardo_steer_gallardo_steeringwheel_0$/,eyeBack:.50,eyeLift:.23,pitch:-.06},
  'lamborghini-revuelto':{wheel:/^Steering_wheel_(?:Logo|Steering_wheel)_0$/,rim:/^Steering_wheel_Steering_wheel_0$/,eyeLift:.33,display:'Speedometer_Cluster_0'},
  'mclaren-p1':{wheel:/^GEO_STEER1_SUB/,rim:/^GEO_STEER1_SUB0_INT_Velvet_0$/,eyeBack:.47,eyeLift:.23,pitch:-.065,mirror:'polymsh_SUB10_Mirror_0'},
  'mini-countryman':{wheel:/^countryman-17_driving_wheel_/,rim:/^countryman-17_driving_wheel_sits_leather_0$/},
  'renault-duster':{wheel:/^duster-11_driving_wheel_/,rim:/^duster-11_driving_wheel_sits_leather_0$/},
  'sd-sc-kongei-kk8s':speedDreamsGT,
  'sd-sc-lynx-220':speedDreamsGT,
  'sd-srw-sector-p4':speedDreamsGT,
  'sd-sc-boxer-96-2':speedDreamsGT,
  'sd-trb1-sector-rb1':speedDreamsGT,
  'sd-trb1-vieringe-5rb':speedDreamsGT,
  'sd-trb1-silber-rblk':speedDreamsGT,
  'sd-trb1-spirit-rb1lt':speedDreamsGT,
  'sd-trb1-taipan-rb1':speedDreamsGT,
  'sd-trb1-boxer-trbrs':speedDreamsGT,
  'sd-ls2-vortex-gt':speedDreamsGT,
  'sd-ls2-morley-r900':{...speedDreamsGT,eyeLift:.26},
  'sd-ls1-archer-r9':speedDreamsGT,
  'sd-sc-fmc-gt4':{...speedDreamsGT,eyeBack:.50,eyeLift:.283,pitch:-.06},
  'sd-sc-cavallo-360':speedDreamsGT,
  'sd-ls1-cavallo-570s1':speedDreamsGT,
  'sd-ls2-condor-c400r':{...speedDreamsGT,eyeLift:.26},
  'sd-ls2-lynx-xkr':speedDreamsGT,
  'sd-ls2-sprite-gts':speedDreamsGT,
  'sd-trb1-cavallo-360rb':speedDreamsGT,
  'sd-rs1-fmc-centre04':speedDreamsGT,
});
const clamp=THREE.MathUtils.clamp;
// Some models reuse "glass" on the instruments, lights and windscreen trim.
// Match the artist's pane meshes so only cabin glazing gets the inside finish.
const commonPane=/_exterior_glass_0$/;
const cabinPanes={
  roadster:/_Glass_(?:mid_tint|Tint_max)_0$/i,
  ferrari:/^glass$/,
  'ford-mustang':/^GT500(?:SideGlass[RL]|DoorGlass[RL]|Windshield|Backlight)_tinted_glass_/,
  'tesla-model':/^(?:windscreen_ok|door_[lr][fr]|glass)_glass[01]_0$/,
  'mazda-miata-mx-5':/^RLA_miata_(?:windshield|window_[lr]f)_RLA_miata_glass(?:_int)?_0$/,
  'aston-martin-db11':/^amdb11_(?:windshield|doorglass_[RL]|sideglass_[RL]|backlight|body)_amdb11_glass(?:_tint)?_0$/,
  'lamborghini-gallardo-lp560':/^gallardo_(?:windshield_tinted|(?:sideglass|doorglass)_[RL]_tinted|backlight_tinted|tailgate)_gallardo_glass(?:_tinted)?_0$/,
  'lamborghini-revuelto':/^(?:Windshield|Right.?Left_window(?:_2|s)|Rear_window)_Windows_0$/,
  'mclaren-p1':/_Windows(?:_alpha)?_0$/,
  'audi-q7':commonPane,'audi-tt':commonPane,'hyundai-tucson':commonPane,
  'mini-countryman':commonPane,'renault-duster':commonPane,
};

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

// Fitted to the sloping centre portion of the Roadster asset's single-piece
// dashboard. The artist did not supply a separate display or an operating UI.
function roadsterConsole(){
  const right=new THREE.Vector3(0,0,1),up=new THREE.Vector3(1,.94,0).normalize();
  const normal=new THREE.Vector3().crossVectors(right,up);
  return {position:new THREE.Vector3(.38,.068,.01),size:new THREE.Vector2(.191,.30),
    normal,quaternion:new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,normal))};
}

function liveInstrument(display,modelId){
  const portrait=modelId==='roadster';
  const position=display.position.clone(),size=display.size.clone();
  if(!portrait){
    // Keep the artist's surrounding screen graphics. Use the central area of
    // the Revuelto cluster and the upper-left area of the Model 3 screen.
    if(modelId==='tesla-model'){
      position.add(new THREE.Vector3(-size.x*.26,size.y*.24,.001).applyQuaternion(display.quaternion));
      size.set(size.x*.42,size.y*.32);
    }else size.set(size.x*.40,size.y*.70);
  }
  const geometry=new THREE.PlaneGeometry(size.x,size.y);
  const canvas=globalThis.document?.createElement('canvas');
  let texture=null;
  if(canvas){canvas.width=384;canvas.height=Math.round(canvas.width*size.y/size.x);}
  const ctx=canvas?.getContext('2d');
  if(ctx){texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;}
  const material=new THREE.MeshBasicMaterial({color:texture?0xffffff:0x11191e,map:texture,toneMapped:false});
  const surface=new THREE.Mesh(geometry,material);surface.name='driving telemetry display';
  surface.userData.instrumentOverlay=true;surface.position.copy(position);surface.quaternion.copy(display.quaternion);
  let lastPaint=-Infinity,lastKey='';
  function update({speed=0,gear='N',powerKW=0,gasFraction=1}={}){
    if(!ctx)return;
    const now=performance.now();
    if(now-lastPaint<100)return;
    const velocity=Math.round(speed),power=Math.round(powerKW),air=Math.round(gasFraction*100);
    const key=portrait?[velocity,gear,power,air].join('|'):velocity+'|'+gear;
    if(key===lastKey)return;
    lastKey=key;lastPaint=now;
    const w=canvas.width,h=canvas.height;
    ctx.fillStyle='#080d11';ctx.fillRect(0,0,w,h);ctx.textBaseline='middle';
    function label(value,x,y,fontSize,color,align='left'){
      ctx.textAlign=align;ctx.fillStyle=color;ctx.font='500 '+fontSize+'px sans-serif';ctx.fillText(value,w*x,h*y);
    }
    if(portrait){
      ctx.fillStyle='#101b22';ctx.fillRect(w*.035,h*.025,w*.93,h*.95);
      label(gear,.13,.13,42,'#80dfc7');
      label(String(velocity),.50,.34,112,'#f1f6f6','center');
      label('km/h',.50,.475,30,'#b2c3c9','center');
      ctx.fillStyle='#364953';ctx.fillRect(w*.10,h*.57,w*.80,2);
      label('POWER',.12,.67,20,'#b2c3c9');label(power+' kW',.88,.67,28,'#f1f6f6','right');
      label('AIR',.12,.80,20,'#b2c3c9');label(air+'%',.88,.80,28,'#f1f6f6','right');
      ctx.fillStyle='#3b5058';ctx.fillRect(w*.12,h*.875,w*.76,h*.015);
      ctx.fillStyle='#80dfc7';ctx.fillRect(w*.12,h*.875,w*.76*clamp(gasFraction,0,1),h*.015);
    }else{
      label(gear,.10,.50,h*.33,'#80dfc7');
      label(String(velocity),.57,.41,h*.58,'#f1f6f6','center');
      label('km/h',.57,.81,h*.18,'#b2c3c9','center');
    }
    texture.needsUpdate=true;
  }
  update();
  return {surface,update,dispose(){geometry.dispose();material.dispose();texture?.dispose();}};
}

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
    const glass=Array.isArray(mesh.material)
      ? /^(glass|windshield|windscreen)$/i.test(original.name)
      : spec.glassMaterial?spec.glassMaterial.test(original.name):cabinPanes[modelId].test(mesh.name);
    const key=original.uuid+'|'+glass;
    if(materialCache.has(key))return materialCache.get(key);
    if(glass){
      // The source can have two overlapping panes and baked exterior
      // reflections. Use a faint neutral tint on the cabin copy only.
      const pane=new THREE.MeshBasicMaterial({name:original.name,color:0xdce9e6,
        transparent:true,opacity:.02,depthWrite:false,side:THREE.DoubleSide,
        forceSinglePass:true,toneMapped:false,fog:false});
      pane.userData.cabinPane=true;
      materialCache.set(key,pane);ownedMaterials.add(pane);glazingCount++;
      return pane;
    }
    const material=copyVehiclePaint(original,original.clone());material.side=THREE.DoubleSide;
    // The Roadster artist's unmapped interior is medium-grey metal; the
    // concept reference has a dark, nonmetallic dashboard. Keep seats intact.
    if(modelId==='roadster'&&original.name==='interior'){material.color.set('#15191c');material.metalness=0;material.roughness=.86;}
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
  const seat={width:size.z,length:size.x,eye,source:true,pitch:spec.pitch??-.075};
  const display=modelId==='roadster'&&root.getObjectByName('roadster008_interior_0')
    ?roadsterConsole():displaySurface(records.find(r=>r.object.name===spec.display));
  const instrument=display?liveInstrument(display,modelId):null;
  if(instrument)root.add(instrument.surface);
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
  return {root,seat,steering,kind:'source',modelId,wheelCenter,wheelRadius,steeringAxis,paintMaterials,display,mirrorSurface,update:instrument?.update,
    sourceMeshCount:records.length,wheelMeshCount:wheelRecords.length,glazingCount,bodyBounds,
    dispose(){root.removeFromParent();root.clear();instrument?.dispose();for(const material of ownedMaterials)material.dispose();ownedMaterials.clear();for(const geometry of ownedGeometries)geometry.dispose();ownedGeometries.clear();},
  };
}
