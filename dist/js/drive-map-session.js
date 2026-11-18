// Seoul driving coordinates are metres east (+x) and south (+z).
const sampleSpacing = 3;
const maximumSampleGap = 200;
const maximumPoints = 4096;
const compactTo = 3072;

function squaredDistance(x, z, point) {
  return (x - point[0]) ** 2 + (z - point[1]) ** 2;
}

function chordErrorSquared(a, b, c) {
  const dx = c[0] - a[0], dz = c[1] - a[1];
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared ? Math.max(0, Math.min(1,
    ((b[0] - a[0]) * dx + (b[1] - a[1]) * dz) / lengthSquared)) : 0;
  return squaredDistance(a[0] + dx * t, a[1] + dz * t, b);
}

export class DriveMapSession {
  constructor() {
    this.segments = [];
    this.revision = 0;
    this.pointCount = 0;
    this.current = null;
    this.place = null;
  }

  breakPath() {
    this.current = null;
  }

  sample(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const line = this.current;
    const tail = line?.at(-1);
    const moved = tail ? squaredDistance(x, z, tail) : Infinity;
    if (moved < .25 ** 2) return;
    if (moved > maximumSampleGap ** 2) {
      this.current = [[x, z]];
      this.segments.push(this.current);
      this.pointCount++;
    } else if (line.length === 1 || squaredDistance(tail[0], tail[1], line.at(-2)) >= sampleSpacing ** 2) {
      line.push([x, z]);
      this.pointCount++;
    } else {
      // Keep an accurate live endpoint while crawling, without storing every
      // sub-metre movement or the small contact jitter of a parked car.
      tail[0] = x;
      tail[1] = z;
    }
    if (this.pointCount > maximumPoints) this.compact();
    this.revision++;
  }

  compact() {
    // One linear pass. Only skip a point if the replacement chord stays within
    // one metre of it. Keep disconnected tracks, corners and both endpoints.
    for (const line of this.segments) {
      let write = 1;
      for (let read = 1; read < line.length; read++) {
        if (this.pointCount > compactTo && read + 1 < line.length &&
            chordErrorSquared(line[write - 1], line[read], line[read + 1]) <= 1) {
          this.pointCount--;
          read++;
        }
        line[write++] = line[read];
      }
      line.length = write;
      if (this.pointCount <= compactTo) return;
    }
    // On a very long, tightly winding route, age off its oldest prefix.
    // Truncating at the beginning never draws a shortcut across a bend.
    let segmentsToDrop = 0;
    for (const line of this.segments) {
      const excess = this.pointCount - compactTo;
      if (!excess) break;
      if (line.length <= excess) {
        this.pointCount -= line.length;
        segmentsToDrop++;
      } else {
        line.splice(0, excess);
        this.pointCount -= excess;
        break;
      }
    }
    if (segmentsToDrop) this.segments.splice(0, segmentsToDrop);
  }

  remember(sim, distance) {
    const {pos, q} = sim.state;
    const verticalOffset = pos.y - sim.restHeight;
    if (![pos.x, pos.z, verticalOffset, q.x, q.y, q.z, q.w, distance].every(Number.isFinite)) return;
    this.place = {x: pos.x, z: pos.z, verticalOffset, q: q.clone(), distance};
    this.sample(pos.x, pos.z);
  }

  // Called after the normal physics reset on returning to Seoul or changing
  // chassis. A car with different wheels keeps the same offset above rest.
  restore(sim) {
    if (!this.place) return null;
    const {x, z, verticalOffset, q, distance} = this.place;
    sim.state.pos.set(x, sim.restHeight + verticalOffset, z);
    sim.state.q.copy(q);
    return distance;
  }
}
