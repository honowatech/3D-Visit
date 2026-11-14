import type { Rect } from './builders';
import { ETAGE, ROOMS, STAIR, type Room } from './plan';

/**
 * Navigation à pied sur les deux niveaux.
 *
 * Le visiteur est toujours dans l'une de trois zones : le rez-de-chaussée, l'étage ou l'escalier.
 * On change de zone en franchissant le pied ou le haut de l'escalier ; chaque zone a ses propres
 * obstacles et sa propre hauteur de sol. Le même modèle sert au déplacement libre, au calcul de
 * trajet (clic pour avancer) et à la téléportation depuis le mini-plan.
 */

export const RDC = 0, UP = 1, STAIRS = 2;
export type Zone = 0 | 1 | 2;
export interface Spot { x: number; z: number; zone: Zone }

/** Rayon du visiteur, et rayon un peu plus large pour les trajets calculés. */
export const BODY = 0.28;
const ROUTE = 0.285;

// Escalier : première volée à l'ouest (on monte vers le sud), palier au sud, seconde volée à l'est.
const SPLIT = -1.3; // entre les deux volées
const LANDING_Z = STAIR.z1 + 10 * 0.28;
const LANDING_Y = 11 * 0.17;
const TOP_Z = LANDING_Z - 9 * 0.28;

// Grille de calcul des trajets
const CELL = 0.04; // assez fin pour les passages étroits entre deux meubles
const GX = -10.03, GZ = -7.33;
const NX = Math.ceil((6.35 - GX) / CELL), NZ = Math.ceil((6.35 - GZ) / CELL);
const LAYER = NX * NZ;
// Rangement des obstacles par cases de 50 cm, pour des tests de collision rapides
const BIN = 0.5, REACH = 0.35;
const BX = Math.ceil((NX * CELL) / BIN), BZ = Math.ceil((NZ * CELL) / BIN);

export class Nav {
  private solids: [Rect[], Rect[], Rect[]];
  private bins: Rect[][][];
  private free = new Uint8Array(LAYER * 3); // 0 inconnu, 1 libre, 2 occupé
  private reach: Uint8Array | null = null;
  private cost = new Float32Array(LAYER * 3);
  private prev = new Int32Array(LAYER * 3);

  constructor(ground: Rect[], upper: Rect[]) {
    const { x1, x2, z1, z2 } = STAIR;
    this.solids = [
      // Depuis le rez-de-chaussée, seule la première volée est accessible.
      [...ground, { x1: -1.35, z1, x2, z2 }],
      // Depuis l'étage, on ne descend que par la seconde volée : le reste de la trémie est un vide.
      [...upper, { x1, z1, x2: -1.25, z2 }],
      [
        { x1: x1 - 0.2, z1: z1 - 0.2, x2: x1, z2: z2 + 0.2 },
        { x1: x2 - 0.2, z1, x2, z2: z2 + 0.2 },
        { x1: x1 - 0.2, z1: z2, x2, z2: z2 + 0.2 },
        { x1: -1.35, z1: z1 - 0.3, x2: -1.25, z2: LANDING_Z },
      ],
    ];
    this.bins = this.solids.map((rects) => {
      const bins: Rect[][] = Array.from({ length: BX * BZ }, () => []);
      for (const c of rects) {
        const i1 = Math.max(0, Math.floor((c.x1 - REACH - GX) / BIN)), i2 = Math.min(BX - 1, Math.floor((c.x2 + REACH - GX) / BIN));
        const j1 = Math.max(0, Math.floor((c.z1 - REACH - GZ) / BIN)), j2 = Math.min(BZ - 1, Math.floor((c.z2 + REACH - GZ) / BIN));
        for (let j = j1; j <= j2; j++) for (let i = i1; i <= i2; i++) bins[j * BX + i].push(c);
      }
      return bins;
    });
  }

  /** Obstacles de la zone (pour le mini-plan). */
  solidsOf(zone: Zone) { return this.solids[zone]; }

  blocked(zone: Zone, x: number, z: number, radius = BODY) {
    const r2 = radius * radius;
    const i = Math.floor((x - GX) / BIN), j = Math.floor((z - GZ) / BIN);
    const near = i >= 0 && j >= 0 && i < BX && j < BZ ? this.bins[zone][j * BX + i] : this.solids[zone];
    for (const c of near) {
      const dx = x - Math.max(c.x1, Math.min(x, c.x2));
      const dz = z - Math.max(c.z1, Math.min(z, c.z2));
      if (dx * dx + dz * dz < r2) return true;
    }
    return false;
  }

  /** Zone atteinte en arrivant en (x, z) depuis `zone`. */
  step(zone: Zone, x: number, z: number): Zone {
    const inStair = z > STAIR.z1 && x > STAIR.x1 && x < STAIR.x2;
    if (zone === RDC) return inStair && x < SPLIT ? STAIRS : RDC;
    if (zone === UP) return inStair && x > SPLIT ? STAIRS : UP;
    if (z > STAIR.z1) return STAIRS;
    return x < SPLIT ? RDC : UP;
  }

  /** Hauteur du sol sous le visiteur. */
  floor(zone: Zone, x: number, z: number) {
    if (zone === RDC) return 0;
    if (zone === UP) return ETAGE.base;
    if (z >= LANDING_Z) return LANDING_Y;
    if (x < SPLIT) return (LANDING_Y * Math.max(0, z - STAIR.z1)) / (LANDING_Z - STAIR.z1);
    return LANDING_Y + ((ETAGE.base - LANDING_Y) * Math.min(1, (LANDING_Z - z) / (LANDING_Z - TOP_Z)));
  }

  /** Niveau affiché sur le mini-plan pour cette position. */
  level(zone: Zone, x: number, z: number): 0 | 1 {
    if (zone !== STAIRS) return zone as 0 | 1;
    return this.floor(zone, x, z) > LANDING_Y + 0.4 ? 1 : 0;
  }

  room(level: 0 | 1, x: number, z: number): Room | null {
    for (const room of ROOMS) {
      if (room.level !== level) continue;
      for (const r of room.rects) if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) return room;
    }
    return null;
  }

  // ── Trajets ────────────────────────────────────────────────────────────────

  private cellFree(zone: Zone, i: number, j: number) {
    if (i < 0 || j < 0 || i >= NX || j >= NZ) return false;
    const id = zone * LAYER + j * NX + i;
    let f = this.free[id];
    if (!f) {
      const x = GX + i * CELL, z = GZ + j * CELL;
      // Une case n'appartient qu'à la zone où l'on se trouve réellement à cet endroit.
      const ok = this.step(zone, x, z) === zone && !this.blocked(zone, x, z, ROUTE);
      f = this.free[id] = ok ? 1 : 2;
    }
    return f === 1;
  }

  /** Cases voisines d'une case libre, avec la zone d'arrivée. */
  private *around(id: number): Generator<[number, number]> {
    const zone = Math.floor(id / LAYER) as Zone;
    const c = id - zone * LAYER;
    const i = c % NX, j = (c - i) / NX;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
      const nz = this.step(zone, GX + ni * CELL, GZ + nj * CELL);
      if (!this.cellFree(nz, ni, nj)) continue;
      // Pas de diagonale qui frôle un angle
      if (di && dj && !(this.cellFree(zone, ni, j) && this.cellFree(zone, i, nj))) continue;
      yield [nz * LAYER + nj * NX + ni, di && dj ? Math.SQRT2 : 1];
    }
  }

  private idOf(s: Spot) {
    return s.zone * LAYER + Math.round((s.z - GZ) / CELL) * NX + Math.round((s.x - GX) / CELL);
  }

  private spotOf(id: number): Spot {
    const zone = Math.floor(id / LAYER) as Zone;
    const c = id - zone * LAYER;
    return { x: GX + (c % NX) * CELL, z: GZ + Math.floor(c / NX) * CELL, zone };
  }

  /** Prépare le calcul des trajets à l'avance. */
  warm() { this.reachable(); }

  /** Tout ce qu'on peut atteindre à pied depuis l'entrée (calculé une fois). */
  private reachable() {
    if (this.reach) return this.reach;
    const reach = (this.reach = new Uint8Array(LAYER * 3));
    const start = this.idOf({ x: 0.45, z: 0.55, zone: RDC });
    const queue = [start];
    reach[start] = 1;
    while (queue.length) {
      const id = queue.pop()!;
      for (const [n] of this.around(id)) if (!reach[n]) { reach[n] = 1; queue.push(n); }
    }
    return reach;
  }

  /** Point accessible le plus proche de (x, z), à `within` mètres au plus ; dans une pièce si `indoors`. */
  nearest(zone: Zone, x: number, z: number, within = 1.5, indoors = false): Spot | null {
    const reach = this.reachable();
    const ci = Math.round((x - GX) / CELL), cj = Math.round((z - GZ) / CELL);
    const span = Math.ceil(within / CELL);
    let best = -1, bestD = Infinity;
    for (let dj = -span; dj <= span; dj++) for (let di = -span; di <= span; di++) {
      const d = di * di + dj * dj;
      if (d >= bestD || d > span * span) continue;
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= NX || j >= NZ) continue;
      const id = zone * LAYER + j * NX + i;
      if (!reach[id]) continue;
      if (indoors && zone !== STAIRS && !this.room(zone as 0 | 1, GX + i * CELL, GZ + j * CELL)) continue;
      best = id;
      bestD = d;
    }
    return best < 0 ? null : this.spotOf(best);
  }

  /** Vue dégagée entre deux points d'une même zone. */
  private clear(a: Spot, b: Spot) {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.04);
    for (let k = 1; k < n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n, z = a.z + ((b.z - a.z) * k) / n;
      if (this.step(a.zone, x, z) !== a.zone || this.blocked(a.zone, x, z, ROUTE - 0.003)) return false;
    }
    return true;
  }

  /** Trajet à pied de `from` à `to` (plus court chemin, puis lissage), ou null s'il n'y en a pas. */
  route(from: Spot, to: Spot): Spot[] | null {
    const reach = this.reachable();
    const origin = this.nearest(from.zone, from.x, from.z, 0.6);
    if (!origin) return null;
    const start = this.idOf(origin), goal = this.idOf(to);
    if (!reach[goal]) return null;
    const gi = (goal % LAYER) % NX, gj = Math.floor((goal % LAYER) / NX);
    const h = (id: number) => {
      const c = id % LAYER;
      const di = Math.abs((c % NX) - gi), dj = Math.abs(Math.floor(c / NX) - gj);
      return Math.max(di, dj) + (Math.SQRT2 - 1) * Math.min(di, dj);
    };
    const cost = this.cost.fill(Infinity);
    const prev = this.prev;
    cost[start] = 0;
    const heap: [number, number][] = [[h(start), start]];
    const push = (e: [number, number]) => {
      let i = heap.push(e) - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    let found = false;
    while (heap.length) {
      const [f, id] = pop();
      if (id === goal) { found = true; break; }
      const g = cost[id];
      if (f > g + h(id) + 1e-4) continue; // entrée périmée
      for (const [n, w] of this.around(id)) {
        const ng = g + w;
        if (ng < cost[n]) {
          cost[n] = ng;
          prev[n] = id;
          push([cost[n] + h(n), n]); // valeur relue : même arrondi qu'au contrôle ci-dessus
        }
      }
    }
    if (!found) return null;
    const cells: Spot[] = [];
    for (let id = goal; ; id = prev[id]) {
      cells.push(this.spotOf(id));
      if (id === start) break;
    }
    cells.reverse();
    // Lissage : on garde un point tant que le suivant n'est plus en vue directe.
    const out: Spot[] = [];
    let anchor = cells[0];
    for (let k = 1; k < cells.length; k++) {
      const next = cells[k + 1];
      if (!next || next.zone !== anchor.zone || !this.clear(anchor, next)) {
        out.push(cells[k]);
        anchor = cells[k];
      }
    }
    return out;
  }
}
