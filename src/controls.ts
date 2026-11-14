import * as THREE from 'three';
import type { Rect } from './builders';

/**
 * Déplacement à pied : clavier (touches physiques, donc ZQSD sur AZERTY et WASD sur QWERTY),
 * souris (capturée, ou glisser si la capture est refusée) et tactile (gauche : marcher, droite : regarder).
 */
export class Walker {
  enabled = true;
  yaw = 0;
  pitch = 0;
  readonly position = new THREE.Vector3();

  private keys = new Set<string>();
  private velocity = new THREE.Vector2();
  private stick = new THREE.Vector2();
  private dragging = false;
  private touches = new Map<number, { x: number; y: number; ox: number; oy: number; move: boolean }>();
  private readonly radius = 0.28;
  private readonly eye = 1.62;
  private stride = 0; // phase de la marche, en pas
  private bob = 0;
  /** Appelé à chaque pose du pied (pour le son). */
  onStep: (running: boolean) => void = () => {};

  constructor(private camera: THREE.PerspectiveCamera, private dom: HTMLElement, private colliders: Rect[]) {
    camera.rotation.order = 'YXZ';
    addEventListener('keydown', (e) => this.keys.add(e.code));
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    dom.addEventListener('mousedown', () => (this.dragging = true));
    addEventListener('mouseup', () => (this.dragging = false));
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement === dom) this.look(e.movementX, e.movementY, 0.0022);
      else if (this.dragging) this.look(-e.movementX, -e.movementY, 0.004);
    });

    dom.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        this.touches.set(t.identifier, {
          x: t.clientX, y: t.clientY, ox: t.clientX, oy: t.clientY, move: t.clientX < innerWidth * 0.4,
        });
      }
    }, { passive: true });
    dom.addEventListener('touchmove', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        const s = this.touches.get(t.identifier);
        if (!s) continue;
        if (s.move) {
          this.stick.set(t.clientX - s.ox, t.clientY - s.oy).divideScalar(60).clampLength(0, 1);
        } else {
          this.look(-(t.clientX - s.x), -(t.clientY - s.y), 0.005);
        }
        s.x = t.clientX;
        s.y = t.clientY;
      }
    }, { passive: true });
    const end = (e: TouchEvent) => {
      for (const t of e.changedTouches) {
        if (this.touches.get(t.identifier)?.move) this.stick.set(0, 0);
        this.touches.delete(t.identifier);
      }
    };
    dom.addEventListener('touchend', end);
    dom.addEventListener('touchcancel', end);
  }

  lock() {
    try {
      const p = this.dom.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch { /* capture indisponible : le glisser reste actif */ }
  }

  place(x: number, z: number, yaw: number) {
    this.position.set(x, this.eye, z);
    this.yaw = yaw;
    this.pitch = 0;
    this.apply();
  }

  private look(dx: number, dy: number, k: number) {
    this.yaw -= dx * k;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * k, -1.35, 1.35);
  }

  private blocked(x: number, z: number) {
    const r2 = this.radius * this.radius;
    for (const c of this.colliders) {
      const dx = x - Math.max(c.x1, Math.min(x, c.x2));
      const dz = z - Math.max(c.z1, Math.min(z, c.z2));
      if (dx * dx + dz * dz < r2) return true;
    }
    return false;
  }

  update(dt: number) {
    if (!this.enabled) return;
    const k = this.keys;
    const has = (...codes: string[]) => codes.some((c) => k.has(c));
    let fwd = (has('KeyW', 'ArrowUp') ? 1 : 0) - (has('KeyS', 'ArrowDown') ? 1 : 0) - this.stick.y;
    let side = (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0) + this.stick.x;
    const len = Math.hypot(fwd, side);
    if (len > 1) { fwd /= len; side /= len; }
    const speed = has('ShiftLeft', 'ShiftRight') ? 3.2 : 1.7;

    // Repère monde : l'avant est (-sin yaw, -cos yaw)
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const target = new THREE.Vector2(-sin * fwd + cos * side, -cos * fwd - sin * side).multiplyScalar(speed);
    this.velocity.lerp(target, 1 - Math.exp(-dt * 10));

    const p = this.position;
    const nx = p.x + this.velocity.x * dt;
    if (!this.blocked(nx, p.z)) p.x = nx; else this.velocity.x = 0;
    const nz = p.z + this.velocity.y * dt;
    if (!this.blocked(p.x, nz)) p.z = nz; else this.velocity.y = 0;

    // Balancement de la marche : un pas tous les 70 cm environ, amorti à l'arrêt
    const v = this.velocity.length();
    const before = Math.floor(this.stride);
    this.stride += (v * dt) / 0.7;
    if (v > 0.4 && Math.floor(this.stride) !== before) this.onStep(speed > 2);
    this.bob = THREE.MathUtils.damp(this.bob, Math.min(1, v / 1.7), 8, dt);
    this.apply();
  }

  private apply() {
    const phase = this.stride * Math.PI;
    this.camera.position.copy(this.position);
    this.camera.position.y += Math.abs(Math.sin(phase)) * 0.028 * this.bob - 0.014 * this.bob;
    this.camera.rotation.set(this.pitch, this.yaw, Math.sin(phase) * 0.004 * this.bob);
  }
}
