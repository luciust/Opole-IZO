/**
 * Cinematic Guided POI Camera Tour of Opole.
 * Uses verified EPSG:2180 scene coordinates for all POIs plus a whole-city overview.
 */

import * as THREE from 'three';

export const POI_LOCATIONS = {
  rynek: { name: "Rynek i Ratusz", x: -88, z: -195, mpt: 0.35, azimuth: 205 },
  wieza: { name: "Wieża Piastowska", x: -300, z: -62, mpt: 0.30, azimuth: 160 },
  amfiteatr: { name: "Amfiteatr Tysiąclecia", x: -365, z: -90, mpt: 0.38, azimuth: 190 },
  katedra: { name: "Katedra Świętego Krzyża", x: -234, z: -390, mpt: 0.32, azimuth: 220 },
  wenecja: { name: "Opolska Wenecja", x: -251, z: -174, mpt: 0.28, azimuth: 135 },
  groszowy: { name: "Most Groszowy (Zielony)", x: -101, z: 92, mpt: 0.28, azimuth: 150 },
  dworzec: { name: "Dworzec Opole Główne", x: 199, z: 563, mpt: 0.36, azimuth: 210 },
  solaris: { name: "Solaris & Plac Kopernika", x: 191, z: -364, mpt: 0.35, azimuth: 225 },
  bolko: { name: "Wyspa Bolko i Zoo", x: -58, z: 1227, mpt: 0.65, azimuth: 180 },
  nwk: { name: "Nowa Wieś Królewska", x: 1540, z: 2140, mpt: 0.45, azimuth: 205 },
  cmentarz: { name: "Cmentarz Komunalny Półwieś", x: -3095, z: -513, mpt: 0.55, azimuth: 180 },
  opole: { name: "Całe Opole (14×14 km)", x: 0, z: 400, mpt: 5.5, azimuth: 205 }
};

export class PoiTour {
  constructor(camera) {
    this.camera = camera;
    this.isActive = false;
    this.currentIndex = 0;
    this.poiKeys = Object.keys(POI_LOCATIONS).filter(k => k !== 'opole');
    this.dwellTime = 7.0;
    this.timer = 0.0;
  }

  toggle() {
    this.isActive = !this.isActive;
    if (this.isActive) {
      this.timer = 0;
      this.goToPOI(this.poiKeys[this.currentIndex]);
    }
    return this.isActive;
  }

  stop() {
    this.isActive = false;
  }

  goToPOI(key) {
    const poi = POI_LOCATIONS[key];
    if (!poi) return;

    this.camera.target.x = poi.x;
    this.camera.target.z = poi.z;
    this.camera.targetMpt = poi.mpt;
    if (poi.azimuth !== undefined) {
      this.camera.targetAzimuth = THREE.MathUtils.degToRad(poi.azimuth);
    }
  }

  update(dt) {
    if (!this.isActive) return;

    this.timer += dt;
    this.camera.targetAzimuth += dt * 0.02;

    if (this.timer >= this.dwellTime) {
      this.timer = 0;
      this.currentIndex = (this.currentIndex + 1) % this.poiKeys.length;
      this.goToPOI(this.poiKeys[this.currentIndex]);
    }
  }
}
