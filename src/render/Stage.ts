import {
  AmbientLight,
  BackSide,
  Color,
  DepthTexture,
  DirectionalLight,
  Fog,
  HemisphereLight,
  LinearSRGBColorSpace,
  Mesh,
  MeshNormalMaterial,
  NearestFilter,
  NoToneMapping,
  Object3D,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  UnsignedIntType,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { ComicPass, COMIC_DEFAULTS, type ComicPassSettings } from './ComicPass.ts';
import { PALETTE, color } from './palette.ts';

const SKY_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vWorld = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uBottom;
uniform float uBands;
varying vec3 vWorld;
void main() {
  float h = normalize(vWorld).y * 0.5 + 0.5;
  // Quantised so the sky is printed in flat bands, not a smooth gradient.
  float q = floor(h * uBands) / max(uBands - 1.0, 1.0);
  gl_FragColor = vec4(mix(uBottom, uTop, clamp(q, 0.0, 1.0)), 1.0);
  #include <colorspace_fragment>
}
`;

export interface SkySettings {
  top: number;
  bottom: number;
  bands: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  sunDirection: Vector3;
  sunIntensity: number;
  ambientIntensity: number;
}

export const DEFAULT_SKY: SkySettings = {
  top: PALETTE.sky,
  bottom: PALETTE.paper,
  bands: 5,
  fogColor: PALETTE.snowShadow,
  fogNear: 22,
  fogFar: 160,
  sunDirection: new Vector3(-0.5, 0.85, 0.32),
  sunIntensity: 2.1,
  ambientIntensity: 0.55,
};

/**
 * Owns the WebGL context, the two off-screen buffers the ink pass eats, and
 * the lighting rig. Everything that draws goes through here.
 */
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly comic = new ComicPass();
  readonly sun: DirectionalLight;
  readonly ambient: AmbientLight;
  readonly hemi: HemisphereLight;

  /** Objects hidden during the normal pre-pass (sky, view model, sprites). */
  readonly skipNormals: Object3D[] = [];

  #colorRT!: WebGLRenderTarget;
  #normalRT!: WebGLRenderTarget;
  #depth!: DepthTexture;
  readonly #normalMaterial = new MeshNormalMaterial();
  readonly #sky: Mesh;
  readonly #skyMaterial: ShaderMaterial;
  #width = 1;
  #height = 1;
  #pixelRatio = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.autoClear = true;

    this.camera = new PerspectiveCamera(72, 1, 0.08, 400);

    this.#skyMaterial = new ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new Color(DEFAULT_SKY.top) },
        uBottom: { value: new Color(DEFAULT_SKY.bottom) },
        uBands: { value: DEFAULT_SKY.bands },
      },
    });
    this.#sky = new Mesh(new SphereGeometry(300, 24, 16), this.#skyMaterial);
    this.#sky.frustumCulled = false;
    this.#sky.renderOrder = -1000;
    this.scene.add(this.#sky);
    this.skipNormals.push(this.#sky);

    this.sun = new DirectionalLight(0xffffff, DEFAULT_SKY.sunIntensity);
    this.sun.position.copy(DEFAULT_SKY.sunDirection).multiplyScalar(60);
    this.scene.add(this.sun, this.sun.target);

    this.hemi = new HemisphereLight(PALETTE.sky, PALETTE.snowShadow, 0.7);
    this.ambient = new AmbientLight(0xffffff, DEFAULT_SKY.ambientIntensity);
    this.scene.add(this.hemi, this.ambient);

    this.scene.fog = new Fog(DEFAULT_SKY.fogColor, DEFAULT_SKY.fogNear, DEFAULT_SKY.fogFar);

    this.comic.setInk(PALETTE.ink, PALETTE.paper);
    this.comic.setCameraRange(this.camera.near, this.camera.far);

    this.#createTargets(1, 1);
  }

  applySky(settings: Partial<SkySettings>): void {
    const s = { ...DEFAULT_SKY, ...settings };
    (this.#skyMaterial.uniforms.uTop!.value as Color).set(s.top);
    (this.#skyMaterial.uniforms.uBottom!.value as Color).set(s.bottom);
    this.#skyMaterial.uniforms.uBands!.value = s.bands;

    this.sun.intensity = s.sunIntensity;
    this.sun.position.copy(s.sunDirection).normalize().multiplyScalar(60);
    this.ambient.intensity = s.ambientIntensity;

    const fog = this.scene.fog as Fog;
    fog.color.copy(color(s.fogColor));
    fog.near = s.fogNear;
    fog.far = s.fogFar;
    this.renderer.setClearColor(fog.color, 1);
  }

  applyComic(settings: Partial<ComicPassSettings>): void {
    this.comic.apply(settings);
  }

  resetComic(): void {
    this.comic.apply(COMIC_DEFAULTS);
  }

  #createTargets(width: number, height: number): void {
    this.#colorRT?.dispose();
    this.#normalRT?.dispose();
    this.#depth?.dispose();

    this.#depth = new DepthTexture(width, height);
    this.#depth.type = UnsignedIntType;
    this.#depth.minFilter = NearestFilter;
    this.#depth.magFilter = NearestFilter;

    this.#colorRT = new WebGLRenderTarget(width, height, {
      depthBuffer: true,
      depthTexture: this.#depth,
    });
    this.#colorRT.texture.colorSpace = LinearSRGBColorSpace;
    this.#colorRT.texture.minFilter = NearestFilter;
    this.#colorRT.texture.magFilter = NearestFilter;

    this.#normalRT = new WebGLRenderTarget(width, height, { depthBuffer: true });
    this.#normalRT.texture.colorSpace = LinearSRGBColorSpace;
    this.#normalRT.texture.minFilter = NearestFilter;
    this.#normalRT.texture.magFilter = NearestFilter;

    this.comic.setInputs(this.#colorRT.texture, this.#normalRT.texture, this.#depth);
    this.comic.setSize(width, height);
  }

  setSize(cssWidth: number, cssHeight: number, pixelRatio: number): void {
    this.#pixelRatio = pixelRatio;
    this.#width = Math.max(1, Math.floor(cssWidth * pixelRatio));
    this.#height = Math.max(1, Math.floor(cssHeight * pixelRatio));

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(cssWidth, cssHeight, false);

    this.camera.aspect = cssWidth / cssHeight;
    this.camera.updateProjectionMatrix();

    this.#createTargets(this.#width, this.#height);
  }

  get pixelRatio(): number {
    return this.#pixelRatio;
  }

  #snapshot: {
    color: WebGLRenderTarget;
    normal: WebGLRenderTarget;
    out: WebGLRenderTarget;
    depth: DepthTexture;
    width: number;
    height: number;
  } | null = null;

  /**
   * Renders the world from an arbitrary camera through the full comic pipeline
   * and reads it back as pixels. This is what fills the inset panels: they show
   * the real scene, drawn the same way, frozen at the instant it happened —
   * exactly the trick the albums play when they cut to a close-up.
   *
   * It stalls the GPU, so it is only ever called on a discrete event.
   */
  snapshot(camera: PerspectiveCamera, width: number, height: number): ImageData | null {
    if (
      this.#snapshot === null ||
      this.#snapshot.width !== width ||
      this.#snapshot.height !== height
    ) {
      this.#snapshot?.color.dispose();
      this.#snapshot?.normal.dispose();
      this.#snapshot?.out.dispose();
      this.#snapshot?.depth.dispose();

      const depth = new DepthTexture(width, height);
      depth.type = UnsignedIntType;
      depth.minFilter = NearestFilter;
      depth.magFilter = NearestFilter;

      const color = new WebGLRenderTarget(width, height, {
        depthBuffer: true,
        depthTexture: depth,
      });
      color.texture.colorSpace = LinearSRGBColorSpace;
      const normal = new WebGLRenderTarget(width, height, { depthBuffer: true });
      normal.texture.colorSpace = LinearSRGBColorSpace;
      const out = new WebGLRenderTarget(width, height);
      out.texture.colorSpace = SRGBColorSpace;

      this.#snapshot = { color, normal, out, depth, width, height };
    }

    const snap = this.#snapshot;
    const previousAspect = camera.aspect;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    this.#sky.position.copy(camera.position);

    this.renderer.setRenderTarget(snap.color);
    this.renderer.clear();
    this.renderer.render(this.scene, camera);

    for (const o of this.skipNormals) o.visible = false;
    const previousFog = this.scene.fog;
    this.scene.fog = null;
    this.scene.overrideMaterial = this.#normalMaterial;
    this.renderer.setRenderTarget(snap.normal);
    this.renderer.clear();
    this.renderer.render(this.scene, camera);
    this.scene.overrideMaterial = null;
    this.scene.fog = previousFog;
    for (const o of this.skipNormals) o.visible = true;

    this.comic.setInputs(snap.color.texture, snap.normal.texture, snap.depth);
    this.comic.setSize(width, height);
    this.comic.render(this.renderer, snap.out);

    const pixels = new Uint8Array(width * height * 4);
    this.renderer.readRenderTargetPixels(snap.out, 0, 0, width, height, pixels);

    // Restore the live pipeline before anything else draws.
    this.comic.setInputs(this.#colorRT.texture, this.#normalRT.texture, this.#depth);
    this.comic.setSize(this.#width, this.#height);
    this.renderer.setRenderTarget(null);
    camera.aspect = previousAspect;
    camera.updateProjectionMatrix();

    // WebGL reads bottom-up; canvases are top-down.
    const flipped = new Uint8ClampedArray(width * height * 4);
    const stride = width * 4;
    for (let y = 0; y < height; y++) {
      flipped.set(pixels.subarray((height - 1 - y) * stride, (height - y) * stride), y * stride);
    }
    return new ImageData(flipped, width, height);
  }

  render(dt: number): void {
    this.comic.update(dt);
    this.#sky.position.copy(this.camera.position);

    // Pass 1 — flat toon colour, with depth we keep for the ink pass.
    this.renderer.setRenderTarget(this.#colorRT);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    // Pass 2 — view-space normals, for the creases depth alone can't see.
    for (const o of this.skipNormals) o.visible = false;
    const previousFog = this.scene.fog;
    this.scene.fog = null;
    this.scene.overrideMaterial = this.#normalMaterial;
    this.renderer.setRenderTarget(this.#normalRT);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = null;
    this.scene.fog = previousFog;
    for (const o of this.skipNormals) o.visible = true;

    // Pass 3 — ink, halftone, paper.
    this.comic.render(this.renderer);
  }

  dispose(): void {
    this.#colorRT.dispose();
    this.#normalRT.dispose();
    this.#depth.dispose();
    this.comic.dispose();
    this.#sky.geometry.dispose();
    this.#skyMaterial.dispose();
    this.#normalMaterial.dispose();
    this.renderer.dispose();
  }
}
