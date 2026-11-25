/**
 * Vehicular Traffic Simulation Module.
 * - Cars, vans, and motorcycles navigating connected road graph edges (adj)
 * - Follows real 10m DTM road elevation (y)
 * - Obeys signalized intersections (traffic_signals) and speed limits
 * - Twin headlight beams at night
 */

import * as THREE from 'three';

export class TrafficSimulation {
  constructor(scene) {
    this.scene = scene;
    this.trafficData = null;
    this.vehicles = [];
    this.maxVehicles = 200;
    this.enabled = true;
    this.simClock = 0;

    this.carColors = [
      0xc0392b, 0x2980b9, 0x27ae60, 0xf1c40f, 0x8e44ad,
      0x2c3e50, 0xbdc3c7, 0xecf0f1, 0xd35400, 0x16a085
    ];

    this.bodyGeom = new THREE.BoxGeometry(3.6, 1.4, 1.8);
    this.cabinGeom = new THREE.BoxGeometry(2.0, 1.1, 1.6);
    this.vanGeom = new THREE.BoxGeometry(4.8, 2.2, 2.0);
    this.motoGeom = new THREE.BoxGeometry(1.8, 1.1, 0.6);

    this.glassMat = new THREE.MeshLambertMaterial({ color: 0x34495e });
    this.headlightMat = new THREE.MeshBasicMaterial({ color: 0xfffa65 });

    this.vehiclesGroup = new THREE.Group();
    this.scene.add(this.vehiclesGroup);

    this.signalLookup = new Map();
    this.loadTrafficGraph();
  }

  async loadTrafficGraph() {
    try {
      const resp = await fetch('/data/traffic.json');
      this.trafficData = await resp.json();
      if (this.trafficData.signals) {
        for (const s of this.trafficData.signals) {
          const cell = `${Math.round(s.x / 20)}_${Math.round(s.z / 20)}`;
          this.signalLookup.set(cell, s);
        }
      }
      console.log(`Opole-IZO: Loaded traffic graph (${this.trafficData.edgesCount} edges, ${this.trafficData.signalsCount} signals)`);
      this.spawnInitialVehicles();
    } catch (e) {
      console.warn("Failed to load traffic.json:", e);
    }
  }

  spawnInitialVehicles() {
    if (!this.trafficData || !this.trafficData.edges.length) return;
    const count = Math.min(this.maxVehicles, this.trafficData.edges.length);
    for (let i = 0; i < count; i++) {
      const edge = this.trafficData.edges[Math.floor(Math.random() * this.trafficData.edges.length)];
      this.spawnVehicle(edge);
    }
  }

  spawnVehicle(edge) {
    const isVan = Math.random() < 0.2;
    const isMoto = Math.random() < 0.12;
    const color = this.carColors[Math.floor(Math.random() * this.carColors.length)];

    const vGroup = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color });

    if (isMoto) {
      const mMesh = new THREE.Mesh(this.motoGeom, bodyMat);
      mMesh.position.y = 0.55;
      vGroup.add(mMesh);
    } else if (isVan) {
      const vanMesh = new THREE.Mesh(this.vanGeom, bodyMat);
      vanMesh.position.y = 1.1;
      vGroup.add(vanMesh);
    } else {
      const body = new THREE.Mesh(this.bodyGeom, bodyMat);
      body.position.y = 0.7;
      vGroup.add(body);

      const cabin = new THREE.Mesh(this.cabinGeom, this.glassMat);
      cabin.position.set(-0.3, 1.5, 0);
      vGroup.add(cabin);
    }

    const hl1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.4), this.headlightMat);
    hl1.position.set(1.8, 0.6, -0.6);
    const hl2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.4), this.headlightMat);
    hl2.position.set(1.8, 0.6, 0.6);
    vGroup.add(hl1);
    vGroup.add(hl2);

    this.vehiclesGroup.add(vGroup);

    this.vehicles.push({
      group: vGroup,
      edge,
      progress: Math.random(),
      speed: (edge.speed || 50) * 0.277,
      hl1,
      hl2
    });
  }

  pickNextEdge(currentEdge) {
    const adj = this.trafficData.adj;
    if (adj && currentEdge.v !== undefined) {
      const outEdges = adj[String(currentEdge.v)];
      if (outEdges && outEdges.length > 0) {
        // Prefer continuing forward rather than immediate U-turn when alternatives exist
        const candidates = outEdges.filter(idx => this.trafficData.edges[idx]?.v !== currentEdge.u);
        const pool = candidates.length > 0 ? candidates : outEdges;
        const chosenIdx = pool[Math.floor(Math.random() * pool.length)];
        if (this.trafficData.edges[chosenIdx]) {
          return this.trafficData.edges[chosenIdx];
        }
      }
    }
    return this.trafficData.edges[Math.floor(Math.random() * this.trafficData.edges.length)];
  }

  isSignalRed(edge) {
    const p2 = edge.pts[1];
    const cell = `${Math.round(p2[0] / 20)}_${Math.round(p2[1] / 20)}`;
    const sig = this.signalLookup.get(cell);
    if (!sig) return false;
    const phase = (this.simClock + sig.phaseOffset) % sig.cycleSec;
    return phase > sig.cycleSec * 0.55;
  }

  update(dt, env) {
    this.vehiclesGroup.visible = this.enabled;
    if (!this.enabled || !this.trafficData) return;

    this.simClock += dt;
    const isNight = Boolean(env && env.night);

    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      const edge = v.edge;
      if (!edge || !edge.pts || edge.pts.length < 2) continue;

      const segLen = Math.max(1.0, edge.dist || 20.0);
      const stoppedAtRed = v.progress > 0.85 && this.isSignalRed(edge);

      if (!stoppedAtRed) {
        v.progress += (v.speed * dt) / segLen;
      }

      if (v.progress >= 1.0) {
        v.progress = 0.0;
        v.edge = this.pickNextEdge(edge);
        v.speed = (v.edge.speed || 50) * 0.277;
      }

      const curP1 = v.edge.pts[0];
      const curP2 = v.edge.pts[1];
      const x = THREE.MathUtils.lerp(curP1[0], curP2[0], v.progress);
      const z = THREE.MathUtils.lerp(curP1[1], curP2[1], v.progress);
      const y1 = curP1.length > 2 ? curP1[2] : 8.0;
      const y2 = curP2.length > 2 ? curP2[2] : 8.0;
      const y = THREE.MathUtils.lerp(y1, y2, v.progress);

      const dx = curP2[0] - curP1[0];
      const dz = curP2[1] - curP1[1];
      const angle = -Math.atan2(dz, dx);

      v.group.position.set(x, y + 0.15, z);
      v.group.rotation.y = angle;
      v.hl1.visible = isNight;
      v.hl2.visible = isNight;
    }
  }
}
