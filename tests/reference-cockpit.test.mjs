import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createReferenceCockpit,referenceCockpitFamily} from '../dist/js/reference-cockpit.js';

const seat={width:1.9,eye:new THREE.Vector3(.05,.85,-.44)};
const named=(root,text)=>{const found=[];root.traverse(n=>{if(n.name.includes(text))found.push(n);});return found;};

test('reference cabins retain generation-specific display placement instead of a universal front tablet',()=>{
  for(const [id,family] of [['lamborghini-urus','urus'],['bmw','e30'],['toyota-supra-mk4','supra'],['tesla-cybertruck','cybertruck'],['tesla-model-3','model3']]){
    assert.equal(referenceCockpitFamily({profileId:id}),family);
    const cabin=createReferenceCockpit({profileId:id},seat);
    assert.equal(cabin.root.userData.layout,family);assert.equal(cabin.steeringAxis,'x');
    const hub=cabin.steering.getWorldPosition(new THREE.Vector3());
    assert.ok(hub.x>.50&&hub.x<.62&&hub.y<-.25&&hub.y>-.35);
    assert.equal(hub.z,0);
    if(['cybertruck','model3'].includes(family)){
      assert.equal(named(cabin.root,'cluster live screen').length,0);assert.equal(named(cabin.root,'instrument binnacle').length,0);
      assert.ok(named(cabin.root,'tablet live screen')[0].position.z>.3);
    }
    if(family==='urus'){
      assert.equal(named(cabin.root,'hexagonal air vent').length,4);
      const upper=named(cabin.root,'navigation live screen')[0],lower=named(cabin.root,'climate live screen')[0];
      assert.ok(upper.position.y>lower.position.y);assert.ok(upper.position.z>.3&&lower.position.z>.3);
    }
    cabin.dispose();
  }
});

test('generation-specific instruments stay readable from the fitted driver eye',()=>{
  for(const [id,family,kind] of [['volkswagen-beetle','beetle','speed'],['toyota-prius','prius','hybrid-meter'],
    ['porsche-911','911','power'],['ferrari','458','power'],['roadster','roadster','tablet'],
    ['bmw-x6','utility','navigation'],['nissan-versa','touring','speed'],['mclaren-p1','sports','cluster'],
    ['tesla-model','model3','tablet'],['lamborghini-urus','urus','navigation']]){
    const cabin=createReferenceCockpit({profileId:id},seat);
    try{
      assert.equal(cabin.root.userData.layout,family,id);
      const screen=cabin.root.getObjectByName(kind+' live screen');
      assert.ok(screen,id+' instrument');
      cabin.root.updateMatrixWorld(true);
      const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(),.03,20);
      const point=new THREE.Vector3();
      const params=screen.geometry.parameters;
      const width=params.width||params.radius*2,height=params.height||params.radius*2;
      let visible=0;
      for(const u of [-.30,-.15,0,.15,.30])for(const v of [-.25,0,.25]){
        screen.localToWorld(point.set(width*u,height*v,0));ray.ray.direction.copy(point).normalize();
        if(ray.intersectObject(cabin.root,true)[0]?.object===screen)visible++;
      }
      assert.ok(visible>=6,id+' eye rays reaching face '+visible+'/15');
      if(family==='prius')assert.ok(screen.position.z>.25);
      if(family==='beetle'){
        assert.equal(cabin.root.getObjectByName('glove compartment door').material,cabin.paintMaterials[0]);
        assert.equal(screen.geometry.type,'CircleGeometry');
        assert.equal(named(cabin.root,'window switch').length,0);
      }
      if(family==='roadster')assert.ok(params.height>params.width);
    }finally{cabin.dispose();}
  }
});

test('driver eye and straight road view remain unobstructed by fallback interior geometry',()=>{
  for(const id of ['lamborghini-urus','bmw','toyota-supra-mk4','tesla-cybertruck','unknown']){
    const cabin=createReferenceCockpit({profileId:id},seat);cabin.root.updateMatrixWorld(true);
    const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(Math.cos(-.06),Math.sin(-.06),0),.03,30);
    assert.equal(ray.intersectObject(cabin.root,true).length,0,id+' forward road sightline');
    assert.equal(cabin.mirrorAnchor.mirrorSurface,cabin.mirrorSurface);assert.ok(cabin.mirrorAnchor.position.y>0);
    assert.ok(named(cabin.root,'door inner panel').length===2);
    cabin.dispose();
  }
});

test('analog speed, gas and available power move needles without inventing engine RPM',()=>{
  const cabin=createReferenceCockpit({profileId:'bmw'},seat),speed=named(cabin.root,'speed needle')[0],power=named(cabin.root,'power needle')[0];
  cabin.update({speed:0,powerKW:0,gasFraction:1});const rest=speed.rotation.x;
  cabin.update({speed:130,powerKW:200,gasFraction:.5,gear:'D'});
  assert.ok(speed.rotation.x>rest);assert.ok(Math.abs(speed.rotation.x)<1e-12);assert.ok(Math.abs(power.rotation.x)<1e-12);
  assert.equal(cabin.root.userData.telemetry.rpm,null);
  cabin.update({speed:Infinity,powerKW:NaN,rpm:6000,gasFraction:-1});
  assert.equal(cabin.root.userData.telemetry.speed,0);assert.equal(cabin.root.userData.telemetry.gasFraction,0);assert.equal(cabin.root.userData.telemetry.rpm,6000);assert.ok(power.rotation.x>0);
  cabin.dispose();
});

test('visible hood and windshield trim frame the road across compact, sedan and truck dimensions',()=>{
  for(const [id,width,length] of [['miata',1.58,3.91],['bmw',1.68,4.34],['tesla-cybertruck',2.13,5.72]]){
    const fitted={width,length,eye:new THREE.Vector3(.08,.83,-width*.23)};
    const cabin=createReferenceCockpit({profileId:id},fitted);
    try{
      cabin.root.updateMatrixWorld(true);
      const hood=cabin.root.getObjectByName('painted hood beyond windshield');
      assert.equal(hood.material,cabin.paintMaterials[0]);
      assert.equal(named(cabin.root,'parked wiper blade').length,2);
      const points=hood.geometry.attributes.position;
      const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(),.03,30);
      let visible=false;
      for(let i=0;i<points.count;i++){
        const point=new THREE.Vector3().fromBufferAttribute(points,i);
        assert.ok(point.y<-.14*point.x,'hood remains below forward road corridor');
      }
      for(const lateral of [-.22,0,.12,.32])for(let down=8;down<=16&&!visible;down+=.25){
        ray.ray.direction.set(1,-Math.tan(THREE.MathUtils.degToRad(down)),lateral).normalize();
        if(ray.intersectObject(cabin.root,true)[0]?.object===hood){visible=true;break;}
      }
      assert.ok(visible,id+' hood can be seen through the windshield above the dashboard');
      for(const degrees of [-12,-6,0,6,12])for(const pitch of [-6,0,6]){
        ray.ray.direction.set(1,Math.tan(THREE.MathUtils.degToRad(pitch)),Math.tan(THREE.MathUtils.degToRad(degrees))).normalize();
        assert.equal(ray.intersectObject(cabin.root,true).length,0,id+' forward road corridor');
      }
    }finally{cabin.dispose();}
  }
});

test('fallback disposes every owned GPU resource once and leaves the source vehicle untouched',()=>{
  const source=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()),vehicle={profileId:'lamborghini-urus',root:new THREE.Group()};vehicle.root.add(source);
  const cabin=createReferenceCockpit(vehicle,seat),resources=new Set();
  cabin.root.traverse(n=>{if(n.isInstancedMesh)resources.add(n);if(n.geometry)resources.add(n.geometry);for(const mat of [n.material].flat().filter(Boolean)){resources.add(mat);if(mat.bumpMap)resources.add(mat.bumpMap);}});
  cabin.paintMaterials.forEach(m=>resources.add(m));
  const counts=new Map();for(const resource of resources)resource.addEventListener('dispose',()=>counts.set(resource,(counts.get(resource)||0)+1));
  cabin.dispose();cabin.dispose();for(const resource of resources)assert.equal(counts.get(resource),1,resource.type||'geometry');
  assert.equal(cabin.root.children.length,0);assert.equal(source.parent,vehicle.root);source.geometry.dispose();source.material.dispose();
});
