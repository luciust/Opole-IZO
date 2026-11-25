/**
 * Date-Driven Easter Eggs for Opole at verified coordinates & 10m DTM heights:
 * - 1–2 Nov (Wszystkich Świętych): Sea of flickering candlelight across Cmentarz Komunalny Półwieś (-3095, -513)
 * - 6 Dec – 12 Jan: Christmas tree with fairy lights on Rynek (-70, -195)
 * - 31 Dec 23:50 – 1 Jan 00:10: New Year fireworks over Rynek & Odra
 * - May – Sept: Grazing cows and sheep on Odra meadows (-140, 620)
 */

import * as THREE from 'three';

export class EasterEggsSimulation {
  constructor(scene) {
    this.scene = scene;
    this.easterGroup = new THREE.Group();
    this.scene.add(this.easterGroup);

    this.candles = null;
    this.christmasTree = null;
    this.fireworks = [];
    this.animalsGroup = new THREE.Group();
    this.easterGroup.add(this.animalsGroup);

    this.cmentarzY = 12.0;
    this.rynekY = 5.5;
    this.pastureY = 4.0;

    this.buildGraveCandles();
    this.buildChristmasTree();
    this.buildGrazingAnimals();
  }

  setElevations(elevs) {
    if (!elevs) return;
    if (typeof elevs.cmentarz === 'number' && this.candles) {
      this.cmentarzY = elevs.cmentarz;
      this.candles.position.y = this.cmentarzY + 0.6;
    }
    if (typeof elevs.rynek === 'number' && this.christmasTree) {
      this.rynekY = elevs.rynek;
      this.christmasTree.position.y = this.rynekY;
    }
    if (typeof elevs.pasture === 'number') {
      this.pastureY = elevs.pasture;
      this.animalsGroup.position.y = this.pastureY;
    }
  }

  buildGraveCandles() {
    const candleCount = 800;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(candleCount * 3);
    const colors = new Float32Array(candleCount * 3);

    for (let i = 0; i < candleCount; i++) {
      const row = Math.floor(i / 20);
      const col = i % 20;

      const cx = -3095 + (col - 10) * 14 + (Math.random() - 0.5) * 3;
      const cz = -513 + (row - 20) * 6 + (Math.random() - 0.5) * 2;

      positions[i * 3 + 0] = cx;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = cz;

      colors[i * 3 + 0] = 1.0;
      colors[i * 3 + 1] = 0.55 + Math.random() * 0.3;
      colors[i * 3 + 2] = 0.1;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 3.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.85
    });

    this.candles = new THREE.Points(geom, mat);
    this.candles.position.y = this.cmentarzY + 0.6;
    this.easterGroup.add(this.candles);
  }

  buildChristmasTree() {
    const group = new THREE.Group();
    group.position.set(-64, this.rynekY, -195);

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.7, 3),
      new THREE.MeshLambertMaterial({ color: 0x5d4037 })
    );
    trunk.position.y = 1.5;
    group.add(trunk);

    const foliageMat = new THREE.MeshLambertMaterial({ color: 0x1b5e20 });
    for (let i = 0; i < 4; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(5.0 - i * 0.9, 4.5, 8), foliageMat);
      cone.position.y = 4.0 + i * 2.8;
      group.add(cone);
    }

    const star = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshBasicMaterial({ color: 0xffd700 }));
    star.position.y = 14.5;
    group.add(star);

    const lightCount = 60;
    const lGeom = new THREE.BufferGeometry();
    const lPos = new Float32Array(lightCount * 3);
    const lColors = new Float32Array(lightCount * 3);

    for (let i = 0; i < lightCount; i++) {
      const h = 3.0 + Math.random() * 10.5;
      const r = (14.5 - h) * 0.35;
      const angle = Math.random() * Math.PI * 2;
      lPos[i * 3 + 0] = Math.cos(angle) * r;
      lPos[i * 3 + 1] = h;
      lPos[i * 3 + 2] = Math.sin(angle) * r;

      const pColors = [[1, 0, 0], [1, 0.8, 0], [0, 1, 0.5], [0.2, 0.8, 1]];
      const pc = pColors[i % pColors.length];
      lColors[i * 3 + 0] = pc[0];
      lColors[i * 3 + 1] = pc[1];
      lColors[i * 3 + 2] = pc[2];
    }
    lGeom.setAttribute('position', new THREE.BufferAttribute(lPos, 3));
    lGeom.setAttribute('color', new THREE.BufferAttribute(lColors, 3));

    const fairyMesh = new THREE.Points(lGeom, new THREE.PointsMaterial({ size: 2.5, vertexColors: true }));
    group.add(fairyMesh);

    this.christmasTree = group;
    this.easterGroup.add(group);
  }

  buildGrazingAnimals() {
    const cowMat = new THREE.MeshLambertMaterial({ color: 0x3d3d3d });
    const sheepMat = new THREE.MeshLambertMaterial({ color: 0xf5f6fa });
    this.animalsGroup.position.y = this.pastureY;

    for (let i = 0; i < 6; i++) {
      const cow = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.2, 0.9), cowMat);
      body.position.y = 0.8;
      cow.add(body);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.6), cowMat);
      head.position.set(1.1, 1.0, 0);
      cow.add(head);

      cow.position.set(-140 + (Math.random() - 0.5) * 80, 0, 620 + (Math.random() - 0.5) * 60);
      cow.rotation.y = Math.random() * Math.PI * 2;
      this.animalsGroup.add(cow);
    }

    for (let i = 0; i < 8; i++) {
      const sheep = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.6), sheepMat);
      body.position.y = 0.45;
      sheep.add(body);

      sheep.position.set(-160 + (Math.random() - 0.5) * 60, 0, 680 + (Math.random() - 0.5) * 60);
      sheep.rotation.y = Math.random() * Math.PI * 2;
      this.animalsGroup.add(sheep);
    }
  }

  spawnFirework(x, z) {
    const particleCount = 120;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];
    const colorHexes = [0xff4757, 0x2ed573, 0x1e90ff, 0xffa502, 0x9b59b6];
    const col = colorHexes[Math.floor(Math.random() * colorHexes.length)];

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3 + 0] = x;
      positions[i * 3 + 1] = 80;
      positions[i * 3 + 2] = z;

      const phi = Math.random() * Math.PI * 2;
      const theta = Math.random() * Math.PI;
      const spd = 15.0 + Math.random() * 25.0;

      velocities.push({
        vx: Math.sin(theta) * Math.cos(phi) * spd,
        vy: Math.cos(theta) * spd,
        vz: Math.sin(theta) * Math.sin(phi) * spd
      });
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: col, size: 3.5, transparent: true, opacity: 1.0 });
    const mesh = new THREE.Points(geom, mat);
    this.easterGroup.add(mesh);
    this.fireworks.push({ mesh, velocities, age: 0, maxAge: 2.2 });
  }

  update(dt, env) {
    const date = env.date || new Date();
    const month = date.getMonth();
    const day = date.getDate();
    const isNight = env.night;

    if (this.candles) {
      const isAllSaints = (month === 10 && (day === 1 || day === 2));
      this.candles.visible = isNight;
      if (isNight) {
        this.candles.material.opacity = (isAllSaints ? 0.95 : 0.6) + Math.sin(Date.now() * 0.008) * 0.15;
      }
    }

    if (this.christmasTree) {
      const isXmasSeason = (month === 11 && day >= 6) || (month === 0 && day <= 12);
      this.christmasTree.visible = isXmasSeason;
    }

    const isPastureSeason = (month >= 4 && month <= 8);
    this.animalsGroup.visible = isPastureSeason;

    for (let i = this.fireworks.length - 1; i >= 0; i--) {
      const fw = this.fireworks[i];
      fw.age += dt;
      if (fw.age >= fw.maxAge) {
        this.easterGroup.remove(fw.mesh);
        fw.mesh.geometry.dispose();
        fw.mesh.material.dispose();
        this.fireworks.splice(i, 1);
        continue;
      }

      const pos = fw.mesh.geometry.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        const v = fw.velocities[j];
        pos.setXYZ(
          j,
          pos.getX(j) + v.vx * dt,
          pos.getY(j) + v.vy * dt - 9.8 * dt * dt,
          pos.getZ(j) + v.vz * dt
        );
      }
      pos.needsUpdate = true;
      fw.mesh.material.opacity = 1.0 - (fw.age / fw.maxAge);
    }

    const isNewYear = (month === 11 && day === 31 && env.timeOfDay >= 23.8) || (month === 0 && day === 1 && env.timeOfDay <= 0.2);
    if (isNewYear && Math.random() < 0.05) {
      this.spawnFirework(-88 + (Math.random() - 0.5) * 300, -195 + (Math.random() - 0.5) * 300);
    }
  }
}
