import * as THREE from 'three';
import {copyVehiclePaint} from './vehicle-paint.js?v=20261111-paint1';
import {tireAxle} from './wheel-alignment.js?v=20261109-wheel1';

const up=new THREE.Vector3(0,1,0),forward=new THREE.Vector3(1,0,0);

function validPoint(value){
  return Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);
}

export function isOpenGrandPrix(car={}){
  return car.cockpitStyle==='open-grand-prix'||/^sd-(?:36|67)gp-/.test(car.profileId||car.id||'');
}

export function grandPrixSeat(car,width,length){
  const early=(car.profileId||car.id||'').includes('36gp-'),g=car.geometryParams||{};
  const originY=car.cityWheelGeometry?.[0]?.y??-.24;
  const roadY=originY-(g.wheelRadius||.34);
  const eye=validPoint(car.cockpitEye)
    ?new THREE.Vector3(...car.cockpitEye)
    :new THREE.Vector3(-(g.wheelbase||2.6)*(early?.23:.075),roadY+(early?1.03:.86),0);
  // Tall pre-war seats look down over the bonnet and a large, steep wheel.
  // A wider frame keeps the dials in view without moving the source eye.
  return {width,length,eye,pitch:early?-.21:-.12,fov:early?77:70};
}

/** Speed Dreams body vertices are already in the adapter's assembled body frame.
 * The four wheel groups use hub-local geometry. The inspection parts stay out
 * of this driver-only copy, including the auxiliary propulsion apparatus. */
export function createGrandPrixCockpit(car,seat){
  const root=new THREE.Group();root.name='single-seat Grand Prix cockpit';root.userData.layout='open-grand-prix';
  const early=(car.profileId||car.id||'').includes('36gp-');
  const ownedGeometry=new Set(),materials=new Set(),copies=new Map(),paintMaterials=[];
  const paints=new Set(car.paintMaterials||[]);
  const standard=(color,metalness=.1,roughness=.65)=>{
    const mat=new THREE.MeshStandardMaterial({color,metalness,roughness});materials.add(mat);return mat;
  };
  function cloneMaterial(source){
    if(copies.has(source))return copies.get(source);
    const mat=copyVehiclePaint(source,source.clone());copies.set(source,mat);materials.add(mat);
    if(paints.has(source))paintMaterials.push(mat);
    if(/^glass/i.test(source.name)){mat.opacity=.035;mat.transparent=true;mat.depthWrite=false;}
    return mat;
  }
  function addSource(object,parent){
    const mat=Array.isArray(object.material)?object.material.map(cloneMaterial):cloneMaterial(object.material);
    const mesh=new THREE.Mesh(object.geometry,mat);mesh.name=object.name;mesh.userData.sharedSourceGeometry=true;parent.add(mesh);return mesh;
  }
  function shape(geo,mat,parent,name){
    const m=new THREE.Mesh(geo,mat);m.name=name;ownedGeometry.add(geo);parent.add(m);return m;
  }
  function bar(parent,a,b,r,mat,name){
    const delta=b.clone().sub(a),m=shape(new THREE.CylinderGeometry(r,r,delta.length(),8),mat,parent,name);
    m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(up,delta.normalize());return m;
  }
  const wheelMeshes=new Set(),moving=[];
  for(const sourceWheel of car.wheels||[]){
    const mount=new THREE.Group(),spin=new THREE.Group();root.add(mount);mount.add(spin);
    sourceWheel.traverse(object=>{
      if(!object.isMesh||object.userData.kind!=='model')return;
      wheelMeshes.add(object);addSource(object,object.parent===sourceWheel.userData.spinGroup?spin:mount);
    });
    moving.push({sourceWheel,mount,spin});
  }
  const steeringMeshes=[];
  car.root?.traverse(object=>{
    if(!object.isMesh||object.userData.kind!=='model'||wheelMeshes.has(object))return;
    if(/^gp_steering/i.test(object.name)){steeringMeshes.push(object);return;}
    // Dials are sometimes baked into the tub's upholstery texture.
    addSource(object,root);
  });
  const steering=new THREE.Group();steering.name='Grand Prix steering wheel';root.add(steering);
  let steeringAxis=forward;
  if(steeringMeshes.length){
    if(validPoint(car.cockpitWheel))steering.position.fromArray(car.cockpitWheel);
    else{
      const bounds=new THREE.Box3();
      for(const source of steeringMeshes){const g=source.geometry;if(!g.boundingBox)g.computeBoundingBox();bounds.union(g.boundingBox);}
      bounds.getCenter(steering.position);
    }
    const axis=tireAxle(steeringMeshes.map(mesh=>mesh.geometry));
    if(axis&&Math.abs(axis.x)>.55)steeringAxis=axis.x<0?axis.negate():axis;
    for(const source of steeringMeshes)addSource(source,steering).position.copy(steering.position).negate();
  }else{
    const alloy=standard(0x777976,.72,.31),bezel=standard(0x444642,.65,.4);
    const column=new THREE.Group();column.name='inclined steering column';root.add(column);column.add(steering);
    if(validPoint(car.cockpitWheel))column.position.fromArray(car.cockpitWheel);
    else column.position.copy(seat.eye).add(new THREE.Vector3(.53,-.27,0));
    column.rotation.z=early?-.30:-.17;
    const rim=standard(early?0x684325:0x201e1b,.04,.54),radius=early?.20:.159;
    const hoop=shape(new THREE.TorusGeometry(radius,.014,12,64),rim,steering,'steering rim');hoop.rotation.y=Math.PI/2;
    for(let i=0;i<3;i++){
      const theta=Math.PI+i*2*Math.PI/3,tip=new THREE.Vector3(0,radius*Math.cos(theta),radius*Math.sin(theta));
      bar(steering,new THREE.Vector3(-.025,0,0),tip,.009,alloy,'alloy spoke');
    }
    const hub=shape(new THREE.CylinderGeometry(.029,.029,.035,24),bezel,steering,'steering hub');
    hub.rotation.z=Math.PI/2;hub.position.x=-.022;
  }
  function update(){
    for(const {sourceWheel,mount,spin} of moving){
      mount.position.copy(sourceWheel.position);mount.quaternion.copy(sourceWheel.quaternion);
      if(sourceWheel.userData.spinGroup)spin.quaternion.copy(sourceWheel.userData.spinGroup.quaternion);
    }
  }
  update();
  return {root,steering,steeringAxis,bodyCoordinates:true,kind:steeringMeshes.length?'source':'reference',paintMaterials,update,
    dispose(){root.removeFromParent();root.clear();for(const g of ownedGeometry)g.dispose();for(const m of materials)m.dispose();}};
}
