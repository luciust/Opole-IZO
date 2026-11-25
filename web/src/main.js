/**
 * Opole-IZO — Isometric Living-City Application Entry Point.
 * Orchestrates rendering, whole-city LOD streaming, environment, landmarks, minimap, and simulations.
 */

import * as THREE from 'three';
import { IsometricCamera } from './core/camera.js';
import { PixelArtRenderer } from './core/renderer.js';
import { TileManager } from './core/tile_manager.js';
import { LandmarksManager } from './landmarks/landmarks_manager.js';
import { SkySun } from './environment/sky_sun.js';
import { WeatherSystem } from './environment/weather.js';
import { StreetLights } from './environment/street_lights.js';
import { TrafficSimulation } from './simulation/traffic.js';
import { PedestrianSimulation } from './simulation/pedestrians.js';
import { TransitSimulation } from './simulation/transit.js';
import { AviationSimulation } from './simulation/aviation.js';
import { EasterEggsSimulation } from './simulation/easter_eggs.js';
import { PoiTour } from './ui/poi_tour.js';
import { ControlPanel } from './ui/panel.js';
import { Minimap } from './ui/minimap.js';

class OpoleIzoApp {
  constructor() {
    this.container = document.getElementById('viewport');
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x76a858);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7);
    this.scene.add(hemiLight);

    // 1. Core Camera & Pixel-Art Post-processing Renderer
    this.isoCamera = new IsometricCamera(this.container);
    this.pixelRenderer = new PixelArtRenderer(this.container);

    // 2. Tile Streaming Manager (Whole-City Far LOD + High-Res Near Streaming)
    this.tileManager = new TileManager(this.scene);

    // 3. Environment: Sky, Sun, Weather & Night Street Lights
    this.skySun = new SkySun(this.scene);
    this.weather = new WeatherSystem(this.scene);
    this.streetLights = new StreetLights(this.scene);

    // 4. Hand-Modelled Architectural Landmarks
    this.landmarks = new LandmarksManager(this.scene);

    // 5. Living Simulation Modules
    this.traffic = new TrafficSimulation(this.scene);
    this.pedestrians = new PedestrianSimulation(this.scene);
    this.transit = new TransitSimulation(this.scene, this.tileManager);
    this.aviation = new AviationSimulation(this.scene);
    this.easterEggs = new EasterEggsSimulation(this.scene);

    // 6. UI, Tours & Interactive Minimap
    this.poiTour = new PoiTour(this.isoCamera);
    this.minimap = new Minimap(this.isoCamera, this.tileManager);
    this.panel = new ControlPanel(this);

    // HUD Elements
    this.hudClock = document.getElementById('hud-clock');
    this.hudWeather = document.getElementById('hud-weather');
    this.hudFps = document.getElementById('hud-fps');

    this.lastTime = performance.now();
    this.frameCount = 0;
    this.fpsTimer = 0;

    this.init();
  }

  async init() {
    window.addEventListener('resize', () => this.onResize());

    // Load static tiles manifest + whole-city overview DTM
    const manifest = await this.tileManager.loadManifest();
    if (manifest) {
      if (manifest.landmarkElevations) {
        this.landmarks.setElevations(manifest.landmarkElevations);
        this.easterEggs.setElevations(manifest.landmarkElevations);
      }
      this.minimap.initFromManifest(manifest);
    }

    // Re-apply seasonal palette if URL hash chose a non-summer season
    if (this.panel && this.panel.season !== 0) {
      this.tileManager.setSeason(this.panel.season);
    }

    requestAnimationFrame((t) => this.tick(t));
  }

  onResize() {
    this.isoCamera.onResize();
    this.pixelRenderer.onResize();
  }

  tick(currentTime) {
    const dt = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    this.frameCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      const fps = Math.round(this.frameCount / this.fpsTimer);
      if (this.hudFps) this.hudFps.textContent = `${fps} FPS`;
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    // 1. Update Camera & Tours
    this.poiTour.update(dt);
    this.isoCamera.update(dt);

    // 2. Update Environment & Sky
    const speed = this.panel ? this.panel.speed : 1.0;
    this.skySun.update(dt, speed);
    this.weather.update(dt, this.isoCamera.target);

    // 3. Stream Near High-Res Tiles & Maintain Whole-City Far LOD
    this.tileManager.update(this.isoCamera.target, dt, this.isoCamera.mpt);

    // 4. Simulation Environment Context
    const env = {
      night: this.skySun.isNight,
      nightFactor: this.skySun.nightFactor,
      timeOfDay: this.skySun.timeOfDay,
      date: new Date(),
      mpt: this.isoCamera.mpt,
      wind: this.weather.wind
    };

    // 5. Update Nighttime Lighting & Simulation Modules
    this.tileManager.setNightFactor(env.nightFactor);
    this.landmarks.update(env);
    this.streetLights.update(env);
    this.traffic.update(dt, env);
    this.pedestrians.update(dt, env);
    this.transit.update(dt, env);
    this.aviation.update(dt, env);
    this.easterEggs.update(dt, env);

    // 6. Update HUD & Minimap
    if (this.hudClock) {
      this.hudClock.textContent = this.panel ? this.panel.formatTime(this.skySun.timeOfDay) : "12:00";
    }
    if (this.hudWeather && this.weather.liveWeather) {
      const temp = this.weather.liveWeather.temperature_2m;
      const wModeName = this.weather.mode === 'auto' ? 'Auto' : this.weather.mode.toUpperCase();
      this.hudWeather.textContent = `${wModeName} ${temp !== undefined ? temp + '°C' : ''}`;
    }
    this.minimap.update();

    // 7. Render
    this.render(dt);

    requestAnimationFrame((t) => this.tick(t));
  }

  render(dt = 0.016) {
    this.pixelRenderer.render(this.scene, this.isoCamera, dt);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new OpoleIzoApp();
});
