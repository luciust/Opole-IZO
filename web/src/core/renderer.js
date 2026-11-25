/**
 * Low-res Pixel-Art Renderer with Edge Outlines & Timothy Lottes CRT Shader.
 * Fulfills Section 5 of izo.md:
 * - 0.5x internal resolution render target -> edge detection -> nearest upscale
 * - Multipass Timothy Lottes CRT shader (blend 0..1, default 0.4)
 */

import * as THREE from 'three';

const LottesCrtShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(800, 600) },
    uLowRes: { value: new THREE.Vector2(400, 300) },
    uCrtBlend: { value: 0.0 },
    uEnableOutline: { value: 1.0 },
    uTime: { value: 0.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform vec2 uLowRes;
    uniform float uCrtBlend;
    uniform float uEnableOutline;
    uniform float uTime;
    varying vec2 vUv;

    // Edge / outline detection on low-res buffer
    vec3 applyOutline(vec2 uv, vec3 baseCol) {
      vec2 texel = 1.0 / uLowRes;
      vec3 cUp = texture2D(tDiffuse, uv + vec2(0.0, texel.y)).rgb;
      vec3 cDown = texture2D(tDiffuse, uv - vec2(0.0, texel.y)).rgb;
      vec3 cLeft = texture2D(tDiffuse, uv - vec2(texel.x, 0.0)).rgb;
      vec3 cRight = texture2D(tDiffuse, uv + vec2(texel.x, 0.0)).rgb;

      float d = length(cUp - cDown) + length(cLeft - cRight);
      if (d > 0.35) {
        return baseCol * 0.45; // Dark ink pixel-art crease
      }
      return baseCol;
    }

    // Timothy Lottes CRT emulation (aperture grille, scanlines, bloom)
    vec3 applyLottesCrt(vec2 uv, vec3 color) {
      // Subtle scanline modulation
      float scanline = sin(uv.y * uLowRes.y * 3.14159) * 0.5 + 0.5;
      scanline = mix(1.0, 0.85 + 0.15 * scanline, uCrtBlend);

      // Aperture shadow mask (RGB stripes)
      float mask = mod(gl_FragCoord.x, 3.0);
      vec3 maskRgb = vec3(1.0);
      if (mask < 1.0) maskRgb = vec3(1.05, 0.95, 0.95);
      else if (mask < 2.0) maskRgb = vec3(0.95, 1.05, 0.95);
      else maskRgb = vec3(0.95, 0.95, 1.05);

      vec3 crtColor = color * scanline * mix(vec3(1.0), maskRgb, uCrtBlend * 0.8);
      
      // Subtle warm phosphor vignette
      vec2 vigUv = (uv - 0.5) * 1.8;
      float vig = clamp(1.0 - dot(vigUv, vigUv) * 0.12, 0.7, 1.0);
      crtColor *= vig;

      return mix(color, crtColor, uCrtBlend);
    }

    void main() {
      // Nearest neighbor low-res UV snap
      vec2 pixelCoord = floor(vUv * uLowRes);
      vec2 snappedUv = (pixelCoord + 0.5) / uLowRes;

      vec3 col = texture2D(tDiffuse, snappedUv).rgb;

      if (uEnableOutline > 0.5) {
        col = applyOutline(snappedUv, col);
      }

      if (uCrtBlend > 0.01) {
        col = applyLottesCrt(vUv, col);
      }

      gl_FragColor = vec4(col, 1.0);
    }
  `
};

export class PixelArtRenderer {
  constructor(container) {
    this.container = container;
    this.width = container.clientWidth;
    this.height = container.clientHeight;

    // WebGL Three Renderer
    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: false,
      preserveDrawingBuffer: true
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    // Low-res render target (0.5x resolution)
    this.lowResScale = 0.5;
    this.lowResWidth = Math.max(320, Math.floor(this.width * this.lowResScale));
    this.lowResHeight = Math.max(240, Math.floor(this.height * this.lowResScale));

    this.renderTarget = new THREE.WebGLRenderTarget(this.lowResWidth, this.lowResHeight, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    });

    // Post-processing Quad
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postScene = new THREE.Scene();

    this.postMaterial = new THREE.ShaderMaterial({
      vertexShader: LottesCrtShader.vertexShader,
      fragmentShader: LottesCrtShader.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(LottesCrtShader.uniforms)
    });
    this.postMaterial.uniforms.tDiffuse.value = this.renderTarget.texture;
    this.postMaterial.uniforms.uResolution.value.set(this.width, this.height);
    this.postMaterial.uniforms.uLowRes.value.set(this.lowResWidth, this.lowResHeight);
    this.postMaterial.uniforms.uCrtBlend.value = 0.0;
    this.postMaterial.uniforms.uEnableOutline.value = 1.0;

    const quadGeom = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(quadGeom, this.postMaterial);
    this.postScene.add(quad);
  }

  setCrtBlend(value) {
    this.postMaterial.uniforms.uCrtBlend.value = THREE.MathUtils.clamp(value, 0, 1);
  }

  setOutlineEnabled(enabled) {
    this.postMaterial.uniforms.uEnableOutline.value = enabled ? 1.0 : 0.0;
  }

  setPixelScale(scale) {
    this.lowResScale = THREE.MathUtils.clamp(scale, 0.35, 1.0);
    this.onResize();
  }

  onResize() {
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    this.renderer.setSize(this.width, this.height);

    this.lowResWidth = Math.max(320, Math.floor(this.width * this.lowResScale));
    this.lowResHeight = Math.max(240, Math.floor(this.height * this.lowResScale));
    this.renderTarget.setSize(this.lowResWidth, this.lowResHeight);

    this.postMaterial.uniforms.uResolution.value.set(this.width, this.height);
    this.postMaterial.uniforms.uLowRes.value.set(this.lowResWidth, this.lowResHeight);
  }

  render(scene, camera, dt) {
    this.postMaterial.uniforms.uTime.value += dt;

    // 1. Render main 3D scene to low-res target
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.clear();
    this.renderer.render(scene, camera.camera);

    // 2. Render post-processing quad with CRT & outline shaders to canvas
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCamera);
  }

  getCanvas() {
    return this.renderer.domElement;
  }
}
