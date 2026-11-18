import assert from 'node:assert/strict';
import test from 'node:test';
import {RACE_COURSE as course, sampleCourse, StationRace} from '../dist/js/station-race.js';

function startRace() {
  const race = new StationRace();
  race.update(3, race.startPose);
  return race;
}

function drive(race, from, to, speed = 20, lateral = -3.15) {
  const step = Math.sign(to - from);
  let distance = from;
  while (Math.abs(to - distance) > 1e-8 && race.phase === 'racing') {
    const metres = step * Math.min(1, Math.abs(to - distance));
    distance += metres;
    assert.equal(race.update(Math.abs(metres) / speed, sampleCourse(distance, lateral)), null);
  }
}

test('circuit forms a continuous loop with forward tangents, signed right offsets and ordered gates', () => {
  assert.ok(course.length > 450 && course.length < 500);
  assert.equal(course.gates[0].x, 0); assert.equal(course.gates[0].z, 0);
  for (let d = -20; d < course.length * 2; d += 2.5) {
    const a = sampleCourse(d);
    const duplicate = sampleCourse(d + course.length);
    assert.ok(Math.hypot(a.x - duplicate.x, a.z - duplicate.z) < 1e-9);
    const ahead = sampleCourse(d + .02);
    assert.ok((ahead.x - a.x) * Math.cos(a.heading) - (ahead.z - a.z) * Math.sin(a.heading) > .019);
    const right = sampleCourse(d, course.width / 2);
    assert.ok(Math.abs((right.x - a.x) * Math.sin(a.heading) + (right.z - a.z) * Math.cos(a.heading) - course.width / 2) < 1e-8);
  }
  assert.equal(new Set(course.gates.map(g => g.distance)).size, course.gates.length);
  assert.deepEqual(course.gates.map(g => g.index), course.gates.map((_, i) => i));
});

test('grid, clock, and rival speeds wait for green and the countdown consumes only its share of a frame', () => {
  const race = new StationRace();
  const original = race.rivals.map(car => car.distance);
  assert.equal(race.rank, 2); assert.equal(race.phase, 'countdown');
  race.update(2.73, race.startPose);
  assert.deepEqual(race.rivals.map(car => car.distance), original);
  assert.equal(race.elapsed, 0);
  race.update(.47, race.startPose);
  assert.equal(race.phase, 'racing');
  assert.ok(Math.abs(race.elapsed - .2) < 1e-12);
  assert.ok(race.rivals.every((r, i) => r.distance > original[i] && r.speed > 0));
});

test('all successive gates and two complete laps are required, with interpolated finish time and immutable final place', () => {
  for (const [speed, expectedRank] of [[24, 1], [16, 2], [8, 4]]) {
    const race = startRace();
    drive(race, -6, 2, speed);
    assert.equal(race.completedGates, 1); assert.equal(race.nextGate, 1); assert.equal(race.lap, 1);
    drive(race, 2, course.length + 1, speed);
    assert.equal(race.completedGates, course.gates.length + 1);
    assert.equal(race.lap, 2); assert.equal(race.phase, 'racing');
    drive(race, course.length + 1, 2 * course.length + 3, speed);
    assert.equal(race.phase, 'finished');
    assert.ok(Math.abs(race.finishTime - (2 * course.length + 6) / speed) < 1e-6);
    assert.equal(race.progress, 2 * course.length); assert.equal(race.rank, expectedRank);
    const finishTime = race.elapsed;
    race.update(25, race.startPose);
    assert.equal(race.elapsed, finishTime); assert.equal(race.rank, expectedRank);
  }
});

test('crossing start in reverse, skipping a gate, and relapping by crossing the finish repeatedly give no credit', () => {
  const race = startRace();
  drive(race, -6, -course.length / 3);
  assert.equal(race.completedGates, 0);
  const reset = race.recover();
  assert.equal(reset.distance, -6);
  const shortcut = race.update(.016, sampleCourse(course.gates[3].distance));
  assert.deepEqual(shortcut, race.startPose); assert.equal(race.completedGates, 0);
  drive(race, -6, 4);
  for (let i = 0; i < 3; i++) { drive(race, 4, -3); drive(race, -3, 4); }
  assert.equal(race.completedGates, 1); assert.equal(race.lap, 1);
});

test('leaving the track or flying above the course ceiling recovers to the last accepted gate and the timer and opponents continue', () => {
  const race = startRace();
  drive(race, -6, course.gates[2].distance + 2);
  const gateCount = race.completedGates;
  const start = race.elapsed;
  const rivalStart = race.rivals[0].distance;
  const above = {...sampleCourse(course.gates[2].distance + 2, -3.15), y: 27};
  assert.equal(race.update(.5, above), null);
  const recovery = race.update(.8, above);
  assert.ok(recovery); assert.equal(race.completedGates, gateCount);
  assert.ok(Math.abs(race.elapsed - start - 1.3) < 1e-10);
  assert.ok(race.rivals[0].distance > rivalStart);
  assert.ok(Math.abs(recovery.distance - course.gates[2].distance - 1.5) < 1e-9);
  const infield = {x: 0, z: -49};
  race.update(1, infield);
  const exit = race.update(1, sampleCourse(course.gates[5].distance));
  assert.deepEqual(exit, recovery); assert.equal(race.nextGate, 3);
});

test('three autonomous opponents slow for bends, can pass, and remain separated through the race and after finishing', () => {
  const race = startRace();
  let minSeparation = Infinity;
  const laneOrders = new Set();
  let maxSpeed = 0;
  for (let i = 0; i < 90 * 25; i++) {
    race.update(1 / 25, race.startPose);
    const rivals = race.rivals;
    laneOrders.add(rivals.slice().sort((a, b) => b.distance - a.distance).map(c => c.id).join());
    for (let j = 0; j < rivals.length; j++) {
      const car = rivals[j];
      assert.ok(Math.abs(car.lateral) + 1.3 < course.width / 2);
      maxSpeed = Math.max(maxSpeed, car.speed);
      for (const other of rivals.slice(j + 1)) {
        minSeparation = Math.min(minSeparation, Math.hypot(car.x - other.x, car.z - other.z));
      }
    }
  }
  assert.ok(laneOrders.size >= 3 && maxSpeed > 20);
  assert.ok(minSeparation > 4.5);
  assert.equal(race.rank, 4); assert.equal(race.phase, 'racing');
  assert.ok(race.rivals.every(car => car.finishTime > 45 && car.finishTime < 80 && car.speed === 0));
});
