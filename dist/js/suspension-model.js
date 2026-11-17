import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const up = new THREE.Vector3(0, 1, 0);
const unitScale = new THREE.Vector3(1, 1, 1);
// The owning Three.js group crosses module URLs (browser cache versioning).
// Keep the animated links with that instance, outside serialized userData.
const suspensionRig = Symbol.for('roadster.suspensionRig');

// All dimensions are in metres. The simulated wheel has one vertical degree
// of freedom, so the cutaway uses a guided carriage and telescopic coilover.
// It does not imply a particular manufacturer's control-arm geometry.
function material(color, metalness, roughness) {
  return new THREE.MeshStandardMaterial({color, metalness, roughness});
}

function addMesh(parent, geometry, finish, name) {
  const mesh = new THREE.Mesh(geometry, finish);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.partId = 'suspension';
  parent.add(mesh);
  return mesh;
}

function bar(a, b, radius) {
  const direction = b.clone().sub(a);
  const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), 10);
  const rotation = new THREE.Quaternion().setFromUnitVectors(up, direction.normalize());
  const centre = a.clone().lerp(b, .5);
  return geometry.applyMatrix4(new THREE.Matrix4().compose(centre, rotation, unitScale));
}

function join(parts) {
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return geometry;
}

function springGeometry() {
  const points = [];
  for (let i = 0; i <= 96; i++) {
    const u = i / 96, phase = u * 6 * Math.PI * 2;
    points.push(new THREE.Vector3(.051 * Math.cos(phase), u * .32, .051 * Math.sin(phase)));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 96, .006, 6, false);
}

export function createSuspension(parent, hubs) {
  const steel = material(0x687986, .75, .35);
  const graphite = material(0x303b43, .52, .52);
  const chrome = material(0xb8c5c9, .92, .22);
  const springPaint = material(0xc75332, .54, .36);
  const rubber = material(0x292726, .06, .9);
  const spring = springGeometry(), disc = new THREE.CylinderGeometry(.063, .063, .014, 16);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const frame = [], pivotMounts = [], corners = [];
  const point = (x, y, z) => new THREE.Vector3(x, y, z);
  for (const hub of hubs) {
    const {x, y, z} = hub, side = Math.sign(z);
    const inset = .14 * side;
    const upper = point(x, y + .345, z - .25 * side);
    const rail = point(x, y + .006, z * .53);
    frame.push(bar(rail, upper, .033));
    for (const dx of [-.15, .15]) {
      frame.push(bar(point(x + dx, y + .005, rail.z), upper, .019));
    }
    pivotMounts.push(new THREE.CylinderGeometry(.073, .073, .025, 16)
      .translate(upper.x, upper.y + .009, upper.z));

    const carrier = new THREE.Group();
    carrier.name = 'steering knuckle';
    parent.add(carrier);
    const knuckle = join([
      bar(point(0, -.06, -inset), point(0, .08, -inset), .033),
      bar(point(0, 0, 0), point(0, 0, -inset), .05),
      bar(point(0, -.055, -inset), point(0, -.055, -inset - .023 * side), .035)
    ]);
    addMesh(carrier, knuckle, steel, 'hub carrier and lower eye');

    const axis = new THREE.Group();
    axis.name = 'telescopic spring and damper';
    parent.add(axis);
    const barrel = addMesh(axis, cylinder, graphite, 'damper barrel');
    barrel.position.y = .084;
    barrel.scale.set(.032, .168, .032);
    const piston = addMesh(axis, cylinder, chrome, 'exposed piston rod');
    const lowerSeat = addMesh(axis, disc, steel, 'lower spring seat');
    lowerSeat.position.y = .045;
    const upperSeat = addMesh(axis, disc, steel, 'upper spring seat');
    const coil = addMesh(axis, spring, springPaint, 'compression spring');
    const stop = addMesh(axis, cylinder, rubber, 'elastomer bump stop');
    stop.scale.set(.023, .044, .023);
    coil.position.y = lowerSeat.position.y;
    corners.push({upper, carrier, axis, piston, coil, upperSeat, stop, inset,
      lastPosition: new THREE.Vector3(Infinity, Infinity, Infinity), lastSteer: NaN});
  }
  // Connect the towers by axle crossmembers and the two longitudinal rails.
  const rails = hubs.map(h => point(h.x, h.y + .006, h.z * .53));
  for (const [i, j] of [[0, 1], [2, 3], [0, 2], [1, 3]]) frame.push(bar(rails[i], rails[j], .038));
  for (const [i, j] of [[0, 3], [1, 2]]) {
    frame.push(bar(rails[i].clone().lerp(rails[i ^ 2], .22),
      rails[j].clone().lerp(rails[j ^ 2], .22), .018));
  }
  addMesh(parent, join(frame), graphite, 'axle crossmembers, longitudinal rails and tower braces');
  addMesh(parent, join(pivotMounts), steel, 'upper strut mounts');
  Object.defineProperty(parent, suspensionRig, {value: corners});
  for (let i = 0; i < corners.length; i++) poseCorner(corners[i], hubs[i], 0);
}

const direction = new THREE.Vector3();
function poseCorner(corner, hub, steer) {
  if (corner.lastSteer === steer && corner.lastPosition.equals(hub)) return;
  corner.lastSteer = steer;
  corner.lastPosition.copy(hub);
  const {axis, upper} = corner;
  corner.carrier.position.copy(hub);
  corner.carrier.rotation.y = steer;
  // The lower eye belongs to the non-spinning knuckle and follows steering.
  axis.position.set(0, -.055, -corner.inset).applyQuaternion(corner.carrier.quaternion).add(hub);
  direction.copy(upper).sub(axis.position);
  const length = direction.length();
  if (length < 1e-6) return;
  axis.quaternion.setFromUnitVectors(up, direction.divideScalar(length));
  const exposed = Math.max(0, length - .168);
  corner.piston.position.y = .168 + exposed / 2;
  corner.piston.scale.set(.014, exposed, .014);
  corner.upperSeat.position.y = length - .011;
  corner.stop.position.y = length - .038;
  corner.coil.scale.y = Math.max(.001, corner.upperSeat.position.y - corner.coil.position.y) / .32;
}

export function updateSuspension(vehicle, inspecting = false) {
  const parent = vehicle.parts?.get('suspension');
  if (!parent?.visible) return;
  const corners = parent[suspensionRig];
  if (!corners) return;
  for (let i = 0; i < corners.length; i++) {
    const wheel = vehicle.wheels[i];
    poseCorner(corners[i], inspecting ? wheel.userData.basePosition : wheel.position,
      inspecting ? 0 : wheel.rotation.y);
  }
}
