const TURN_RADIUS = 32;
const QUARTER_TURN = Math.PI * TURN_RADIUS / 2;
const FULL_TURN = Math.PI * 2;
const WIDTH = 19;
const GATE_COUNT = 12;
const LAP_COUNT = 2;
const COUNTDOWN = 3;

// Centreline distance is measured from the start stripe. Three.js cars face local
// +X, so increasing yaw turns the nose towards -Z.
const segments = [];
let length = 0;
let endX = 0;
let endZ = 0;
let endHeading = 0;
function segmentPose(segment, along) {
  const {x, z, heading} = segment;
  if (!segment.turn) return {x: x + Math.cos(heading) * along, z: z - Math.sin(heading) * along, heading};
  const yaw = heading + along / TURN_RADIUS;
  return {
    x: x + TURN_RADIUS * (Math.sin(yaw) - Math.sin(heading)),
    z: z + TURN_RADIUS * (Math.cos(yaw) - Math.cos(heading)),
    heading: yaw
  };
}
for (const [metres, turn] of [[53, false], [QUARTER_TURN, true], [34, false], [QUARTER_TURN, true],
  [106, false], [QUARTER_TURN, true], [34, false], [QUARTER_TURN, true], [53, false]]) {
  const segment = {x: endX, z: endZ, heading: endHeading, start: length, length: metres, turn};
  segments.push(segment);
  const end = segmentPose(segment, metres);
  endX = end.x; endZ = end.z; endHeading = end.heading;
  length += metres;
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(n, hi));
function wrap(value, period) {
  return ((value % period) + period) % period;
}
function segmentFor(distance) {
  const along = wrap(distance, length);
  return segments.find(s => along < s.start + s.length) || segments[segments.length - 1];
}
export function sampleCourse(distance, lateral = 0) {
  const along = wrap(distance, length);
  const segment = segmentFor(along);
  const {x, z, heading} = segmentPose(segment, along - segment.start);
  return {x: x + Math.sin(heading) * lateral, z: z + Math.cos(heading) * lateral, heading, distance};
}
const gates = Array.from({length: GATE_COUNT}, (_, index) => ({
  index, ...sampleCourse(index * length / GATE_COUNT)
}));
export const RACE_COURSE = {length, width: WIDTH, laps: LAP_COUNT, gates};

function projectToCourse(point) {
  let bestSquared = Infinity;
  let distance = 0;
  for (const segment of segments) {
    const dx = point.x - segment.x;
    const dz = point.z - segment.z;
    let along;
    if (segment.turn) {
      const radiusX = dx + TURN_RADIUS * Math.sin(segment.heading);
      const radiusZ = dz + TURN_RADIUS * Math.cos(segment.heading);
      // Unwrap around the middle of this 90-degree arc, so endpoints are
      // correctly compared on either side of the 2π angle discontinuity.
      const middle = segment.heading + Math.PI / 4;
      const angle = middle + wrap(Math.atan2(radiusX, radiusZ) - middle + Math.PI, FULL_TURN) - Math.PI;
      along = (angle - segment.heading) * TURN_RADIUS;
    } else {
      along = dx * Math.cos(segment.heading) - dz * Math.sin(segment.heading);
    }
    along = clamp(along, 0, segment.length);
    const p = segmentPose(segment, along);
    const squared = (p.x - point.x) ** 2 + (p.z - point.z) ** 2;
    if (squared < bestSquared) {
      bestSquared = squared;
      distance = segment.start + along;
    }
  }
  return {distance, error: Math.sqrt(bestSquared)};
}

function crossingFraction(a, b, gate) {
  const cos = Math.cos(gate.heading), sin = Math.sin(gate.heading);
  const before = (a.x - gate.x) * cos - (a.z - gate.z) * sin;
  const after = (b.x - gate.x) * cos - (b.z - gate.z) * sin;
  if (before > 1e-7 || after < -1e-7 || after - before < 1e-7) return null;
  const fraction = clamp(-before / (after - before), 0, 1);
  const x = a.x + (b.x - a.x) * fraction;
  const z = a.z + (b.z - a.z) * fraction;
  return Math.abs((x - gate.x) * sin + (z - gate.z) * cos) <= WIDTH / 2 ? fraction : null;
}

const grid = [
  {id: 'apex', name: '에이펙스', color: 0xffb34e, distance: -4, lateral: 3.15, lane: 4.6, top: 24, corner: 13.5, acceleration: 4.1},
  {id: 'nova', name: '노바', color: 0x5acdf3, distance: -12, lateral: -3.15, lane: -4.6, top: 21.8, corner: 14.8, acceleration: 4.9},
  {id: 'comet', name: '코멧', color: 0xa99aff, distance: -14, lateral: 3.15, lane: 0, top: 23.5, corner: 13.2, acceleration: 4.6}
];
const finishDistance = length * LAP_COUNT;
function advanceRival(car, dt, startTime) {
  // Each rival brakes ahead of corners, accelerates out of them, and advances
  // in its own lane. Account for the longer path travelled in an outside lane.
  let time = 0;
  while (time < dt - 1e-9) {
    const parkingDistance = finishDistance + 42 + car.lane;
    if (car.distance >= parkingDistance) break;
    const step = Math.min(.05, dt - time);
    const segment = segmentFor(car.distance);
    const remaining = segment.start + segment.length - wrap(car.distance, length);
    let target = car.corner;
    if (!segment.turn) {
      const nextSegment = segments[(segments.indexOf(segment) + 1) % segments.length];
      const brakingDistance = remaining + (nextSegment.turn ? 0 : nextSegment.length);
      target = Math.min(car.top, Math.sqrt(car.corner ** 2 + 2 * 5.5 * brakingDistance));
    }
    target = Math.min(target, Math.sqrt(2 * 5.5 * (parkingDistance - car.distance)));
    const nextSpeed = car.speed + clamp(target - car.speed, -5.7 * step, car.acceleration * step);
    const delta = (car.speed + nextSpeed) / 2 * step / (segment.turn ? 1 + car.lateral / TURN_RADIUS : 1);
    if (car.finishTime == null && car.distance + delta >= finishDistance) {
      car.finishTime = startTime + time + step * (finishDistance - car.distance) / delta;
    }
    car.distance = Math.min(car.distance + delta, parkingDistance);
    car.speed = car.distance < parkingDistance ? nextSpeed : 0;
    // Fan out smoothly from two grid columns into three passing lanes.
    const entry = clamp(car.distance / 30, 0, 1);
    car.lateral = car.gridLateral + (car.lane - car.gridLateral) * entry ** 2 * (3 - 2 * entry);
    time += step;
  }
  const pose = sampleCourse(car.distance, car.lateral);
  const entry = clamp(car.distance / 30, 0, 1);
  const laneSlope = (car.lane - car.gridLateral) * 6 * entry * (1 - entry) / 30;
  car.x = pose.x; car.z = pose.z; car.heading = pose.heading - Math.atan(laneSlope);
}

export class StationRace {
  constructor() {
    this.phase = 'countdown';
    this.countdown = COUNTDOWN;
    this.elapsed = 0;
    this.finishTime = null;
    this.startPose = sampleCourse(-6, -3.15);
    this.rivals = grid.map(car => ({...car, ...sampleCourse(car.distance, car.lateral), gridLateral: car.lateral, speed: 0, finishTime: null}));
    this._ordinal = 0;
    this._progress = this.startPose.distance;
    this._previous = this.startPose;
    this._leftAt = null;
    this._offTrackTime = 0;
  }
  get nextGate() { return this._ordinal % GATE_COUNT; }
  get completedGates() { return this._ordinal; }
  get progress() { return this._progress; }
  get lap() { return clamp(Math.floor((this._ordinal - 1) / GATE_COUNT) + 1, 1, LAP_COUNT); }
  get rank() {
    if (this.finishTime != null) return 1 + this.rivals.filter(car => car.finishTime != null && car.finishTime < this.finishTime).length;
    return 1 + this.rivals.filter(car => car.distance > this._progress).length;
  }
  recover() {
    const distance = this._ordinal === 0 ? this.startPose.distance : (this._ordinal - 1) * length / GATE_COUNT + 1.5;
    const pose = sampleCourse(distance, -3.15);
    this._previous = pose;
    this._progress = distance;
    this._leftAt = null;
    this._offTrackTime = 0;
    return pose;
  }
  update(dt, player) {
    if (!Number.isFinite(dt) || dt <= 0 || this.phase === 'finished') return null;
    if (this.phase === 'countdown') {
      const wait = Math.min(dt, this.countdown);
      this.countdown -= wait;
      dt -= wait;
      if (this.countdown > 1e-8) return null;
      this.countdown = 0;
      this.phase = 'racing';
      if (dt <= 1e-9) return null;
    }
    const start = this.elapsed;
    this.elapsed += dt;
    for (const rival of this.rivals) advanceRival(rival, dt, start);
    if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.z)) return this.recover();
    const from = this._previous;
    const to = {x: player.x, z: player.z};
    const travel = Math.hypot(to.x - from.x, to.z - from.z);
    if (travel > Math.max(5, 125 * dt + .75)) return this.recover();
    const projection = projectToCourse(to);
    let onCourse = projection.error <= WIDTH / 2 + 1.5 && !(player.y > 5);
    // Check the swept path too. A single long frame across a hairpin cannot
    // bridge the infield without leaving the course.
    for (let along = 6; onCourse && along < travel; along += 6) {
      const t = along / travel;
      onCourse = projectToCourse({x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t}).error <= WIDTH / 2 + 1.5;
    }
    this._previous = to;
    if (!onCourse) {
      if (!this._leftAt) this._leftAt = from;
      this._offTrackTime += dt;
      return this._offTrackTime >= 1.25 ? this.recover() : null;
    }
    if (this._leftAt) {
      if (Math.hypot(to.x - this._leftAt.x, to.z - this._leftAt.z) > 13) return this.recover();
      this._leftAt = null;
      this._offTrackTime = 0;
      return null;
    }
    let previousFraction = -1;
    for (let i = 0; i < GATE_COUNT; i++) {
      const fraction = crossingFraction(from, to, gates[this.nextGate]);
      if (fraction == null || fraction <= previousFraction) break;
      previousFraction = fraction;
      this._ordinal++;
      if (this._ordinal > LAP_COUNT * GATE_COUNT) {
        this.phase = 'finished';
        this.finishTime = start + fraction * dt;
        this.elapsed = this.finishTime;
        this._progress = finishDistance;
        return null;
      }
    }
    const passed = (this._ordinal - 1) * length / GATE_COUNT;
    const offset = wrap(projection.distance - passed + length / 2, length) - length / 2;
    this._progress = passed + Math.min(offset, length / GATE_COUNT - .001);
    return null;
  }
}
