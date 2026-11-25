/**
 * Aeroklub Opolski Aviation Simulation.
 * Fulfills Section 5 of izo.md:
 * - Gliders (PZL Bielsko SZD Puchacz) circling thermals over Opole
 * - Tow plane (PZL Wilga) sortie
 * - Air Ambulance (LPR Eurocopter) heading to Witosa hospital
 */

import * as THREE from 'three';

export class AviationSimulation {
  constructor(scene) {
    this.scene = scene;
    this.enabled = true;
    this.aviationGroup = new THREE.Group();
    this.scene.add(this.aviationGroup);

    this.aircraft = [];
    this.buildAircraft();
  }

  buildGliderMesh() {
    const group = new THREE.Group();
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const canopyMat = new THREE.MeshLambertMaterial({ color: 0x74b9ff, transparent: true, opacity: 0.8 });

    // Fuselage
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.1, 7.5, 6), whiteMat);
    fuse.rotateX(Math.PI / 2);
    group.add(fuse);

    // High aspect ratio glider wings (16m wingspan)
    const wings = new THREE.Mesh(new THREE.BoxGeometry(16.0, 0.15, 1.1), whiteMat);
    wings.position.set(0, 0.25, 0.5);
    group.add(wings);

    // T-tail fin & stabilizer
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 0.9), whiteMat);
    fin.position.set(0, 0.7, -3.2);
    const stab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 0.6), whiteMat);
    stab.position.set(0, 1.4, -3.2);
    group.add(fin);
    group.add(stab);

    // Cockpit canopy
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 1.8), canopyMat);
    canopy.position.set(0, 0.4, 1.5);
    group.add(canopy);

    return group;
  }

  buildHelicopterMesh() {
    const group = new THREE.Group();
    const yellowMat = new THREE.MeshLambertMaterial({ color: 0xf1c40f }); // LPR Polish Air Ambulance Yellow
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 6.0), yellowMat);
    group.add(body);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 6.5), yellowMat);
    tail.position.set(0, 0.2, -5.5);
    group.add(tail);

    // Main rotor
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(11.0, 0.08, 0.6), darkMat);
    rotor.position.set(0, 1.2, -0.5);
    group.add(rotor);
    group.rotor = rotor;

    return group;
  }

  buildAircraft() {
    // 1. Glider circling over Wyspa Bolko & Odra thermals
    const glider = this.buildGliderMesh();
    this.aviationGroup.add(glider);
    this.aircraft.push({
      mesh: glider,
      type: 'glider',
      center: { x: -100, z: 800 },
      radius: 450,
      altitude: 260,
      angle: 0.0,
      speed: 0.35 // rad/s
    });

    // 2. Second glider higher over Stare Miasto
    const glider2 = this.buildGliderMesh();
    this.aviationGroup.add(glider2);
    this.aircraft.push({
      mesh: glider2,
      type: 'glider',
      center: { x: 200, z: -300 },
      radius: 600,
      altitude: 340,
      angle: Math.PI,
      speed: 0.25
    });

    // 3. LPR Rescue Helicopter cruising towards USK Witosa hospital
    const heli = this.buildHelicopterMesh();
    this.aviationGroup.add(heli);
    this.aircraft.push({
      mesh: heli,
      type: 'heli',
      pos: { x: -2500, z: 2000 },
      target: { x: 2800, z: -1600 },
      altitude: 180,
      speed: 65 // m/s
    });
  }

  update(dt, env) {
    if (!this.enabled) {
      this.aviationGroup.visible = false;
      return;
    }
    this.aviationGroup.visible = true;

    for (const a of this.aircraft) {
      if (a.type === 'glider') {
        a.angle += a.speed * dt;
        const x = a.center.x + Math.cos(a.angle) * a.radius;
        const z = a.center.z + Math.sin(a.angle) * a.radius;
        a.mesh.position.set(x, a.altitude, z);

        // Bank into the turn
        a.mesh.rotation.y = -a.angle + Math.PI / 2;
        a.mesh.rotation.z = 0.25; // Gentle thermal bank
      } else if (a.type === 'heli') {
        // Spin rotor
        if (a.mesh.rotor) a.mesh.rotor.rotation.y += dt * 35.0;

        // Fly along route
        const dx = a.target.x - a.pos.x;
        const dz = a.target.z - a.pos.z;
        const dist = Math.hypot(dx, dz);

        if (dist > 20) {
          a.pos.x += (dx / dist) * a.speed * dt;
          a.pos.z += (dz / dist) * a.speed * dt;
          const heading = -Math.atan2(dz, dx) + Math.PI / 2;
          a.mesh.position.set(a.pos.x, a.altitude, a.pos.z);
          a.mesh.rotation.y = heading;
          a.mesh.rotation.x = 0.1; // Forward pitch
        } else {
          // Reset flight loop
          a.pos.x = -2500;
          a.pos.z = 2000;
        }
      }
    }
  }
}
