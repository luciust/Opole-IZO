/**
 * City-Wide Nighttime Street Lights Layer.
 * Loads lamps.bin (OSM street_lamp nodes + urban road lamps) and renders
 * instanced lantern heads + soft warm roadside light pools during dusk & night.
 */

import * as THREE from 'three';

export class StreetLights {
  constructor(scene, buildId = 'opole_20261125_v3') {
    this.scene = scene;
    this.buildId = buildId;
    this.enabled = true;

    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);

    this.lanternMesh = null;
    this.poolMesh = null;
    this.lanternMat = null;
    this.poolMat = null;

    this.loadLamps();
  }

  createGlowTexture() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
    grad.addColorStop(0.0, 'rgba(255, 224, 140, 0.95)');
    grad.addColorStop(0.35, 'rgba(255, 185, 78, 0.55)');
    grad.addColorStop(0.7, 'rgba(255, 145, 40, 0.16)');
    grad.addColorStop(1.0, 'rgba(255, 130, 20, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  async loadLamps() {
    try {
      const resp = await fetch(`/data/lamps.bin?v=${this.buildId}`);
      if (!resp.ok) return;
      const buf = await resp.arrayBuffer();
      if (buf.byteLength < 4) return;

      const view = new DataView(buf);
      const count = view.getUint32(0, true);
      if (count === 0 || 4 + count * 16 > buf.byteLength) return;

      const data = new Float32Array(buf, 4, count * 4);

      // 1. Elevated glowing lantern heads
      const headGeom = new THREE.BoxGeometry(1.1, 0.7, 1.1);
      this.lanternMat = new THREE.MeshBasicMaterial({
        color: 0xffe49e,
        transparent: true,
        opacity: 0.95
      });
      this.lanternMesh = new THREE.InstancedMesh(headGeom, this.lanternMat, count);

      // 2. Soft oval light pools stretched along the road
      const poolGeom = new THREE.PlaneGeometry(20, 14);
      poolGeom.rotateX(-Math.PI / 2);
      this.poolMat = new THREE.MeshBasicMaterial({
        map: this.createGlowTexture(),
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      this.poolMesh = new THREE.InstancedMesh(poolGeom, this.poolMat, count);

      const dummy = new THREE.Object3D();
      for (let i = 0; i < count; i++) {
        const off = i * 4;
        const x = data[off + 0];
        const y = data[off + 1];
        const z = data[off + 2];
        const yaw = data[off + 3];

        dummy.position.set(x, y + 6.2, z);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        this.lanternMesh.setMatrixAt(i, dummy.matrix);

        dummy.position.set(x, y + 0.45, z);
        dummy.rotation.set(0, yaw, 0);
        dummy.updateMatrix();
        this.poolMesh.setMatrixAt(i, dummy.matrix);
      }

      this.lanternMesh.instanceMatrix.needsUpdate = true;
      this.poolMesh.instanceMatrix.needsUpdate = true;

      this.group.add(this.lanternMesh);
      this.group.add(this.poolMesh);
      console.log(`Opole-IZO: Loaded ${count} street lights`);
    } catch (e) {
      console.warn('Failed to load lamps.bin:', e.message);
    }
  }

  update(env) {
    const nightFactor = env && typeof env.nightFactor === 'number'
      ? env.nightFactor
      : (env && env.night ? 1.0 : 0.0);

    const active = this.enabled && nightFactor > 0.02;
    this.group.visible = active;
    if (!active) return;

    if (this.lanternMat) {
      this.lanternMat.opacity = THREE.MathUtils.clamp(nightFactor, 0.0, 0.95);
    }
    if (this.poolMat) {
      this.poolMat.opacity = 0.52 * nightFactor;
    }
  }
}
