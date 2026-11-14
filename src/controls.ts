import * as THREE from 'three';
import { RDC, STAIRS, type Nav, type Spot, type Zone } from './nav';

/**
 * Déplacement à pied sur les deux niveaux.
 * - Clic ou toucher bref : aller à ce point (le trajet est fourni par `goTo`).
 * - Clavier (touches physiques, donc ZQSD sur AZERTY et WASD sur QWERTY) ; glisser pour regarder,
 *   ou souris capturée sur demande.
 * - Tactile : manette à gauche pour marcher, glisser à droite pour regarder.
 */
export class Walker {
  enabled = true;
  yaw = 0;
  pitch = 0;
  zone: Zone = RDC;
  /** Position des yeux. */
  readonly position = new THREE.Vector3();
  /** Clic ou toucher bref sur la scène (coordonnées écran). */
  onTap: (x: number, y: number) => void = () => {};

  private keys = new Set<string>();
  private velocity = new THREE.Vector2();
  private stick = new THREE.Vector2();
  private touches = new Map<number, { x: number; y: number; ox: number; oy: number; move: boolean; t: number; far: number }>();
  private press: { x: number; y: number; far: number } | null = null;
  private path: Spot[] = [];
  private pace = 0; // vitesse le long du trajet
  private steer = false; // le regard suit le trajet tant que le visiteur ne le reprend pas
  private feet = 0;
  private lastTouch = -1e9;
  private readonly eye = 1.62;

  constructor(
    private camera: THREE.PerspectiveCamera, private dom: HTMLElement, private nav: Nav,
    private joy: HTMLElement | null = null,
  ) {
    camera.rotation.order = 'YXZ';
    addEventListener('keydown', (e) => this.keys.add(e.code));
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    dom.addEventListener('mousedown', (e) => {
      // Après un toucher, le navigateur rejoue des événements souris : on les ignore.
      if (e.button === 0 && performance.now() - this.lastTouch > 800) this.press = { x: e.clientX, y: e.clientY, far: 0 };
    });
    addEventListener('mouseup', (e) => {
      const p = this.press;
      this.press = null;
      if (!p || !this.enabled || p.far > 5) return;
      if (this.locked) this.onTap(innerWidth / 2, innerHeight / 2);
      else this.onTap(e.clientX, e.clientY);
    });
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.press) this.press.far += Math.abs(e.movementX) + Math.abs(e.movementY);
      if (this.locked) this.look(e.movementX, e.movementY, 0.0022);
      else if (this.press && this.press.far > 5) this.look(-e.movementX, -e.movementY, 0.004);
    });

    dom.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        const move = t.clientX < innerWidth * 0.4 && t.clientY > innerHeight * 0.45 && !this.hasStick();
        this.touches.set(t.identifier, {
          x: t.clientX, y: t.clientY, ox: t.clientX, oy: t.clientY, move, t: performance.now(), far: 0,
        });
      }
    }, { passive: true });
    dom.addEventListener('touchmove', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        const s = this.touches.get(t.identifier);
        if (!s) continue;
        s.far += Math.abs(t.clientX - s.x) + Math.abs(t.clientY - s.y);
        if (s.move) {
          this.stick.set(t.clientX - s.ox, t.clientY - s.oy).divideScalar(48).clampLength(0, 1);
          if (s.far > 10) this.showStick(s.ox, s.oy);
        } else if (s.far > 10) {
          this.look(-(t.clientX - s.x), -(t.clientY - s.y), 0.005);
        }
        s.x = t.clientX;
        s.y = t.clientY;
      }
    }, { passive: true });
    const end = (e: TouchEvent) => {
      for (const t of e.changedTouches) {
        const s = this.touches.get(t.identifier);
        if (!s) continue;
        if (s.move) {
          this.stick.set(0, 0);
          this.showStick();
        }
        this.touches.delete(t.identifier);
        this.lastTouch = performance.now();
        if (this.enabled && e.type === 'touchend' && s.far <= 10 && performance.now() - s.t < 400) {
          this.onTap(t.clientX, t.clientY);
        }
      }
    };
    dom.addEventListener('touchend', end);
    dom.addEventListener('touchcancel', end);
  }

  private hasStick() {
    for (const s of this.touches.values()) if (s.move) return true;
    return false;
  }

  /** Manette tactile : affichée sous le pouce pendant le geste, à sa place de repos sinon. */
  private showStick(ox?: number, oy?: number) {
    const j = this.joy;
    if (!j) return;
    const knob = j.firstElementChild as HTMLElement;
    const on = ox !== undefined && oy !== undefined;
    j.classList.toggle('on', on);
    j.style.left = on ? `${ox}px` : '';
    j.style.top = on ? `${oy}px` : '';
    knob.style.transform = on ? `translate(${this.stick.x * 34}px, ${this.stick.y * 34}px)` : '';
  }

  get locked() { return document.pointerLockElement === this.dom; }
  /** Vrai tant qu'un trajet calculé est en cours. */
  get walking() { return this.path.length > 0; }
  get spot(): Spot { return { x: this.position.x, z: this.position.z, zone: this.zone }; }

  lock() {
    try {
      const p = this.dom.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch { /* capture indisponible : le glisser reste actif */ }
  }

  place(x: number, z: number, yaw: number, zone: Zone = RDC, pitch = 0) {
    this.zone = zone;
    this.feet = this.nav.floor(zone, x, z);
    this.position.set(x, this.feet + this.eye, z);
    this.yaw = yaw;
    this.pitch = pitch;
    this.path = [];
    this.velocity.set(0, 0);
    this.apply();
  }

  /** Suit le trajet donné (voir Nav.route). */
  goTo(path: Spot[]) {
    this.path = path;
    this.steer = true;
    this.velocity.set(0, 0);
  }

  private look(dx: number, dy: number, k: number) {
    this.yaw -= dx * k;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * k, -1.35, 1.35);
    this.steer = false;
  }

  /** `dt` borné pour la marche libre ; `long` (moins borné) pour suivre un trajet sans risque de collision. */
  update(dt: number, long = dt) {
    if (!this.enabled) return;
    const k = this.keys;
    const has = (...codes: string[]) => codes.some((c) => k.has(c));
    let fwd = (has('KeyW', 'ArrowUp') ? 1 : 0) - (has('KeyS', 'ArrowDown') ? 1 : 0) - this.stick.y;
    let side = (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0) + this.stick.x;
    const len = Math.hypot(fwd, side);
    if (len > 1) { fwd /= len; side /= len; }
    if (len > 0.05) this.path = []; // le visiteur reprend la main
    const onStairs = this.zone === STAIRS;
    const p = this.position;

    if (this.path.length) {
      this.follow(long, onStairs ? 1.25 : 1.9);
    } else {
      this.pace = 0;
      const speed = (has('ShiftLeft', 'ShiftRight') ? 3.2 : 1.7) * (onStairs ? 0.7 : 1);
      // Repère monde : l'avant est (-sin yaw, -cos yaw)
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      const target = new THREE.Vector2(-sin * fwd + cos * side, -cos * fwd - sin * side).multiplyScalar(speed);
      this.velocity.lerp(target, 1 - Math.exp(-dt * 10));
      const nx = p.x + this.velocity.x * dt;
      if (!this.nav.blocked(this.zone, nx, p.z)) { p.x = nx; this.zone = this.nav.step(this.zone, p.x, p.z); }
      else this.velocity.x = 0;
      const nz = p.z + this.velocity.y * dt;
      if (!this.nav.blocked(this.zone, p.x, nz)) { p.z = nz; this.zone = this.nav.step(this.zone, p.x, p.z); }
      else this.velocity.y = 0;
    }
    this.feet = THREE.MathUtils.damp(this.feet, this.nav.floor(this.zone, p.x, p.z), 14, dt);
    p.y = this.feet + this.eye;
    this.apply();
  }

  private follow(dt: number, cruise: number) {
    const p = this.position;
    let left = 0, px = p.x, pz = p.z;
    for (const s of this.path) { left += Math.hypot(s.x - px, s.z - pz); px = s.x; pz = s.z; }
    // Départ et arrivée en douceur
    this.pace = Math.min(cruise, this.pace + dt * 5, 0.35 + left * 2.2);
    let step = this.pace * dt;
    let hx = 0, hz = 0;
    while (this.path.length && step > 0) {
      const s = this.path[0];
      const dx = s.x - p.x, dz = s.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-4) { hx = dx / d; hz = dz / d; }
      if (d <= step) {
        p.x = s.x; p.z = s.z;
        this.zone = s.zone;
        step -= d;
        this.path.shift();
      } else {
        p.x += hx * step; p.z += hz * step;
        this.zone = this.nav.step(this.zone, p.x, p.z);
        step = 0;
      }
    }
    if (this.steer && (hx || hz) && left > 0.5) {
      let turn = Math.atan2(-hx, -hz) - this.yaw;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      const ease = 1 - Math.exp(-dt * 3.2);
      this.yaw += turn * ease;
      this.pitch += (0 - this.pitch) * ease * 0.5;
    }
  }

  private apply() {
    this.camera.position.copy(this.position);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
