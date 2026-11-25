/**
 * Tile Streaming Manager with Whole-City Far LOD, Near High-Res Streaming,
 * Web Worker Decoding, GPU Disposal, and True 4-Season Palette Remapping.
 */

import * as THREE from 'three';

export class TileManager {
  constructor(scene, buildId = 'opole_20261125_v3') {
    this.scene = scene;
    this.buildId = buildId;
    this.manifest = null;
    this.overviewDtm = null; // { w, h, data: Float32Array }

    this.loadedTiles = new Map(); // key -> { status, group, groundMesh, bldgMesh, treeInstanced, ... }
    this.farTiles = new Map();    // key -> { group, groundMesh, rawImage, ... }

    this.maxLoadingDistance = 12000; // Stream the entire 14x14km city (closest tiles first)
    this.maxUnloadDistance = 16000;  // Keep city tiles resident while within view
    this.currentSeason = 0; // 0: summer, 1: autumn, 2: winter, 3: spring
    this.activeFetches = 0;
    this.maxConcurrentFetches = 10;
    this.pendingCommits = [];
    this.unloadCheckTimer = 0;

    // Palette lookup map: packed summer RGB -> class index 0..63
    this.summerRgbToClass = new Map();
    this.seasonPalettes = null;

    // Web Worker pool for off-thread tile decoding
    this.workers = [];
    this.workerQueue = [];
    this.workerBusy = new Set();
    const workerCount = Math.min(navigator.hardwareConcurrency || 4, 4);
    for (let i = 0; i < workerCount; i++) {
      const w = new Worker(new URL('../workers/tile_worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => this.onWorkerResult(i, e.data);
      w.onerror = (err) => {
        console.warn('Tile worker error:', err.message);
        this.workerBusy.delete(i);
        this.dispatchWorkerQueue();
      };
      this.workers.push(w);
    }

    this.textureLoader = new THREE.TextureLoader();

    // Nighttime procedural window lighting uniform shared across all building tiles
    this.bldgNightUniform = { value: 0.0 };
    this.windowLightsEnabled = true;

    // Double-sided buildings material with vertex colors + nighttime illuminated windows
    this.bldgMaterial = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      vertexColors: true
    });
    this.bldgMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uNightFactor = this.bldgNightUniform;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vBldgWorldPos;
           varying vec3 vBldgNormal;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vBldgWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
           vBldgNormal = normalize(mat3(modelMatrix) * objectNormal);`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uNightFactor;
           varying vec3 vBldgWorldPos;
           varying vec3 vBldgNormal;
           float bldgWinHash(vec3 p) {
             p = fract(p * vec3(443.897, 441.423, 437.195));
             p += dot(p, p.yzx + 19.19);
             return fract((p.x + p.y) * p.z);
           }`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           if (uNightFactor > 0.01 && abs(vBldgNormal.y) < 0.35) {
             vec2 tangent = normalize(vec2(-vBldgNormal.z, vBldgNormal.x) + vec2(1e-5, 0.0));
             float uWall = dot(vBldgWorldPos.xz, tangent);
             float vWall = vBldgWorldPos.y;
             float bayW = 2.8;
             float floorH = 3.2;
             float colIdx = floor(uWall / bayW);
             float rowIdx = floor(vWall / floorH);
             float fx = fract(uWall / bayW);
             float fy = fract(vWall / floorH);
             if (vWall > 1.2 && fx > 0.27 && fx < 0.73 && fy > 0.26 && fy < 0.74) {
               float bId = floor(vBldgWorldPos.x * 0.07) * 19.0 + floor(vBldgWorldPos.z * 0.07) * 37.0;
               float faceId = floor(vBldgNormal.x * 4.0 + vBldgNormal.z * 7.0);
               float h = bldgWinHash(vec3(colIdx + bId, rowIdx, faceId));
               if (h > 0.46) {
                 vec3 warm = mix(vec3(1.0, 0.72, 0.30), vec3(1.0, 0.90, 0.62), fract(h * 17.3));
                 vec3 cool = vec3(0.75, 0.88, 1.0);
                 vec3 winCol = (h > 0.91) ? cool : warm;
                 totalEmissiveRadiance += winCol * uNightFactor * 1.25;
               }
             }
           }`
        );
    };
    this.bldgMaterial.customProgramCacheKey = () => 'opole_bldg_night_windows_v1';

    // Tree geometries & materials
    this.treeBroadleafGeom = new THREE.ConeGeometry(2.5, 7.0, 5);
    this.treeConiferGeom = new THREE.ConeGeometry(1.8, 8.5, 5);
    this.treeMaterial = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
  }

  async loadManifest() {
    try {
      const resp = await fetch(`/data/manifest.json?v=${this.buildId}`);
      this.manifest = await resp.json();
      if (this.manifest.buildId) {
        this.buildId = this.manifest.buildId;
      }
      this.initPaletteLookup(this.manifest.palettes);
      console.log(`Opole-IZO: Loaded manifest (${this.manifest.tiles.length} tiles, build=${this.buildId})`);

      // Load 50m whole-city overview DTM (315 KB) for instant far-LOD across all 196 tiles
      await this.loadOverviewDtm();
      this.buildFarCityTiles();

      // Immediately load center tiles around Opole Rynek (tile 6, 7) and neighbors
      const centerTiles = [
        [6, 7], [5, 7], [7, 7], [6, 6], [6, 8],
        [5, 6], [7, 8], [5, 8], [7, 6]
      ];
      for (const [tx, ty] of centerTiles) {
        this.requestTileLoad(tx, ty, true);
      }

      return this.manifest;
    } catch (e) {
      console.error("Failed to load manifest.json:", e);
      return null;
    }
  }

  async loadOverviewDtm() {
    try {
      const resp = await fetch(`/data/overview_dtm.bin?v=${this.buildId}`);
      if (!resp.ok) return;
      const buf = await resp.arrayBuffer();
      const view = new DataView(buf);
      const w = view.getUint16(0, true);
      const h = view.getUint16(2, true);
      const data = new Float32Array(buf, 4, w * h);
      this.overviewDtm = { w, h, data };
    } catch (e) {
      console.warn("Failed to load overview_dtm.bin:", e.message);
    }
  }

  /** Sample terrain height y (relative to HEIGHT_OFFSET) anywhere in the 14x14km city */
  sampleElevation(x, z) {
    if (!this.overviewDtm) return 8.0;
    const { w, h, data } = this.overviewDtm;
    // x in [-6960, 7040], z in [-6360, 7640] (north is -6360 = row 0)
    const u = THREE.MathUtils.clamp((x + 6960.0) / 14000.0, 0, 1);
    const v = THREE.MathUtils.clamp((z + 6360.0) / 14000.0, 0, 1);
    const col = Math.min(w - 1, Math.round(u * (w - 1)));
    const row = Math.min(h - 1, Math.round(v * (h - 1)));
    const val = data[row * w + col];
    return Number.isFinite(val) ? val : 8.0;
  }

  initPaletteLookup(palettes) {
    if (!palettes || !palettes.summer) return;
    this.seasonPalettes = [
      palettes.summer,
      palettes.autumn || palettes.summer,
      palettes.winter || palettes.summer,
      palettes.spring || palettes.summer,
    ];
    this.summerRgbToClass.clear();
    palettes.summer.forEach((rgb, idx) => {
      const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
      this.summerRgbToClass.set(key, idx);
    });
  }

  /** Remap a summer indexed-palette image into the active seasonal palette via offscreen canvas */
  applySeasonToTexture(tex, img, seasonIndex) {
    if (!img) return;
    if (seasonIndex === 0 || !this.seasonPalettes) {
      tex.image = img;
      tex.needsUpdate = true;
      return;
    }

    const targetPal = this.seasonPalettes[seasonIndex];
    const w = img.width;
    const h = img.height;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, w, h);
    const px = imgData.data;

    for (let i = 0; i < px.length; i += 4) {
      const key = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
      const cls = this.summerRgbToClass.get(key);
      if (cls !== undefined) {
        const rgb = targetPal[cls];
        px[i] = rgb[0];
        px[i + 1] = rgb[1];
        px[i + 2] = rgb[2];
      }
    }
    ctx.putImageData(imgData, 0, 0);
    tex.image = canvas;
    tex.needsUpdate = true;
  }

  /** Build lightweight 196-tile Far LOD terrain across the entire 14x14km city */
  buildFarCityTiles() {
    if (!this.manifest) return;
    const FAR_GRID = 21; // 50m vertex spacing per 1km tile

    for (const meta of this.manifest.tiles) {
      const key = `${meta.tx}_${meta.ty}`;
      const [t_x0, t_z0, t_x1, t_z1] = meta.bounds;
      const centerX = (t_x0 + t_x1) * 0.5;
      const centerZ = (t_z0 + t_z1) * 0.5;

      const geom = new THREE.PlaneGeometry(1000, 1000, FAR_GRID - 1, FAR_GRID - 1);
      geom.rotateX(-Math.PI / 2);

      if (this.overviewDtm) {
        const posAttr = geom.attributes.position;
        for (let r = 0; r < FAR_GRID; r++) {
          const wz = t_z0 + (r / (FAR_GRID - 1)) * 1000.0;
          for (let c = 0; c < FAR_GRID; c++) {
            const wx = t_x0 + (c / (FAR_GRID - 1)) * 1000.0;
            const idx = r * FAR_GRID + c;
            // Offset far mesh by -0.25m so near high-res tiles never z-fight
            posAttr.setY(idx, this.sampleElevation(wx, wz) - 0.25);
          }
        }
        geom.computeVertexNormals();
      }

      const mat = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide
      });

      const farEntry = {
        group: new THREE.Group(),
        groundMesh: new THREE.Mesh(geom, mat),
        rawImage: null,
        texture: null,
        textureRequested: false
      };
      farEntry.groundMesh.position.set(centerX, 0, centerZ);
      farEntry.group.add(farEntry.groundMesh);

      this.scene.add(farEntry.group);
      this.farTiles.set(key, farEntry);

      // Load 128x128 overview texture lazily
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        farEntry.rawImage = img;
        const tex = new THREE.Texture(img);
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        farEntry.texture = tex;
        if (this.currentSeason !== 0) {
          this.applySeasonToTexture(tex, img, this.currentSeason);
        } else {
          tex.needsUpdate = true;
        }
        mat.map = tex;
        mat.needsUpdate = true;
      };
      img.src = `/data/tiles/${meta.name}_s.png?v=${this.buildId}`;
    }
  }

  setNightFactor(nightFactor) {
    this.bldgNightUniform.value = this.windowLightsEnabled ? nightFactor : 0.0;
  }

  setSeason(seasonIndex) {
    this.currentSeason = seasonIndex;
    const treeColors = [0x2e7d32, 0xd35400, 0x78909c, 0x27ae60];
    this.treeMaterial.color.setHex(treeColors[seasonIndex] || 0x2e7d32);

    // Recolor near high-res textures using true seasonal palette
    for (const tile of this.loadedTiles.values()) {
      if (tile.status === 'active' && tile.texture && tile.rawImage) {
        this.applySeasonToTexture(tile.texture, tile.rawImage, seasonIndex);
      }
    }

    // Recolor far-LOD overview textures
    for (const far of this.farTiles.values()) {
      if (far.texture && far.rawImage) {
        this.applySeasonToTexture(far.texture, far.rawImage, seasonIndex);
      }
    }
  }

  // --- Web Worker Dispatch ---

  requestTileLoad(tx, ty, immediate = false) {
    const key = `${tx}_${ty}`;
    if (this.loadedTiles.has(key)) return;
    this.loadedTiles.set(key, { status: 'loading' });

    const tileName = `tile_${tx}_${ty}`;
    this.activeFetches++;

    fetch(`/data/tiles/${tileName}.bin?v=${this.buildId}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then(buffer => {
        this.activeFetches--;
        if (immediate) {
          const decoded = this.decodeTileBuffer(buffer, tx, ty);
          this.pendingCommits.push(decoded);
        } else {
          this.workerQueue.push({ buffer, tx, ty });
          this.dispatchWorkerQueue();
        }
      })
      .catch(err => {
        this.activeFetches--;
        console.warn(`Failed loading tile ${tileName}:`, err.message);
        this.loadedTiles.delete(key);
      });
  }

  dispatchWorkerQueue() {
    while (this.workerQueue.length > 0) {
      let freeIdx = -1;
      for (let i = 0; i < this.workers.length; i++) {
        if (!this.workerBusy.has(i)) { freeIdx = i; break; }
      }
      if (freeIdx === -1) break;

      const item = this.workerQueue.shift();
      this.workerBusy.add(freeIdx);
      this.workers[freeIdx].postMessage(
        { buffer: item.buffer, tx: item.tx, ty: item.ty },
        [item.buffer]
      );
    }
  }

  onWorkerResult(workerIdx, data) {
    this.workerBusy.delete(workerIdx);
    if (data.error) {
      console.warn(`Worker decode error for tile ${data.tx}_${data.ty}:`, data.error);
      this.loadedTiles.delete(`${data.tx}_${data.ty}`);
    } else {
      this.pendingCommits.push(data);
    }
    this.dispatchWorkerQueue();
  }

  decodeTileBuffer(buffer, tx, ty) {
    const view = new DataView(buffer);
    const m0 = String.fromCharCode(view.getUint8(0));
    const m1 = String.fromCharCode(view.getUint8(1));
    const m2 = String.fromCharCode(view.getUint8(2));
    const m3 = String.fromCharCode(view.getUint8(3));

    let readTx = tx;
    let readTy = ty;
    let gridPts = 101;
    let bldgVertexCount = 0;
    let treeCount = 0;
    let offset = 32;

    if (m0 + m1 + m2 + m3 === "IZO1") {
      readTx = view.getUint16(4, true);
      readTy = view.getUint16(6, true);
      gridPts = view.getUint16(8, true);
      bldgVertexCount = view.getUint32(12, true);
      treeCount = view.getUint32(16, true);
    }

    const heightsLength = gridPts * gridPts;
    let heights = null;
    if (offset + heightsLength * 4 <= buffer.byteLength) {
      heights = new Float32Array(buffer, offset, heightsLength);
      offset += heightsLength * 4;
    } else {
      heights = new Float32Array(heightsLength);
    }

    let bldgVertices = new Float32Array(0);
    const maxBldgVerts = Math.max(0, Math.floor((buffer.byteLength - offset) / 28));
    if (bldgVertexCount > maxBldgVerts) bldgVertexCount = maxBldgVerts;
    const bldgFloats = bldgVertexCount * 7;
    if (bldgFloats > 0) {
      bldgVertices = new Float32Array(buffer, offset, bldgFloats);
      offset += bldgFloats * 4;
    }

    let trees = new Float32Array(0);
    const maxTrees = Math.max(0, Math.floor((buffer.byteLength - offset) / 24));
    if (treeCount > maxTrees) treeCount = maxTrees;
    const treeFloats = treeCount * 6;
    if (treeFloats > 0) {
      trees = new Float32Array(buffer, offset, treeFloats);
    }

    return {
      tx: readTx,
      ty: readTy,
      gridPts,
      bldgVertexCount,
      treeCount,
      heights,
      bldgVertices,
      trees
    };
  }

  update(cameraTarget, dt, mpt = 0.43) {
    if (!this.manifest) return;

    // 1. Commit queued decoded tiles (up to 4 per frame for rapid whole-city streaming)
    let commitsThisFrame = 0;
    while (this.pendingCommits.length > 0 && commitsThisFrame < 4) {
      const commitData = this.pendingCommits.shift();
      this.commitTileMesh(commitData);
      commitsThisFrame++;
    }

    // 2. Sort tiles by distance to camera target (closest tiles always load first)
    const activeRadius = this.maxLoadingDistance;
    const targetX = cameraTarget.x;
    const targetZ = cameraTarget.z;

    // Adaptive LOD for instanced tree cones: hide dense trees when far or zoomed out
    const showTrees = mpt < 2.2;
    for (const tile of this.loadedTiles.values()) {
      if (tile.status === 'active' && tile.treeInstanced) {
        const dist = Math.hypot(tile.centerX - targetX, tile.centerZ - targetZ);
        tile.treeInstanced.visible = showTrees && dist <= 4500;
      }
    }

    const nearbyTiles = [];
    for (const t of this.manifest.tiles) {
      const bounds = t.bounds;
      const centerX = (bounds[0] + bounds[2]) * 0.5;
      const centerZ = (bounds[1] + bounds[3]) * 0.5;
      const dist = Math.hypot(centerX - targetX, centerZ - targetZ);

      if (dist <= activeRadius) {
        const key = `${t.tx}_${t.ty}`;
        if (!this.loadedTiles.has(key)) {
          nearbyTiles.push({ tile: t, dist, key });
        }
      }
    }

    nearbyTiles.sort((a, b) => a.dist - b.dist);

    // 3. Fetch nearby high-res tiles with concurrency limit
    for (const item of nearbyTiles) {
      if (this.activeFetches >= this.maxConcurrentFetches) break;
      if (this.loadedTiles.has(item.key)) continue;
      this.requestTileLoad(item.tile.tx, item.tile.ty, false);
    }

    // 4. Periodic tile unloading (every 2 seconds)
    this.unloadCheckTimer += dt;
    if (this.unloadCheckTimer >= 2.0) {
      this.unloadCheckTimer = 0;
      this.unloadDistantTiles(targetX, targetZ);
    }
  }

  unloadDistantTiles(targetX, targetZ) {
    const keysToUnload = [];

    for (const [key, tile] of this.loadedTiles.entries()) {
      if (tile.status !== 'active' || !tile.group) continue;
      const parts = key.split('_');
      const tx = parseInt(parts[0], 10);
      const ty = parseInt(parts[1], 10);

      const meta = this.manifest.tiles.find(t => t.tx === tx && t.ty === ty);
      if (meta && meta.bounds) {
        const centerX = (meta.bounds[0] + meta.bounds[2]) * 0.5;
        const centerZ = (meta.bounds[1] + meta.bounds[3]) * 0.5;
        const dist = Math.hypot(centerX - targetX, centerZ - targetZ);
        if (dist > this.maxUnloadDistance) {
          keysToUnload.push(key);
        }
      }
    }

    for (const key of keysToUnload) {
      this.disposeTile(key);
    }
  }

  disposeTile(key) {
    const tile = this.loadedTiles.get(key);
    if (!tile || !tile.group) return;

    this.scene.remove(tile.group);

    if (tile.groundMesh) {
      tile.groundMesh.geometry.dispose();
      if (tile.texture) tile.texture.dispose();
      tile.groundMesh.material.dispose();
    }
    if (tile.bldgMesh) {
      tile.bldgMesh.geometry.dispose();
    }
    if (tile.treeInstanced) {
      tile.treeInstanced.dispose();
    }

    this.loadedTiles.delete(key);

    // Re-reveal far-LOD placeholder tile for seamless city view
    const far = this.farTiles.get(key);
    if (far) far.group.visible = true;
  }

  commitTileMesh(data) {
    const key = `${data.tx}_${data.ty}`;
    const tileName = `tile_${data.tx}_${data.ty}`;

    const existing = this.loadedTiles.get(key);
    if (!existing || existing.status === 'active') return;

    let t_x0 = -960.0, t_z0 = -360.0, t_x1 = 40.0, t_z1 = 640.0;
    if (this.manifest && this.manifest.tiles) {
      const meta = this.manifest.tiles.find(t => t.tx === data.tx && t.ty === data.ty);
      if (meta && meta.bounds) {
        [t_x0, t_z0, t_x1, t_z1] = meta.bounds;
      }
    }

    const centerX = (t_x0 + t_x1) * 0.5;
    const centerZ = (t_z0 + t_z1) * 0.5;

    const tileGroup = new THREE.Group();

    // 1. High-Res 10m Terrain Mesh (101 x 101)
    const gridPts = data.gridPts;
    const terrainGeom = new THREE.PlaneGeometry(1000, 1000, gridPts - 1, gridPts - 1);
    terrainGeom.rotateX(-Math.PI / 2);

    const posAttr = terrainGeom.attributes.position;
    const heights = data.heights;
    if (heights && heights.length >= posAttr.count) {
      for (let i = 0; i < posAttr.count; i++) {
        const h = heights[i];
        posAttr.setY(i, (Number.isFinite(h) && Math.abs(h) < 500) ? h : 0);
      }
    }
    terrainGeom.computeVertexNormals();

    const terrainMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide
    });
    const groundMesh = new THREE.Mesh(terrainGeom, terrainMat);
    groundMesh.position.set(centerX, 0, centerZ);
    tileGroup.add(groundMesh);

    const tileRecord = {
      status: 'active',
      centerX,
      centerZ,
      group: tileGroup,
      groundMesh,
      bldgMesh: null,
      treeInstanced: null,
      rawImage: null,
      texture: null
    };

    // Load 500x500 (2m/px) ground texture with seasonal palette support
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!this.loadedTiles.has(key)) return;
      tileRecord.rawImage = img;
      const tex = new THREE.Texture(img);
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tileRecord.texture = tex;
      if (this.currentSeason !== 0) {
        this.applySeasonToTexture(tex, img, this.currentSeason);
      } else {
        tex.needsUpdate = true;
      }
      terrainMat.map = tex;
      terrainMat.needsUpdate = true;
    };
    img.src = `/data/tiles/${tileName}.png?v=${this.buildId}`;

    // 2. LoD2 + OSM Buildings Mesh
    if (data.bldgVertexCount > 0 && data.bldgVertices.length > 0) {
      const bldgGeom = new THREE.BufferGeometry();
      const numVerts = data.bldgVertexCount;
      const bldgPositions = new Float32Array(numVerts * 3);
      const bldgNormals = new Float32Array(numVerts * 3);
      const bldgColors = new Float32Array(numVerts * 3);

      const src = data.bldgVertices;
      let validVerts = 0;
      for (let i = 0; i < numVerts; i++) {
        const offset = i * 7;
        const px = src[offset + 0];
        const py = src[offset + 1];
        const pz = src[offset + 2];

        if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz) ||
            Math.abs(px) > 20000 || Math.abs(py) > 500 || Math.abs(pz) > 20000) {
          continue;
        }

        bldgPositions[validVerts * 3 + 0] = px;
        bldgPositions[validVerts * 3 + 1] = py;
        bldgPositions[validVerts * 3 + 2] = pz;

        const nx = src[offset + 3];
        const ny = src[offset + 4];
        const nz = src[offset + 5];
        bldgNormals[validVerts * 3 + 0] = Number.isFinite(nx) ? nx : 0;
        bldgNormals[validVerts * 3 + 1] = Number.isFinite(ny) ? ny : 1;
        bldgNormals[validVerts * 3 + 2] = Number.isFinite(nz) ? nz : 0;

        const isRoof = src[offset + 6] > 0.5;
        if (isRoof) {
          bldgColors[validVerts * 3 + 0] = 0.85;
          bldgColors[validVerts * 3 + 1] = 0.41;
          bldgColors[validVerts * 3 + 2] = 0.28;
        } else {
          bldgColors[validVerts * 3 + 0] = 0.92;
          bldgColors[validVerts * 3 + 1] = 0.89;
          bldgColors[validVerts * 3 + 2] = 0.82;
        }
        validVerts++;
      }

      if (validVerts > 0) {
        const finalPositions = (validVerts === numVerts) ? bldgPositions : bldgPositions.slice(0, validVerts * 3);
        const finalNormals = (validVerts === numVerts) ? bldgNormals : bldgNormals.slice(0, validVerts * 3);
        const finalColors = (validVerts === numVerts) ? bldgColors : bldgColors.slice(0, validVerts * 3);

        bldgGeom.setAttribute('position', new THREE.BufferAttribute(finalPositions, 3));
        bldgGeom.setAttribute('normal', new THREE.BufferAttribute(finalNormals, 3));
        bldgGeom.setAttribute('color', new THREE.BufferAttribute(finalColors, 3));

        tileRecord.bldgMesh = new THREE.Mesh(bldgGeom, this.bldgMaterial);
        tileGroup.add(tileRecord.bldgMesh);
      }
    }

    // 3. Tree Instancing
    if (data.treeCount > 0 && data.trees.length > 0) {
      const treeCount = data.treeCount;
      const treeInstanced = new THREE.InstancedMesh(this.treeBroadleafGeom, this.treeMaterial, treeCount);
      const dummy = new THREE.Object3D();
      const treesData = data.trees;

      for (let i = 0; i < treeCount; i++) {
        const toff = i * 6;
        const tx = treesData[toff + 0];
        const ty = treesData[toff + 1];
        const tz = treesData[toff + 2];
        const th = treesData[toff + 3];

        if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz) || !Number.isFinite(th)) {
          continue;
        }

        dummy.position.set(tx, ty + th * 0.5, tz);
        const scale = THREE.MathUtils.clamp(th / 8.0, 0.2, 3.0);
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        treeInstanced.setMatrixAt(i, dummy.matrix);
      }
      treeInstanced.instanceMatrix.needsUpdate = true;
      tileRecord.treeInstanced = treeInstanced;
      tileGroup.add(treeInstanced);
    }

    this.scene.add(tileGroup);
    this.loadedTiles.set(key, tileRecord);

    // Hide far-LOD placeholder once high-res mesh is active
    const far = this.farTiles.get(key);
    if (far) far.group.visible = false;
  }
}
