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
  PCFShadowMap,
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

/** Half-width of the shadow frustum, in metres, centred on the player. */
const SHADOW_EXTENT = 42;

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

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec3 dir = normalize(vWorld);
  float h = clamp(dir.y, 0.0, 1.0);

  // Most of the interest belongs near the horizon; a linear ramp puts it in
  // the wrong half of the sky and reads as a cheap gradient.
  float t = pow(h, 0.62);

  // Quantised into flat printed bands, with a dithered edge so the band
  // boundary looks like screen-printing rather than a shader step.
  float scaled = t * uBands;
  float grain = (hash21(dir.xz * 220.0) - 0.5) * 0.22;
  float q = floor(scaled + grain) / max(uBands - 1.0, 1.0);

  vec3 sky = mix(uBottom, uTop, clamp(q, 0.0, 1.0));

  // A pale band sitting right on the horizon separates sky from snow. Without
  // it both read at the same value and the world loses its horizon entirely.
  float glow = smoothstep(0.20, 0.0, abs(dir.y - 0.03));
  sky = mix(sky, uBottom * 1.06, glow * 0.75);

  gl_FragColor = vec4(sky, 1.0);
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
  top: 0x6d94b8,
  bottom: 0xd9e4ee,
  bands: 6,
  fogColor: 0xaebfd0,
  fogNear: 40,
  fogFar: 190,
  // A low, raking sun. High noon flattens everything; a 30° key throws the
  // long hard shadows that do the modelling in a cel-shaded frame.
  sunDirection: new Vector3(-0.62, 0.5, 0.42),
  // Around 1.0 on the key: MeshToonMaterial multiplies albedo by the ramp and
  // the light, so anything much above 1 clips every lit surface to white and
  // the top two ramp steps become indistinguishable.
  sunIntensity: 1.35,
  ambientIntensity: 0.1,
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

  readonly #sunDirection = new Vector3().copy(DEFAULT_SKY.sunDirection).normalize();

  /**
   * Slides the shadow frustum to sit around the player. A 90-metre box over the
   * whole level would give roughly one shadow texel per 4 cm — enough to lose a
   * door frame's shadow entirely.
   */
  focusShadows(target: Vector3): void {
    this.sun.target.position.copy(target);
    this.sun.target.updateMatrixWorld();
    this.sun.position.copy(target).addScaledVector(this.#sunDirection, 90);
    this.sun.updateMatrixWorld();
  }

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

    // Hard cel shadows. PCF (not PCFSoft) keeps the edge crisp enough to read
    // as a drawn shape; the shadow camera is kept small and follows the player,
    // so texel density stays high instead of smearing over the whole valley.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;

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

    this.sun = new DirectionalLight(0xfff4e2, DEFAULT_SKY.sunIntensity);
    this.sun.position.copy(DEFAULT_SKY.sunDirection).multiplyScalar(60);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const extent = SHADOW_EXTENT;
    this.sun.shadow.camera.left = -extent;
    this.sun.shadow.camera.right = extent;
    this.sun.shadow.camera.top = extent;
    this.sun.shadow.camera.bottom = -extent;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 220;
    // Three never recomputes this for us: without it the shadow camera keeps
    // its default ±5 m frustum and the map covers a single doorway.
    this.sun.shadow.camera.updateProjectionMatrix();
    // Boxes meeting at right angles acne badly without a normal bias; the
    // negative depth bias then pulls contact shadows back against their object.
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target);

    // Sky fill only — cool from above, bounced warm from the snow. Kept low:
    // this is the light that destroys the toon ramp if you let it grow.
    // Enough sky fill that shaded rock keeps its texture instead of going to a
    // black mass, but not so much that the toon ramp loses its second step.
    this.hemi = new HemisphereLight(0x8fb4d8, 0xa8927a, 0.42);
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
    this.#sunDirection.copy(s.sunDirection).normalize();
    this.sun.position.copy(this.#sunDirection).multiplyScalar(90);
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
    this.renderer.shadowMap.needsUpdate = true;

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
    // The shadow map is refreshed once here; leaving autoUpdate on would make
    // the normal pass re-render every caster a second time for nothing.
    this.renderer.shadowMap.needsUpdate = true;
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
