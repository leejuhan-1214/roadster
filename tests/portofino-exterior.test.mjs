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
  const paint=parser.json.materials.find(m=>m.name==='ReservePaint');
  const trim=parser.json.materials.find(m=>m.name==='Portofino original trim');
  assert.equal(paint.alphaMode,'MASK');assert.equal(trim.alphaMode,'MASK');
  assert.notEqual(paint.pbrMetallicRoughness.baseColorTexture.index,trim.pbrMetallicRoughness.baseColorTexture.index);
});
