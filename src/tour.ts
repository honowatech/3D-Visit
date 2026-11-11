import * as THREE from 'three';
import type { Rect } from './builders';
import { ETAGE, STAIR } from './plan';

/**
 * Visite intérieure complète : une caméra « drone » suit un trajet lissé à travers
 * toutes les pièces, du rez-de-chaussée à l'étage en passant par l'escalier.
 *
 * Chaque étape donne une position (x, z) et, si besoin, un point à regarder ;
 * sans indication, le drone regarde devant lui.
 */

interface Stop {
  x: number;
  z: number;
  y: number;
  look?: [number, number, number?]; // x, z et hauteur éventuelle du point visé
  room: string;
}

const H0 = 1.5; // hauteur de vol au rez-de-chaussée
const H1 = ETAGE.base + 1.5;

const stops: Stop[] = [];
let room = '';
let height = H0;
/** Ajoute une étape ; `r` change la pièce annoncée à partir de ce point. */
function at(x: number, z: number, opts: { r?: string; look?: Stop['look']; y?: number } = {}) {
  if (opts.r) room = opts.r;
  stops.push({ x, z, y: opts.y ?? height, look: opts.look, room });
}

// ── Rez-de-chaussée ────────────────────────────────────────────────────────
at(-3.55, 5.3, { r: 'Terrasse' });
at(-3.55, 4.3);
at(-3.57, 3.3, { r: "Hall d'entrée" });
at(-3.55, 2.4);
at(-3.6, 1.5);
at(-4.0, 1.05);
at(-4.6, 1.0, { r: "Salle d'étude" });
at(-5.35, 1.15);
at(-6.0, 1.65);
at(-7.0, 1.75);
at(-7.3, 2.5);
at(-6.75, 2.55);
at(-5.6, 2.45);
at(-5.45, 1.6);
at(-5.4, 1.1);
at(-4.6, 0.98);
at(-3.9, 0.8, { r: "Hall d'entrée" });
at(-3.6, 0.2);
at(-3.6, -0.4, { r: 'Couloir' });
at(-4.0, -1.0);
at(-4.8, -1.15);
at(-5.1, -1.9);
at(-5.05, -2.7, { r: "Chambre d'amis" });
at(-5.5, -3.5, { look: [-7.4, -4.25, 0.9] });
at(-5.9, -4.5, { look: [-7.6, -4.2, 0.9] });
at(-5.65, -5.1, { look: [-7.4, -4.0, 0.9] });
at(-5.45, -4.2, { look: [-5.2, -2.5] });
at(-5.15, -3.3);
at(-5.05, -2.7, { r: 'Couloir' });
at(-5.15, -2.05, { r: "Salle d'eau", look: [-8.2, -1.95, 1.2] });
at(-6.0, -1.92, { look: [-8.3, -2.0, 1.2] });
at(-5.2, -1.75, { look: [-8.2, -1.9, 1.2] });
at(-5.15, -1.1, { r: 'WC visiteurs', look: [-8.0, -0.7, 1.2] });
at(-5.25, -0.67, { look: [-8.3, -0.67, 1.1] });
at(-6.15, -0.67, { look: [-8.3, -0.67, 1.0] });
at(-5.2, -0.7, { look: [-8.3, -0.67, 1.1] });
at(-4.5, -1.0, { r: 'Couloir' });
at(-3.6, -1.05);
at(-2.7, -1.05, { r: 'Cuisine' });
at(-2.15, -1.15);
at(-1.8, -1.75);
at(-2.1, -2.25);
at(-2.8, -2.25, { r: 'Réserve' });
at(-3.3, -2.8, { look: [-3.7, -5.3, 1.1] });
at(-3.3, -4.2, { look: [-3.9, -5.6, 1.0] });
at(-3.25, -2.9, { look: [-3.8, -5.4, 1.1] });
at(-2.75, -2.25);
at(-1.9, -2.3, { r: 'Cuisine' });
at(-1.56, -3.0);
at(-1.5, -4.2);
at(-0.4, -4.5);
at(0.7, -4.45, { look: [3.3, -5.0, 1.1] });
at(0.8, -3.2);
at(0.75, -1.8);
at(1.2, -1.0, { r: 'Salle à manger' });
at(1.75, -1.3);
at(1.75, -2.6, { look: [3.0, -1.9, 0.9] });
at(2.1, -3.15, { look: [3.0, -1.9, 0.9] });
at(3.05, -3.15, { look: [3.05, -1.5, 0.9] });
at(4.2, -3.05, { look: [3.0, -1.8, 0.9] });
at(4.3, -1.8, { look: [2.6, -0.4, 1.0] });
at(4.15, -0.5);
at(3.2, 0.4, { r: 'Séjour' });
at(2.0, 0.5);
at(0.95, 0.75);
at(0.82, 1.5);
at(1.0, 2.32);
at(2.36, 2.38, { look: [3.0, 4.9, 1.0] });
at(3.22, 2.5);
at(3.18, 3.25);
at(3.15, 3.8);
at(2.4, 4.35, { look: [2.36, 1.5, 0.9] });
at(1.52, 4.1, { look: [2.5, 1.5, 0.9] });
at(1.5, 3.0);
at(1.45, 2.42);
at(1.0, 2.3);
at(0.85, 1.6);
at(0.85, 0.9);
at(0.3, 0.6);
at(-0.6, 0.9, { r: 'Escalier' });
at(-1.5, 1.1);

// ── Escalier : première volée, palier intermédiaire, seconde volée ─────────
const xa = (STAIR.x1 - 1.35) / 2, xb = (-1.25 + STAIR.x2) / 2;
at(xa, 1.9, { y: 1.5 });
at(xa, 3.3, { y: 2.35 });
at(xa, 4.6, { y: 3.15 });
at(-1.35, 5.3, { y: 3.4 });
at(xb, 4.7, { y: 3.45 });
at(xb, 3.4, { y: 4.2 });
at(xb, 2.3, { y: H1 - 0.05 });

// ── Étage ──────────────────────────────────────────────────────────────────
height = H1;
at(-0.85, 1.3, { r: 'Palier' });
at(-0.1, 0.9, { r: 'Séjour familial' });
at(0.8, 0.95);
at(1.8, 1.5, { look: [0.8, 3.6, H1 - 0.8] });
at(3.3, 1.9, { look: [1.2, 3.8, H1 - 0.8] });
at(3.9, 3.3, { look: [1.0, 3.7, H1 - 0.7] });
at(3.5, 2.0, { look: [2.6, 0.2, H1 - 0.6] });
at(2.0, 1.35);
at(0.8, 1.0);
at(-0.1, 0.9);
at(-1.2, 0.8, { r: 'Palier' });
at(-1.95, 0.2);
at(-1.9, -0.6);
at(-1.0, -0.8);
at(0.5, -0.8);
at(1.3, -0.74);
at(1.8, -0.74, { r: 'Chambre 3' });
at(2.3, -0.85, { look: [5.0, -0.85] });
at(2.36, -1.55);
at(2.5, -2.55, { look: [3.0, -4.05, H1 - 0.8] });
at(4.4, -2.7, { look: [3.0, -4.05, H1 - 0.8] });
at(4.9, -4.0, { look: [3.0, -4.05, H1 - 0.8] });
at(4.6, -5.3, { look: [3.0, -4.1, H1 - 0.8] });
at(4.95, -3.9, { look: [3.4, -2.0] });
at(4.4, -2.7);
at(3.0, -2.62);
at(2.4, -2.2);
at(2.36, -1.45);
at(2.15, -0.8);
at(1.75, -0.74, { r: 'Palier' });
at(0.6, -0.8);
at(-0.4, -0.95);
at(-0.62, -1.55, { r: 'Chambre 2' });
at(-0.72, -2.6, { look: [0.6, -3.75, H1 - 0.8] });
at(-0.82, -3.7, { look: [0.6, -3.75, H1 - 0.8] });
at(-0.75, -4.7, { look: [-2.5, -5.0] });
at(0.3, -5.4, { look: [0.5, -3.6, H1 - 0.8] });
at(-0.75, -4.6);
at(-0.78, -2.6);
at(-0.62, -1.5);
at(-1.2, -0.8, { r: 'Palier' });
at(-1.95, -1.5);
at(-1.95, -3.0);
at(-2.25, -3.5);
at(-2.7, -3.52, { r: 'Chambre 1' });
at(-3.5, -3.55, { look: [-3.6, -6.0] });
at(-4.7, -3.6);
at(-6.0, -3.42, { look: [-6.6, -5.0, H1 - 0.8] });
at(-7.3, -3.5, { look: [-7.3, -5.9, H1 - 0.5] });
at(-7.3, -4.6, { look: [-7.3, -5.95, H1 - 0.3] });
at(-7.3, -3.5, { look: [-8.6, -4.8, H1 - 0.8] });
at(-5.8, -3.42);
at(-4.6, -3.55);
at(-3.4, -3.5);
at(-2.7, -3.52, { r: 'Palier' });
at(-2.0, -3.0);
at(-1.95, -1.4);
at(-2.2, -0.7);
at(-2.7, -0.62, { r: 'Suite parentale' });
at(-3.4, -0.7);
at(-3.8, 0.5);
at(-5.4, 0.4, { r: 'Dressing', look: [-5.4, -2.5] });
at(-5.4, -0.9, { r: 'Salle de bains', look: [-8.0, -0.8] });
at(-5.3, 0.3, { look: [-8.0, -0.8] });
at(-4.9, 1.3, { r: 'Suite parentale', look: [-7.0, 1.4, H1 - 0.8] });
at(-4.85, 2.3, { look: [-7.0, 1.6, H1 - 0.8] });
at(-4.1, 2.35, { look: [-5.6, 4.2] });
at(-3.75, 1.7, { look: [-5.8, 4.5] });

export class Tour {
  playing = false;
  /** Avancement le long du trajet, de 0 à 1. */
  progress = 0;
  speed = 1.15; // m/s, à vitesse normale
  /** Multiplicateur de vitesse choisi à l'écran. */
  rate = 1;
  readonly length: number;
  yaw = 0;

  private path: THREE.CatmullRomCurve3;
  private gaze: THREE.CatmullRomCurve3;
  private snap = true;

  constructor(private camera: THREE.PerspectiveCamera) {
    const pts = stops.map((s) => new THREE.Vector3(s.x, s.y, s.z));
    const looks = stops.map((s, i) => {
      if (s.look) return new THREE.Vector3(s.look[0], s.look[2] ?? s.y - 0.2, s.look[1]);
      const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)];
      return b.clone().sub(a).normalize().multiplyScalar(3).add(pts[i]).setY(pts[i].y + (b.y - a.y) * 0.9 - 0.15);
    });
    this.path = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    this.gaze = new THREE.CatmullRomCurve3(looks, false, 'centripetal');
    this.path.arcLengthDivisions = 6000;
    this.length = this.path.getLength();
  }

  get duration() { return this.length / (this.speed * this.rate); }
  get position() { return this.camera.position; }
  get upstairs() { return this.camera.position.y > 3.3; }

  /** Nom de la pièce traversée. */
  get room() {
    const t = this.path.getUtoTmapping(this.progress, 0);
    return stops[Math.min(Math.round(t * (stops.length - 1)), stops.length - 1)].room;
  }

  seek(progress: number) {
    this.progress = THREE.MathUtils.clamp(progress, 0, 1);
    this.snap = true;
    this.apply(0);
  }

  /** Avance ou recule de `seconds` secondes de film. */
  skip(seconds: number) {
    this.seek(this.progress + (seconds * this.speed * this.rate) / this.length);
  }

  update(dt: number) {
    if (this.playing) {
      this.progress = Math.min(1, this.progress + (this.speed * this.rate * dt) / this.length);
      if (this.progress >= 1) this.playing = false;
    }
    this.apply(dt);
  }

  private apply(dt: number) {
    const t = this.path.getUtoTmapping(this.progress, 0);
    const pos = this.path.getPoint(t);
    const target = this.gaze.getPoint(t);
    const want = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(pos, target, THREE.Object3D.DEFAULT_UP),
    );
    this.camera.position.copy(pos);
    if (this.snap) this.camera.quaternion.copy(want);
    else this.camera.quaternion.slerp(want, 1 - Math.exp(-dt * 3.5));
    this.snap = false;
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    this.yaw = Math.atan2(-dir.x, -dir.z);
  }

  /** Contrôle du tracé : points du trajet à moins de `margin` d'un mur ou d'un meuble. */
  check(ground: Rect[], upper: Rect[], margin = 0.18) {
    const hits: string[] = [];
    for (let i = 0; i <= 3000; i++) {
      const p = this.path.getPointAt(i / 3000);
      const onStairs = p.x > STAIR.x1 && p.x < STAIR.x2 && p.z > STAIR.z1 - 0.3 && p.z < STAIR.z2;
      if (onStairs) continue;
      for (const c of p.y > 3.3 ? upper : ground) {
        const dx = p.x - Math.max(c.x1, Math.min(p.x, c.x2));
        const dz = p.z - Math.max(c.z1, Math.min(p.z, c.z2));
        if (dx * dx + dz * dz < margin * margin) {
          const t = this.path.getUtoTmapping(i / 3000, 0);
          hits.push(`${stops[Math.round(t * (stops.length - 1))].room} (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
          break;
        }
      }
    }
    return [...new Set(hits)];
  }
}
