// Reject broken showcase surfaces before publishing the website.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MeshoptDecoder } from "meshoptimizer";

await MeshoptDecoder.ready;
const glb = await readFile(new URL("../public/showcase-v2.glb", import.meta.url));
const length = glb.readUInt32LE(12);
const doc = JSON.parse(glb.toString("utf8", 20, 20 + length));
const binary = glb.subarray(28 + length);
assert.equal(doc.meshes.length, 28, "Keep the four tiles' colour regions and four frame pieces");
const buffers = doc.bufferViews.map((view) => {
  const compression = view.extensions?.EXT_meshopt_compression;
  assert(compression, "Showcase buffers must use lossless mesh compression");
  const output = new Uint8Array(view.byteLength);
  MeshoptDecoder.decodeGltfBuffer(output, compression.count, compression.byteStride,
    binary.subarray(compression.byteOffset, compression.byteOffset + compression.byteLength), compression.mode);
  return output;
});
let total = 0;
for (const mesh of doc.meshes) for (const primitive of mesh.primitives) {
  const positions = doc.accessors[primitive.attributes.POSITION], faces = doc.accessors[primitive.indices];
  const points = new Float32Array(buffers[positions.bufferView].buffer);
  const indices = new Uint32Array(buffers[faces.bufferView].buffer);
  assert(points.every(Number.isFinite), `${mesh.name}: finite vertices`);
  assert.equal(indices.length, faces.count);
  assert(indices.length > 0 && indices.length % 3 === 0);
  const edges = new Map();
  for (let face = 0; face < indices.length; face += 3) {
    const a = indices[face], b = indices[face + 1], c = indices[face + 2];
    assert(a !== b && b !== c && a !== c, `${mesh.name}: collapsed triangle`);
    for (const [from, to] of [[a, b], [b, c], [c, a]]) {
      assert(from < positions.count && to < positions.count, `${mesh.name}: index outside vertex buffer`);
      const key = Math.min(from, to) * positions.count + Math.max(from, to);
      const previous = edges.get(key) || [0, 0];
      previous[0]++; previous[1] += from < to ? 1 : -1; edges.set(key, previous);
    }
  }
  for (const [count, direction] of edges.values()) {
    assert.equal(count, 2, `${mesh.name}: open or non-manifold surface`);
    assert.equal(direction, 0, `${mesh.name}: inconsistent triangle winding`);
  }
  total += indices.length / 3;
}
console.log(`PASS: ${doc.meshes.length} closed, consistently wound meshes; ${total.toLocaleString("en-GB")} intact triangles.`);
