import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {vehicleProfile} from '../dist/js/vehicle-profiles.js';
import {adaptRealVehicle,disposeVehicle} from '../dist/js/real-vehicle-model.js';
import {loadModelGeometry} from './model-loader-helper.mjs';

test('Portofino fixed body clears the road, and only the wheels occupy the tire footprints',async()=>{
  const profile=vehicleProfile('ferrari-portofino');
  const {scene}=await loadModelGeometry(profile);
  const vehicle=adaptRealVehicle(scene,profile);
  try{
    const fixedBounds=new THREE.Box3().setFromObject(vehicle.parts.get('body'));
    const hubs=vehicle.wheels;
    for(let i=0;i<hubs.length;i++){
      const wheelBounds=new THREE.Box3().setFromObject(hubs[i]);
      assert.ok(fixedBounds.min.y-wheelBounds.min.y>.085,'fixed scan cannot carry residual asphalt or tire');
      let rim=false,disc=false;
      hubs[i].traverse(o=>{
        if(!o.isMesh)return;
        rim ||= /diamond cut alloy/i.test(o.material.name);
        disc ||= /ceramic rotor/i.test(o.material.name);
      });
      assert.ok(rim&&disc,'each wheel carries the rolling alloy and its brake rotor');
    }
    assert.ok(Math.abs(hubs[0].position.x-hubs[2].position.x-2.670)<.001,'original wheelbase');
  }finally{disposeVehicle(vehicle);}
});

test('Portofino has a curved transparent windscreen with a clear central opening and independent paint',async()=>{
  const profile=vehicleProfile('ferrari-portofino');
  const {scene,parser}=await loadModelGeometry(profile);
  const pane=scene.getObjectByName('Portofino_Curved_Windscreen');
  assert.ok(pane?.isMesh);
  const glaze=parser.json.materials.find(m=>m.name===pane.material.name);
  assert.equal(glaze.alphaMode,'BLEND');
  assert.ok(glaze.pbrMetallicRoughness.baseColorFactor[3]<.5);
  // Trace through the pane at the driver's eye level. The old capture had a
  // second opaque photographic windscreen behind the outer surface.
  scene.updateMatrixWorld(true);
  const hits=new THREE.Raycaster(new THREE.Vector3(-.075,.111,-.078),new THREE.Vector3(1,0,0),0,.24).intersectObject(scene,true);
  assert.ok(hits.some(h=>h.object===pane));
  assert.ok(hits.every(h=>h.object===pane),'no opaque scan shell blocks the view of the road');
  const shell=scene.getObjectByName('ReservePaint_shell');
  assert.ok(shell?.isMesh);
  assert.equal(shell.material.name,'ReservePaint');
  assert.equal(shell.material.transparent,false);
  assert.equal(shell.material.alphaTest,0);
  assert.equal(shell.material.map,null,'photographic shadows cannot turn into paint boundaries');
  const finish=parser.json.materials.find(m=>m.name===shell.material.name);
  assert.ok(finish.extensions.KHR_materials_clearcoat.clearcoatFactor>.5);
  const materials=new Set();
  scene.traverse(node=>{if(node.isMesh)materials.add(node.material.name);});
  for(const name of ['Portofino graphite intakes','Portofino LED light guide','Portofino ruby tail lenses','Portofino dark wheelhouse']){
    assert.ok(materials.has(name),name+' has independent solid geometry');
  }
});

test('Portofino wheel openings follow circular return edges on the sprung body',async()=>{
  const {scene}=await loadModelGeometry(vehicleProfile('ferrari-portofino'));
  const lip=scene.getObjectByName('ReservePaint_arch');
  assert.ok(lip?.isMesh);
  const v=lip.geometry.attributes.position;
  for(const [cx,cy,radius] of [[.270,-.067,.0784],[-.311,-.0685,.080]]){
    for(const side of [-1,1]){
      const sectors=new Set();
      for(let i=0;i<v.count;i++){
        if(Math.sign(v.getZ(i))!==side)continue;
        const dx=v.getX(i)-cx,dy=v.getY(i)-cy;
        if(Math.abs(Math.hypot(dx,dy)-radius)>.003)continue;
        const angle=Math.atan2(dy,dx);
        if(angle>=0&&angle<Math.PI)sectors.add(Math.floor(32*angle/Math.PI));
      }
      assert.equal(sectors.size,32,'a continuous stamped lip spans the top of each tire');
    }
  }
});
