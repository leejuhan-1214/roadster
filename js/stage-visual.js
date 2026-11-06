import * as THREE from 'three';

// Stage geometry is a read-only view of the collision/mission description.
// Box solids use their exact supplied centres and dimensions. Gates and pads
// are visual targets only; this module never adds collision or flight forces.
const Z = new THREE.Vector3(0, 0, 1);
const COMPLETE_COLOR = new THREE.Color('#55df9a');
const CURRENT_COLOR = new THREE.Color('#ffca72');
const FUTURE_COLOR = new THREE.Color('#496f70');

function vector(value, fallback = [0, 0, 0]) {
  if (value?.isVector3) return value.clone();
  if (Array.isArray(value)) return new THREE.Vector3(...value);
  if (value && Number.isFinite(value.x)) return new THREE.Vector3(value.x, value.y, value.z);
  return new THREE.Vector3(...fallback);
}

function label(text, color = '#d9edea', width = 2.0, height = .27) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 96;
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, 768, 96); c.fillStyle = color;
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '600 42px sans-serif';
  c.fillText(text, 384, 48, 740);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }));
  m.castShadow = false; return m;
}

function addMesh(group, geometry, material, position = null) {
  const m = new THREE.Mesh(geometry, material);
  if (position) m.position.copy(position);
  m.castShadow = true; m.receiveShadow = true; group.add(m); return m;
}

function flatRing(group, radius, width, material, y = 0) {
  const r = addMesh(group, new THREE.RingGeometry(Math.max(0, radius - width), radius, 96), material);
  r.rotation.x = -Math.PI / 2; r.position.y = y; r.castShadow = false; return r;
}

function hazardTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
  const c = canvas.getContext('2d'); c.fillStyle = '#232d30'; c.fillRect(0, 0, 256, 64);
  c.fillStyle = '#e6ab45';
  for (let x = -64; x < 320; x += 64) {
    c.beginPath(); c.moveTo(x, 64); c.lineTo(x + 32, 64); c.lineTo(x + 96, 0); c.lineTo(x + 64, 0); c.closePath(); c.fill();
  }
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1); return t;
}

export function createStageVisual(stageData = {}) {
  const root = new THREE.Group(); root.name = 'stage-visual';
  root.userData.stageId = stageData.id || stageData.name || 'stage';
  root.userData.obstacles = new Map(); root.userData.gates = new Map(); root.userData.checkpoints = new Map();
  root.userData.checkpointOrder = (stageData.checkpoints || []).map((cp, i) => cp.id || `${cp.type}-${i}`);
  const edgeMaterial = new THREE.LineBasicMaterial({ color: '#94b5bd', transparent: true, opacity: .62 });
  const stripe = hazardTexture();
  const stripeMat = new THREE.MeshStandardMaterial({ color: stripe ? '#ffffff' : '#dea94e', map: stripe, metalness: .05, roughness: .67, side: THREE.DoubleSide });
  const cool = new THREE.MeshBasicMaterial({ color: '#69e5cf', transparent: true, opacity: .88, side: THREE.DoubleSide, depthWrite: false });
  const faint = new THREE.MeshBasicMaterial({ color: '#79a5a6', transparent: true, opacity: .22, side: THREE.DoubleSide, depthWrite: false });
  const gateMat = new THREE.MeshStandardMaterial({ color: '#70dfce', emissive: '#19a48c', emissiveIntensity: .65, metalness: .6, roughness: .28 });
  const gateInnerMat = new THREE.MeshBasicMaterial({ color: '#d6fff6', transparent: true, opacity: .75, toneMapped: false });

  (stageData.obstacles || []).forEach((obstacle, i) => {
    const centre = vector(obstacle.center || obstacle.position);
    const size = vector(obstacle.size, [1, 1, 1]);
    if (![size.x, size.y, size.z].every(v => Number.isFinite(v) && v > 0)) return;
    const group = new THREE.Group(); group.position.copy(centre);
    group.name = obstacle.id || `obstacle-${i}`; group.userData.obstacleId = group.name;
    group.userData.collisionCenter = centre.clone(); group.userData.collisionSize = size.clone();
    root.add(group); root.userData.obstacles.set(group.name, group);
    const mat = new THREE.MeshStandardMaterial({ color: obstacle.color || '#30464e', metalness: .28, roughness: .65 });
    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    addMesh(group, geometry, mat);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
    group.add(edges);

    // Hazard bands sit on the two X faces with a millimetric z-fighting offset.
    const bandHeight = Math.min(.18, size.y * .18);
    for (const side of [-1, 1]) {
      const band = addMesh(group, new THREE.PlaneGeometry(size.z * .96, bandHeight), stripeMat,
        new THREE.Vector3(side * (size.x / 2 + .004), size.y / 2 - bandHeight * .7, 0));
      band.rotation.y = side * Math.PI / 2; band.castShadow = false;
      const name = label(`${String(i + 1).padStart(2, '0')}  /  ${obstacle.label || 'BARRIER'}`, '#d5e5e3', Math.min(size.z * .76, 3), Math.min(size.y * .19, .33));
      if (name && size.y > .55 && size.z > .8) {
        name.position.set(side * (size.x / 2 + .008), Math.min(size.y * .12, .25), 0);
        name.rotation.y = side * Math.PI / 2; group.add(name);
      }
    }
    // Small cyan top rails keep obstacles readable at dusk, still on their surfaces.
    for (const side of [-1, 1]) {
      const rail = addMesh(group, new THREE.BoxGeometry(Math.max(.03, size.x - .08), .014, .025), cool,
        new THREE.Vector3(0, size.y / 2 + .005, side * (size.z / 2 - .035)));
      rail.castShadow = false;
    }
  });

  const checkpoints = stageData.checkpoints || [];
  const gates = stageData.gates || checkpoints.filter(cp => cp.type === 'air');
  gates.forEach((gate, i) => {
    const group = new THREE.Group(); group.name = gate.id || `gate-${i}`;
    group.position.copy(vector(gate.center || gate.position));
    const normal = vector(gate.normal, [1, 0, 0]);
    if (normal.lengthSq() < 1e-8) normal.set(1, 0, 0);
    group.quaternion.setFromUnitVectors(Z, normal.normalize());
    const radius = Math.max(.3, Number(gate.radius) || 2);
    group.userData.gateId = group.name; group.userData.radius = radius;
    root.add(group); root.userData.gates.set(group.name, group); root.userData.checkpoints.set(group.name, group);
    const frame = addMesh(group, new THREE.TorusGeometry(radius, .055, 8, 96), gateMat.clone());
    frame.castShadow = false; group.userData.frame = frame; group.userData.markerMaterials = [frame.material];
    const inner = addMesh(group, new THREE.TorusGeometry(radius - .095, .012, 5, 96), gateInnerMat.clone()); inner.castShadow = false;
    group.userData.markerMaterials.push(inner.material);
    for (let n = 0; n < 4; n++) {
      const a = n * Math.PI / 2;
      const tick = addMesh(group, new THREE.BoxGeometry(.16, .045, .075), gateInnerMat,
        new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
      tick.rotation.z = a; tick.castShadow = false;
    }
    const checkpointIndex = checkpoints.indexOf(gate);
    const name = label(`${String((checkpointIndex >= 0 ? checkpointIndex : i) + 1).padStart(2, '0')}  /  ${gate.label || 'FLIGHT GATE'}`, '#9de8d8', Math.min(radius * 1.7, 3.4), .30);
    if (name) { name.position.set(0, radius + .32, 0); group.add(name); }
  });

  checkpoints.filter(cp => cp.type === 'drive').forEach((checkpoint, i) => {
    const group = new THREE.Group(); group.name = checkpoint.id || `drive-${i}`;
    group.position.copy(vector(checkpoint.center)); group.position.y += .016;
    const radius = Math.max(.5, Number(checkpoint.radius) || 3);
    const markerMat = cool.clone(); group.userData.markerMaterials = [markerMat];
    root.add(group); root.userData.checkpoints.set(group.name, group);
    flatRing(group, radius, .065, markerMat);
    flatRing(group, radius * .94, .015, faint, .002);
    // Chevrons face +X, matching the route heading; they are painted on the road.
    for (const x of [-.48, .08, .64]) for (const sign of [-1, 1]) {
      const mark = addMesh(group, new THREE.PlaneGeometry(.55, .065), markerMat,
        new THREE.Vector3(x, .004, sign * .18));
      mark.rotation.set(-Math.PI / 2, 0, sign * Math.PI / 4); mark.castShadow = false;
    }
    const text = label(checkpoint.label || 'DRIVE CHECKPOINT', '#a8e8dc', radius * 1.35, .35);
    if (text) { text.rotation.x = -Math.PI / 2; text.position.set(0, .006, radius * .65); group.add(text); }
  });

  const landCheckpoints = checkpoints.filter(cp => cp.type === 'land');
  const landings = stageData.landings || (stageData.landing ? [stageData.landing] :
    landCheckpoints.length ? landCheckpoints : stageData.finishpad ? [stageData.finishpad] : []);
  landings.forEach((landing, i) => {
    const group = new THREE.Group(); group.name = landing.id || `landing-${i}`;
    group.position.copy(vector(landing.center || landing.position)); group.position.y += .016;
    root.add(group); root.userData.landing = group; root.userData.checkpoints.set(group.name, group);
    const markerMat = cool.clone(); group.userData.markerMaterials = [markerMat];
    const radius = Math.max(1, Number(landing.radius) || 3);
    flatRing(group, radius, .055, markerMat);
    flatRing(group, radius * .83, .02, faint, .002);
    flatRing(group, radius * .45, .018, faint, .003);
    for (let n = 0; n < 4; n++) {
      const a = n * Math.PI / 2;
      const tick = addMesh(group, new THREE.PlaneGeometry(radius * .25, .065), markerMat,
        new THREE.Vector3(Math.cos(a) * radius * .91, .004, Math.sin(a) * radius * .91));
      tick.rotation.x = -Math.PI / 2; tick.rotation.z = -a; tick.castShadow = false;
    }
    // The H is large enough to read as a destination without covering the grid.
    for (const x of [-radius * .2, radius * .2]) {
      const bar = addMesh(group, new THREE.PlaneGeometry(.065, radius * .62), markerMat, new THREE.Vector3(x, .005, 0));
      bar.rotation.x = -Math.PI / 2; bar.castShadow = false;
    }
    const cross = addMesh(group, new THREE.PlaneGeometry(radius * .4, .065), markerMat, new THREE.Vector3(0, .006, 0));
    cross.rotation.x = -Math.PI / 2; cross.castShadow = false;
    const text = label(landing.label || 'LANDING ZONE', '#9ce5d5', radius * 1.1, radius * .14);
    if (text) { text.rotation.x = -Math.PI / 2; text.position.set(0, .008, radius * .62); group.add(text); }
  });

  // Store resources that can exist even for a stage without matching objects.
  root.userData.stageResources = { materials: [edgeMaterial, stripeMat, cool, faint, gateMat, gateInnerMat], textures: stripe ? [stripe] : [] };
  if (!root.userData.checkpointOrder.length) root.userData.checkpointOrder = [...root.userData.checkpoints.keys()];
  updateStageVisual(root, 0, 0);
  return root;
}

export function updateStageVisual(group, progress = 0, time = 0) {
  if (!group?.userData.checkpoints) return;
  const completed = Math.max(0, Math.floor(Number(progress) || 0));
  const order = group.userData.checkpointOrder;
  const pulse = .84 + .16 * Math.sin(Number(time) * 3.8);
  for (let i = 0; i < order.length; i++) {
    const checkpoint = group.userData.checkpoints.get(order[i]);
    if (!checkpoint) continue;
    const done = i < completed, current = i === completed;
    const color = done ? COMPLETE_COLOR : current ? CURRENT_COLOR : FUTURE_COLOR;
    for (const material of checkpoint.userData.markerMaterials || []) {
      material.color.copy(color);
      if (material.emissive) {
        material.emissive.copy(color);
        material.emissiveIntensity = done ? .4 : current ? pulse * .85 : .1;
      }
      if (material.transparent) material.opacity = done ? .85 : current ? pulse : .45;
    }
    checkpoint.userData.completed = done; checkpoint.userData.current = current;
  }
}

export function disposeStageVisual(group) {
  if (!group) return;
  const geometries = new Set(), materials = new Set(), textures = new Set();
  group.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
      if (!material) continue; materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  const resources = group.userData.stageResources;
  for (const m of resources?.materials || []) materials.add(m);
  for (const t of resources?.textures || []) textures.add(t);
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
  for (const t of textures) t.dispose();
  group.removeFromParent(); group.clear();
}
