/**
 * Isometric Orthographic Camera for Opole-IZO.
 * Fulfills Section 5 of izo.md:
 * - 30° elevation, free azimuth with snap to 45° multiples
 * - Default view: Real Opole Rynek (-88, -195), azimuth 205°, 0.43 m/texel
 * - Smooth pan, zoom (0.1 to 10.0 m/texel for whole-city view), and rotation
 * - Full WASD + Arrow key panning, Q/E 45° snap rotation
 * - Touch: single-finger drag pan, two-finger pinch zoom, two-finger rotate
 */

import * as THREE from 'three';

export class IsometricCamera {
  constructor(container) {
    this.container = container;

    // Default target: Opole Rynek (Ratusz) in scene coords
    this.target = new THREE.Vector3(-88, 0, -195);
    this.elevation = THREE.MathUtils.degToRad(30.0);
    this.azimuth = THREE.MathUtils.degToRad(205.0);
    this.targetAzimuth = this.azimuth;
    this.mpt = 0.43; // Metres per texel (zoom)
    this.targetMpt = this.mpt;

    this.keysDown = new Set();

    const aspect = container.clientWidth / Math.max(1, container.clientHeight);
    const frustumHeight = container.clientHeight * this.mpt;
    const frustumWidth = frustumHeight * aspect;

    this.camera = new THREE.OrthographicCamera(
      -frustumWidth / 2, frustumWidth / 2,
      frustumHeight / 2, -frustumHeight / 2,
      -5000, 12000
    );

    this.updateCameraTransform();
    this.setupInteraction();
  }

  updateCameraTransform() {
    const dist = 3500;
    const cosElev = Math.cos(this.elevation);
    const sinElev = Math.sin(this.elevation);
    const sinAzim = Math.sin(this.azimuth);
    const cosAzim = Math.cos(this.azimuth);

    const cx = this.target.x + dist * cosElev * sinAzim;
    const cy = this.target.y + dist * sinElev;
    const cz = this.target.z + dist * cosElev * cosAzim;

    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(this.target);

    const aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight);
    const frustumHeight = this.container.clientHeight * this.mpt;
    const frustumWidth = frustumHeight * aspect;

    this.camera.left = -frustumWidth / 2;
    this.camera.right = frustumWidth / 2;
    this.camera.top = frustumHeight / 2;
    this.camera.bottom = -frustumHeight / 2;
    this.camera.updateProjectionMatrix();
  }

  snapToNextAzimuth(direction = 1) {
    const step = THREE.MathUtils.degToRad(45.0);
    const currentSteps = Math.round(this.targetAzimuth / step);
    this.targetAzimuth = (currentSteps + direction) * step;
  }

  setPOI(x, z, zoomMpt = 0.35) {
    this.target.set(x, 0, z);
    this.targetMpt = zoomMpt;
  }

  getCameraDirections() {
    const cosAzim = Math.cos(this.azimuth);
    const sinAzim = Math.sin(this.azimuth);
    return {
      rightX: cosAzim,
      rightZ: -sinAzim,
      forwardX: sinAzim,
      forwardZ: cosAzim
    };
  }

  setupInteraction() {
    let isDragging = false;
    let dragButton = 0;
    let prevMouse = { x: 0, y: 0 };

    this.container.addEventListener('mousedown', (e) => {
      isDragging = true;
      dragButton = e.button;
      prevMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - prevMouse.x;
      const dy = e.clientY - prevMouse.y;
      prevMouse = { x: e.clientX, y: e.clientY };

      if (dragButton === 0) {
        const { rightX, rightZ, forwardX, forwardZ } = this.getCameraDirections();
        const boost = e.shiftKey ? 2.5 : 1.2;
        const panSpeed = this.mpt * boost;
        this.target.x -= (dx * rightX - dy * forwardX) * panSpeed;
        this.target.z -= (dx * rightZ - dy * forwardZ) * panSpeed;
      } else if (dragButton === 2) {
        this.targetAzimuth += dx * 0.006;
      }
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    this.container.addEventListener('contextmenu', (e) => e.preventDefault());

    // Wheel zoom: 0.1 m/px (close pixel art) up to 10.0 m/px (entire 14km city)
    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 1.15 : 0.87;
      this.targetMpt = THREE.MathUtils.clamp(this.targetMpt * zoomFactor, 0.1, 10.0);
    }, { passive: false });

    // Touch Events
    let touchState = null;

    this.container.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        touchState = {
          type: 'pan',
          prevX: e.touches[0].clientX,
          prevY: e.touches[0].clientY
        };
      } else if (e.touches.length === 2) {
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        const angle = Math.atan2(t1.clientY - t0.clientY, t1.clientX - t0.clientX);
        touchState = {
          type: 'pinch',
          initialDist: Math.max(10, dist),
          initialMpt: this.targetMpt,
          prevAngle: angle
        };
      }
    }, { passive: false });

    this.container.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!touchState) return;

      if (touchState.type === 'pan' && e.touches.length === 1) {
        const dx = e.touches[0].clientX - touchState.prevX;
        const dy = e.touches[0].clientY - touchState.prevY;
        touchState.prevX = e.touches[0].clientX;
        touchState.prevY = e.touches[0].clientY;

        const { rightX, rightZ, forwardX, forwardZ } = this.getCameraDirections();
        const panSpeed = this.mpt * 1.5;
        this.target.x -= (dx * rightX - dy * forwardX) * panSpeed;
        this.target.z -= (dx * rightZ - dy * forwardZ) * panSpeed;
      } else if (touchState.type === 'pinch' && e.touches.length === 2) {
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const dist = Math.max(10, Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY));
        const angle = Math.atan2(t1.clientY - t0.clientY, t1.clientX - t0.clientX);

        const scale = touchState.initialDist / dist;
        this.targetMpt = THREE.MathUtils.clamp(touchState.initialMpt * scale, 0.1, 10.0);

        let angleDelta = angle - touchState.prevAngle;
        if (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
        if (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
        this.targetAzimuth += angleDelta;
        touchState.prevAngle = angle;
      }
    }, { passive: false });

    this.container.addEventListener('touchend', (e) => {
      if (e.touches.length === 0) {
        touchState = null;
      } else if (e.touches.length === 1 && touchState && touchState.type === 'pinch') {
        touchState = {
          type: 'pan',
          prevX: e.touches[0].clientX,
          prevY: e.touches[0].clientY
        };
      }
    });

    // Keyboard Navigation (WASD + Arrows pan, Q/E 45° snap rotate)
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      this.keysDown.add(e.key.toLowerCase());

      if (e.key === 'q' || e.key === 'Q') {
        this.snapToNextAzimuth(-1);
      } else if (e.key === 'e' || e.key === 'E') {
        this.snapToNextAzimuth(1);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.key.toLowerCase());
    });

    window.addEventListener('blur', () => {
      this.keysDown.clear();
    });
  }

  update(dt) {
    const { rightX, rightZ, forwardX, forwardZ } = this.getCameraDirections();
    const speedBoost = this.keysDown.has('shift') ? 2.2 : 1.0;
    const panSpeed = this.mpt * 340 * speedBoost * dt;

    let panDx = 0;
    let panDz = 0;

    if (this.keysDown.has('w') || this.keysDown.has('arrowup')) {
      panDx -= forwardX * panSpeed;
      panDz -= forwardZ * panSpeed;
    }
    if (this.keysDown.has('s') || this.keysDown.has('arrowdown')) {
      panDx += forwardX * panSpeed;
      panDz += forwardZ * panSpeed;
    }
    if (this.keysDown.has('a') || this.keysDown.has('arrowleft')) {
      panDx += rightX * panSpeed;
      panDz += rightZ * panSpeed;
    }
    if (this.keysDown.has('d') || this.keysDown.has('arrowright')) {
      panDx -= rightX * panSpeed;
      panDz -= rightZ * panSpeed;
    }

    this.target.x += panDx;
    this.target.z += panDz;

    const lerpSpeed = Math.min(1.0, dt * 10);
    this.azimuth = THREE.MathUtils.lerp(this.azimuth, this.targetAzimuth, lerpSpeed);
    this.mpt = THREE.MathUtils.lerp(this.mpt, this.targetMpt, lerpSpeed);

    // Clamp target within 14x14km bounds (origin-relative: x -6960..7040, z -6360..7640)
    this.target.x = THREE.MathUtils.clamp(this.target.x, -6960, 7040);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -6360, 7640);

    this.updateCameraTransform();
  }

  onResize() {
    this.updateCameraTransform();
  }
}
