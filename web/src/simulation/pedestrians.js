/**
 * Pedestrian and Resident Simulation Module.
 * - Walking along connected sidewalk graph (walk.json) at real 10m DTM elevation (y)
 * - Animated walking strides
 * - Chatting groups and café terrace life in verified Opole squares
 */

import * as THREE from 'three';

export class PedestrianSimulation {
  constructor(scene) {
    this.scene = scene;
    this.walkData = null;
    this.pedestrians = [];
    this.cafeGuests = [];
    this.maxWalkers = 200;
    this.enabled = true;

    this.pedGroup = new THREE.Group();
    this.scene.add(this.pedGroup);

    this.clothesColors = [
      0x34495e, 0xe74c3c, 0x2980b9, 0x27ae60, 0x8e44ad,
      0xd35400, 0xf39c12, 0x16a085, 0x7f8c8d, 0x2c3e50
    ];

    this.torsoGeom = new THREE.BoxGeometry(0.5, 0.9, 0.35);
    this.headGeom = new THREE.BoxGeometry(0.35, 0.4, 0.35);
    this.skinMat = new THREE.MeshLambertMaterial({ color: 0xffd1a4 });

    this.loadWalkGraph();
  }

  async loadWalkGraph() {
    try {
      const resp = await fetch('/data/walk.json');
      this.walkData = await resp.json();
      console.log(`Opole-IZO: Loaded walk graph (${this.walkData.edgesCount} edges, ${this.walkData.plazas.length} plazas)`);
      this.spawnWalkers();
      this.spawnCafeGuests();
    } catch (e) {
      console.warn("Failed to load walk.json:", e);
    }
  }

  createPedestrianMesh(clothingColor) {
    const pGroup = new THREE.Group();
    const clothesMat = new THREE.MeshLambertMaterial({ color: clothingColor });

    const torso = new THREE.Mesh(this.torsoGeom, clothesMat);
    torso.position.y = 0.75;
    pGroup.add(torso);

    const head = new THREE.Mesh(this.headGeom, this.skinMat);
    head.position.y = 1.4;
    pGroup.add(head);

    return pGroup;
  }

  spawnWalkers() {
    if (!this.walkData || !this.walkData.edges.length) return;
    const count = Math.min(this.maxWalkers, this.walkData.edges.length);
    for (let i = 0; i < count; i++) {
      const edge = this.walkData.edges[Math.floor(Math.random() * this.walkData.edges.length)];
      const color = this.clothesColors[Math.floor(Math.random() * this.clothesColors.length)];
      const mesh = this.createPedestrianMesh(color);
      this.pedGroup.add(mesh);

      this.pedestrians.push({
        mesh,
        edge,
        progress: Math.random(),
        speed: 1.1 + Math.random() * 0.4,
        bobPhase: Math.random() * Math.PI * 2
      });
    }
  }

  spawnCafeGuests() {
    if (!this.walkData || !this.walkData.plazas) return;
    for (const plaza of this.walkData.plazas) {
      const guestCount = plaza.type === 'cafe_square' ? 24 : 8;
      const py = typeof plaza.y === 'number' ? plaza.y : 6.0;
      for (let i = 0; i < guestCount; i++) {
        const color = this.clothesColors[Math.floor(Math.random() * this.clothesColors.length)];
        const mesh = this.createPedestrianMesh(color);

        const angle = Math.random() * Math.PI * 2;
        const rad = Math.random() * plaza.radius * 0.7;
        const gx = plaza.x + Math.cos(angle) * rad;
        const gz = plaza.z + Math.sin(angle) * rad;

        mesh.position.set(gx, py, gz);
        mesh.rotation.y = Math.random() * Math.PI * 2;
        this.pedGroup.add(mesh);
        this.cafeGuests.push(mesh);
      }
    }
  }

  pickNextEdge(currentEdge) {
    const adj = this.walkData.adj;
    if (adj && currentEdge.v !== undefined) {
      const outEdges = adj[String(currentEdge.v)];
      if (outEdges && outEdges.length > 0) {
        const candidates = outEdges.filter(idx => this.walkData.edges[idx]?.v !== currentEdge.u);
        const pool = candidates.length > 0 ? candidates : outEdges;
        const chosenIdx = pool[Math.floor(Math.random() * pool.length)];
        if (this.walkData.edges[chosenIdx]) {
          return this.walkData.edges[chosenIdx];
        }
      }
    }
    return this.walkData.edges[Math.floor(Math.random() * this.walkData.edges.length)];
  }

  update(dt) {
    this.pedGroup.visible = this.enabled;
    if (!this.enabled || !this.walkData) return;

    for (let i = 0; i < this.pedestrians.length; i++) {
      const p = this.pedestrians[i];
      const edge = p.edge;
      if (!edge || !edge.pts || edge.pts.length < 2) continue;

      const segLen = Math.max(1.0, edge.dist || 10.0);
      p.progress += (p.speed * dt) / segLen;
      if (p.progress >= 1.0) {
        p.progress = 0.0;
        p.edge = this.pickNextEdge(edge);
      }

      const curP1 = p.edge.pts[0];
      const curP2 = p.edge.pts[1];
      const x = THREE.MathUtils.lerp(curP1[0], curP2[0], p.progress);
      const z = THREE.MathUtils.lerp(curP1[1], curP2[1], p.progress);
      const y1 = curP1.length > 2 ? curP1[2] : 6.0;
      const y2 = curP2.length > 2 ? curP2[2] : 6.0;
      const y = THREE.MathUtils.lerp(y1, y2, p.progress);

      const dx = curP2[0] - curP1[0];
      const dz = curP2[1] - curP1[1];
      const heading = -Math.atan2(dz, dx);

      p.bobPhase += dt * 8.0;
      const bobY = Math.abs(Math.sin(p.bobPhase)) * 0.12;

      p.mesh.position.set(x, y + bobY, z);
      p.mesh.rotation.y = heading;
    }
  }
}
