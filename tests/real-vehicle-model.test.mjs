import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {adaptRealVehicle} from '../dist/js/real-vehicle-model.js';
import {VEHICLES,vehicleProfile,vehiclePhysics} from '../dist/js/vehicle-profiles.js';
import {DEFAULTS,PhysicsSim} from '../dist/js/physics.js';

const near=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const wheelIds=['fl','fr','rl','rr'];
// Author the fixture in chassis axes then express it in each model's source axes.
// It deliberately has proportions different from Roadster to detect distortion.
function sourceFor(profile){
  const source=new THREE.Group();source.rotation.y=-profile.yaw;
  const paint=new THREE.MeshStandardMaterial({name:profile.paint,color:0x990011});
  const tireMaterial=new THREE.MeshStandardMaterial({name:'Tire'});
  const metal=new THREE.MeshStandardMaterial({name:'Metal'});
  const add=(parent,name,size,material,position)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);
    mesh.name=name;mesh.position.fromArray(position);parent.add(mesh);return mesh;
  };
  add(source,'body-shell',[4.8,.8,1.6],paint,[0,1.3,0]);
  add(source,'front-nose',[.2,.1,.4],paint,[2.5,1.1,0]);
  const glass=new THREE.MeshPhysicalMaterial({name:'Glass',transmission:.7});
  add(source,'windshield',[1,.5,1.1],glass,[.3,1.8,0]);
  const centers=[[1.5,1,-.8],[1.5,1,.8],[-1.5,1,-.8],[-1.5,1,.8]];
  centers.forEach((center,i)=>{
    const wheel=new THREE.Group();
    wheel.name=profile.id==='ferrari'?'wheel_'+wheelIds[i]:'BMW_E30_M3_TIRE_'+i;
    wheel.position.fromArray(center);source.add(wheel);
    add(wheel,'tire-'+i,[.65,.65,.22],tireMaterial,[0,0,0]);
    if(profile.id==='ferrari')add(wheel,'rim-'+i,[.4,.4,.25],metal,[0,0,0]);
    else{
      const rim=new THREE.Group();rim.name='BMW_E30_M3_RIM_'+i;rim.position.fromArray(center);source.add(rim);
      add(rim,'rim-'+i,[.4,.4,.25],metal,[0,0,0]);
      const brake=new THREE.Group();brake.name='Brembo_Calipers_'+i;brake.position.fromArray(center);source.add(brake);
      add(brake,'brake-'+i,[.1,.2,.1],metal,[.1,0,0]);
    }
  });
  return source;
}
const modelPart=(vehicle,name)=>[...vehicle.detailParts.values()].find(p=>p.name===name);

function quantizeSource(source){
  source.traverse(o=>{
    if(!o.isMesh)return;
    const position=o.geometry.getAttribute('position');
    const extent=Math.max(...position.array.map(Math.abs));
    const values=Int16Array.from(position.array,v=>Math.round(v/extent*32767));
    o.geometry.setAttribute('position',new THREE.BufferAttribute(values,3,true));
    o.scale.multiplyScalar(extent);
    const normal=o.geometry.getAttribute('normal');
    o.geometry.setAttribute('normal',new THREE.BufferAttribute(Int8Array.from(normal.array,v=>Math.round(v*127)),3,true));
    const tangents=new Int8Array(position.count*4);
    for(let i=0;i<position.count;i++){tangents[i*4]=127;tangents[i*4+3]=127;}
    o.geometry.setAttribute('tangent',new THREE.BufferAttribute(tangents,4,true));
  });
  return source;
}

for(const id of ['ferrari','bmw'])test(`${id}: source orientation, wheel ordering and uniform proportions survive adaptation`,()=>{
  const profile=vehicleProfile(id),source=sourceFor(profile),vehicle=adaptRealVehicle(source,profile);
  const scale=profile.wheelbase/3;
  assert.deepEqual(vehicle.wheels.map(w=>w.userData.partId),wheelIds.map(id=>'wheel-'+id));
  vehicle.wheels.forEach((wheel,i)=>{
    near(wheel.position.x,(i<2?1:-1)*profile.wheelbase/2);
    near(wheel.position.z,(i%2?1:-1)*.8*scale);
    near(wheel.position.y,-.24);
    const tire=modelPart(vehicle,'tire-'+i);
    assert.equal(tire.parent,wheel.userData.spinGroup);
    tire.geometry.computeBoundingBox();
    const size=tire.geometry.boundingBox.getSize(new THREE.Vector3());
    near(size.x/.65,scale,1e-6);near(size.y/.65,scale,1e-6);near(size.z/.22,scale,1e-6);
  });
  const body=modelPart(vehicle,'body-shell');body.geometry.computeBoundingBox();
  const bodySize=body.geometry.boundingBox.getSize(new THREE.Vector3());
  near(bodySize.x/4.8,scale,1e-6);near(bodySize.y/.8,scale,1e-6);near(bodySize.z/1.6,scale,1e-6);
  const nose=modelPart(vehicle,'front-nose');nose.geometry.computeBoundingBox();
  assert.ok(nose.geometry.boundingBox.min.x>0,'the nose must point in positive X');
  near(vehicle.geometryParams.wheelbase,profile.wheelbase);
  near(vehicle.geometryParams.trackWidth,1.6*scale,1e-6);
  near(vehicle.geometryParams.wheelRadius,.325*scale,1e-6);
  assert.equal(new Set(vehicle.catalog.map(p=>p.id)).size,vehicle.catalog.length);
  vehicle.root.traverse(o=>{if(o.isMesh)assert.ok(vehicle.detailParts.has(o.userData.partId));});
  if(id==='bmw')for(let i=0;i<4;i++)assert.equal(modelPart(vehicle,'brake-'+i).parent,vehicle.wheels[i]);
});

test('separately loaded vehicles own independent hardware and paint state',()=>{
  const profile=vehicleProfile('ferrari'),source=sourceFor(profile);
  const a=adaptRealVehicle(source,profile),b=adaptRealVehicle(source,profile);
  for(const id of ['tank','thrusters','battery','drive-front','power-electronics']){
    assert.notEqual(a.parts.get(id),b.parts.get(id));
    assert.equal(a.parts.get(id).parent,a.root);
    assert.equal(b.parts.get(id).parent,b.root);
  }
  assert.notEqual(a.gimbalNozzles[0],b.gimbalNozzles[0]);
  a.gimbalNozzles[0].rotation.x=.3;assert.equal(b.gimbalNozzles[0].rotation.x,0);
  assert.equal(a.paintMaterials.length,1);assert.equal(b.paintMaterials.length,1);
  a.paintMaterials[0].color.set(0x00ff00);
  assert.notEqual(a.paintMaterials[0].color.getHex(),b.paintMaterials[0].color.getHex());
  assert.equal(source.getObjectByName('body-shell').material.color.getHex(),0x990011);
});

test('quantized glTF attributes preserve dimensions when world transforms exceed normalized integer range',()=>{
  for(const id of ['ferrari','bmw']){
    const profile=vehicleProfile(id);
    const plain=adaptRealVehicle(sourceFor(profile),profile);
    const quantized=quantizeSource(sourceFor(profile));
    const vehicle=adaptRealVehicle(quantized,profile);
    for(const key of Object.keys(plain.geometryParams))near(vehicle.geometryParams[key],plain.geometryParams[key],.0001);
    for(let i=0;i<4;i++)assert.ok(vehicle.wheels[i].position.distanceTo(plain.wheels[i].position)<.0001);
    for(const entry of vehicle.catalog.filter(p=>p.kind==='model')){
      const mesh=vehicle.detailParts.get(entry.id),original=plain.detailParts.get(entry.id);
      for(const key of ['position','normal','tangent']){
        const attribute=mesh.geometry.getAttribute(key);
        assert.ok(attribute.array instanceof Float32Array,`${id} ${key} must accept world-space values`);
        assert.equal(attribute.normalized,false);
        assert.ok(attribute.array.every(Number.isFinite));
      }
      mesh.geometry.computeBoundingBox();original.geometry.computeBoundingBox();
      assert.ok(mesh.geometry.boundingBox.min.distanceTo(original.geometry.boundingBox.min)<.0001);
      assert.ok(mesh.geometry.boundingBox.max.distanceTo(original.geometry.boundingBox.max)<.0001);
    }
    assert.ok(quantized.getObjectByName('body-shell').geometry.getAttribute('position').array instanceof Int16Array,
      'adaptation must leave source attributes unchanged');
  }
});

test('published reference mass plus assumed rig and box inertia feed actual simulation parameters',()=>{
  for(const profile of VEHICLES.filter(v=>v.id!=='roadster')){
    const vehicle=profile.adapter?{geometryParams:{wheelbase:profile.wheelbase,trackWidth:profile.width*.82,bodyLength:profile.length,bodyWidth:profile.width,bodyHeight:profile.height}}:adaptRealVehicle(sourceFor(profile),profile);
    const params=vehiclePhysics(profile,vehicle.geometryParams,DEFAULTS);
    assert.equal(params.dryMass,profile.referenceMass+profile.rigMass);
    near(params.inertiaRoll,params.dryMass*(profile.width**2+profile.height**2)/12);
    near(params.inertiaYaw,params.dryMass*(profile.length**2+profile.width**2)/12);
    near(params.inertiaPitch,params.dryMass*(profile.length**2+profile.height**2)/12);
    const sim=new PhysicsSim(params);
    near(sim.mass,params.dryMass+sim.state.gas);
    near(sim.wheels[0].pos.x-sim.wheels[2].pos.x,profile.wheelbase);
    near(sim.wheels[1].pos.z-sim.wheels[0].pos.z,params.trackWidth);
    near(sim.bodyHalf[0],params.bodyLength/2);
    assert.equal(params.springK,DEFAULTS.springK);
    assert.equal(params.tankVolume,DEFAULTS.tankVolume);
  }
  const original=vehiclePhysics(vehicleProfile('roadster'),{},DEFAULTS);
  assert.deepEqual(original,DEFAULTS);assert.notEqual(original,DEFAULTS);
  assert.throws(()=>vehicleProfile('nonexistent'));
});
