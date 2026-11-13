import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

/**
 * Heure de la journée : position et teinte du soleil, ciel, lumière ambiante,
 * et allumage des lampes intérieures à la tombée du jour.
 */

export type Hour = 'matin' | 'midi' | 'soir' | 'nuit';
export const HOURS: Hour[] = ['matin', 'midi', 'soir', 'nuit'];

interface Mood {
  light: THREE.Vector3; // direction de la lumière principale (soleil, ou lune la nuit)
  sky: THREE.Vector3; // position du soleil dans le ciel
  color: THREE.Color;
  power: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemi: number;
  env: number; // reflets et lumière d'ambiance
  exposure: number;
  lamps: number; // lampes intérieures
  glow: number; // spots et abat-jour
  turbidity: number;
  rayleigh: number;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).normalize();
const c = (hex: string) => new THREE.Color(hex);

// Repère : x vers l'est, z vers le sud.
const MOODS: Record<Hour, Mood> = {
  matin: {
    light: v(0.62, 0.55, 0.56), sky: v(0.62, 0.55, 0.56), color: c('#fff2dc'), power: 3.4,
    hemiSky: c('#dfeaf5'), hemiGround: c('#b9ab95'), hemi: 0.55, env: 0.45, exposure: 0.8,
    lamps: 0.75, glow: 0.7, turbidity: 4, rayleigh: 2.2,
  },
  midi: {
    light: v(0.12, 1, 0.3), sky: v(0.12, 1, 0.3), color: c('#fffaf0'), power: 3.9,
    hemiSky: c('#e4eefb'), hemiGround: c('#c4b8a4'), hemi: 0.7, env: 0.55, exposure: 0.74,
    lamps: 0.55, glow: 0.5, turbidity: 2.5, rayleigh: 1.1,
  },
  soir: {
    light: v(-0.8, 0.2, 0.45), sky: v(-0.8, 0.09, 0.45), color: c('#ffb074'), power: 2.7,
    hemiSky: c('#f3cfb4'), hemiGround: c('#8e7f74'), hemi: 0.34, env: 0.3, exposure: 0.9,
    lamps: 1.05, glow: 1, turbidity: 9, rayleigh: 3.2,
  },
  nuit: {
    light: v(0.4, 0.75, -0.45), sky: v(-0.6, -0.5, 0.3), color: c('#8fa8de'), power: 0.32,
    hemiSky: c('#27375c'), hemiGround: c('#14161d'), hemi: 0.22, env: 0.07, exposure: 0.95,
    lamps: 1.25, glow: 1.15, turbidity: 2, rayleigh: 0.6,
  },
};

function blend(a: Mood, b: Mood, t: number): Mood {
  const n = (k: 'power' | 'hemi' | 'env' | 'exposure' | 'lamps' | 'glow' | 'turbidity' | 'rayleigh') => a[k] + (b[k] - a[k]) * t;
  return {
    light: a.light.clone().lerp(b.light, t).normalize(),
    sky: a.sky.clone().lerp(b.sky, t).normalize(),
    color: a.color.clone().lerp(b.color, t),
    hemiSky: a.hemiSky.clone().lerp(b.hemiSky, t),
    hemiGround: a.hemiGround.clone().lerp(b.hemiGround, t),
    // Quand la lumière change franchement de côté, on l'atténue en cours de route
    power: n('power') * (a.light.dot(b.light) < 0.5 ? 1 - 0.6 * Math.sin(Math.PI * t) : 1),
    hemi: n('hemi'), env: n('env'), exposure: n('exposure'), lamps: n('lamps'), glow: n('glow'),
    turbidity: n('turbidity'), rayleigh: n('rayleigh'),
  };
}

export class Daylight {
  hour: Hour = 'matin';
  readonly sun = new THREE.DirectionalLight();
  readonly sky = new Sky();
  private hemi = new THREE.HemisphereLight();
  private lamps: [THREE.PointLight, number][] = [];
  private glows: [THREE.MeshStandardMaterial, number][] = [];
  private from = MOODS.matin;
  private t = 1;

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private center: THREE.Vector3) {
    this.sky.scale.setScalar(1000);
    this.sky.material.uniforms.mieCoefficient.value = 0.004;
    const s = this.sun;
    s.target.position.copy(center);
    s.castShadow = true;
    Object.assign(s.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 90 });
    s.shadow.bias = -0.0004;
    s.shadow.normalBias = 0.04;
    scene.add(this.sky, s, s.target, this.hemi);
    this.show(MOODS.matin);
  }

  /** Recense les lampes et les matériaux lumineux de la maison. */
  adopt(root: THREE.Object3D) {
    const seen = new Set<THREE.Material>();
    root.traverse((o) => {
      if ((o as THREE.PointLight).isPointLight) this.lamps.push([o as THREE.PointLight, (o as THREE.PointLight).intensity]);
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m?.isMeshStandardMaterial && m.emissiveIntensity > 0 && m.emissive.getHex() && !seen.has(m)) {
        seen.add(m);
        this.glows.push([m, m.emissiveIntensity]);
      }
    });
    this.show(MOODS[this.hour]);
  }

  /** Lampes de la maison, de la plus puissante à la moins puissante. */
  get lights() { return [...this.lamps].sort((a, b) => b[1] - a[1]).map(([l]) => l); }

  set(hour: Hour, instant = false) {
    if (hour === this.hour && this.t >= 1) return;
    this.from = blend(this.from, MOODS[this.hour], this.t);
    this.hour = hour;
    this.t = instant ? 1 : 0;
    if (instant) this.show(MOODS[hour]);
  }

  /** Fait avancer la transition ; renvoie vrai tant que la lumière change. */
  update(dt: number) {
    if (this.t >= 1) return false;
    this.t = Math.min(1, this.t + dt / 1.4);
    const e = this.t * this.t * (3 - 2 * this.t);
    this.show(blend(this.from, MOODS[this.hour], e));
    return true;
  }

  private show(m: Mood) {
    this.sun.position.copy(m.light).multiplyScalar(40).add(this.center);
    this.sun.color.copy(m.color);
    this.sun.intensity = m.power;
    this.hemi.color.copy(m.hemiSky);
    this.hemi.groundColor.copy(m.hemiGround);
    this.hemi.intensity = m.hemi;
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(m.sky);
    u.turbidity.value = m.turbidity;
    u.rayleigh.value = m.rayleigh;
    this.scene.environmentIntensity = m.env;
    this.renderer.toneMappingExposure = m.exposure;
    for (const [l, base] of this.lamps) l.intensity = base * m.lamps;
    for (const [mat, base] of this.glows) mat.emissiveIntensity = base * m.glow;
  }
}
