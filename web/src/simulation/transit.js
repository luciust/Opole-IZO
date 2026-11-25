/**
 * Public Transit Simulation: Live MZK Opole Buses (GPS -> EPSG:2180) & PKP/Polregio Trains.
 * - Real-time MZK Opole buses via /api/vehicles converted from WGS84 [lon, lat] to scene (x, z)
 * - Simulated fallback routes when live GPS is unavailable
 * - PKP InterCity Pendolino (ED250) and Polregio Impuls (EN63A) trains traversing E30 line at 160 km/h
 */

import * as THREE from 'three';

// Local tangent projection calibrated to Opole ORIGIN (EPSG:2180 E=423960, N=311640)
const CENTER_LAT = 50.666818;
const CENTER_LON = 17.923641;
const METERS_PER_DEG_LAT = 111240.0;
const METERS_PER_DEG_LON = 111320.0 * Math.cos(CENTER_LAT * Math.PI / 180);

function lonLatToScene(lon, lat) {
  const x = (lon - CENTER_LON) * METERS_PER_DEG_LON;
  const z = -(lat - CENTER_LAT) * METERS_PER_DEG_LAT;
  return { x, z };
}

export class TransitSimulation {
  constructor(scene, tileManager = null) {
    this.scene = scene;
    this.tileManager = tileManager;
    this.transitData = null;
    this.buses = [];
    this.liveBusMap = new Map(); // vehicle.id -> live bus entry
    this.trains = [];
    this.enabledBuses = true;
    this.enabledTrains = true;

    this.transitGroup = new THREE.Group();
    this.scene.add(this.transitGroup);

    this.busGeom = new THREE.BoxGeometry(11.5, 3.1, 2.6);
    this.busCabinGeom = new THREE.BoxGeometry(9.5, 1.4, 2.65);
    this.busMatRed = new THREE.MeshLambertMaterial({ color: 0xad3431 });
    this.busMatYellow = new THREE.MeshLambertMaterial({ color: 0xf1c40f });
    this.busGlass = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });

    this.trainCarGeom = new THREE.BoxGeometry(24.0, 3.8, 3.0);
    this.pendolinoMat = new THREE.MeshLambertMaterial({ color: 0x1e3799 });
    this.pendolinoAccent = new THREE.MeshLambertMaterial({ color: 0xf6b93b });
    this.polregioMat = new THREE.MeshLambertMaterial({ color: 0xc0392b });

    this.loadTransitData();
  }

  async loadTransitData() {
    try {
      const resp = await fetch('/data/transit.json');
      this.transitData = await resp.json();
      console.log(`Opole-IZO: Loaded transit network (${this.transitData.mzkLines.length} bus lines, ${this.transitData.trainRoutes.length} train routes)`);
      this.initBuses();
      this.initTrains();
      this.pollLiveBuses();
      setInterval(() => this.pollLiveBuses(), 15000);
    } catch (e) {
      console.warn("Failed to load transit.json:", e);
    }
  }

  createBusMesh() {
    const group = new THREE.Group();

    const lowerBody = new THREE.Mesh(this.busGeom, this.busMatRed);
    lowerBody.position.y = 1.6;
    group.add(lowerBody);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(11.55, 0.4, 2.62), this.busMatYellow);
    stripe.position.y = 1.9;
    group.add(stripe);

    const cabin = new THREE.Mesh(this.busCabinGeom, this.busGlass);
    cabin.position.set(0.5, 2.3, 0);
    group.add(cabin);

    const signMat = new THREE.MeshBasicMaterial({ color: 0xffa502 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 1.8), signMat);
    sign.position.set(5.8, 2.7, 0);
    group.add(sign);

    return group;
  }

  createTrainSet(type = "PKP_InterCity_Pendolino", carCount = 5) {
    const setGroup = new THREE.Group();
    const isPendolino = type.includes("Pendolino");
    const carMat = isPendolino ? this.pendolinoMat : this.polregioMat;

    for (let c = 0; c < carCount; c++) {
      const car = new THREE.Mesh(this.trainCarGeom, carMat);
      car.position.set(-c * 25.0, 2.2, 0);

      const stripeMat = isPendolino ? this.pendolinoAccent : this.busMatYellow;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(24.1, 0.5, 3.05), stripeMat);
      stripe.position.set(-c * 25.0, 1.8, 0);

      setGroup.add(car);
      setGroup.add(stripe);
    }
    return setGroup;
  }

  initBuses() {
    if (!this.transitData || !this.transitData.mzkLines) return;
    for (const line of this.transitData.mzkLines) {
      for (let b = 0; b < 2; b++) {
        const mesh = this.createBusMesh();
        this.transitGroup.add(mesh);
        this.buses.push({
          mesh,
          route: line,
          progress: b * 0.5 + Math.random() * 0.1,
          speed: 11.0
        });
      }
    }
  }

  initTrains() {
    if (!this.transitData || !this.transitData.trainRoutes) return;
    for (const r of this.transitData.trainRoutes) {
      for (const tCfg of r.trains) {
        const mesh = this.createTrainSet(tCfg.type, 4);
        this.transitGroup.add(mesh);
        this.trains.push({
          mesh,
          route: r,
          cfg: tCfg,
          progress: Math.random(),
          speed: (r.speed || 160) * 0.277
        });
      }
    }
  }

  async pollLiveBuses() {
    try {
      const resp = await fetch('/api/vehicles');
      const data = await resp.json();
      if (data && Array.isArray(data.positions) && data.positions.length > 0) {
        const seenIds = new Set();
        for (const live of data.positions) {
          if (!live.location || live.location.length < 2) continue;
          const vid = live.vehicle?.id || `${live.routeName}_${live.location[0]}`;
          const { x, z } = lonLatToScene(live.location[0], live.location[1]);
          if (Math.abs(x) > 7200 || Math.abs(z) > 7500) continue;

          const y = this.tileManager ? this.tileManager.sampleElevation(x, z) : 8.0;
          // Compass bearing (0=North, 90=East) -> Three.js Y rotation (0=+X East, +PI/2=North)
          const heading = typeof live.bearing === 'number'
            ? THREE.MathUtils.degToRad(90 - live.bearing)
            : 0;

          seenIds.add(vid);
          let entry = this.liveBusMap.get(vid);
          if (!entry) {
            const mesh = this.createBusMesh();
            mesh.position.set(x, y, z);
            mesh.rotation.y = heading;
            this.transitGroup.add(mesh);
            entry = {
              mesh,
              targetX: x, targetY: y, targetZ: z,
              targetHeading: heading
            };
            this.liveBusMap.set(vid, entry);
          } else {
            entry.targetX = x;
            entry.targetY = y;
            entry.targetZ = z;
            entry.targetHeading = heading;
          }
        }

        // Remove stale live buses no longer reported
        for (const [vid, entry] of this.liveBusMap.entries()) {
          if (!seenIds.has(vid)) {
            this.transitGroup.remove(entry.mesh);
            this.liveBusMap.delete(vid);
          }
        }
      }
    } catch (e) {
      // Simulated fallback remains active
    }
  }

  samplePolyline(pts, progress) {
    const totalSegments = pts.length - 1;
    const fSeg = progress * totalSegments;
    const sIdx = Math.min(totalSegments - 1, Math.floor(fSeg));
    const t = fSeg - sIdx;
    const p1 = pts[sIdx];
    const p2 = pts[sIdx + 1];
    const x = THREE.MathUtils.lerp(p1[0], p2[0], t);
    const z = THREE.MathUtils.lerp(p1[1], p2[1], t);
    const y1 = p1.length > 2 ? p1[2] : 8.0;
    const y2 = p2.length > 2 ? p2[2] : 8.0;
    const y = THREE.MathUtils.lerp(y1, y2, t);
    const heading = -Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
    return { x, y, z, heading };
  }

  update(dt) {
    const hasLiveBuses = this.liveBusMap.size > 0;

    // 1. Live GPS MZK Buses
    const lerpAlpha = Math.min(1.0, dt * 1.5);
    for (const entry of this.liveBusMap.values()) {
      entry.mesh.visible = this.enabledBuses;
      if (!this.enabledBuses) continue;
      entry.mesh.position.x = THREE.MathUtils.lerp(entry.mesh.position.x, entry.targetX, lerpAlpha);
      entry.mesh.position.y = THREE.MathUtils.lerp(entry.mesh.position.y, entry.targetY, lerpAlpha);
      entry.mesh.position.z = THREE.MathUtils.lerp(entry.mesh.position.z, entry.targetZ, lerpAlpha);
      entry.mesh.rotation.y = entry.targetHeading;
    }

    // 2. Simulated Fallback MZK Buses (hidden when live GPS stream is active)
    for (const b of this.buses) {
      b.mesh.visible = this.enabledBuses && !hasLiveBuses;
      if (!b.mesh.visible) continue;
      const pts = b.route.pts;
      if (pts.length < 2) continue;

      b.progress = (b.progress + (b.speed * dt * 0.0003)) % 1.0;
      const { x, y, z, heading } = this.samplePolyline(pts, b.progress);
      b.mesh.position.set(x, y, z);
      b.mesh.rotation.y = heading;
    }

    // 3. PKP / Polregio Trains
    for (const tr of this.trains) {
      tr.mesh.visible = this.enabledTrains;
      if (!this.enabledTrains) continue;
      const pts = tr.route.pts;
      if (pts.length < 2) continue;

      tr.progress = (tr.progress + (tr.speed * dt * 0.00015)) % 1.0;
      const { x, y, z, heading } = this.samplePolyline(pts, tr.progress);
      tr.mesh.position.set(x, y, z);
      tr.mesh.rotation.y = heading;
    }
  }
}
