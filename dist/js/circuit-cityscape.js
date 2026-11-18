import * as THREE from 'three';
import { RACE_COURSE, projectToCourse, runoffWidth, sampleCourse } from './station-race-course.js?v=20261119-ai158';

// Each district gets its own glazed and metal mesh. Kilometres of windows
// share one repeating atlas, so another floor costs no additional draw call.
const palette = {
  steel: 0xa4b7bd, shadow: 0x405461, bronze: 0xc99263,
  porcelain: 0xe2ded0, paving: 0x879599, rooftop: 0x6e848b,
  glazed: [0xe9f3f5, 0xbedde4, 0xd3e2df, 0xadcada, 0xf6dbbf],
};
const linearColors = new Map();
function tint(hex) {
  if (!linearColors.has(hex)) linearColors.set(hex, new THREE.Color(hex));
  return linearColors.get(hex);
}

function hash(x, y) {
  let bits = Math.imul(x + 17, 1597334677) ^ Math.imul(y + 39, 3812015801);
  bits = Math.imul(bits ^ bits >>> 16, 2246822519);
  return (bits >>> 0) / 4294967296;
}

function* facadeMaterials() {
  // Four curtain-wall systems share the same atlas. A surface uses one
  // 32-bay strip for its entire width; sixteen different floors repeat
  // vertically. Neighbouring office bays share a room's lighting circuit.
  const width = 1024, height = 128;
  const glass = new Uint8Array(width * height * 4), interior = new Uint8Array(glass.length);
  const occupancy = [.31, .39, .25, .18], warmShare = [.08, .63, .41, .11];
  const paneBase = [[51, 84, 103], [58, 75, 81], [53, 82, 89], [64, 80, 101]];
  for (let floor = 0; floor < 16; floor++) {
    for (let col = 0; col < 128; col++) {
      const variant = col >> 5, bay = col % 32, room = Math.floor(bay / (variant % 2 ? 2 : 4));
      const seed = hash(col, floor + 37);
      const floorOccupied = hash(variant + 11, floor) > .24 && (floor + variant) % 8 !== 0;
      const lit = floorOccupied && hash(room + variant * 19, floor) < occupancy[variant];
      const warm = hash(room + 19, floor + variant * 7) < warmShare[variant];
      const reflection = 11 * Math.cos((bay / 16 + floor / 32) * Math.PI * 2) + 10 * seed;
      const [br, bg, bb] = paneBase[variant];
      for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
        let r, g, b, glow = 0;
        if (v === 0 || u === 0) {
          const mullion = bay % 4 === 0 && u === 0 ? 20 : 0;
          r = 45 + mullion; g = 60 + mullion; b = 68 + mullion;
        } else if (v === 1 || ((floor + variant) % 4 === 0 && v < 4)) {
          r = 65; g = 82; b = 91;
        } else if (lit) {
          const light = 6 * v + seed * 9;
          r = (warm ? 153 : 102) + light; g = (warm ? 122 : 134) + light; b = (warm ? 92 : 147) + light;
          glow = .25;
          if (v === 2 || (v < 5 && u > 4 && seed < .39)) { r *= .68; g *= .70; b *= .71; glow = .08; }
        } else {
          const gleam = reflection + v * 1.6 + (u === 1 && bay % 4 === 0 ? 15 : 0);
          r = br + gleam; g = bg + gleam; b = bb + gleam;
        }
        const i = ((floor * 8 + v) * width + col * 8 + u) * 4;
        glass[i] = r; glass[i + 1] = g; glass[i + 2] = b; glass[i + 3] = 255;
        interior[i] = r * glow; interior[i + 1] = g * glow; interior[i + 2] = b * glow; interior[i + 3] = 255;
      }
    }
    if (floor % 2 === 1) yield;
  }
  function texture(bytes, name, srgb) {
    const tex = new THREE.DataTexture(bytes, width, height, THREE.RGBAFormat);
    tex.name = name; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true; tex.anisotropy = 4;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }
  const glazing = new THREE.MeshStandardMaterial({
    map: texture(glass, 'Glazing, mullions and floor interiors', true),
    emissiveMap: texture(interior, 'Occupied panes', true), emissive: 0xffffff,
    emissiveIntensity: 1.25, roughness: .48, metalness: .17, vertexColors: true,
  });
  const cladding = new THREE.MeshStandardMaterial({ roughness: .52, metalness: .20, vertexColors: true });
  return { glazing, cladding };
}

class Surfaces {
  position = []; normal = []; uv = []; color = []; index = [];

  face(points, color, uv) {
    const a = points[0], b = points[1], c = points[2], base = this.position.length / 3;
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    const length = Math.hypot(nx, ny, nz);
    if (length < .00001) return;
    const rgb = tint(color);
    for (let i = 0; i < points.length; i++) {
      this.position.push(...points[i]); this.normal.push(nx / length, ny / length, nz / length);
      this.uv.push(uv?.[i * 2] ?? 0, uv?.[i * 2 + 1] ?? 0);
      this.color.push(rgb.r, rgb.g, rgb.b);
    }
    for (let i = 1; i < points.length - 1; i++) this.index.push(base, base + i, base + i + 1);
  }

  addMesh(root, material, name) {
    if (!this.index.length) return;
    const g = new THREE.BufferGeometry();
    for (const [attribute, data, size] of [['position', this.position, 3], ['normal', this.normal, 3], ['uv', this.uv, 2], ['color', this.color, 3]]) {
      g.setAttribute(attribute, new THREE.Float32BufferAttribute(data, size));
    }
    g.setIndex(this.index); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material); mesh.name = name; root.add(mesh);
  }
}

// Plan coordinates are local to each building: length follows the street and
// depth points across it. Their chamfers and curves form actual silhouettes.
function plan(x, z, w, d, style = 'chamfer') {
  const a = w / 2, b = d / 2;
  if (style === 'lenticular') {
    return Array.from({ length: 14 }, (_, i) => {
      const t = i * 2 * Math.PI / 14;
      return [x + a * Math.cos(t), z + b * Math.sin(t)];
    });
  }
  const bevel = style === 'square' ? 0 : Math.min(a, b) * (style === 'facet' ? .53 : .21);
  const corners = bevel ? [[-a + bevel, -b], [a - bevel, -b], [a, -b + bevel], [a, b - bevel],
    [a - bevel, b], [-a + bevel, b], [-a, b - bevel], [-a, -b + bevel]]
    : [[-a, -b], [a, -b], [a, b], [-a, b]];
  return corners.map(([u, v]) => [x + u, z + v]);
}

function transform(block, p) {
  return [block.x + block.cos * p[0] + block.sin * p[1], block.z - block.sin * p[0] + block.cos * p[1]];
}

function prism(obstacles, id, footprint, lo, hi) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of footprint) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  obstacles.push({ id, kind: 'prism', footprint, center: [(x0 + x1) / 2, (lo + hi) / 2, (z0 + z1) / 2], size: [x1 - x0, hi - lo, z1 - z0] });
}

function buildBlock(block, glass, metal, obstacles) {
  const { w, d, h, far, style, serial } = block;
  const glazed = palette.glazed[serial % palette.glazed.length];
  const trim = [palette.bronze, palette.porcelain, palette.steel][serial % 3];
  let part = 0;
  function shell(target, p, lo, hi, color, solid = false, bay = 22, floor = 25.6) {
    const ring = p.map(point => transform(block, point));
    const system = target === glass && bay > 30 ? 1 : (style * 3 + Math.floor(serial / 3)) % 4;
    const vOffset = Math.floor(hash(serial, 21) * 16) / 16;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const bays = Math.min(31.7, Math.hypot(b[0] - a[0], b[1] - a[1]) * 12 / bay);
      const u0 = (system * 32 + .1 + Math.floor(hash(serial, i) * (31.8 - bays))) / 128;
      const u1 = u0 + bays / 128, v0 = lo / (floor * 2) + vOffset, v1 = hi / (floor * 2) + vOffset;
      target.face([[a[0], lo, a[1]], [a[0], hi, a[1]], [b[0], hi, b[1]], [b[0], lo, b[1]]], color,
        [u0, v0, u0, v1, u1, v1, u1, v0]);
    }
    metal.face(ring.slice().reverse().map(([x, z]) => [x, hi, z]), target === glass ? palette.rooftop : color);
    if (lo > 0) metal.face(ring.map(([x, z]) => [x, lo, z]), target === glass ? palette.shadow : color);
    if (solid) prism(obstacles, 'circuit-city-' + serial + '-' + part++, ring, lo, hi);
  }
  const band = (x, z, width, depth, y, height, color, shape) =>
    shell(metal, plan(x, z, width, depth, shape), y, y + height, color);
  const level = (x, z, width, depth, lo, hi, shape) =>
    shell(glass, plan(x, z, width, depth, shape), lo, hi, glazed, true);
  // The podium is a public concourse with full-height shopfronts. Its taller
  // ground-floor glazing, deep canopy and regularly spaced piers read at speed.
  const podium = far ? 5.4 : 7.8;
  shell(glass, plan(0, 0, w, d), 0, podium, 0xf1dfc7, true, 39, 42);
  band(0, 0, w + 2.1, d + 1.8, podium - .85, .85, trim);
  if (!far) {
    band(0, 0, w + .8, d + .65, .05, .65, palette.paving);
    const street = -block.side * (d / 2 + .15);
    for (let x = -w * .36; x < w * .43; x += 6.8) {
      band(x, street, .68, .64, .7, podium - 1.55, palette.porcelain, 'square');
    }
    band(0, street, w * .79, 1.9, 4.2, .43, palette.shadow, 'square');
  }
  if (style === 0) {
    // Offset office stacks, exposed mechanical storeys, and deep roof parapets.
    let lo = podium;
    for (let i = 0; i < 3; i++) {
      const hi = podium + (h - podium) * [.42, .76, 1][i], x = i * w * .037;
      const width = w * (.85 - i * .16), depth = d * (.82 - i * .112);
      level(x, 0, width, depth, lo, hi, 'chamfer');
      band(x, 0, width + .5, depth + .5, hi - 1.15, 1.15, i === 2 ? trim : palette.shadow);
      lo = hi;
    }
  } else if (style === 1) {
    // A pair of thin inhabited blades and a suspended two-storey winter garden.
    const width = w * .33, depth = d * .73;
    for (const sign of [-1, 1]) {
      const x = sign * w * .232, roof = h * (sign < 0 ? .84 : 1);
      level(x, 0, width, depth, podium, roof, 'facet');
      band(x, 0, width + .65, depth + .65, roof - 1.4, 1.4, trim, 'facet');
      if (!far) band(x + sign * width * .33, 0, .82, depth * .66, podium, roof - podium + 2.2, trim, 'square');
    }
    shell(glass, plan(0, 0, w * .20, depth * .65, 'square'), h * .61, h * .61 + 5.2, 0xf1e4ca, true);
    band(0, 0, w * .21, depth * .68, h * .61 - .7, .7, palette.steel, 'square');
  } else if (style === 2) {
    // A terraced oval hotel. The exposed horizontal shading shelves cast a
    // different silhouette from the vertical fins on the neighbouring towers.
    const roof = h * .84;
    level(0, 0, w * .90, d * .83, podium, roof, 'lenticular');
    for (let y = podium + 3.8; y <= roof - 1; y += far ? 12 : 6.6) {
      band(0, 0, w * .94, d * .91, y, .55, trim, 'lenticular');
    }
    level(-w * .06, 0, w * .64, d * .64, roof, h, 'lenticular');
    band(-w * .06, 0, w * .70, d * .70, h - .85, .85, trim, 'lenticular');
  } else if (style === 3) {
    // Exchange tower: deep sun blades continue past the glazed lantern.
    level(0, 0, w * .76, d * .74, podium, h * .86, 'facet');
    level(0, 0, w * .58, d * .58, h * .86, h, 'facet');
    for (const side of [-1, 1]) {
      const z = side * d * .37;
      const count = far ? 2 : 5;
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1) - .5, top = h * (1.035 - .20 * Math.abs(t));
        band(t * w * .53, z, far ? .86 : .63, 1.22, podium, top - podium, trim, 'square');
      }
    }
    band(0, 0, w * .6, d * .6, h - .7, .7, palette.steel, 'facet');
  } else {
    // An original waterfront landmark: tapered, elliptical office terraces
    // enclosed by two interlaced families of climbing steel ribs. A real void
    // between its upper lantern and the ribs silhouettes against the sky.
    const shellAt = t => {
      const swell = .85 - .47 * t + .065 * Math.sin(t * Math.PI * 2);
      return { x: w * (.08 * t + .045 * Math.sin(t * Math.PI)), w: w * swell, d: d * swell, y: podium + (h - podium) * t };
    };
    for (let tier = 0; tier < 5; tier++) {
      const base = shellAt(tier / 5), next = shellAt((tier + 1) / 5);
      level(base.x, 0, base.w * .84, base.d * .84, base.y, next.y, 'lenticular');
      band(base.x, 0, base.w * .9, base.d * .91, next.y - 1.15, 1.15, palette.steel, 'lenticular');
    }
    function shoe(t, k, handed) {
      const b = shellAt(t), phi = k * Math.PI / 2 + handed * (t * 1.18 + .11);
      return { x: b.x + Math.cos(phi) * b.w * .55, z: Math.sin(phi) * b.d * .58, y: b.y };
    }
    for (const handed of [-1, 1]) for (let k = 0; k < 4; k++) {
      for (let i = 0; i < 8; i++) {
        const a = shoe(i / 8, k, handed), b = shoe((i + 1) / 8, k, handed);
        const lower = plan(a.x, a.z, 1.24, 1.08, 'square').map(p => transform(block, p));
        const upper = plan(b.x, b.z, 1.14, 1, 'square').map(p => transform(block, p));
        for (let j = 0; j < 4; j++) {
          const n = (j + 1) % 4;
          const pa = lower[j], pb = upper[j], pc = upper[n], pd = lower[n];
          metal.face([[pa[0], a.y, pa[1]], [pb[0], b.y, pb[1]], [pc[0], b.y, pc[1]], [pd[0], a.y, pd[1]]],
            handed === 1 ? palette.bronze : palette.porcelain);
        }
        // An individual rib segment occupies little lateral space in each
        // storey. Its envelope is oriented along the rib, leaving the air
        // between the rib and the office shell navigable.
        const midA = transform(block, [a.x, a.z]), midB = transform(block, [b.x, b.z]);
        const dx = midB[0] - midA[0], dz = midB[1] - midA[1], dist = Math.hypot(dx, dz);
        const nx = -.79 * dz / dist, nz = .79 * dx / dist;
        prism(obstacles, 'circuit-city-' + serial + '-' + part++,
          [[midA[0] - nx, midA[1] - nz], [midB[0] - nx, midB[1] - nz],
            [midB[0] + nx, midB[1] + nz], [midA[0] + nx, midA[1] + nz]], a.y, b.y);
      }
    }
    const top = shellAt(1);
    band(top.x, 0, top.w * 1.16, top.d * 1.23, h - 1.7, 1.7, palette.bronze, 'lenticular');
  }
}

const districtNames = ['Quayside', 'Terminus', 'Gallery', 'Market', 'Observatory', 'Aerodrome',
  'Foundry', 'Exchange', 'Terraces', 'Gardens', 'West End', 'Grandstand'];

function cityPlan() {
  const blocks = [];
  const inWater = (x, z, radius) => x + radius >= 165 && x - radius <= 505 && z + radius >= -58 && z - radius <= 82;
  function place(s, side, offset, w, d, h, style, far) {
    const serial = blocks.length;
    const minOffset = offset, radius = Math.hypot(w, d) / 2 + 1.6;
    for (offset = minOffset; offset <= minOffset + 120; offset += 11) {
      const p = sampleCourse(s, side * offset), nearest = projectToCourse(p);
      const wall = RACE_COURSE.width / 2 + runoffWidth(nearest.distance, Math.sign(nearest.lateral));
      if (nearest.error < radius + wall + 9 || inWater(p.x, p.z, radius)) continue;
      if (blocks.some(b => Math.hypot(b.x - p.x, b.z - p.z) < radius + b.radius + 4)) continue;
      const yaw = p.heading + (far ? .16 * (hash(serial, 10) - .5) : 0);
      blocks.push({ x: p.x, z: p.z, cos: Math.cos(yaw), sin: Math.sin(yaw), district: Math.min(11, Math.floor(s * 12 / RACE_COURSE.length)),
        s, side, w, d, h, style, far, serial, radius });
      return;
    }
  }
  // Explicit quayside composition. The dual tower is the sightline at the end
  // of the grid; broad terraces flank the basin without growing out of it.
  for (const item of [
    [70, 1, 51, 39, 25, 46, 2], [104, -1, 53, 44, 29, 69, 0],
    [164, 1, 109, 36, 43, 81, 3], [245, -1, 92, 52, 30, 54, 2],
    [303, 1, 116, 36, 31, 96, 0], [372, -1, 96, 55, 24, 77, 1],
    [425, 1, 115, 49, 31, 55, 2], [520, -1, 96, 35, 26, 91, 3],
    [566, 1, 50, 55, 31, 103, 4], [622, -1, 66, 44, 28, 64, 2],
  ]) place(...item, false);
  for (let i = 0, s = 680; s < RACE_COURSE.length; i++, s += 83) {
    const side = i % 2 ? 1 : -1, district = Math.floor(s * 12 / RACE_COURSE.length);
    const type = (district + [0, 1, 3, 1, 2][i % 5]) % 4;
    const height = (district === 4 || district === 8 ? 27 : 37) + hash(i, 4) * 44;
    place(s, side, 43 + 18 * hash(i, 7), 29 + 22 * hash(i, 8), 22 + 13 * hash(i, 9), height, type, false);
    if (i % 3 !== 1) place(s + 17, -side, 65, 32 + 12 * hash(i, 2), 23, height * .85, (type + 2) % 4, false);
  }
  for (let i = 0, s = 20; s < RACE_COURSE.length; i++, s += 73) {
    const side = i % 2 ? -1 : 1;
    place(s, side, 115 + hash(i, 3) * 71, 32 + hash(i, 9) * 18, 26 + hash(i, 7) * 14,
      64 + hash(i, 5) * 68, (i + Math.floor(i / 5)) % 4, true);
  }
  return blocks;
}

export function* circuitCityscapeStages(root, obstacles) {
  const group = new THREE.Group();
  group.name = 'Circuit metropolitan districts';
  root.add(group);
  const { glazing, cladding } = yield* facadeMaterials();
  const blocks = cityPlan();
  group.userData.buildingCount = blocks.length;
  yield;
  for (let district = 0; district < districtNames.length; district++) {
    const glass = new Surfaces(), metal = new Surfaces();
    let count = 0;
    for (const block of blocks) {
      if (block.district !== district) continue;
      buildBlock(block, glass, metal, obstacles);
      if (++count % 3 === 0) yield;
    }
    glass.addMesh(group, glazing, districtNames[district] + ' glazed facades');
    metal.addMesh(group, cladding, districtNames[district] + ' roofs and cladding');
    yield;
  }
  return group;
}
