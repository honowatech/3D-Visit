import * as THREE from 'three';
import type { Rect } from './builders';
import type { LevelPlan } from './plan';

/**
 * Découpage de la maison en zones d'éclairage : une par pièce close, plus l'extérieur (zone 0).
 * Chaque zone reçoit une sonde de lumière ; la carte produite ici dit, pour tout point d'un
 * niveau, à quelle sonde se fier, avec un fondu au droit des portes ouvertes et des passages.
 */

export interface Zone {
  id: number;
  level: number; // -1 pour l'extérieur
  name: string;
  probe: THREE.Vector3;
}

export interface ZoneMap {
  zones: Zone[];
  texture: THREE.DataTexture; // R : zone, G : zone voisine, B : part de la voisine (0 à 0,5)
  origin: THREE.Vector2; // angle nord-ouest de la grille (x, z)
  extent: THREE.Vector2; // emprise d'un niveau en mètres
  levels: number;
  zoneAt(level: number, x: number, z: number): number;
}

const CELL = 0.05;
const X0 = -10.5, Z0 = -7.7, X1 = 6.7, Z1 = 6.9;
const NX = Math.round((X1 - X0) / CELL), NZ = Math.round((Z1 - Z0) / CELL);
const BLEND = 12; // rayon du fondu entre zones, en cellules
const NEIGHBOURS = [1, -1, NX, -NX];

function fill(grid: Uint8Array, r: Rect, v: number) {
  const i1 = Math.max(0, Math.round((r.x1 - X0) / CELL)), i2 = Math.min(NX, Math.round((r.x2 - X0) / CELL));
  const j1 = Math.max(0, Math.round((r.z1 - Z0) / CELL)), j2 = Math.min(NZ, Math.round((r.z2 - Z0) / CELL));
  for (let j = j1; j < j2; j++) grid.fill(v, j * NX + i1, j * NX + i2);
}

const edge = (c: number, d: number) =>
  (d === 1 && c % NX === NX - 1) || (d === -1 && c % NX === 0) || c + d < 0 || c + d >= NX * NZ;

export function buildZoneMap(levels: LevelPlan[], furniture: Rect[][], outside: THREE.Vector3): ZoneMap {
  const N = NX * NZ;
  const zones: Zone[] = [{ id: 0, level: -1, name: 'Extérieur', probe: outside }];
  const data = new Uint8Array(levels.length * N * 4);
  const ids: Int16Array[] = [];
  const queue = new Int32Array(N);

  levels.forEach((level, li) => {
    // `closed` : murs pleins, toutes baies fermées (délimite les pièces).
    // `open` : murs réels, passages et portes ouvertes libres (laisse filer la lumière).
    const closed = new Uint8Array(N), open = new Uint8Array(N);
    for (const w of level.walls) {
      if (w.low) continue; // un garde-corps ne ferme pas une pièce
      const rect = (a1: number, a2: number): Rect =>
        w.axis === 'x' ? { x1: a1, x2: a2, z1: w.at - 0.1, z2: w.at + 0.1 } : { x1: w.at - 0.1, x2: w.at + 0.1, z1: a1, z2: a2 };
      fill(closed, rect(w.from - 0.1, w.to + 0.1), 1);
      fill(open, rect(w.from - 0.1, w.to + 0.1), 1);
      for (const o of w.openings) if (o.kind === 'passage' || o.open) fill(open, rect(o.from, o.to), 0);
    }

    // Pièces = composantes connexes de l'espace libre ; celle qui touche le bord est l'extérieur.
    const id = new Int16Array(N).fill(-1);
    const flood = (start: number, zone: number) => {
      let head = 0, tail = 0;
      queue[tail++] = start;
      id[start] = zone;
      while (head < tail) {
        const c = queue[head++];
        for (const d of NEIGHBOURS) {
          const n = c + d;
          if (edge(c, d) || closed[n] || id[n] !== -1) continue;
          id[n] = zone;
          queue[tail++] = n;
        }
      }
      return tail;
    };
    flood(0, 0);
    for (let c = 0; c < N; c++) {
      if (closed[c] || id[c] !== -1) continue;
      const zone = zones.length;
      const size = flood(c, zone);
      if (size * CELL * CELL < 0.5) { // recoin négligeable : rattaché au voisinage plus bas
        for (let k = 0; k < size; k++) id[queue[k]] = -1;
        for (let k = 0; k < size; k++) closed[queue[k]] = 1;
        continue;
      }
      zones.push({ id: zone, level: li, name: '', probe: probePoint(id, zone, size, queue, level, furniture[li] ?? []) });
    }
    for (const l of level.labels) {
      const z = id[cellOf(l.x, l.z)];
      if (z > 0 && !zones[z].name) zones[z].name = l.name;
    }

    // Les cellules de mur prennent la zone libre la plus proche.
    let head = 0, tail = 0;
    for (let c = 0; c < N; c++) if (id[c] !== -1) queue[tail++] = c;
    while (head < tail) {
      const c = queue[head++];
      for (const d of NEIGHBOURS) {
        const n = c + d;
        if (edge(c, d) || id[n] !== -1) continue;
        id[n] = id[c];
        queue[tail++] = n;
      }
    }
    ids.push(id);

    // Fondu : autour de chaque frontière franchissable, on pondère les zones atteignables à pied.
    const near = new Uint8Array(N);
    const dist = new Int32Array(N);
    const stamp = new Int32Array(N);
    head = tail = 0;
    for (let c = 0; c < N; c++) {
      if (open[c]) continue;
      for (const d of NEIGHBOURS) {
        const n = c + d;
        if (!edge(c, d) && !open[n] && id[n] !== id[c]) { near[c] = 1; dist[c] = 0; queue[tail++] = c; break; }
      }
    }
    while (head < tail) {
      const c = queue[head++];
      if (dist[c] >= BLEND) continue;
      for (const d of NEIGHBOURS) {
        const n = c + d;
        if (edge(c, d) || open[n] || near[n]) continue;
        near[n] = 1;
        dist[n] = dist[c] + 1;
        queue[tail++] = n;
      }
    }
    const candidates = queue.slice(0, tail);
    const weight = new Float32Array(zones.length);
    let pass = 0;
    for (const c0 of candidates) {
      pass++;
      weight.fill(0);
      head = tail = 0;
      queue[tail++] = c0;
      stamp[c0] = pass;
      dist[c0] = 0;
      while (head < tail) {
        const c = queue[head++];
        const f = 1 - dist[c] / (BLEND + 1);
        weight[id[c]] += f * f;
        if (dist[c] >= BLEND) continue;
        for (const d of NEIGHBOURS) {
          const n = c + d;
          if (edge(c, d) || open[n] || stamp[n] === pass) continue;
          stamp[n] = pass;
          dist[n] = dist[c] + 1;
          queue[tail++] = n;
        }
      }
      const a = id[c0];
      let b = a, wb = 0;
      for (let z = 0; z < weight.length; z++) if (z !== a && weight[z] > wb) { b = z; wb = weight[z]; }
      const o = (li * N + c0) * 4;
      data[o + 1] = b;
      data[o + 2] = Math.round(255 * Math.min(0.5, wb / (wb + weight[a])));
    }
    for (let c = 0; c < N; c++) data[(li * N + c) * 4] = id[c];
  });

  // Les niveaux sont rangés côte à côte dans la texture.
  const wide = new Uint8Array(data.length);
  for (let li = 0; li < levels.length; li++) for (let j = 0; j < NZ; j++) {
    wide.set(data.subarray((li * N + j * NX) * 4, (li * N + (j + 1) * NX) * 4), (j * NX * levels.length + li * NX) * 4);
  }
  const texture = new THREE.DataTexture(wide, NX * levels.length, NZ, THREE.RGBAFormat);
  texture.needsUpdate = true;

  return {
    zones, texture, levels: levels.length,
    origin: new THREE.Vector2(X0, Z0),
    extent: new THREE.Vector2(X1 - X0, Z1 - Z0),
    zoneAt: (level, x, z) => (x < X0 || x >= X1 || z < Z0 || z >= Z1 ? 0 : ids[level][cellOf(x, z)]),
  };
}

const cellOf = (x: number, z: number) =>
  Math.min(NZ - 1, Math.max(0, Math.floor((z - Z0) / CELL))) * NX + Math.min(NX - 1, Math.max(0, Math.floor((x - X0) / CELL)));

/** Emplacement de la sonde : au large des murs et des meubles, près du centre de la pièce. */
function probePoint(id: Int16Array, zone: number, size: number, cells: Int32Array, level: LevelPlan, furniture: Rect[]) {
  const own = cells.slice(0, size);
  let cx = 0, cz = 0;
  for (const c of own) { cx += c % NX; cz += Math.floor(c / NX); }
  cx /= size;
  cz /= size;
  // Distance (en cellules) au bord de la pièce ou au meuble le plus proche
  const blocked = new Uint8Array(NX * NZ);
  for (const f of furniture) fill(blocked, { x1: f.x1 - 0.15, z1: f.z1 - 0.15, x2: f.x2 + 0.15, z2: f.z2 + 0.15 }, 1);
  const dist = new Int32Array(NX * NZ).fill(-1);
  const queue = new Int32Array(size);
  let head = 0, tail = 0;
  for (const c of own) {
    if (blocked[c] || NEIGHBOURS.some((d) => edge(c, d) || id[c + d] !== zone)) { dist[c] = 0; queue[tail++] = c; }
  }
  while (head < tail) {
    const c = queue[head++];
    for (const d of NEIGHBOURS) {
      const n = c + d;
      if (edge(c, d) || id[n] !== zone || dist[n] !== -1) continue;
      dist[n] = dist[c] + 1;
      queue[tail++] = n;
    }
  }
  let best = own[0], score = -Infinity;
  for (const c of own) {
    const s = Math.min(dist[c] * CELL, 0.9) - 0.12 * Math.hypot(c % NX - cx, Math.floor(c / NX) - cz) * CELL;
    if (s > score) { score = s; best = c; }
  }
  return new THREE.Vector3(X0 + (best % NX + 0.5) * CELL, level.base + 1.5, Z0 + (Math.floor(best / NX) + 0.5) * CELL);
}
