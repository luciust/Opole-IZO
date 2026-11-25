/**
 * Dynamic Sun, Sky & Ambient Lighting System.
 * Calculates astronomical sun position based on Opole coordinates (50.6668° N, 17.9237° E),
 * date-driven solar declination, and smooth twilight nightFactor (0.0 = day .. 1.0 = night).
 */

import * as THREE from 'three';

export class SkySun {
  constructor(scene) {
    this.scene = scene;
    this.latRad = THREE.MathUtils.degToRad(50.6668);

    this.sunLight = new THREE.DirectionalLight(0xfff7e6, 1.2);
    this.sunLight.castShadow = false;
    this.scene.add(this.sunLight);

    this.ambientLight = new THREE.AmbientLight(0xdfe6e9, 0.7);
    this.scene.add(this.ambientLight);

    this.timeOfDay = 12.0; // 0 to 24 hours
    this.isNight = false;
    this.nightFactor = 0.0; // Smooth 0..1 ramp across dusk/dawn
    this.updateLighting();
  }

  setTimeOfDay(hours) {
    this.timeOfDay = ((hours % 24) + 24) % 24;
    this.updateLighting();
  }

  updateLighting() {
    const hourAngle = ((this.timeOfDay - 12.0) / 24.0) * Math.PI * 2.0;

    // Date-driven solar declination
    const now = new Date();
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const declinationDeg = -23.44 * Math.cos(2 * Math.PI * (dayOfYear + 10) / 365.25);
    const declination = THREE.MathUtils.degToRad(declinationDeg);

    const sinElevation = Math.sin(this.latRad) * Math.sin(declination) +
                         Math.cos(this.latRad) * Math.cos(declination) * Math.cos(hourAngle);
    const elevation = Math.asin(sinElevation);
    const elevDeg = THREE.MathUtils.radToDeg(elevation);

    const cosAzimuth = (Math.sin(declination) - Math.sin(this.latRad) * sinElevation) /
                       (Math.cos(this.latRad) * Math.cos(elevation));
    const azimuth = Math.acos(THREE.MathUtils.clamp(cosAzimuth, -1.0, 1.0)) * (hourAngle > 0 ? 1 : -1);

    // Smooth dusk/dawn transition between +6° and -4° solar elevation
    this.nightFactor = THREE.MathUtils.clamp((6.0 - elevDeg) / 10.0, 0.0, 1.0);
    this.isNight = elevDeg < 2.0;

    if (elevDeg >= -3.0) {
      const sunDist = 3000;
      const sx = sunDist * Math.cos(elevation) * Math.sin(azimuth);
      const sy = sunDist * Math.sin(elevation);
      const sz = sunDist * Math.cos(elevation) * Math.cos(azimuth);
      this.sunLight.position.set(sx, sy, sz);

      if (elevDeg < 12.0) {
        const t = THREE.MathUtils.clamp((elevDeg + 3.0) / 15.0, 0.0, 1.0);
        this.sunLight.color.setHex(0xf39c12);
        this.sunLight.intensity = 0.25 + t * 0.9;
        this.ambientLight.color.setHex(0x636e72).lerp(new THREE.Color(0x2d3436), 1.0 - t);
        this.ambientLight.intensity = 0.35 + t * 0.25;
      } else {
        this.sunLight.color.setHex(0xfff8e7);
        this.sunLight.intensity = 1.2;
        this.ambientLight.color.setHex(0xecf0f1);
        this.ambientLight.intensity = 0.75;
      }
    } else {
      this.sunLight.position.set(-800, 2000, 800);
      this.sunLight.color.setHex(0x74b9ff);
      this.sunLight.intensity = 0.24;

      this.ambientLight.color.setHex(0x1e272e);
      this.ambientLight.intensity = 0.32;
    }
  }

  update(dt, speedMultiplier = 1.0) {
    if (speedMultiplier > 0) {
      const hoursPerSec = (1.0 / 3600.0) * speedMultiplier;
      this.timeOfDay = (this.timeOfDay + hoursPerSec * dt * 60) % 24;
      this.updateLighting();
    }
  }
}
