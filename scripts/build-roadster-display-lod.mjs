// Run from the repository after installing meshoptimizer@1.0.1 as a build tool.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const { MeshoptSimplifier } = await import(process.env.MESHOPT_MODULE || 'meshoptimizer');
await MeshoptSimplifier.ready;
const directory = new URL('../dist/assets/tesla-roadster-2020/', import.meta.url);
const read = name => readFile(new URL(name, directory));
const sha = data => createHash('sha256').update(data).digest('hex');
const [json, bytes, provenanceFile] = await Promise.all([read('scene.gltf'), read('scene.bin'), read('provenance.json')]);
const gltf = JSON.parse(json), provenance = JSON.parse(provenanceFile);
if (sha(bytes) !== provenance.files.find(f => f.file.endsWith('/scene.bin')).sha256) throw new Error('Unexpected Roadster vertex source');

// The original model uses packed little-endian float and index accessors.
function accessor(index) {
  const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView];
  const ArrayType = {5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array}[a.componentType];
  const width = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4}[a.type];
  if (!ArrayType || !width || a.sparse || view.buffer !== 0 ||
      (view.byteStride && view.byteStride !== width * ArrayType.BYTES_PER_ELEMENT)) throw new Error('Unsupported accessor ' + index);
  return new ArrayType(bytes.buffer, bytes.byteOffset + (view.byteOffset || 0) + (a.byteOffset || 0), a.count * width);
}

const chunks = [], rows = [];
let originalTriangles = 0, displayTriangles = 0;
for (const [id, mesh] of gltf.meshes.entries()) {
  const p = mesh.primitives[0];
  if (mesh.primitives.length !== 1 || p.mode !== 4) throw new Error('Expected one triangle primitive per mesh');
  const indices = accessor(p.indices), positions = accessor(p.attributes.POSITION);
  originalTriangles += indices.length / 3;
  if (indices.length < 1800) { displayTriangles += indices.length / 3; continue; }
  const normals = accessor(p.attributes.NORMAL);
  const uv = p.attributes.TEXCOORD_0 !== undefined ? accessor(p.attributes.TEXCOORD_0) : null;
  const vertices = positions.length / 3, stride = uv ? 5 : 3;
  const attributes = new Float32Array(vertices * stride);
  for (let i = 0; i < vertices; i++) {
    attributes.set(normals.subarray(i * 3, i * 3 + 3), i * stride);
    if (uv) attributes.set(uv.subarray(i * 2, i * 2 + 2), i * stride + 3);
  }
  const weights = uv ? [.025,.025,.025,.01,.01] : [.025,.025,.025];
  const target = Math.max(300, Math.floor(indices.length * .16 / 3) * 3);
  const [reduced] = MeshoptSimplifier.simplifyWithAttributes(
    Uint32Array.from(indices), positions, 3, attributes, stride, weights, null, target, .004, ['LockBorder']);
  displayTriangles += reduced.length / 3;
  if (reduced.length === indices.length) continue;
  const encoded = vertices > 65535 ? reduced : Uint16Array.from(reduced);
  chunks.push(Buffer.from(encoded.buffer, encoded.byteOffset, encoded.byteLength));
  rows.push([id, vertices, indices.length, reduced.length, encoded.BYTES_PER_ELEMENT]);
}
// Each index payload starts on a four-byte boundary so a browser can reference
// it directly without copying. Include the source counts to reject stale data.
const header = Buffer.alloc(8 + rows.length * 24);
header.write('RDL1'); header.writeUInt32LE(rows.length, 4);
const buffers = [header]; let offset = header.length;
for (const [i,row] of rows.entries()) {
  const padding = (4 - offset % 4) % 4;
  if (padding) { buffers.push(Buffer.alloc(padding)); offset += padding; }
  [...row, offset].forEach((value, j) => header.writeUInt32LE(value, 8 + i * 24 + j * 4));
  buffers.push(chunks[i]); offset += chunks[i].length;
}
const output = Buffer.concat(buffers);
await writeFile(new URL('exterior-indices.bin',directory), output);
console.log({ originalTriangles, displayTriangles, reducedMeshes: rows.length, bytes: output.length,
  indexSha256: sha(output), gltfSha256: sha(json), sourceBinSha256: sha(bytes) });
