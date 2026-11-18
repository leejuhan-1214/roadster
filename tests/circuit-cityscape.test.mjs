import assert from 'node:assert/strict';
import test from 'node:test';
import { Group } from 'three';
import { circuitCityscapeStages } from '../dist/js/circuit-cityscape.js';
import { RACE_COURSE, projectToCourse, runoffWidth } from '../dist/js/station-race-course.js';

const world = new Group(), obstacles = [];
for (const stage of circuitCityscapeStages(world, obstacles)) { /* staged construction */ }
const districts = world.getObjectByName('Circuit metropolitan districts');

test('the race has three-dimensional districts, shared atlases and a bounded render cost', () => {
  assert.ok(districts.userData.buildingCount > 90);
  assert.equal(districts.children.length, 24);
  const materials = new Set(districts.children.map(mesh => mesh.material));
  assert.equal(materials.size, 2);
  assert.ok([...materials].some(material => material.map && material.emissiveMap));
  let triangles = 0;
  for (const mesh of districts.children) {
    const g = mesh.geometry;
    triangles += g.index.count / 3;
    assert.ok(g.boundingSphere.radius > 0 && Number.isFinite(g.boundingSphere.radius));
    assert.ok(g.attributes.position.count > 0);
  }
  assert.ok(triangles < 65000);
});

test('curtain-wall types have different lighting occupancy and complete unlit floors', () => {
  const { data, width, height } = districts.children.find(mesh => mesh.material.emissiveMap).material.emissiveMap.image;
  const strip = width / 4, occupancy = [];
  for (let i = 0; i < 4; i++) {
    let occupied = 0, darkFloor = false;
    for (let floor = 0; floor < 16; floor++) {
      let activePixels = 0;
      for (let y = floor * height / 16; y < (floor + 1) * height / 16; y++) {
        for (let x = strip * i; x < strip * (i + 1); x++) {
          if (data[(y * width + x) * 4] > 0) activePixels++;
        }
      }
      if (!activePixels) darkFloor = true;
      occupied += activePixels;
    }
    assert.ok(darkFloor);
    const fraction = occupied / (height * strip);
    assert.ok(fraction > .02 && fraction < .3);
    occupancy.push(fraction);
  }
  assert.ok(Math.max(...occupancy) - Math.min(...occupancy) > .07);
});

test('buildings clear the racing line, corner runoff and both sides of the viaduct basin', () => {
  for (const solid of obstacles) {
    assert.ok(solid.size.every(v => v > 0));
    const [x, , z] = solid.center, [width, , depth] = solid.size;
    assert.ok(x + width / 2 < 165 || x - width / 2 > 505 || z + depth / 2 < -58 || z - depth / 2 > 82, solid.id);
    for (const [x, z] of solid.footprint) {
      const nearest = projectToCourse({ x, z });
      assert.ok(nearest.error > RACE_COURSE.width / 2 + runoffWidth(nearest.distance, Math.sign(nearest.lateral)), solid.id);
    }
  }
  const firstStraight = obstacles.filter(s => s.center[0] > 40 && s.center[0] < 600);
  assert.ok(firstStraight.some(s => s.center[2] < -25 && s.center[2] > -180 && s.center[1] > 40));
  assert.ok(firstStraight.some(s => s.center[2] > 25 && s.center[2] < 180 && s.center[1] > 40));
});
