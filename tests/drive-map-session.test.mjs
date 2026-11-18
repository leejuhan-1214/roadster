import assert from 'node:assert/strict';
import test from 'node:test';
import {DriveMapSession} from '../dist/js/drive-map-session.js';
import {PhysicsSim} from '../dist/js/physics.js';

test('the live route marks turns and does not grow while the car is parked', () => {
  const drive = new DriveMapSession();
  for (let x = 0; x <= 20; x += .5) drive.sample(x, 100);
  for (let z = 100; z <= 120; z += .5) drive.sample(20, z);
  const [route] = drive.segments;
  assert.deepEqual(route[0], [0, 100]);
  assert.deepEqual(route.at(-1), [20, 120]);
  assert.ok(route.some(([x,z]) => Math.hypot(x - 20, z - 100) < 3));
  assert.ok(route.length < 25);
  const revision = drive.revision;
  for (let i = 0; i < 300; i++) drive.sample(20.03, 120.02);
  drive.sample(NaN, Infinity);
  assert.equal(drive.revision, revision);
});

test('a station return, reset or discontinuous world move cannot join unrelated streets', () => {
  const drive = new DriveMapSession();
  drive.sample(10, 20); drive.sample(16, 20);
  drive.breakPath(); drive.breakPath();
  // The exit can be close enough to the entry that distance alone cannot tell.
  drive.sample(15, 25); drive.sample(21, 25);
  drive.sample(-8000, 3200);
  assert.deepEqual(drive.segments, [[[10,20],[16,20]],[[15,25],[21,25]],[[-8000,3200]]]);
});

test('long tracks have bounded storage, preserve endpoints around breaks and never invent a bridge', () => {
  const drive = new DriveMapSession();
  for (let i = 0; i < 16000; i++) drive.sample(i * 4, 25);
  assert.deepEqual(drive.segments[0][0], [0,25]);
  assert.deepEqual(drive.segments[0].at(-1), [63996,25]);
  drive.breakPath();
  for (let i = 0; i < 9000; i++) drive.sample(i * 4, i % 2 ? 400 : 410);
  assert.ok(drive.pointCount <= 4096);
  assert.equal(drive.pointCount, drive.segments.reduce((n, s) => n + s.length, 0));
  assert.deepEqual(drive.segments.at(-1).at(-1), [35996,400]);
  assert.ok(drive.segments.every(line => line.every(([,z]) => z === 25) || line.every(([,z]) => z >= 400)));
  for (let i = 0; i < 8500; i++) { drive.breakPath(); drive.sample(i, -60); }
  assert.ok(drive.segments.length <= 4096);
  assert.deepEqual(drive.segments.at(-1), [[8499,-60]]);
});

test('a restored car keeps its city coordinates, attitude, height relative to its chassis and odometer', () => {
  const drive = new DriveMapSession(), sim = new PhysicsSim();
  assert.equal(drive.restore(sim), null);
  sim.state.pos.set(-95, sim.restHeight + 5, 120);
  sim.state.q.set(.1,-.25,.3,.9).normalize();
  const q = sim.state.q.clone();
  drive.remember(sim, 417.75);
  sim.reset('ground');
  sim.restHeight += .25;
  assert.equal(drive.restore(sim), 417.75);
  assert.deepEqual(sim.state.pos.toArray(), [-95,sim.restHeight + 5,120]);
  assert.ok(sim.state.q.equals(q));
  assert.deepEqual(sim.state.vel.toArray(), [0,0,0]);
  assert.deepEqual(drive.segments, [[[-95,120]]]);
});
