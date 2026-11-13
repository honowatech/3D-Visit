import * as THREE from 'three';

/**
 * Briques de construction génériques : murs avec ouvertures, fenêtres, portes, sols.
 * Repère : x vers l'est, z vers le sud, y vers le haut. Unités en mètres.
 */

export interface Rect { x1: number; z1: number; x2: number; z2: number }

export interface Opening {
  from: number; // position le long du mur (coordonnée monde)
  to: number;
  sill: number; // allège (0 pour une porte)
  head: number; // linteau
  kind: 'window' | 'door' | 'passage';
  open?: 1 | -1; // porte ouverte : côté vers lequel bat le vantail (charnière en `to`)
}

export interface WallSpec {
  axis: 'x' | 'z'; // direction dans laquelle court le mur
  at: number; // coordonnée de l'axe du mur sur l'autre direction
  from: number;
  to: number;
  base?: number;
  height: number;
  thickness?: number;
  openings?: Opening[]; // allège et linteau relatifs à `base`
  plinth?: boolean;
}

export interface BuildMaterials {
  wall: THREE.Material;
  baseboard: THREE.Material;
  frame: THREE.Material;
  glass: THREE.Material;
  door: THREE.Material;
  metal: THREE.Material;
}

type Axis = 'x' | 'z';

/** Boîte définie par ses bornes : `a` le long du mur, `p` perpendiculairement. */
export function slab(
  parent: THREE.Object3D, mat: THREE.Material, axis: Axis,
  a1: number, a2: number, y1: number, y2: number, p1: number, p2: number,
  shadows = true,
) {
  const [x1, x2, z1, z2] = axis === 'x' ? [a1, a2, p1, p2] : [p1, p2, a1, a2];
  const m = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1, y2 - y1, z2 - z1), mat);
  m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
  // UV en mètres, calées sur le repère de la maison : les textures gardent leur échelle d'un mur à l'autre.
  const pos = m.geometry.attributes.position, uv = m.geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + m.position.x, y = pos.getY(i) + m.position.y, z = pos.getZ(i) + m.position.z;
    const face = Math.floor(i / 4); // ±x, ±y, ±z
    if (face < 2) uv.setXY(i, z, y);
    else if (face < 4) uv.setXY(i, x, z);
    else uv.setXY(i, x, y);
  }
  m.castShadow = m.receiveShadow = shadows;
  parent.add(m);
  return m;
}

const rectOf = (axis: Axis, a1: number, a2: number, p1: number, p2: number): Rect =>
  axis === 'x' ? { x1: a1, x2: a2, z1: p1, z2: p2 } : { x1: p1, x2: p2, z1: a1, z2: a2 };

export function buildWall(parent: THREE.Object3D, spec: WallSpec, mats: BuildMaterials, colliders: Rect[] | null) {
  const { axis, at, from, to, height } = spec;
  const base = spec.base ?? 0;
  const t = spec.thickness ?? 0.2;
  const p1 = at - t / 2, p2 = at + t / 2;
  const openings = (spec.openings ?? [])
    .map((o) => ({ ...o, sill: base + o.sill, head: base + o.head }))
    .sort((a, b) => a.from - b.from);

  const solid = (a1: number, a2: number, y1: number, y2: number) => {
    if (a2 - a1 < 1e-4 || y2 - y1 < 1e-4) return;
    slab(parent, mats.wall, axis, a1, a2, y1, y2, p1, p2);
    if (y1 === base && spec.plinth !== false) {
      slab(parent, mats.baseboard, axis, a1, a2, base, base + 0.08, p1 - 0.012, p2 + 0.012, false);
    }
  };

  let cursor = from;
  for (const o of openings) {
    solid(cursor, o.from, base, height);
    solid(o.from, o.to, base, o.sill);
    solid(o.from, o.to, o.head, height);
    if (o.kind === 'window') buildWindow(parent, axis, o, p1, p2, mats);
    if (o.kind === 'door') buildDoor(parent, axis, o, at, mats);
    cursor = o.to;
  }
  solid(cursor, to, base, height);

  // Collisions : tout le mur, sauf les passages libres.
  if (colliders) {
    let c = from;
    for (const o of openings.filter((o) => o.kind === 'passage' || o.open)) {
      colliders.push(rectOf(axis, c, o.from, p1, p2));
      c = o.to;
    }
    colliders.push(rectOf(axis, c, to, p1, p2));
  }
}

function buildWindow(parent: THREE.Object3D, axis: Axis, o: Opening, p1: number, p2: number, m: BuildMaterials) {
  const mid = (p1 + p2) / 2;
  const f = 0.05; // section du cadre
  const d1 = mid - 0.03, d2 = mid + 0.03;
  slab(parent, m.frame, axis, o.from, o.to, o.sill, o.sill + f, d1, d2);
  slab(parent, m.frame, axis, o.from, o.to, o.head - f, o.head, d1, d2);
  slab(parent, m.frame, axis, o.from, o.from + f, o.sill, o.head, d1, d2);
  slab(parent, m.frame, axis, o.to - f, o.to, o.sill, o.head, d1, d2);
  const panels = Math.max(2, Math.round((o.to - o.from) / 0.9));
  for (let i = 1; i < panels; i++) {
    const a = o.from + ((o.to - o.from) * i) / panels;
    slab(parent, m.frame, axis, a - 0.02, a + 0.02, o.sill, o.head, d1, d2);
  }
  slab(parent, m.glass, axis, o.from, o.to, o.sill, o.head, mid - 0.004, mid + 0.004, false);
  // Tablette d'appui
  slab(parent, m.baseboard, axis, o.from - 0.03, o.to + 0.03, o.sill - 0.03, o.sill, p1 - 0.04, p2 + 0.04);
}

function buildDoor(parent: THREE.Object3D, axis: Axis, o: Opening, at: number, m: BuildMaterials) {
  const f = 0.06;
  const y0 = o.sill; // sol du niveau
  slab(parent, m.door, axis, o.from, o.from + f, y0, o.head, at - 0.115, at + 0.115);
  slab(parent, m.door, axis, o.to - f, o.to, y0, o.head, at - 0.115, at + 0.115);
  slab(parent, m.door, axis, o.from, o.to, o.head - f, o.head, at - 0.115, at + 0.115);
  if (o.open) {
    const reach = at + o.open * (o.to - o.from - 2 * f);
    slab(parent, m.door, axis, o.to - f - 0.044, o.to - f, y0 + 0.005, o.head - f, Math.min(at, reach), Math.max(at, reach));
    return;
  }
  slab(parent, m.door, axis, o.from + f, o.to - f, y0 + 0.005, o.head - f, at - 0.022, at + 0.022);
  // Moulures et poignée, des deux côtés
  for (const side of [-1, 1]) {
    const p = at + side * 0.026;
    for (const [y1, y2] of [[0.2, 0.95], [1.05, 1.9]]) {
      slab(parent, m.door, axis, o.from + 0.2, o.to - 0.2, y0 + y1, y0 + y2, Math.min(p, p - side * 0.01), Math.max(p, p - side * 0.01), false);
    }
    slab(parent, m.metal, axis, o.to - 0.2, o.to - 0.08, y0 + 1.0, y0 + 1.025, Math.min(p, p + side * 0.04), Math.max(p, p + side * 0.04), false);
  }
}

/** Sol (ou toute surface horizontale) dont la texture se répète tous les `tile` mètres. */
export function floorRect(parent: THREE.Object3D, mat: THREE.Material, r: Rect, y = 0, tile = 0.6) {
  const g = new THREE.BufferGeometry();
  const { x1, x2, z1, z2 } = r;
  g.setAttribute('position', new THREE.Float32BufferAttribute([x1, y, z1, x1, y, z2, x2, y, z2, x2, y, z1], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([x1, z1, x1, z2, x2, z2, x2, z1].map((v) => v / tile), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
