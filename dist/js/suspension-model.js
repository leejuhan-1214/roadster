import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {suspensionLayout} from './suspension-layouts.js?v=20261118-model154';

const up = new THREE.Vector3(0, 1, 0);
const unitScale = new THREE.Vector3(1, 1, 1);
// The owning Three.js group crosses module URLs (browser cache versioning).
// Keep the animated links with that instance, outside serialized userData.
const suspensionRig = Symbol.for('roadster.suspensionRig');

// Dimensions are illustrated hardpoints in metres, fitted to each model's track.
// Motion comes from the simulated wheel or the independent inspector preview.
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

const point = (x, y, z) => new THREE.Vector3(x, y, z);
function sphereAt(at, radius) {
  return new THREE.SphereGeometry(radius, 10, 6).translate(at.x, at.y, at.z);
}

// Each casting is rigid. Both bushings lie on one hinge axis; the ball joint
// sweeps an arc about it. The rolling radius and steering of the displayed
// tire still come from the original vehicle; the fitted upright bridges them.
function createArm(parent, pivot, tip, axis, halfWidth, finish, rubber, name) {
  const arm = new THREE.Group();
  arm.name = name;
  arm.position.copy(pivot);
  parent.add(arm);
  const end = tip.clone().sub(pivot);
  const first = axis.clone().multiplyScalar(-halfWidth), last = first.clone().negate();
  const a = first.clone().lerp(end, .38), b = last.clone().lerp(end, .38);
  const casting=[bar(first,end,.021),bar(last,end,.024),bar(a,b,.015),sphereAt(end,.032)];
  if(name!=='upper wishbone') {
    const seatA=first.clone().lerp(end,.72), seatB=last.clone().lerp(end,.72);
    casting.push(bar(seatA,seatB,.025), sphereAt(seatA.lerp(seatB,.5),.032));
  }
  addMesh(arm, join(casting), finish, 'forged arm and ball joint');
  const sleeves = [];
  for (const pin of [first,last]) {
    sleeves.push(bar(pin.clone().addScaledVector(axis,-.038), pin.clone().addScaledVector(axis,.038), .032));
  }
  addMesh(arm, join(sleeves), rubber, 'pivot bushings');
  const radial = end.clone().addScaledVector(axis, -end.dot(axis));
  const slope = new THREE.Vector3().crossVectors(axis, radial).y;
  return {arm, axis, end, radius:slope, outer:tip.clone()};
}

function poseArm(link, travel) {
  // All hinge axes and their neutral outer points are horizontally coplanar.
  const angle = Math.asin(THREE.MathUtils.clamp(travel / link.radius, -.98, .98));
  link.arm.quaternion.setFromAxisAngle(link.axis, angle);
  link.outer.copy(link.end).applyQuaternion(link.arm.quaternion).add(link.arm.position);
}

function positionLink(mesh, a, b) {
  direction.subVectors(b, a);
  const length = direction.length();
  mesh.position.copy(a).lerp(b, .5);
  mesh.scale.y = length;
  if (length > 1e-8) mesh.quaternion.setFromUnitVectors(up, direction.divideScalar(length));
}

function makeLink(parent, cylinder, finish, radius, name) {
  const mesh = addMesh(parent, cylinder, finish, name);
  mesh.scale.set(radius,1,radius);
  return mesh;
}

function createRocker(parent, fulcrum, lower, side, extent, cylinder, steel, chrome) {
  const pivot = new THREE.Group();
  pivot.name='inboard bell crank';
  pivot.position.copy(fulcrum);
  parent.add(pivot);
  const input=point(0,0,.115*extent*side), output=point(0,.125*extent,0);
  const pin=point(0,0,0);
  addMesh(pivot,join([bar(pin,input,.020),bar(pin,output,.020),bar(input,output,.012),
    bar(point(-.032,0,0),point(.032,0,0),.023),sphereAt(input,.019),sphereAt(output,.019)]),steel,'rocker and pivot shaft');
  const foot=lower.arm.position.clone().lerp(lower.outer,.72);
  const rodLength=foot.distanceTo(fulcrum.clone().add(input));
  return {pivot, input, output, rodLength, side, rod:makeLink(parent,cylinder,chrome,.012,'suspension pushrod')};
}

function poseRocker(rocker, foot, shockEye) {
  // Intersection of the crank pin's circle and the fixed pushrod's circle
  // selects the same assembly branch as the neutral model.
  const centre=rocker.pivot.position;
  const out=(foot.z-centre.z)*rocker.side, dy=foot.y-centre.y;
  const separation=Math.hypot(out,dy), radius=Math.abs(rocker.input.z);
  const cos=(separation**2+radius**2-rocker.rodLength**2)/(2*radius*separation);
  const angle=Math.atan2(dy,out)+Math.acos(THREE.MathUtils.clamp(cos,-1,1));
  rocker.pivot.rotation.x=-rocker.side*angle;
  endpoint.copy(rocker.input).applyQuaternion(rocker.pivot.quaternion).add(centre);
  positionLink(rocker.rod,foot,endpoint);
  shockEye.copy(rocker.output).applyQuaternion(rocker.pivot.quaternion).add(centre);
}

function airBellowsGeometry() {
  const rings = [];
  for (let j=0; j<=28; j++) {
    const u = j/28, shoulder = Math.min(1, u*11, (1-u)*11);
    rings.push(new THREE.Vector2(.046 + shoulder*(.015 + .004*Math.cos(6*Math.PI*u)), u*.32));
  }
  return new THREE.LatheGeometry(rings, 20);
}

export function createSuspension(parent, hubs, profileId = 'roadster') {
  const steel = material(0x687986, .75, .35);
  const graphite = material(0x303b43, .52, .52);
  const chrome = material(0xb8c5c9, .92, .22);
  const springPaint = material(0xc75332, .54, .36);
  const rubber = material(0x292726, .06, .9);
  const layout = suspensionLayout(profileId);
  const spring = springGeometry(), disc = new THREE.CylinderGeometry(.063, .063, .014, 16);
  const bellows = layout.front === 'airGuide' ? airBellowsGeometry() : null;
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const bootProfile=Array.from({length:17},(_,i)=>new THREE.Vector2(i%2 ? .73 : 1,i/16-.5));
  const boot=new THREE.LatheGeometry(bootProfile,10);
  const frame = [], pivotMounts = [], corners = [];
  for (const [index,hub] of hubs.entries()) {
    const {x, y, z} = hub, side = Math.sign(z);
    const front = index < 2, family = front ? layout.front : layout.rear;
    const guided = family === 'guided' || family === 'airGuide';
    const extent = THREE.MathUtils.clamp(Math.abs(z)/.85, .73, 1.35);
    const inset = .14 * extent * side;
    const rail = point(x, y + .006, z * .53);
    const fulcrum=family==='pushrod' ? point(x,y+.13*extent,rail.z) : null;
    const upper = fulcrum ? point(x,fulcrum.y+.125*extent,.065*extent*side) : point(x, y + .345 * extent, z - .31 * extent * side);
    frame.push(bar(rail, upper, .033));
    for (const dx of [-.15, .15]) {
      frame.push(bar(point(x + dx, y + .005, rail.z), upper, .019));
    }
    const towerMount = new THREE.CylinderGeometry(.073,.073,.025,16);
    if(fulcrum) towerMount.rotateX(Math.PI/2);
    pivotMounts.push(towerMount.translate(upper.x,upper.y+(fulcrum ? 0 : .009),upper.z));

    const carrier = new THREE.Group();
    carrier.name = 'steering knuckle';
    parent.add(carrier);
    const hubSeat=point(0,0,-inset), steeringEar=point(-.12,.025,-inset);
    const knuckle = [
      bar(point(0, 0, 0), hubSeat, .05),
      bar(point(0,-.070,-inset), point(0,.09,-inset), .026),
      new THREE.TorusGeometry(.048,.014,6,20).translate(0,0,-inset)
    ];
    if (!guided) knuckle.push(bar(point(0,.066,-inset),point(-.102,.084,-inset),.018),
      bar(point(0,-.048,-inset),point(-.102,-.060,-inset),.018));
    if (front) knuckle.push(bar(hubSeat,steeringEar,.018));
    addMesh(carrier, join(knuckle), steel, guided ? 'hub bearing housing' : 'bearing housing and brake carrier ears');

    const uprightLinks = [], links = [];
    function attachArm(high, trailing) {
      const rise = (high ? .090 : -.072) * extent, lateral = (high ? .20 : .135) * extent;
      const tip = point(x, y+rise, z-lateral*side);
      const pivot = point(x+(trailing ? .34*extent : 0), tip.y, rail.z+(high ? .069*side : 0));
      const hinge = trailing ? point(.42,0,.9075*side).normalize() : point(1,0,0);
      const arm = createArm(parent,pivot,tip,hinge,(high ? .115 : .17)*extent,high ? steel : graphite,rubber,
        trailing ? 'semi-trailing arm' : high ? 'upper wishbone' : 'lower control arm');
      const bridge = makeLink(parent,cylinder,steel,high ? .019 : .023,'upright ball joint attachment');
      links.push(arm);
      uprightLinks.push({bridge, arm, mount:point(0, high ? .055 : -.048, -inset)});
      for (const d of [-1,1]) {
        const pin=pivot.clone().addScaledVector(hinge,d*(high ? .115 : .17)*extent);
        const foot=point(pin.x,y+.006,rail.z);
        frame.push(bar(foot,pin,.021));
      }
      return arm;
    }
    const lower = guided ? null : attachArm(false,family==='semiTrailing');
    if (family==='wishbone' || family==='trailingWishbone' || fulcrum) attachArm(true,false);
    const rocker=fulcrum && createRocker(parent,fulcrum,lower,side,extent,cylinder,steel,chrome);
    if(fulcrum) frame.push(bar(rail,fulcrum,.034));
    const steeringRod = front ? makeLink(parent,cylinder,chrome,.012,'rack tie rod') : null;
    const rackEnd = point(x-.105,y+.018,rail.z);
    const centreToRack = steeringEar.clone().add(hub).distanceTo(rackEnd);
    const rackHousing = rackEnd.clone();
    rackHousing.z*=.69;
    const rackBoot=front ? makeLink(parent,boot,rubber,.026,'rack bellows') : null;
    if(front) frame.push(bar(rackHousing, point(rackEnd.x,rackEnd.y,0),.029));
    const trailingRod = family==='trailingWishbone' ? makeLink(parent,cylinder,graphite,.022,'longitudinal trailing link') : null;
    const trailingPivot = trailingRod && point(x+.42*extent,y-.070,z-.24*extent*side);
    if(trailingPivot) frame.push(bar(trailingPivot,point(trailingPivot.x,y+.006,rail.z),.022));

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
    const springAxis = family==='semiTrailing' ? new THREE.Group() : axis;
    if (springAxis!==axis) {
      springAxis.name='separate rear spring';
      parent.add(springAxis);
    }
    const coil = addMesh(springAxis, bellows || spring, bellows ? rubber : springPaint, bellows ? 'rolling air spring sleeve' : 'compression spring');
    const stop = addMesh(axis, cylinder, rubber, 'elastomer bump stop');
    stop.scale.set(.023, .044, .023);
    coil.position.y = lowerSeat.position.y;
    const springTop = upper.clone();
    if(springAxis!==axis) {
      upper.x -= .12*extent;
      addMesh(springAxis,disc,steel,'spring perch on trailing arm').position.y=.045;
      frame.push(bar(springTop,upper,.025));
      pivotMounts.push(new THREE.CylinderGeometry(.065,.065,.018,16).translate(upper.x,upper.y,upper.z));
    }
    corners.push({family, base:point(x,y,z), upper, springTop, lower, links, uprightLinks, rocker, steeringRod, steeringEar, rackEnd, rackHousing, rackBoot, centreToRack, side,
      trailingRod,trailingPivot, carrier,axis,springAxis,piston,coil,upperSeat,stop,inset,
      lastPosition: point(Infinity,Infinity,Infinity), lastSteer: NaN});
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

const direction = new THREE.Vector3(), endpoint = new THREE.Vector3(), springFoot = new THREE.Vector3();
function poseCorner(corner, hub, steer) {
  if (corner.lastSteer === steer && corner.lastPosition.equals(hub)) return;
  corner.lastSteer = steer;
  corner.lastPosition.copy(hub);
  const {axis, upper} = corner;
  corner.carrier.position.copy(hub);
  corner.carrier.rotation.y = steer;
  for(const link of corner.links) poseArm(link,hub.y-corner.base.y);
  for(const {bridge,arm,mount} of corner.uprightLinks) {
    endpoint.copy(mount).applyQuaternion(corner.carrier.quaternion).add(hub);
    positionLink(bridge,endpoint,arm.outer);
  }
  if(corner.steeringRod) {
    endpoint.copy(corner.steeringEar).applyQuaternion(corner.carrier.quaternion).add(hub);
    // Fit the inner rod end to the rack's lateral axis. The steering angle is
    // imposed by the vehicle, and the tie rod stays rigid over normal travel.
    const dx=endpoint.x-corner.rackEnd.x, dy=endpoint.y-corner.rackEnd.y;
    corner.rackEnd.z=endpoint.z-corner.side*Math.sqrt(Math.max(0,corner.centreToRack**2-dx**2-dy**2));
    positionLink(corner.steeringRod,corner.rackEnd,endpoint);
    positionLink(corner.rackBoot,corner.rackHousing,corner.rackEnd);
  }
  if(corner.trailingRod) positionLink(corner.trailingRod,corner.trailingPivot,corner.lower.outer);
  if(corner.lower) springFoot.copy(corner.lower.arm.position).lerp(corner.lower.outer,.72);
  if(corner.rocker) poseRocker(corner.rocker,springFoot,axis.position);
  else if(corner.family==='wishbone' || corner.family==='trailingWishbone') axis.position.copy(springFoot);
  else axis.position.set(corner.family==='semiTrailing' ? -.085 : 0,-.055,-corner.inset).applyQuaternion(corner.carrier.quaternion).add(hub);
  direction.copy(upper).sub(axis.position);
  const length = direction.length();
  if (length < 1e-6) return;
  axis.quaternion.setFromUnitVectors(up, direction.divideScalar(length));
  const exposed = Math.max(0, length - .168);
  corner.piston.position.y = .168 + exposed / 2;
  corner.piston.scale.set(.014, exposed, .014);
  corner.upperSeat.position.y = length - .011;
  corner.stop.position.y = length - .038;
  let springLength=length;
  if(corner.springAxis!==axis) {
    corner.springAxis.position.copy(springFoot);
    direction.subVectors(corner.springTop,springFoot);
    springLength=direction.length();
    if(springLength>1e-8) corner.springAxis.quaternion.setFromUnitVectors(up,direction.divideScalar(springLength));
  }
  corner.coil.scale.y = Math.max(.001, springLength-.011-corner.coil.position.y) / .32;
}

const previewHub = new THREE.Vector3();
export function updateSuspension(vehicle, inspecting = false, preview = null) {
  const parent = vehicle.parts?.get('suspension');
  if (!parent?.visible) return;
  const corners = parent[suspensionRig];
  if (!corners) return;
  for (let i = 0; i < corners.length; i++) {
    const wheel = vehicle.wheels[i];
    if (inspecting && preview) {
      previewHub.copy(wheel.userData.basePosition);
      previewHub.y += (Array.isArray(preview.travel) ? preview.travel[i] : preview.travel) || 0;
      poseCorner(corners[i],previewHub,i<2 ? preview.steer || 0 : 0);
    } else {
      poseCorner(corners[i], inspecting ? wheel.userData.basePosition : wheel.position, inspecting ? 0 : wheel.rotation.y);
    }
  }
}
