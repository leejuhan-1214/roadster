import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createLandingDeck} from '../dist/js/landing-deck.js';
import {FlightScene} from '../dist/js/scene.js';
import {sampleRoadSurface} from '../dist/js/road-surface.js';

test('test panels, recessed fastener faces and scale marks share the tire contact datum',()=>{
  const deck=createLandingDeck(new THREE.MeshStandardMaterial());
  const bounds=new THREE.Box3().setFromObject(deck);
  assert.deepEqual(bounds.min.toArray(),[-4,0,-2.5]);
  assert.deepEqual(bounds.max.toArray(),[4,0,2.5]);
  assert.equal(deck.children.length,3);
});

test('flat and profiled laboratory pavement use the same elevations as the wheels',()=>{
  const floor={groundSurface:new THREE.Object3D(),roadRelief:new THREE.Mesh(new THREE.PlaneGeometry(12,12,4,4).rotateX(-Math.PI/2))};
  for(const roughness of [0,1,2,0]){
    FlightScene.prototype.updateRoadRelief.call(floor,roughness);
    const p=floor.roadRelief.geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      const expected=sampleRoadSurface(p.getX(i),p.getZ(i),{roughness}).height;
      assert.ok(Math.abs(expected-p.getY(i))<1e-8);
      assert.ok(floor.groundSurface.position.y<=expected);
    }
    if(!roughness)assert.equal(floor.groundSurface.position.y,0);
  }
});
