/**
 * Control Panel, Settings, Keyboard Shortcuts (T, P, U) & URL Hash Synchronization.
 */

export class ControlPanel {
  constructor(app) {
    this.app = app;
    this.panel = document.getElementById('sim-panel');
    this.isOpen = true;

    this.speed = 1.0;
    this.season = 0;
    this.weatherMode = 'clear';
    this.pixelScale = 0.5;

    this.initDOM();
    this.initShortcuts();
    this.readUrlHash();
  }

  initShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === 't') {
        const active = this.app.poiTour.toggle();
        document.getElementById('btn-tour')?.classList.toggle('active', active);
      } else if (k === 'p') {
        this.takeScreenshot();
      } else if (k === 'u') {
        this.togglePanel();
      }
    });
  }

  initDOM() {
    const toggleBtn = document.getElementById('btn-panel-toggle');
    const closeBtn = document.getElementById('btn-panel-close');
    toggleBtn?.addEventListener('click', () => this.togglePanel());
    closeBtn?.addEventListener('click', () => this.togglePanel(false));

    // Time Slider
    const timeSlider = document.getElementById('time-slider');
    const timeVal = document.getElementById('time-val');
    timeSlider?.addEventListener('input', (e) => {
      const h = parseFloat(e.target.value);
      this.app.skySun.setTimeOfDay(h);
      if (timeVal) timeVal.textContent = this.formatTime(h);
      this.syncUrlHash();
    });

    // Speed Buttons
    const speedBtns = document.querySelectorAll('.speed-btn');
    speedBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        speedBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.speed = parseFloat(btn.dataset.speed);
        this.syncUrlHash();
      });
    });

    // Season Buttons
    const seasonBtns = document.querySelectorAll('.season-btn');
    seasonBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        seasonBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.season = parseInt(btn.dataset.season, 10);
        this.app.tileManager.setSeason(this.season);
        this.syncUrlHash();
      });
    });

    // Weather Buttons
    const weatherBtns = document.querySelectorAll('.weather-btn');
    weatherBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        weatherBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.weatherMode = btn.dataset.weather;
        this.app.weather.setMode(this.weatherMode, true);
        this.syncUrlHash();
      });
    });

    // Life Layers Toggles
    document.getElementById('toggle-buses')?.addEventListener('change', (e) => {
      this.app.transit.enabledBuses = e.target.checked;
      this.syncUrlHash();
    });
    document.getElementById('toggle-traffic')?.addEventListener('change', (e) => {
      this.app.traffic.enabled = e.target.checked;
      this.syncUrlHash();
    });
    document.getElementById('toggle-pedestrians')?.addEventListener('change', (e) => {
      this.app.pedestrians.enabled = e.target.checked;
      this.syncUrlHash();
    });
    document.getElementById('toggle-trains')?.addEventListener('change', (e) => {
      this.app.transit.enabledTrains = e.target.checked;
      this.syncUrlHash();
    });
    document.getElementById('toggle-aviation')?.addEventListener('change', (e) => {
      this.app.aviation.enabled = e.target.checked;
      this.syncUrlHash();
    });
    document.getElementById('toggle-nightlights')?.addEventListener('change', (e) => {
      this.app.streetLights.enabled = e.target.checked;
      this.app.tileManager.windowLightsEnabled = e.target.checked;
      this.syncUrlHash();
    });

    // Graphics Toggles (Resolution Scale, CRT & Outline)
    const resBtns = document.querySelectorAll('.res-btn');
    resBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        resBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.pixelScale = parseFloat(btn.dataset.scale);
        this.app.pixelRenderer.setPixelScale(this.pixelScale);
        this.syncUrlHash();
      });
    });

    const toggleCrt = document.getElementById('toggle-crt');
    const crtSlider = document.getElementById('crt-slider');
    const crtVal = document.getElementById('crt-val');
    toggleCrt?.addEventListener('change', (e) => {
      const blend = e.target.checked ? (crtSlider ? parseFloat(crtSlider.value) : 0.4) : 0;
      this.app.pixelRenderer.setCrtBlend(blend);
      this.syncUrlHash();
    });
    crtSlider?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (crtVal) crtVal.textContent = Math.round(val * 100) + '%';
      if (toggleCrt?.checked) {
        this.app.pixelRenderer.setCrtBlend(val);
      }
      this.syncUrlHash();
    });
    document.getElementById('toggle-outline')?.addEventListener('change', (e) => {
      this.app.pixelRenderer.setOutlineEnabled(e.target.checked);
      this.syncUrlHash();
    });

    // Rotate Buttons
    document.getElementById('btn-rotate-left')?.addEventListener('click', () => {
      this.app.isoCamera.snapToNextAzimuth(-1);
    });
    document.getElementById('btn-rotate-right')?.addEventListener('click', () => {
      this.app.isoCamera.snapToNextAzimuth(1);
    });

    // POI Tour Button
    const tourBtn = document.getElementById('btn-tour');
    tourBtn?.addEventListener('click', () => {
      const active = this.app.poiTour.toggle();
      tourBtn.classList.toggle('active', active);
    });

    // Photo / Screenshot Button
    document.getElementById('btn-photo')?.addEventListener('click', () => {
      this.takeScreenshot();
    });

    // Copy Link Button
    document.getElementById('btn-copy-link')?.addEventListener('click', () => {
      this.syncUrlHash();
      navigator.clipboard.writeText(window.location.href).then(() => {
        const btn = document.getElementById('btn-copy-link');
        const origText = btn.textContent;
        btn.textContent = "Skopiowano do schowka!";
        setTimeout(() => btn.textContent = origText, 2000);
      });
    });

    // About Modal
    const aboutModal = document.getElementById('about-modal');
    document.getElementById('open-about')?.addEventListener('click', (e) => {
      e.preventDefault();
      aboutModal?.classList.remove('modal-hidden');
    });
    document.getElementById('close-about')?.addEventListener('click', () => {
      aboutModal?.classList.add('modal-hidden');
    });
    aboutModal?.addEventListener('click', (e) => {
      if (e.target === aboutModal) aboutModal.classList.add('modal-hidden');
    });

    // POI Ribbon Buttons
    document.querySelectorAll('.poi-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const poiKey = btn.dataset.poi;
        this.app.poiTour.stop();
        document.getElementById('btn-tour')?.classList.remove('active');
        this.app.poiTour.goToPOI(poiKey);
      });
    });
  }

  togglePanel(forceState) {
    this.isOpen = forceState !== undefined ? forceState : !this.isOpen;
    this.panel?.classList.toggle('panel-closed', !this.isOpen);
    document.getElementById('btn-panel-toggle')?.classList.toggle('active', this.isOpen);
  }

  formatTime(h) {
    const hours = Math.floor(h);
    const mins = Math.floor((h - hours) * 60);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  takeScreenshot() {
    this.app.render();
    const canvas = this.app.pixelRenderer.getCanvas();
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `opole-izo-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  }

  syncUrlHash() {
    const cam = this.app.isoCamera;
    const params = new URLSearchParams();

    params.set('time', this.app.skySun.timeOfDay.toFixed(1));
    if (this.speed !== 1.0) params.set('speed', this.speed);
    if (this.season !== 0) params.set('season', this.season);
    if (this.weatherMode !== 'clear') params.set('weather', this.weatherMode);
    if (this.pixelScale !== 0.5) params.set('res', this.pixelScale);

    params.set('x', Math.round(cam.target.x));
    params.set('z', Math.round(cam.target.z));
    params.set('mpt', cam.mpt.toFixed(2));
    params.set('azim', Math.round(cam.azimuth * 180 / Math.PI));

    window.history.replaceState(null, '', `#${params.toString()}`);
  }

  readUrlHash() {
    if (!window.location.hash || window.location.hash.length < 2) return;
    try {
      const params = new URLSearchParams(window.location.hash.substring(1));
      if (params.has('time')) {
        const t = parseFloat(params.get('time'));
        this.app.skySun.setTimeOfDay(t);
        const slider = document.getElementById('time-slider');
        if (slider) slider.value = t;
        const val = document.getElementById('time-val');
        if (val) val.textContent = this.formatTime(t);
      }
      if (params.has('season')) {
        const s = parseInt(params.get('season'), 10);
        this.season = s;
        this.app.tileManager.setSeason(s);
        document.querySelectorAll('.season-btn').forEach(b => {
          b.classList.toggle('active', parseInt(b.dataset.season, 10) === s);
        });
      }
      if (params.has('weather')) {
        const w = params.get('weather');
        this.weatherMode = w;
        this.app.weather.setMode(w, true);
        document.querySelectorAll('.weather-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.weather === w);
        });
      }
      if (params.has('res')) {
        const sc = parseFloat(params.get('res'));
        this.pixelScale = sc;
        this.app.pixelRenderer.setPixelScale(sc);
        document.querySelectorAll('.res-btn').forEach(b => {
          b.classList.toggle('active', Math.abs(parseFloat(b.dataset.scale) - sc) < 0.01);
        });
      }
      if (params.has('x') && params.has('z')) {
        this.app.isoCamera.target.x = parseFloat(params.get('x'));
        this.app.isoCamera.target.z = parseFloat(params.get('z'));
      }
      if (params.has('mpt')) {
        this.app.isoCamera.targetMpt = parseFloat(params.get('mpt'));
        this.app.isoCamera.mpt = this.app.isoCamera.targetMpt;
      }
      if (params.has('azim')) {
        this.app.isoCamera.targetAzimuth = parseFloat(params.get('azim')) * Math.PI / 180;
        this.app.isoCamera.azimuth = this.app.isoCamera.targetAzimuth;
      }
    } catch (e) {
      console.warn("Failed parsing URL hash:", e);
    }
  }
}
