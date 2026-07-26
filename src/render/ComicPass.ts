import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  OrthographicCamera,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { color } from './palette.ts';

/**
 * The whole comic-book look lives in this one full-screen pass.
 *
 * It takes the flat toon-shaded colour buffer plus a view-space normal buffer
 * and its depth, then:
 *   1. runs a Sobel over depth *and* normals to find the ink lines — depth
 *      catches silhouettes, normals catch interior creases a depth edge misses;
 *   2. wobbles the sample offsets on a stepped clock so the line "boils" like
 *      hand-inked animation instead of sitting perfectly still;
 *   3. drops a rotated halftone grid into the shadows;
 *   4. lays paper grain over everything.
 */
const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <packing>

uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2  uTexel;
uniform vec2  uResolution;
uniform float uNear;
uniform float uFar;
uniform float uThickness;
uniform float uDepthEdge;
uniform float uNormalEdge;
uniform vec3  uInk;
uniform vec3  uPaper;
uniform float uBoil;
uniform float uTimeStep;
uniform float uHalftone;
uniform float uGrain;
uniform float uVignette;
uniform float uDesat;
uniform float uShadeEdge;
uniform float uShadeEdgeStrength;

varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float linearDepth(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  if (d >= 1.0) return 1.0;
  float viewZ = perspectiveDepthToViewZ(d, uNear, uFar);
  return viewZToOrthographicDepth(viewZ, uNear, uFar);
}

vec3 viewNormal(vec2 uv) {
  return normalize(texture2D(tNormal, uv).xyz * 2.0 - 1.0);
}

void main() {
  // Stepped clock: the ink only redraws a few times a second, which is what
  // sells "someone inked this" rather than "a shader drew this".
  vec2 boil = vec2(
    hash21(floor(vUv * uResolution * 0.25) + uTimeStep),
    hash21(floor(vUv * uResolution * 0.25) + uTimeStep + 17.0)
  ) - 0.5;

  vec2 off = uTexel * uThickness + uTexel * boil * uBoil;

  float dC = linearDepth(vUv);
  float dL = linearDepth(vUv - vec2(off.x, 0.0));
  float dR = linearDepth(vUv + vec2(off.x, 0.0));
  float dU = linearDepth(vUv + vec2(0.0, off.y));
  float dD = linearDepth(vUv - vec2(0.0, off.y));

  // Normalising by depth keeps distant geometry from turning into a solid
  // black mass, and keeps near silhouettes from washing out.
  float depthDiff = (abs(dC - dL) + abs(dC - dR) + abs(dC - dU) + abs(dC - dD));
  float depthEdge = step(uDepthEdge * (0.05 + dC * 2.5), depthDiff);

  vec3 nC = viewNormal(vUv);
  vec3 nL = viewNormal(vUv - vec2(off.x, 0.0));
  vec3 nR = viewNormal(vUv + vec2(off.x, 0.0));
  vec3 nU = viewNormal(vUv + vec2(0.0, off.y));
  vec3 nD = viewNormal(vUv - vec2(0.0, off.y));

  float normalDiff =
      (1.0 - dot(nC, nL)) + (1.0 - dot(nC, nR)) +
      (1.0 - dot(nC, nU)) + (1.0 - dot(nC, nD));
  // Interior creases are suppressed with distance — far-away detail would
  // otherwise alias into a shimmering mess.
  float normalEdge = step(uNormalEdge, normalDiff) * (1.0 - smoothstep(0.05, 0.55, dC));

  float edge = clamp(max(depthEdge, normalEdge), 0.0, 1.0);
  // Sky never gets outlined against itself.
  edge *= step(dC, 0.9995);

  vec3 base = texture2D(tColor, vUv).rgb;

  float luma = dot(base, vec3(0.2126, 0.7152, 0.0722));
  base = mix(vec3(luma), base, uDesat);

  // Shadow-terminator ink. An album inks the boundary between lit and shaded
  // sides of a form, not only its silhouette — and because the toon ramp makes
  // that boundary a hard step, a luminance Sobel finds it exactly.
  float lL = dot(texture2D(tColor, vUv - vec2(off.x, 0.0)).rgb, vec3(0.2126, 0.7152, 0.0722));
  float lR = dot(texture2D(tColor, vUv + vec2(off.x, 0.0)).rgb, vec3(0.2126, 0.7152, 0.0722));
  float lU = dot(texture2D(tColor, vUv + vec2(0.0, off.y)).rgb, vec3(0.2126, 0.7152, 0.0722));
  float lD = dot(texture2D(tColor, vUv - vec2(0.0, off.y)).rgb, vec3(0.2126, 0.7152, 0.0722));
  float lumaDiff = abs(luma - lL) + abs(luma - lR) + abs(luma - lU) + abs(luma - lD);
  float shadeEdge = step(uShadeEdge, lumaDiff) * step(dC, 0.9995) * uShadeEdgeStrength;

  // Halftone: a rotated dot grid that only bites in the *darkest* tones, the
  // way a printer builds up shadow. Letting it creep into the midtones puts a
  // grey mush over the whole frame, which is worse than having none at all.
  float ang = 0.4363; // ~25°, classic screen angle
  vec2 rot = vec2(
    vUv.x * cos(ang) - vUv.y * sin(ang),
    vUv.x * sin(ang) + vUv.y * cos(ang)
  ) * uResolution / 11.0;
  float dots = length(fract(rot) - 0.5);
  float shade = smoothstep(0.3, 0.05, luma);
  float screen = 1.0 - smoothstep(0.22, 0.46, dots) * shade * uHalftone;
  base *= mix(1.0, screen, uHalftone);

  // Paper: a fixed fibre grain plus a per-step speckle. Applied to the fills
  // only — the ink goes on afterwards.
  float fibre = hash21(vUv * uResolution * 0.5);
  float speck = hash21(vUv * uResolution + uTimeStep * 3.1);
  base *= 1.0 - (fibre * 0.5 + speck * 0.5) * uGrain;
  base = mix(base, uPaper, fibre * uGrain * 0.25);

  float v = distance(vUv, vec2(0.5));
  base *= 1.0 - smoothstep(0.42, 0.86, v) * uVignette;

  // Ink last, and undiluted. Laying grain and vignette over the line is what
  // turns a confident black contour into a grey smudge that vanishes against
  // dark fills — the single biggest reason a cel-shaded frame reads as a
  // filter rather than as drawing.
  vec3 outColor = mix(base, uInk, max(edge, shadeEdge));

  gl_FragColor = vec4(outColor, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface ComicPassSettings {
  thickness: number;
  depthEdge: number;
  normalEdge: number;
  boil: number;
  halftone: number;
  grain: number;
  vignette: number;
  /** 1 = full colour, 0 = greyscale. Flashbacks run near zero. */
  saturation: number;
  /** Luminance step that counts as a shadow terminator worth inking. */
  shadeEdge: number;
  shadeEdgeStrength: number;
}

export const COMIC_DEFAULTS: ComicPassSettings = {
  thickness: 2.3,
  depthEdge: 0.011,
  normalEdge: 0.34,
  boil: 0.7,
  halftone: 0.4,
  grain: 0.075,
  vignette: 0.34,
  saturation: 1,
  shadeEdge: 0.34,
  shadeEdgeStrength: 0.9,
};

export class ComicPass {
  readonly material: ShaderMaterial;
  readonly #mesh: Mesh;
  readonly #camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  /** Ink is re-drawn at this many frames per second, not every frame. */
  inkFps = 11;
  #inkClock = 0;

  constructor() {
    // A single oversized triangle beats a quad: no diagonal seam, one less vertex.
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    );
    geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));

    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: null },
        tNormal: { value: null },
        tDepth: { value: null },
        uTexel: { value: new Vector2() },
        uResolution: { value: new Vector2() },
        uNear: { value: 0.1 },
        uFar: { value: 500 },
        uThickness: { value: COMIC_DEFAULTS.thickness },
        uDepthEdge: { value: COMIC_DEFAULTS.depthEdge },
        uNormalEdge: { value: COMIC_DEFAULTS.normalEdge },
        uInk: { value: new Vector3() },
        uPaper: { value: new Vector3() },
        uBoil: { value: COMIC_DEFAULTS.boil },
        uTimeStep: { value: 0 },
        uHalftone: { value: COMIC_DEFAULTS.halftone },
        uGrain: { value: COMIC_DEFAULTS.grain },
        uVignette: { value: COMIC_DEFAULTS.vignette },
        uDesat: { value: COMIC_DEFAULTS.saturation },
        uShadeEdge: { value: COMIC_DEFAULTS.shadeEdge },
        uShadeEdgeStrength: { value: COMIC_DEFAULTS.shadeEdgeStrength },
      },
    });

    this.#mesh = new Mesh(geometry, this.material);
    this.#mesh.frustumCulled = false;
  }

  setInk(inkHex: number, paperHex: number): void {
    const ink = color(inkHex);
    const paper = color(paperHex);
    (this.material.uniforms.uInk!.value as Vector3).set(ink.r, ink.g, ink.b);
    (this.material.uniforms.uPaper!.value as Vector3).set(paper.r, paper.g, paper.b);
  }

  apply(settings: Partial<ComicPassSettings>): void {
    const u = this.material.uniforms;
    if (settings.depthEdge !== undefined) u.uDepthEdge!.value = settings.depthEdge;
    if (settings.normalEdge !== undefined) u.uNormalEdge!.value = settings.normalEdge;
    if (settings.boil !== undefined) u.uBoil!.value = settings.boil;
    if (settings.halftone !== undefined) u.uHalftone!.value = settings.halftone;
    if (settings.grain !== undefined) u.uGrain!.value = settings.grain;
    if (settings.vignette !== undefined) u.uVignette!.value = settings.vignette;
    if (settings.saturation !== undefined) u.uDesat!.value = settings.saturation;
    if (settings.shadeEdge !== undefined) u.uShadeEdge!.value = settings.shadeEdge;
    if (settings.shadeEdgeStrength !== undefined) {
      u.uShadeEdgeStrength!.value = settings.shadeEdgeStrength;
    }
    if (settings.thickness !== undefined) this.#thickness = settings.thickness;
    this.#applyThickness(this.#height);
  }

  #thickness = COMIC_DEFAULTS.thickness;
  #height = 1080;

  /**
   * Line weight is authored for a 1080p frame and scaled to whatever the buffer
   * actually is. Without this the outline is hairline on a 4K monitor and a
   * black smear at 50 % render scale.
   */
  #applyThickness(height: number): void {
    // Scaled for the buffer, but never allowed below ~1.6 texels: a contour
    // thinner than that breaks up into dashes and stops reading as a line at
    // all, which is exactly what happens on a short or half-scale viewport.
    this.material.uniforms.uThickness!.value = Math.max(1.6, this.#thickness * (height / 1080));
  }

  setSize(width: number, height: number): void {
    const u = this.material.uniforms;
    (u.uTexel!.value as Vector2).set(1 / width, 1 / height);
    (u.uResolution!.value as Vector2).set(width, height);
    this.#height = height;
    this.#applyThickness(height);
  }

  setCameraRange(near: number, far: number): void {
    this.material.uniforms.uNear!.value = near;
    this.material.uniforms.uFar!.value = far;
  }

  setInputs(colorTex: Texture, normalTex: Texture, depthTex: Texture): void {
    this.material.uniforms.tColor!.value = colorTex;
    this.material.uniforms.tNormal!.value = normalTex;
    this.material.uniforms.tDepth!.value = depthTex;
  }

  update(dt: number): void {
    this.#inkClock += dt;
    const step = 1 / this.inkFps;
    if (this.#inkClock >= step) {
      this.#inkClock %= step;
      this.material.uniforms.uTimeStep!.value = (this.material.uniforms.uTimeStep!.value + 1) % 512;
    }
  }

  render(renderer: WebGLRenderer, target: WebGLRenderTarget | null = null): void {
    renderer.setRenderTarget(target);
    renderer.render(this.#mesh, this.#camera);
  }

  dispose(): void {
    this.#mesh.geometry.dispose();
    this.material.dispose();
  }
}
