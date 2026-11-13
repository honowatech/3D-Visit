import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

/** Soleil, ciel et lampes selon l'heure. Repère : x vers l'est, z vers le sud. */

export type Moment = 'matin' | 'midi' | 'soir' | 'nuit';

interface Preset {
  dir: [number, number, number]; // direction de l'astre qui éclaire (soleil, ou lune la nuit)
  sky: [number, number, number]; // position du soleil pour le ciel (sous l'horizon la nuit)
  color: string;
  intensity: number;
  turbidity: number;
  rayleigh: number;
  exposure: number;
  lamps: number; // puissance des lampes intérieures
  softness: number; // flou des ombres portées
}

const PRESETS: Record<Moment, Preset> = {
  matin: {
    dir: [0.62, 0.55, 0.56], sky: [0.62, 0.55, 0.56], color: '#fff2dc', intensity: 3.4,
    turbidity: 4, rayleigh: 2.2, exposure: 0.8, lamps: 0.45, softness: 1.2,
  },
  midi: {
    dir: [0.1, 0.96, 0.26], sky: [0.1, 0.96, 0.26], color: '#fffaf0', intensity: 3.8,
    turbidity: 3, rayleigh: 1.6, exposure: 0.7, lamps: 0.4, softness: 1,
  },
  soir: {
    dir: [-0.86, 0.2, 0.34], sky: [-0.86, 0.2, 0.34], color: '#ffb877', intensity: 2.6,
    turbidity: 7, rayleigh: 3, exposure: 0.9, lamps: 0.8, softness: 2,
  },
  nuit: {
    dir: [0.3, 0.72, -0.5], sky: [-0.8, -0.16, 0.3], color: '#9db4e0', intensity: 0.1,
    turbidity: 2, rayleigh: 0.6, exposure: 1.1, lamps: 1, softness: 2.5,
  },
};

const SKY_LIGHT = 0.24; // part du ciel dans l'éclairage, relativement à son image
const DURATION = 1.4; // secondes de fondu d'une heure à l'autre

export class Lighting {
  readonly sky = new Sky();
  readonly sun = new THREE.DirectionalLight();
  moment: Moment = 'matin';
  /** Vrai tant que la lumière change : ombres et sondes sont à refaire. */
  changing = false;

  private readonly lamps: { light: THREE.PointLight; power: number }[] = [];
  private from = PRESETS.matin;
  private to = PRESETS.matin;
  private t = 1;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    private readonly center: THREE.Vector3,
    shadowSize: number,
  ) {
    this.sky.scale.setScalar(1000);
    this.sky.material.uniforms.mieCoefficient.value = 0.004;
    this.sky.userData.noAO = true;
    // Gain du ciel : réduit pendant les captures, où il vaut éclairage et non image.
    this.sky.material.uniforms.gain = { value: 1 };
    this.sky.material.fragmentShader = this.sky.material.fragmentShader
      .replace('uniform float showSunDisc;', 'uniform float showSunDisc;\nuniform float gain;')
      .replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( mix( vec3( dot( texColor, vec3( 0.2126, 0.7152, 0.0722 ) ) ), texColor, gain < 1.0 ? 0.55 : 1.0 ) * gain, 1.0 );');

    const { sun } = this;
    sun.castShadow = true;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 90 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    sun.target.position.copy(center);
    scene.add(this.sky, sun, sun.target);
    this.apply(1);
  }

  /** Recense les lampes de la maison pour les moduler selon l'heure. */
  adoptLamps(root: THREE.Object3D) {
    root.traverse((o) => {
      const light = o as THREE.PointLight;
      if (light.isPointLight) this.lamps.push({ light, power: light.intensity });
    });
    this.apply(this.t);
  }

  /** Donne des ombres portées aux lampes les plus proches des points indiqués (une par point). */
  castLampShadows(points: THREE.Vector3[]) {
    const at = new THREE.Vector3();
    for (const p of points) {
      let best: THREE.PointLight | null = null, d = Infinity;
      for (const { light } of this.lamps) {
        const dist = light.getWorldPosition(at).distanceTo(p);
        if (dist < d) { d = dist; best = light; }
      }
      if (!best) continue;
      best.castShadow = true;
      best.shadow.mapSize.set(512, 512);
      best.shadow.camera.near = 0.1;
      best.shadow.camera.far = 9;
      best.shadow.bias = -0.003;
      best.shadow.radius = 3;
    }
  }

  set(moment: Moment, instant = false) {
    if (moment === this.moment && this.t >= 1) return;
    this.from = this.current();
    this.to = PRESETS[moment];
    this.moment = moment;
    this.t = instant ? 1 : 0;
    this.changing = true;
    if (instant) this.apply(1);
  }

  update(dt: number) {
    if (this.t >= 1) { this.changing = false; return; }
    this.t = Math.min(1, this.t + dt / DURATION);
    this.apply(this.t);
  }

  /**
   * Bascule le ciel en source de lumière pour les captures : sans disque solaire (sa lumière y
   * est déjà, via le soleil) et ramené à sa juste part face à lui.
   */
  captureMode(on: boolean) {
    const u = this.sky.material.uniforms;
    u.showSunDisc.value = on ? 0 : 1;
    u.gain.value = on ? SKY_LIGHT : 1;
  }

  private current(): Preset {
    const k = THREE.MathUtils.smoothstep(this.t, 0, 1);
    const a = this.from, b = this.to;
    const mix = (x: number, y: number) => x + (y - x) * k;
    const dir = (x: [number, number, number], y: [number, number, number]) =>
      new THREE.Vector3(...x).lerp(new THREE.Vector3(...y), k).normalize().toArray() as [number, number, number];
    return {
      dir: dir(a.dir, b.dir), sky: dir(a.sky, b.sky),
      color: `#${new THREE.Color(a.color).lerp(new THREE.Color(b.color), k).getHexString()}`,
      intensity: mix(a.intensity, b.intensity),
      turbidity: mix(a.turbidity, b.turbidity), rayleigh: mix(a.rayleigh, b.rayleigh),
      exposure: mix(a.exposure, b.exposure), lamps: mix(a.lamps, b.lamps), softness: mix(a.softness, b.softness),
    };
  }

  private apply(t: number) {
    this.t = t;
    const p = t >= 1 ? this.to : this.current();
    const { sun, sky } = this;
    sun.position.set(...p.dir).multiplyScalar(45).add(this.center);
    sun.color.set(p.color);
    sun.intensity = p.intensity;
    sun.shadow.radius = p.softness;
    const u = sky.material.uniforms;
    u.sunPosition.value.set(...p.sky);
    u.turbidity.value = p.turbidity;
    u.rayleigh.value = p.rayleigh;
    this.renderer.toneMappingExposure = p.exposure;
    for (const l of this.lamps) l.light.intensity = l.power * p.lamps;
  }
}
