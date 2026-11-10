import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalLine, canonicalRing, canonicalGeoJSON } from '../scripts/seoul-geometry.mjs';

test('source matching accepts reversed roads but distinguishes changed bends', () => {
  const road = [[-40.23, 12.61], [0, 3.19], [84.22, -55.8]];
  assert.equal(canonicalLine(road), canonicalLine(road.slice().reverse()));
  assert.notEqual(canonicalLine(road), canonicalLine([road[0], [0, 3.20], road[2]]));
});

test('source building identity is invariant to ring start and winding while retaining courtyards', () => {
  const ring = [[0, 0], [10, 0], [10, 8], [0, 8], [0, 0]];
  const rotated = [[10, 8], [0, 8], [0, 0], [10, 0], [10, 8]];
  assert.equal(canonicalRing(ring), canonicalRing(rotated));
  assert.equal(canonicalRing(ring), canonicalRing(rotated.slice().reverse()));
  const hole = [[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]];
  const otherHole = [[6, 2], [8, 2], [8, 4], [6, 4], [6, 2]];
  const identity = coordinates => canonicalGeoJSON({ type: 'Polygon', coordinates }, p => p);
  assert.deepEqual(identity([ring, hole, otherHole]), identity([rotated, otherHole.slice().reverse(), hole]));
  assert.notDeepEqual(identity([ring, hole]), identity([ring]));
});
