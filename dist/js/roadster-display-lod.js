import * as THREE from 'three';

// Second index lists for an exterior view. Positions, normals, UVs,
// materials, wheel pivots and selectable objects stay with the source model.
export function installRoadsterDisplayLod(vehicle, buffer) {
  const data = new DataView(buffer);
  if (data.byteLength < 8 || data.getUint32(0) !== 0x52444c31) throw new Error('Unknown Roadster display indices');
  const count = data.getUint32(4,true);
  if (8 + count * 24 > data.byteLength) throw new Error('Incomplete Roadster display table');
  const meshes = new Map();
  for (const mesh of vehicle.detailParts.values()) {
    if (mesh.isMesh) meshes.set(mesh.userData.sourceMeshIndex, mesh);
  }
  const records = [];
  for (let i = 0; i < count; i++) {
    const read = j => data.getUint32(8 + 24 * i + 4 * j, true);
    const mesh = meshes.get(read(0)), original = mesh?.geometry;
    const vertices = read(1), sourceCount = read(2), reducedCount = read(3), width = read(4), offset = read(5);
    if (original?.index?.count !== sourceCount || original.attributes.position.count !== vertices ||
        ![2,4].includes(width) || offset % 4 || offset < 8 + count * 24 ||
        !reducedCount || reducedCount % 3 || reducedCount >= sourceCount ||
        offset + reducedCount * width > buffer.byteLength) throw new Error('Roadster display indices do not match the model');
    const Type = width === 4 ? Uint32Array : Uint16Array;
    const indices = new THREE.BufferAttribute(new Type(buffer, offset, reducedCount), 1);
    const display = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(original.attributes)) display.setAttribute(name, attribute);
    display.setIndex(indices);
    display.boundingBox = original.boundingBox;
    display.boundingSphere = original.boundingSphere;
    records.push({mesh, original, display});
  }
  for (const {original, display} of records) {
    // Vehicle eviction (or shutdown) can occur from either rendering mode.
    const releasePair = ({target}) => {
      original.removeEventListener('dispose', releasePair);
      display.removeEventListener('dispose', releasePair);
      (target === original ? display : original).dispose();
    };
    original.addEventListener('dispose', releasePair);
    display.addEventListener('dispose', releasePair);
  }
  let active = false;
  vehicle.setExteriorDisplayLod = enabled => {
    if (enabled === active) return;
    active = enabled;
    for (const {mesh, original, display} of records) mesh.geometry = enabled ? display : original;
  };
}
