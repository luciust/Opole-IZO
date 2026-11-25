/**
 * Web Worker for decoding binary tile files (.bin) into transferable Float32Arrays.
 * Transfers the underlying ArrayBuffer(s) once (deduplicated) to prevent DataCloneError.
 */

self.onmessage = function(e) {
  const { buffer, tx, ty } = e.data;
  if (!buffer || buffer.byteLength < 32) {
    self.postMessage({ error: "Invalid buffer size", tx, ty });
    return;
  }

  const view = new DataView(buffer);

  // Verify magic "IZO1"
  const m0 = String.fromCharCode(view.getUint8(0));
  const m1 = String.fromCharCode(view.getUint8(1));
  const m2 = String.fromCharCode(view.getUint8(2));
  const m3 = String.fromCharCode(view.getUint8(3));
  if (m0 + m1 + m2 + m3 !== "IZO1") {
    self.postMessage({ error: "Invalid magic identifier", tx, ty });
    return;
  }

  const readTx = view.getUint16(4, true);
  const readTy = view.getUint16(6, true);
  const gridPts = view.getUint16(8, true);
  let bldgVertexCount = view.getUint32(12, true);
  let treeCount = view.getUint32(16, true);

  let offset = 32;

  // 1. Heights array (gridPts * gridPts floats)
  const heightsLength = gridPts * gridPts;
  let heights;
  if (offset + heightsLength * 4 <= buffer.byteLength) {
    heights = new Float32Array(buffer, offset, heightsLength);
    offset += heightsLength * 4;
  } else {
    heights = new Float32Array(heightsLength);
  }

  // 2. Building vertices (bldgVertexCount * 7 floats: x, y, z, nx, ny, nz, surface_type)
  const maxBldgVerts = Math.max(0, Math.floor((buffer.byteLength - offset) / 28));
  if (bldgVertexCount > maxBldgVerts) bldgVertexCount = maxBldgVerts;
  const bldgFloats = bldgVertexCount * 7;
  let bldgVertices;
  if (bldgFloats > 0) {
    bldgVertices = new Float32Array(buffer, offset, bldgFloats);
    offset += bldgFloats * 4;
  } else {
    bldgVertices = new Float32Array(0);
  }

  // 3. Trees array (treeCount * 6 floats: x, y, z, height, radius, type)
  const maxTrees = Math.max(0, Math.floor((buffer.byteLength - offset) / 24));
  if (treeCount > maxTrees) treeCount = maxTrees;
  const treeFloats = treeCount * 6;
  let trees;
  if (treeFloats > 0) {
    trees = new Float32Array(buffer, offset, treeFloats);
  } else {
    trees = new Float32Array(0);
  }

  // Deduplicate underlying ArrayBuffers (views into the same buffer share buffer identity)
  const transferList = Array.from(new Set([heights.buffer, bldgVertices.buffer, trees.buffer]));

  self.postMessage({
    tx: readTx,
    ty: readTy,
    gridPts,
    bldgVertexCount,
    treeCount,
    heights,
    bldgVertices,
    trees
  }, transferList);
};
