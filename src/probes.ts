import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { ZoneMap } from './zones';

/**
 * Sondes de lumière : une capture à 360° par pièce, filtrée (PMREM) puis rangée dans un atlas.
 * Les matériaux y lisent leur lumière indirecte et leurs reflets à la place de l'environnement
 * global : une pièce fermée ne reçoit plus le ciel, et le sol reflète la pièce où il se trouve.
 */

const LODS = 6; // niveaux de rugosité d'un PMREM de 256 px
const GAP = 0.12; // recul le long de la normale pour choisir la pièce d'une paroi

export interface ProbeOptions {
  tile: number; // côté de la vignette la plus nette (256 ou 128)
  capture: number; // côté des faces capturées
  split: number; // altitude séparant les deux niveaux
  top: number; // au-dessus : toujours l'extérieur
}

export class LightProbes {
  /** Décalage vertical de l'étage (vue éclatée), pour continuer à lire la bonne pièce. */
  readonly lift = { value: 0 };
  /** À appeler autour d'une capture : met la maison en configuration fermée, puis la restaure. */
  prepare: () => () => void = () => () => {};

  private readonly atlas: THREE.WebGLRenderTarget;
  private readonly cubeTarget: THREE.WebGLCubeRenderTarget;
  private readonly cubeCam: THREE.CubeCamera;
  private readonly pmrem: THREE.PMREMGenerator;
  private pmremTarget: THREE.WebGLCubeRenderTarget | null = null;
  private readonly blit: FullScreenQuad;
  private readonly tiles: THREE.Vector3[] = []; // x, y, côté de chaque vignette dans sa case
  private readonly cell = new THREE.Vector2();
  private readonly cols: number;
  private readonly glsl: string;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private queue: number[] = [];
  private total = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly map: ZoneMap,
    private readonly opts: ProbeOptions,
  ) {
    // Vignettes octaédriques : la plus nette à gauche, les plus floues empilées à droite.
    let y = 0;
    for (let l = 0; l < LODS; l++) {
      const s = Math.max(opts.tile >> l, 16);
      this.tiles.push(new THREE.Vector3(l ? opts.tile : 0, l ? y : 0, s));
      if (l) y += s;
    }
    this.cell.set(opts.tile + this.tiles[1].z, Math.max(opts.tile, y));
    const n = map.zones.length;
    this.cols = Math.ceil(Math.sqrt((n * this.cell.y) / this.cell.x));
    const rows = Math.ceil(n / this.cols);
    this.atlas = new THREE.WebGLRenderTarget(this.cols * this.cell.x, rows * this.cell.y, {
      type: THREE.HalfFloatType, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter,
    });
    this.atlas.scissorTest = true;
    renderer.setRenderTarget(this.atlas);
    renderer.clear();
    renderer.setRenderTarget(null);

    this.cubeTarget = new THREE.WebGLCubeRenderTarget(opts.capture, { type: THREE.HalfFloatType });
    this.cubeCam = new THREE.CubeCamera(0.05, 500, this.cubeTarget);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.blit = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { env: { value: null }, lod: { value: 0 }, size: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform samplerCube env; uniform float lod; uniform float size; varying vec2 vUv;
        void main() {
          // La marge d'un texel se replie d'elle-même sur le bord opposé de l'octaèdre.
          vec2 o = (vUv * size - 1.0) / (size - 2.0) * 2.0 - 1.0;
          vec3 d = vec3(o.x, 1.0 - abs(o.x) - abs(o.y), o.y);
          if (d.y < 0.0) d.xz = (1.0 - abs(d.zx)) * vec2(d.x >= 0.0 ? 1.0 : -1.0, d.z >= 0.0 ? 1.0 : -1.0);
          gl_FragColor = vec4(textureLod(env, normalize(d), lod).rgb, 1.0);
        }`,
      depthTest: false, depthWrite: false, toneMapped: false,
    }));

    this.uniforms = {
      zoneMap: { value: map.texture },
      zoneAtlas: { value: this.atlas.texture },
      zoneLift: this.lift,
    };
    const f = (v: number) => v.toFixed(4);
    const v2 = (v: THREE.Vector2) => `vec2(${f(v.x)}, ${f(v.y)})`;
    this.glsl = /* glsl */ `
#ifdef USE_ENVMAP
  uniform sampler2D zoneMap;
  uniform sampler2D zoneAtlas;
  uniform float zoneLift;
  uniform float zoneGain;
  varying vec3 vZonePos;
  const vec3 ZONE_TILES[${LODS}] = vec3[${LODS}](${this.tiles.map((t) => `vec3(${f(t.x)}, ${f(t.y)}, ${f(t.z)})`).join(', ')});

  // x : zone, y : zone voisine, z : part de la voisine
  vec3 zoneLookup(vec3 n) {
    vec3 p = vZonePos + n * ${f(GAP)};
    vec2 g = (p.xz - ${v2(map.origin)}) / ${v2(map.extent)};
    if (p.y > ${f(opts.top)} + zoneLift || any(lessThan(g, vec2(0.0))) || any(greaterThanEqual(g, vec2(1.0)))) return vec3(0.0);
    float level = step(${f(opts.split)} + zoneLift, p.y);
    vec4 t = textureLod(zoneMap, vec2((g.x + level) / ${f(map.levels)}, g.y), 0.0);
    return vec3(floor(t.rg * 255.0 + 0.5), t.b);
  }
  vec3 zoneTile(float zone, vec3 dir, int lod) {
    vec3 tile = ZONE_TILES[lod];
    dir /= abs(dir.x) + abs(dir.y) + abs(dir.z);
    vec2 o = dir.y >= 0.0 ? dir.xz : (1.0 - abs(dir.zx)) * vec2(dir.x >= 0.0 ? 1.0 : -1.0, dir.z >= 0.0 ? 1.0 : -1.0);
    vec2 px = vec2(mod(zone, ${f(this.cols)}), floor(zone / ${f(this.cols)})) * ${v2(this.cell)}
      + tile.xy + 1.0 + (o * 0.5 + 0.5) * (tile.z - 2.0);
    return textureLod(zoneAtlas, px / ${v2(new THREE.Vector2(this.atlas.width, this.atlas.height))}, 0.0).rgb;
  }
  vec3 zoneSample(vec3 zone, vec3 dir, float mip) {
    int lo = int(floor(mip));
    int hi = min(lo + 1, ${LODS - 1});
    vec3 c = mix(zoneTile(zone.x, dir, lo), zoneTile(zone.x, dir, hi), fract(mip));
    if (zone.z > 0.0) c = mix(c, mix(zoneTile(zone.y, dir, lo), zoneTile(zone.y, dir, hi), fract(mip)), zone.z);
    return c;
  }
  vec3 getIBLIrradiance(const in vec3 normal) {
    vec3 n = transformNormalByInverseViewMatrix(normal, viewMatrix);
    return PI * zoneSample(zoneLookup(n), n, ${f(LODS - 1)}) * envMapIntensity;
  }
  vec3 getIBLRadiance(const in vec3 viewDir, const in vec3 normal, const in float roughness) {
    vec3 r = reflect(-viewDir, normal);
    r = normalize(mix(r, normal, pow4(roughness)));
    r = transformDirectionByInverseViewMatrix(r, viewMatrix);
    vec3 n = transformNormalByInverseViewMatrix(normal, viewMatrix);
    float q = clamp(roughness, 0.0, 1.0);
    return zoneSample(zoneLookup(n), r, ${f(LODS - 1)} * q * (2.0 - q)) * envMapIntensity * zoneGain;
  }
#endif`;
  }

  /** Branche un matériau sur les sondes (à faire avant son premier rendu). */
  patch(material: THREE.Material) {
    if (!(material as THREE.MeshStandardMaterial).isMeshStandardMaterial || material.userData.zoned) return;
    material.userData.zoned = true;
    material.onBeforeCompile = (shader) => {
      // `userData.reflets` renforce les reflets d'un matériau (vitrages presque transparents)
      Object.assign(shader.uniforms, this.uniforms, { zoneGain: { value: material.userData.reflets ?? 1 } });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vZonePos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvZonePos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>', this.glsl);
    };
    material.customProgramCacheKey = () => 'zoned';
  }

  patchAll(root: THREE.Object3D) {
    root.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) this.patch(mat);
    });
  }

  /** Demande une nouvelle capture de toutes les sondes ; chaque passe ajoute un rebond de lumière. */
  refresh(passes = 2, first: number[] = []) {
    // Les zones `first` (là où l'on regarde) passent en tête de chaque passe.
    const all = [...new Set([...first, ...this.map.zones.map((z) => z.id)])];
    this.queue = [];
    for (let i = 0; i < passes; i++) this.queue.push(...all);
    this.total = this.queue.length;
  }

  get pending() { return this.queue.length; }

  /** Avancement du calcul en cours, de 0 à 1. */
  get progress() { return this.total ? 1 - this.queue.length / this.total : 1; }

  /** Identifie la disposition de l'atlas : un éclairage enregistré n'est relisible qu'à l'identique. */
  get layout() { return `${this.atlas.width}x${this.atlas.height}/${this.map.zones.length}`; }

  /** Copie de l'éclairage calculé, pour l'enregistrer. */
  snapshot() {
    const { atlas } = this;
    const data = new Uint16Array(atlas.width * atlas.height * 4);
    this.renderer.readRenderTargetPixels(atlas, 0, 0, atlas.width, atlas.height, data);
    return data;
  }

  /** Recharge un éclairage enregistré ; renvoie faux s'il ne correspond pas à l'atlas. */
  restore(data: Uint16Array) {
    const { renderer, atlas } = this;
    if (data.length !== atlas.width * atlas.height * 4) return false;
    const tex = new THREE.DataTexture(data, atlas.width, atlas.height, THREE.RGBAFormat, THREE.HalfFloatType);
    tex.needsUpdate = true;
    const copy = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { map: { value: tex } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = texture2D(map, vUv); }',
      depthTest: false, depthWrite: false, toneMapped: false,
    }));
    const target = renderer.getRenderTarget();
    atlas.viewport.set(0, 0, atlas.width, atlas.height);
    atlas.scissor.copy(atlas.viewport);
    renderer.setRenderTarget(atlas);
    copy.render(renderer);
    renderer.setRenderTarget(target);
    (copy.material as THREE.Material).dispose();
    tex.dispose();
    this.queue = [];
    return true;
  }

  /** Capture jusqu'à `count` sondes en attente. Renvoie vrai s'il y a eu du travail. */
  update(count = 1) {
    if (!this.queue.length) return false;
    const { renderer } = this;
    const restore = this.prepare();
    const target = renderer.getRenderTarget();
    const lift = this.lift.value;
    this.lift.value = 0;
    for (const id of this.queue.splice(0, count)) this.capture(id);
    this.lift.value = lift;
    renderer.setRenderTarget(target);
    restore();
    return true;
  }

  private capture(id: number) {
    const { renderer, atlas } = this;
    this.cubeCam.position.copy(this.map.zones[id].probe);
    this.cubeCam.update(renderer, this.scene);
    this.pmremTarget = this.pmrem.fromCubemap(this.cubeTarget.texture, this.pmremTarget) as unknown as THREE.WebGLCubeRenderTarget;

    const u = (this.blit.material as THREE.ShaderMaterial).uniforms;
    u.env.value = this.pmremTarget.texture;
    const x0 = (id % this.cols) * this.cell.x, y0 = Math.floor(id / this.cols) * this.cell.y;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(atlas);
    this.tiles.forEach((t, lod) => {
      u.lod.value = lod;
      u.size.value = t.z;
      atlas.viewport.set(x0 + t.x, y0 + t.y, t.z, t.z);
      atlas.scissor.copy(atlas.viewport);
      renderer.setRenderTarget(atlas);
      this.blit.render(renderer);
    });
    renderer.autoClear = autoClear;
  }
}
