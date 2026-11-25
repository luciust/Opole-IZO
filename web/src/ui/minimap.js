/**
 * Interactive 14x14 City Minimap Overlay.
 * Composites the 128x128 tile overview thumbnails onto an offscreen canvas,
 * draws the live camera viewport & azimuth indicator, and supports click/drag teleportation.
 */

export class Minimap {
  constructor(camera, tileManager) {
    this.camera = camera;
    this.tileManager = tileManager;
    this.canvas = document.getElementById('hud-minimap-canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

    this.size = 154; // 14 tiles * 11 px
    this.bgCanvas = document.createElement('canvas');
    this.bgCanvas.width = this.size;
    this.bgCanvas.height = this.size;
    this.bgCtx = this.bgCanvas.getContext('2d');
    this.bgCtx.fillStyle = '#3d5a34';
    this.bgCtx.fillRect(0, 0, this.size, this.size);

    // Scene world bounds matching config.py:
    // X: -6960 .. +7040 (width 14000), Z: -6360 .. +7640 (height 14000)
    this.minX = -6960;
    this.minZ = -6360;
    this.worldSpan = 14000;

    this.setupInteraction();
  }

  initFromManifest(manifest) {
    if (!manifest || !manifest.tiles) return;
    const cell = this.size / 14;
    const buildId = manifest.buildId || this.tileManager.buildId;

    for (const t of manifest.tiles) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // ty=0 is south (bottom), ty=13 is north (top)
        const px = t.tx * cell;
        const py = (13 - t.ty) * cell;
        this.bgCtx.drawImage(img, px, py, cell, cell);
      };
      img.src = `/data/tiles/${t.name}_s.png?v=${buildId}`;
    }
  }

  setupInteraction() {
    if (!this.canvas) return;
    let dragging = false;

    const jumpToPointer = (clientX, clientY) => {
      const rect = this.canvas.getBoundingClientRect();
      const u = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const v = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      this.camera.target.x = this.minX + u * this.worldSpan;
      this.camera.target.z = this.minZ + v * this.worldSpan;
    };

    this.canvas.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      dragging = true;
      jumpToPointer(e.clientX, e.clientY);
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      jumpToPointer(e.clientX, e.clientY);
    });

    window.addEventListener('mouseup', () => {
      dragging = false;
    });
  }

  update() {
    if (!this.ctx) return;

    // Draw pre-composited 14x14 city overview
    this.ctx.drawImage(this.bgCanvas, 0, 0, this.size, this.size);

    // Camera target marker
    const u = (this.camera.target.x - this.minX) / this.worldSpan;
    const v = (this.camera.target.z - this.minZ) / this.worldSpan;
    const cx = u * this.size;
    const cy = v * this.size;

    // Approximate orthographic viewport extent on minimap
    const vpW = Math.max(6, (this.camera.camera.right - this.camera.camera.left) / this.worldSpan * this.size);
    const vpH = Math.max(6, (this.camera.camera.top - this.camera.camera.bottom) / this.worldSpan * this.size);

    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.strokeStyle = '#f5cd79';
    this.ctx.lineWidth = 1.5;
    this.ctx.strokeRect(-vpW * 0.5, -vpH * 0.5, vpW, vpH);

    // Camera look direction dot + arrow
    const dirX = -Math.sin(this.camera.azimuth);
    const dirY = -Math.cos(this.camera.azimuth);
    this.ctx.beginPath();
    this.ctx.moveTo(0, 0);
    this.ctx.lineTo(dirX * 10, dirY * 10);
    this.ctx.strokeStyle = '#00d2d3';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    this.ctx.fillStyle = '#ea2027';
    this.ctx.fillRect(-2, -2, 4, 4);
    this.ctx.restore();
  }
}
