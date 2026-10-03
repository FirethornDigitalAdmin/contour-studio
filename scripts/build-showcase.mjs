// Compress an existing generated preview without changing its surfaces or winding.
// pnpm build:showcase PATH/TO/preview.glb [optional decoded validation GLB]
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Pass the path to a generated multicolour preview.glb");
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const source = await readFile(sourcePath);
if (source.readUInt32LE(0) !== 0x46546c67 || source.readUInt32LE(4) !== 2) throw new Error("Expected a GLB 2.0 preview");
const jsonLength = source.readUInt32LE(12);
const doc = JSON.parse(source.toString("utf8", 20, 20 + jsonLength));
const binaryStart = 20 + jsonLength + 8;
const binary = source.subarray(binaryStart);
const accessors = [], views = [], encodedChunks = [], decodedChunks = [];
let encodedLength = 0, decodedLength = 0, triangles = 0;
const align = (value) => Math.ceil(value / 4) * 4;

function readAccessor(index) {
  const accessor = doc.accessors[index], view = doc.bufferViews[accessor.bufferView];
  const width = accessor.type === "VEC3" ? 3 : 1;
  const bytes = accessor.componentType === 5123 ? 2 : 4;
  if (view.byteStride && view.byteStride !== width * bytes) throw new Error("Unexpected interleaved source data");
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const data = binary.subarray(start, start + accessor.count * width * bytes);
  const copy = new Uint8Array(data); // Aligned, independent bytes for typed arrays.
  if (accessor.componentType === 5126) return new Float32Array(copy.buffer);
  if (accessor.componentType === 5125) return new Uint32Array(copy.buffer);
  if (accessor.componentType === 5123) return new Uint32Array(new Uint16Array(copy.buffer));
  throw new Error("Unexpected source accessor type");
}
function triangleKey(a, b, c) {
  // Cyclic rotation preserves winding; reversal deliberately does not match.
  if (a <= b && a <= c) return `${a},${b},${c}`;
  if (b <= a && b <= c) return `${b},${c},${a}`;
  return `${c},${a},${b}`;
}
function addBuffer(data, count, stride, mode, target) {
  const raw = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const encoded = MeshoptEncoder.encodeGltfBuffer(raw, count, stride, mode);
  const decoded = new Uint8Array(raw.length);
  MeshoptDecoder.decodeGltfBuffer(decoded, count, stride, encoded, mode);
  const view = views.length;
  views.push({ buffer: 1, byteOffset: decodedLength, byteLength: raw.length, target,
    ...(mode === "ATTRIBUTES" ? { byteStride: stride } : {}),
    extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: encodedLength,
      byteLength: encoded.length, byteStride: stride, count, mode } } });
  encodedChunks.push(Buffer.from(encoded), Buffer.alloc(align(encoded.length) - encoded.length));
  decodedChunks.push(Buffer.from(decoded), Buffer.alloc(align(decoded.length) - decoded.length));
  encodedLength += align(encoded.length); decodedLength += align(decoded.length);
  return { view, decoded };
}

for (const mesh of doc.meshes) {
  if (!/^MaterialVisual_(?:Frame_)?[AB][12](?:_1)?_(ground|water|forest|fields|roads|buildings|frame)$/.test(mesh.name)) throw new Error(`Unexpected example mesh: ${mesh.name}`);
  for (const primitive of mesh.primitives) {
    // Region colours are applied by the viewer; source vertex colours are redundant.
    if (Object.keys(primitive.attributes).some((name) => !["POSITION", "COLOR_0"].includes(name)) || (primitive.mode ?? 4) !== 4) throw new Error("Unexpected source attributes");
    const positions = readAccessor(primitive.attributes.POSITION);
    const indices = readAccessor(primitive.indices);
    const originalIndices = indices.slice();
    const [remap, count] = MeshoptEncoder.reorderMesh(indices, true, false);
    const reordered = new Float32Array(count * 3), inverse = new Uint32Array(count);
    for (let vertex = 0; vertex < remap.length; vertex++) {
      if (remap[vertex] === 0xffffffff) continue;
      reordered.set(positions.subarray(vertex * 3, vertex * 3 + 3), remap[vertex] * 3);
      inverse[remap[vertex]] = vertex;
    }
    const positionBuffer = addBuffer(reordered, count, 12, "ATTRIBUTES", 34962);
    if (!Buffer.from(positionBuffer.decoded).equals(Buffer.from(reordered.buffer))) throw new Error("Position compression changed a vertex");
    const indexBuffer = addBuffer(indices, indices.length, 4, "TRIANGLES", 34963);
    const roundTrip = new Uint32Array(indexBuffer.decoded.buffer);
    // Verify every decoded, oriented triangle against the original source.
    const faces = new Map();
    for (let i = 0; i < originalIndices.length; i += 3) {
      const key = triangleKey(originalIndices[i], originalIndices[i + 1], originalIndices[i + 2]);
      faces.set(key, (faces.get(key) || 0) + 1);
    }
    for (let i = 0; i < roundTrip.length; i += 3) {
      const key = triangleKey(inverse[roundTrip[i]], inverse[roundTrip[i + 1]], inverse[roundTrip[i + 2]]);
      const left = faces.get(key);
      if (!left) throw new Error(`Compression changed a face in ${mesh.name}`);
      if (left === 1) faces.delete(key); else faces.set(key, left - 1);
    }
    if (faces.size) throw new Error(`Compression removed faces in ${mesh.name}`);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < reordered.length; i++) { const axis = i % 3; min[axis] = Math.min(min[axis], reordered[i]); max[axis] = Math.max(max[axis], reordered[i]); }
    primitive.attributes = { POSITION: accessors.length };
    accessors.push({ bufferView: positionBuffer.view, componentType: 5126, count, type: "VEC3", min, max });
    primitive.indices = accessors.length;
    accessors.push({ bufferView: indexBuffer.view, componentType: 5125, count: indices.length, type: "SCALAR", min: [0], max: [count - 1] });
    triangles += indices.length / 3;
  }
  delete mesh.extras;
}
for (const node of doc.nodes) delete node.extras;
delete doc.extras;
doc.asset = { version: "2.0", generator: "Contour Studio lossless showcase compression" };
doc.accessors = accessors; doc.bufferViews = views;
doc.extensionsUsed = doc.extensionsRequired = ["EXT_meshopt_compression"];
doc.buffers = [{ byteLength: encodedLength }, { byteLength: decodedLength, extensions: { EXT_meshopt_compression: { fallback: true } } }];

function makeGLB(document, binaryData) {
  const json = Buffer.from(JSON.stringify(document));
  const padded = Buffer.concat([json, Buffer.alloc(align(json.length) - json.length, 0x20)]);
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + padded.length + binaryData.length, 8); header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binaryHeader = Buffer.alloc(8); binaryHeader.writeUInt32LE(binaryData.length, 0); binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, padded, binaryHeader, binaryData]);
}
const output = fileURLToPath(new URL("../public/showcase-v2.glb", import.meta.url));
const compressed = makeGLB(doc, Buffer.concat(encodedChunks));
await writeFile(output, compressed);
if (process.argv[3]) {
  const decodedDoc = structuredClone(doc);
  delete decodedDoc.extensionsUsed; delete decodedDoc.extensionsRequired;
  decodedDoc.buffers = [{ byteLength: decodedLength }];
  for (const view of decodedDoc.bufferViews) { view.buffer = 0; delete view.extensions; }
  await writeFile(process.argv[3], makeGLB(decodedDoc, Buffer.concat(decodedChunks)));
}
console.log(JSON.stringify({ meshes: doc.meshes.length, triangles, bytes: compressed.length, verified: "Exact float32 positions and every oriented source triangle retained" }));
