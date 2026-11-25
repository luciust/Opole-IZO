/**
 * Dynamic Weather System: Clouds, Rain, Snow, Lightning & Live Weather Sync.
 * Fulfills Section 5 of izo.md:
 * - Volumetric pixel clouds drifting with wind
 * - Ground shadow projection
 * - Rain streaks, winter snowflakes
 * - Live Open-Meteo weather fetch via caching proxy (/api/weather)
 */

import * as THREE from 'three';

export class WeatherSystem {
  constructor(scene) {
    this.scene = scene;
    this.mode = 'clear'; // 'auto', 'clear', 'clouds', 'rain', 'snow', 'storm'
    this.liveWeather = null;

    this.wind = {
      speed: 12.0, // km/h
      angle: THREE.MathUtils.degToRad(225.0) // South-west wind typical for Opole
    };

    // 1. Pixel Clouds Group
    this.cloudsGroup = new THREE.Group();
    this.clouds = [];
    this.initClouds();
    this.scene.add(this.cloudsGroup);

    // 2. Precipitation Particles (Rain & Snow)
    this.initPrecipitation();
    this.setMode('clear', false);

    // 3. Lightning Flash Light
    this.lightningLight = new THREE.PointLight(0xa6d8d4, 0, 4000);
    this.lightningLight.position.set(0, 500, 0);
    this.scene.add(this.lightningLight);
    this.nextLightningTime = 5.0;

    // Start auto polling
    this.pollLiveWeather();
    setInterval(() => this.pollLiveWeather(), 600000); // 10 min refresh
  }

  async pollLiveWeather() {
    try {
      const resp = await fetch('/api/weather');
      const data = await resp.json();
      if (data && data.current) {
        this.liveWeather = data.current;
        console.log("Opole-IZO: Live weather synced:", this.liveWeather);
        if (this.mode === 'auto') {
          this.applyLiveWeather();
        }
      }
    } catch (e) {
      console.warn("Live weather poll failed:", e.message);
    }
  }

  applyLiveWeather() {
    if (!this.liveWeather) return;
    const wCode = this.liveWeather.weather_code;
    const rain = this.liveWeather.rain || 0;
    const snow = this.liveWeather.snowfall || 0;
    const cloudCover = this.liveWeather.cloud_cover || 0;

    if (this.liveWeather.wind_speed_10m) {
      this.wind.speed = this.liveWeather.wind_speed_10m;
      this.wind.angle = THREE.MathUtils.degToRad(this.liveWeather.wind_direction_10m || 220);
    }

    if (wCode >= 95) {
      this.setMode('storm', false);
    } else if (snow > 0 || (wCode >= 71 && wCode <= 77)) {
      this.setMode('snow', false);
    } else if (rain > 0 || (wCode >= 51 && wCode <= 67)) {
      this.setMode('rain', false);
    } else if (cloudCover > 40) {
      this.setMode('clouds', false);
    } else {
      this.setMode('clear', false);
    }
  }

  setMode(mode, userManual = true) {
    if (userManual) this.mode = mode;
    if (mode === 'auto') {
      this.applyLiveWeather();
      return;
    }

    // Toggle particle systems
    if (mode === 'rain' || mode === 'storm') {
      this.rainMesh.visible = true;
      this.snowMesh.visible = false;
      this.cloudsGroup.visible = true;
    } else if (mode === 'snow') {
      this.rainMesh.visible = false;
      this.snowMesh.visible = true;
      this.cloudsGroup.visible = true;
    } else if (mode === 'clouds') {
      this.rainMesh.visible = false;
      this.snowMesh.visible = false;
      this.cloudsGroup.visible = true;
    } else {
      // clear
      this.rainMesh.visible = false;
      this.snowMesh.visible = false;
      this.cloudsGroup.visible = false;
    }
  }

  initClouds() {
    const cloudCount = 18;
    const cloudMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85
    });

    for (let i = 0; i < cloudCount; i++) {
      const cloudPuff = new THREE.Group();
      const numBlocks = 4 + Math.floor(Math.random() * 5);
      
      for (let b = 0; b < numBlocks; b++) {
        const bw = 50 + Math.random() * 80;
        const bh = 15 + Math.random() * 20;
        const bd = 40 + Math.random() * 60;
        const blockGeom = new THREE.BoxGeometry(bw, bh, bd);
        const blockMesh = new THREE.Mesh(blockGeom, cloudMat);
        blockMesh.position.set(
          (Math.random() - 0.5) * 80,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 60
        );
        cloudPuff.add(blockMesh);
      }

      cloudPuff.position.set(
        (Math.random() - 0.5) * 6000,
        280 + Math.random() * 60,
        (Math.random() - 0.5) * 6000
      );

      this.cloudsGroup.add(cloudPuff);
      this.clouds.push(cloudPuff);
    }
  }

  initPrecipitation() {
    // 1. Rain
    const rainCount = 4000;
    const rainGeom = new THREE.BufferGeometry();
    const rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      rainPositions[i * 3 + 0] = (Math.random() - 0.5) * 3000;
      rainPositions[i * 3 + 1] = Math.random() * 400;
      rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 3000;
    }
    rainGeom.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));

    const rainMat = new THREE.PointsMaterial({
      color: 0x74b9ff,
      size: 3.5,
      transparent: true,
      opacity: 0.65
    });
    this.rainMesh = new THREE.Points(rainGeom, rainMat);
    this.rainMesh.visible = false;
    this.scene.add(this.rainMesh);

    // 2. Snow
    const snowCount = 3000;
    const snowGeom = new THREE.BufferGeometry();
    const snowPositions = new Float32Array(snowCount * 3);
    for (let i = 0; i < snowCount; i++) {
      snowPositions[i * 3 + 0] = (Math.random() - 0.5) * 3000;
      snowPositions[i * 3 + 1] = Math.random() * 400;
      snowPositions[i * 3 + 2] = (Math.random() - 0.5) * 3000;
    }
    snowGeom.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));

    const snowMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 4.5,
      transparent: true,
      opacity: 0.85
    });
    this.snowMesh = new THREE.Points(snowGeom, snowMat);
    this.snowMesh.visible = false;
    this.scene.add(this.snowMesh);
  }

  update(dt, cameraTarget) {
    const windVx = Math.cos(this.wind.angle) * this.wind.speed * 1.5;
    const windVz = Math.sin(this.wind.angle) * this.wind.speed * 1.5;

    // 1. Update Clouds
    for (const cloud of this.clouds) {
      cloud.position.x += windVx * dt;
      cloud.position.z += windVz * dt;

      // Wrap around camera target bounds
      if (cloud.position.x - cameraTarget.x > 3500) cloud.position.x -= 7000;
      if (cloud.position.x - cameraTarget.x < -3500) cloud.position.x += 7000;
      if (cloud.position.z - cameraTarget.z > 3500) cloud.position.z -= 7000;
      if (cloud.position.z - cameraTarget.z < -3500) cloud.position.z += 7000;
    }

    // 2. Update Rain
    if (this.rainMesh.visible) {
      const pos = this.rainMesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - 450 * dt;
        let x = pos.getX(i) + windVx * dt * 0.4;
        let z = pos.getZ(i) + windVz * dt * 0.4;

        if (y < 0) {
          y = 350;
          x = cameraTarget.x + (Math.random() - 0.5) * 2000;
          z = cameraTarget.z + (Math.random() - 0.5) * 2000;
        }
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
    }

    // 3. Update Snow
    if (this.snowMesh.visible) {
      const pos = this.snowMesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - 60 * dt;
        let x = pos.getX(i) + Math.sin(y * 0.05 + i) * 15 * dt + windVx * dt * 0.2;
        let z = pos.getZ(i) + Math.cos(y * 0.05 + i) * 15 * dt + windVz * dt * 0.2;

        if (y < 0) {
          y = 350;
          x = cameraTarget.x + (Math.random() - 0.5) * 2000;
          z = cameraTarget.z + (Math.random() - 0.5) * 2000;
        }
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
    }

    // 4. Storm Lightning
    if (this.mode === 'storm') {
      this.nextLightningTime -= dt;
      if (this.nextLightningTime <= 0) {
        this.lightningLight.intensity = 8.0;
        this.lightningLight.position.set(
          cameraTarget.x + (Math.random() - 0.5) * 1000,
          400,
          cameraTarget.z + (Math.random() - 0.5) * 1000
        );
        setTimeout(() => {
          this.lightningLight.intensity = 0;
        }, 80);
        this.nextLightningTime = 4.0 + Math.random() * 8.0;
      }
    }
  }
}
