/**
 * Hand-Modelled Architectural Landmarks of Opole.
 * Positioned at verified EPSG:2180 scene coordinates and seated on 10m GUGiK DTM ground elevations.
 */

import * as THREE from 'three';

export class LandmarksManager {
  constructor(scene) {
    this.scene = scene;
    this.landmarksGroup = new THREE.Group();
    this.scene.add(this.landmarksGroup);
    this.groups = {};

    this.materials = {
      brick: new THREE.MeshLambertMaterial({ color: 0x9e382b }),
      brickDark: new THREE.MeshLambertMaterial({ color: 0x6e251c }),
      stone: new THREE.MeshLambertMaterial({ color: 0xdcdde1 }),
      sandstone: new THREE.MeshLambertMaterial({ color: 0xe5c07b }),
      terracotta: new THREE.MeshLambertMaterial({ color: 0xc0392b }),
      roofCopper: new THREE.MeshLambertMaterial({ color: 0x27ae60 }),
      roofSlate: new THREE.MeshLambertMaterial({ color: 0x2f3640 }),
      ironGreen: new THREE.MeshLambertMaterial({ color: 0x16a085 }),
      water: new THREE.MeshLambertMaterial({ color: 0x34495e }),
      glass: new THREE.MeshLambertMaterial({ color: 0x74b9ff, transparent: true, opacity: 0.8 }),
      gold: new THREE.MeshLambertMaterial({ color: 0xf1c40f }),
      wood: new THREE.MeshLambertMaterial({ color: 0x795548 }),
      whiteCanopy: new THREE.MeshLambertMaterial({ color: 0xf5f6fa, side: THREE.DoubleSide }),
      // Nighttime emissive materials for landmark windows, clocks, glass & lamps
      winWarm: new THREE.MeshLambertMaterial({ color: 0x2c3e50, emissive: 0xffc864, emissiveIntensity: 0.0 }),
      clockGlow: new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffeaa7, emissiveIntensity: 0.0 }),
      stainedGlass: new THREE.MeshLambertMaterial({ color: 0xe5c07b, emissive: 0xffa84c, emissiveIntensity: 0.0 }),
      glassNight: new THREE.MeshLambertMaterial({ color: 0x74b9ff, transparent: true, opacity: 0.82, emissive: 0xffe49c, emissiveIntensity: 0.0 }),
      floodLamp: new THREE.MeshLambertMaterial({ color: 0xf1c40f, emissive: 0xfff5b8, emissiveIntensity: 0.0 })
    };

    this.buildAllLandmarks();
  }

  /** Update landmark window & floodlight emissive glow based on time of day */
  update(env) {
    const nf = env && typeof env.nightFactor === 'number'
      ? env.nightFactor
      : (env && env.night ? 1.0 : 0.0);

    this.materials.winWarm.emissiveIntensity = nf * 1.15;
    this.materials.clockGlow.emissiveIntensity = nf * 1.0;
    this.materials.stainedGlass.emissiveIntensity = nf * 0.95;
    this.materials.glassNight.emissiveIntensity = nf * 0.75;
    this.materials.floodLamp.emissiveIntensity = nf * 1.4;
  }

  /** Seat all landmarks cleanly on the loaded 10m GUGiK DTM ground elevation */
  setElevations(elevs) {
    if (!elevs) return;
    for (const [key, group] of Object.entries(this.groups)) {
      if (typeof elevs[key] === 'number' && Number.isFinite(elevs[key])) {
        group.position.y = elevs[key];
      }
    }
  }

  buildAllLandmarks() {
    this.buildRatuszAndRynek();
    this.buildWiezaPiastowska();
    this.buildAmfiteatr();
    this.buildKatedra();
    this.buildMostGroszowy();
    this.buildOpolskaWenecja();
    this.buildDworzecGlowny();
    this.buildSolarisCenter();
  }

  // 1. Ratusz w Opolu (Real Rynek coords: x = -88, z = -195)
  buildRatuszAndRynek() {
    const group = new THREE.Group();
    group.position.set(-88, 5.2, -195);

    const baseGeom = new THREE.BoxGeometry(40, 16, 26);
    const baseMesh = new THREE.Mesh(baseGeom, this.materials.stone);
    baseMesh.position.y = 8;
    group.add(baseMesh);

    const roofGeom = new THREE.ConeGeometry(23, 8, 4);
    roofGeom.rotateY(Math.PI / 4);
    const roofMesh = new THREE.Mesh(roofGeom, this.materials.terracotta);
    roofMesh.position.y = 20;
    roofMesh.scale.set(1.1, 1, 0.75);
    group.add(roofMesh);

    const towerShaft = new THREE.Mesh(new THREE.BoxGeometry(8, 52, 8), this.materials.stone);
    towerShaft.position.set(-8, 26, 0);
    group.add(towerShaft);

    const belfry = new THREE.Mesh(new THREE.BoxGeometry(9.5, 8, 9.5), this.materials.sandstone);
    belfry.position.set(-8, 54, 0);
    group.add(belfry);

    const clockGeom = new THREE.CylinderGeometry(2.0, 2.0, 0.4, 12);
    clockGeom.rotateX(Math.PI / 2);
    const clockS = new THREE.Mesh(clockGeom, this.materials.clockGlow);
    clockS.position.set(-8, 54, 4.8);
    group.add(clockS);

    // Ratusz palace lit windows along north & south facades
    for (let wx = -15; wx <= 15; wx += 6) {
      for (const wy of [6.5, 11.5]) {
        for (const wz of [-13.1, 13.1]) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 0.25), this.materials.winWarm);
          win.position.set(wx, wy, wz);
          group.add(win);
        }
      }
    }

    const crown = new THREE.Mesh(new THREE.BoxGeometry(7, 10, 7), this.materials.stone);
    crown.position.set(-8, 62, 0);
    group.add(crown);

    const spireGeom = new THREE.ConeGeometry(4, 9, 4);
    spireGeom.rotateY(Math.PI / 4);
    const spire = new THREE.Mesh(spireGeom, this.materials.roofCopper);
    spire.position.set(-8, 70, 0);
    group.add(spire);

    for (let x = -16; x <= 16; x += 8) {
      const archPillar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 5, 1.6), this.materials.sandstone);
      archPillar.position.set(x, 2.5, 13.5);
      group.add(archPillar);
    }

    // Café parasols around Rynek north & south sides
    const parasolMat = new THREE.MeshLambertMaterial({ color: 0xe74c3c });
    for (let px = -22; px <= 22; px += 11) {
      for (const pz of [-24, 24]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.8), this.materials.wood);
        pole.position.set(px, 1.4, pz);
        const umbrella = new THREE.Mesh(new THREE.ConeGeometry(2.0, 0.6, 8), parasolMat);
        umbrella.position.set(px, 2.7, pz);
        group.add(pole);
        group.add(umbrella);
      }
    }

    this.groups.rynek = group;
    this.landmarksGroup.add(group);
  }

  // 2. Wieża Piastowska (Real coords: x = -300, z = -62)
  buildWiezaPiastowska() {
    const group = new THREE.Group();
    group.position.set(-300, 4.0, -62);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 6.2, 32, 16), this.materials.brick);
    shaft.position.y = 16;
    group.add(shaft);

    const cornice = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 5.8, 2.5, 16), this.materials.stone);
    cornice.position.y = 33;
    group.add(cornice);

    const cone = new THREE.Mesh(new THREE.ConeGeometry(6.4, 12, 16), this.materials.brickDark);
    cone.position.y = 40;
    group.add(cone);

    const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4), this.materials.gold);
    finial.position.y = 48;
    group.add(finial);

    this.groups.wieza = group;
    this.landmarksGroup.add(group);
  }

  // 3. Amfiteatr Tysiąclecia (Next to Wieża Piastowska: x = -365, z = -90)
  buildAmfiteatr() {
    const group = new THREE.Group();
    group.position.set(-365, 4.0, -90);

    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(36, 18, 6, 24, 1, true, 0, Math.PI * 1.3),
      this.materials.stone
    );
    bowl.position.y = 3;
    bowl.rotation.y = 0.5;
    group.add(bowl);

    const stage = new THREE.Mesh(new THREE.BoxGeometry(26, 2, 18), this.materials.wood);
    stage.position.set(0, 1, -12);
    group.add(stage);

    const canopyCurve = new THREE.CylinderGeometry(24, 28, 14, 16, 1, true, 0, Math.PI);
    canopyCurve.rotateZ(Math.PI / 2);
    const canopy = new THREE.Mesh(canopyCurve, this.materials.whiteCanopy);
    canopy.position.set(0, 14, -10);
    canopy.scale.set(0.7, 1.2, 0.8);
    group.add(canopy);

    for (const mx of [-14, 14]) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 18), this.materials.stone);
      mast.position.set(mx, 9, -15);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), this.materials.floodLamp);
      lamp.position.set(mx, 18, -15);
      group.add(mast);
      group.add(lamp);
    }

    this.groups.amfiteatr = group;
    this.landmarksGroup.add(group);
  }

  // 4. Katedra Świętego Krzyża (Real coords: x = -234, z = -390)
  buildKatedra() {
    const group = new THREE.Group();
    group.position.set(-234, 4.0, -390);

    const nave = new THREE.Mesh(new THREE.BoxGeometry(22, 24, 52), this.materials.brick);
    nave.position.y = 12;
    group.add(nave);

    const roofGeom = new THREE.ConeGeometry(17, 12, 4);
    roofGeom.rotateY(Math.PI / 4);
    const roof = new THREE.Mesh(roofGeom, this.materials.roofSlate);
    roof.position.y = 30;
    roof.scale.set(1.0, 1, 1.6);
    group.add(roof);

    const buildSpire = (ox, oz) => {
      const towerGroup = new THREE.Group();
      towerGroup.position.set(ox, 0, oz);

      const tBase = new THREE.Mesh(new THREE.BoxGeometry(8, 48, 8), this.materials.brick);
      tBase.position.y = 24;
      towerGroup.add(tBase);

      const octBase = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.8, 8, 8), this.materials.sandstone);
      octBase.position.y = 52;
      towerGroup.add(octBase);

      const needle = new THREE.Mesh(new THREE.ConeGeometry(3.8, 22, 8), this.materials.roofCopper);
      needle.position.y = 66;
      towerGroup.add(needle);

      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 1.5), this.materials.gold);
      cross.position.y = 78;
      towerGroup.add(cross);

      return towerGroup;
    };

    group.add(buildSpire(-8, -26));
    group.add(buildSpire(8, -26));

    const roseGeom = new THREE.CylinderGeometry(3.5, 3.5, 0.4, 16);
    roseGeom.rotateX(Math.PI / 2);
    const rose = new THREE.Mesh(roseGeom, this.materials.stainedGlass);
    rose.position.set(0, 22, -26.3);
    group.add(rose);

    // Tall Gothic stained-glass lancet windows along nave sides
    for (let wz = -18; wz <= 18; wz += 9) {
      for (const wx of [-11.15, 11.15]) {
        const lancet = new THREE.Mesh(new THREE.BoxGeometry(0.3, 9.0, 2.2), this.materials.stainedGlass);
        lancet.position.set(wx, 14, wz);
        group.add(lancet);
      }
    }

    this.groups.katedra = group;
    this.landmarksGroup.add(group);
  }

  // 5. Most Groszowy / Most Zielony (Real coords: x = -101, z = 92)
  buildMostGroszowy() {
    const group = new THREE.Group();
    group.position.set(-101, 2.0, 92);
    group.rotation.y = Math.PI * 0.42; // Spans East-West across Kanał Młynówka

    const deck = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.6, 38), this.materials.wood);
    deck.position.y = 2.5;
    group.add(deck);

    const makePortalArch = (z) => {
      const archGroup = new THREE.Group();
      archGroup.position.set(0, 2.5, z);

      const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 6.5), this.materials.ironGreen);
      p1.position.set(-2.9, 3.25, 0);
      const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 6.5), this.materials.ironGreen);
      p2.position.set(2.9, 3.25, 0);

      const archTop = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.22, 6, 12, Math.PI), this.materials.ironGreen);
      archTop.position.set(0, 6.5, 0);

      archGroup.add(p1);
      archGroup.add(p2);
      archGroup.add(archTop);
      return archGroup;
    };

    group.add(makePortalArch(-14));
    group.add(makePortalArch(0));
    group.add(makePortalArch(14));

    for (const side of [-2.9, 2.9]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 38), this.materials.ironGreen);
      rail.position.set(side, 3.3, 0);
      group.add(rail);
    }

    // Bridge lanterns at portal arches
    for (const lz of [-14, 0, 14]) {
      for (const lx of [-2.9, 2.9]) {
        const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), this.materials.floodLamp);
        bulb.position.set(lx, 6.2, lz);
        group.add(bulb);
      }
    }

    this.groups.groszowy = group;
    this.landmarksGroup.add(group);
  }

  // 6. Opolska Wenecja (Canal waterfront along Młynówka: x = -251, z = -174)
  buildOpolskaWenecja() {
    const group = new THREE.Group();
    group.position.set(-251, 3.0, -174);

    const quayWall = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 72), this.materials.stone);
    quayWall.position.set(4, 1.5, 0);
    group.add(quayWall);

    const wenecjaColors = [0xf5cd79, 0xf8a5c2, 0x63cdda, 0xe77f67, 0x778beb];
    for (let i = 0; i < 5; i++) {
      const hMat = new THREE.MeshLambertMaterial({ color: wenecjaColors[i] });
      const house = new THREE.Mesh(new THREE.BoxGeometry(9, 11 + (i % 2) * 2, 13), hMat);
      house.position.set(-2, 6, -26 + i * 13);
      group.add(house);

      // Warm waterfront house windows facing Młynówka canal
      for (const wy of [4.5, 8.5]) {
        for (const wzOff of [-3.2, 3.2]) {
          const wMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.8, 1.5), this.materials.winWarm);
          wMesh.position.set(2.55, wy, -26 + i * 13 + wzOff);
          group.add(wMesh);
        }
      }

      const rGeom = new THREE.ConeGeometry(7.2, 4.5, 4);
      rGeom.rotateY(Math.PI / 4);
      const rMesh = new THREE.Mesh(rGeom, this.materials.terracotta);
      rMesh.position.set(-2, 13.5 + (i % 2) * 2, -26 + i * 13);
      group.add(rMesh);
    }

    this.groups.wenecja = group;
    this.landmarksGroup.add(group);
  }

  // 7. Dworzec Główny PKP (Real coords: x = 199, z = 563)
  buildDworzecGlowny() {
    const group = new THREE.Group();
    group.position.set(199, 7.0, 563);

    const mainHall = new THREE.Mesh(new THREE.BoxGeometry(52, 16, 22), this.materials.sandstone);
    mainHall.position.y = 8;
    group.add(mainHall);

    const tower = new THREE.Mesh(new THREE.BoxGeometry(8, 28, 8), this.materials.brick);
    tower.position.set(0, 14, 11);
    group.add(tower);

    const clock = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.4, 12), this.materials.clockGlow);
    clock.rotateX(Math.PI / 2);
    clock.position.set(0, 24, 15.2);
    group.add(clock);

    // Station facade arched windows
    for (let wx = -20; wx <= 20; wx += 8) {
      if (Math.abs(wx) < 5) continue;
      const win = new THREE.Mesh(new THREE.BoxGeometry(2.6, 5.5, 0.3), this.materials.winWarm);
      win.position.set(wx, 8.5, 11.1);
      group.add(win);
    }

    for (const pz of [-16, -26, -36]) {
      const platform = new THREE.Mesh(new THREE.BoxGeometry(140, 1.2, 6), this.materials.stone);
      platform.position.set(0, 0.6, pz);
      group.add(platform);

      const canopy = new THREE.Mesh(new THREE.BoxGeometry(120, 0.5, 7), this.materials.ironGreen);
      canopy.position.set(0, 5, pz);
      group.add(canopy);

      for (let px = -50; px <= 50; px += 20) {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 4.5), this.materials.ironGreen);
        pillar.position.set(px, 2.5, pz);
        group.add(pillar);
      }
    }

    this.groups.dworzec = group;
    this.landmarksGroup.add(group);
  }

  // 8. Solaris Center (Real coords: x = 191, z = -364)
  buildSolarisCenter() {
    const group = new THREE.Group();
    group.position.set(191, 8.0, -364);

    const mallBody = new THREE.Mesh(new THREE.BoxGeometry(74, 16, 62), this.materials.sandstone);
    mallBody.position.y = 8;
    group.add(mallBody);

    const glassAtrium = new THREE.Mesh(new THREE.BoxGeometry(36, 14, 4), this.materials.glassNight);
    glassAtrium.position.set(0, 8, 31.2);
    group.add(glassAtrium);

    this.groups.solaris = group;
    this.landmarksGroup.add(group);
  }
}
