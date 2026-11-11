import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildWall, floorRect, slab, type BuildMaterials, type Rect } from './builders';
import { ETAGE, PLOT, RDC, SEJOUR, SLAB, STAIR, type LevelPlan } from './plan';
import { tileTexture, woodTexture } from './textures';

export { SEJOUR };

export interface House {
  group: THREE.Group;
  rdc: THREE.Group;
  etage: THREE.Group; // dalle, murs et sols de l'étage
  roof: THREE.Group;
  labels: { rdc: THREE.Group; etage: THREE.Group };
  colliders: Rect[]; // rez-de-chaussée (visite à pied)
  collidersEtage: Rect[];
  bounds: Rect;
}

export function buildHouse(): House {
  const group = new THREE.Group();
  const rdc = new THREE.Group();
  const etage = new THREE.Group();
  const roof = new THREE.Group();
  group.add(rdc, etage, roof);
  const colliders: Rect[] = [];
  const collidersEtage: Rect[] = [];

  const mats: BuildMaterials = {
    wall: new THREE.MeshStandardMaterial({ color: '#f1ece2', roughness: 0.92 }),
    baseboard: new THREE.MeshStandardMaterial({ color: '#d8d0c2', roughness: 0.35 }),
    frame: new THREE.MeshStandardMaterial({ color: '#3b3733', roughness: 0.45, metalness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({
      color: '#cfe3e6', transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.1, depthWrite: false,
    }),
    door: new THREE.MeshStandardMaterial({ map: woodTexture('#6b3f22', 4), roughness: 0.55 }),
    metal: new THREE.MeshStandardMaterial({ color: '#b9b2a6', roughness: 0.3, metalness: 0.9 }),
  };
  const tile = new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.16 });
  const plaster = new THREE.MeshStandardMaterial({ color: '#f8f6f1', roughness: 0.95 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#c9c3b8', roughness: 0.9 });
  const step = new THREE.MeshStandardMaterial({ color: '#d9d2c5', roughness: 0.4 });

  const buildLevel = (target: THREE.Group, level: LevelPlan, solid: Rect[] | null) => {
    for (const w of level.walls) {
      buildWall(target, {
        axis: w.axis, at: w.at, from: w.from - 0.1, to: w.to + 0.1,
        base: level.base, height: w.low ? level.base + w.low : level.top,
        openings: w.openings, plinth: !w.low,
      }, mats, solid);
    }
    for (const f of level.floors) floorRect(target, tile, f, level.base + 0.002);
    const labels = new THREE.Group();
    for (const l of level.labels) {
      const el = document.createElement('div');
      el.className = 'room-label';
      el.innerHTML = `<b>${l.name}</b>${l.area ? `<span>${l.area} m²</span>` : ''}`;
      const o = new CSS2DObject(el);
      o.position.set(l.x, level.base + 0.3, l.z);
      labels.add(o);
    }
    target.add(labels);
    return labels;
  };

  const labels = { rdc: buildLevel(rdc, RDC, colliders), etage: buildLevel(etage, ETAGE, collidersEtage) };

  // Dalle de l'étage (plafond du rez-de-chaussée), trémie d'escalier réservée
  const landing: Rect = { x1: -1.25, z1: STAIR.z1, x2: 0, z2: 2.18 };
  floorRect(etage, tile, landing, ETAGE.base + 0.002);
  const slabs: Rect[] = [
    ...ETAGE.floors, landing,
    { x1: STAIR.x1, z1: STAIR.z2, x2: 0, z2: 6.1 },
    { x1: -0.2, z1: 2.18, x2: 0, z2: STAIR.z2 },
  ];
  for (const s of slabs) slab(etage, plaster, 'x', s.x1, s.x2, RDC.top, RDC.top + SLAB, s.z1, s.z2);

  // Toiture-terrasse
  for (const s of [...ETAGE.floors, { x1: STAIR.x1, z1: STAIR.z1, x2: 0, z2: 6.1 }]) {
    slab(roof, roofMat, 'x', s.x1 - 0.25, s.x2 + 0.25, ETAGE.top, ETAGE.top + 0.2, s.z1 - 0.25, s.z2 + 0.25);
  }

  buildStairs(rdc, step);
  colliders.push({ x1: STAIR.x1, z1: STAIR.z1, x2: STAIR.x2, z2: STAIR.z2 });

  // Éclairage du séjour et de ses abords
  const H = RDC.top;
  const spotMat = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff1d6', emissiveIntensity: 2.2 });
  for (const [x, z] of [[1.3, 1.5], [3.4, 1.5], [1.3, 3.9], [3.4, 3.9], [1.9, -3.2], [4.2, -3.2], [-1.3, 0.95], [-1.6, -4.6], [0.4, -4.6], [-1.6, -1.4], [0.4, -1.4]]) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 20), spotMat);
    disc.position.set(x, H - 0.006, z);
    etage.add(disc);
  }
  const lamps: [number, number, number, number][] = [
    [2.36, H - 1.0, 2.7, 5], [3.05, H - 1.5, -1.85, 4], [-0.35, H - 1.5, -2.95, 5], [-1.3, H - 1.0, 0.95, 2.5], [-1.3, 5.2, 3.9, 4],
  ];
  for (const [x, y, z, power] of lamps) {
    const l = new THREE.PointLight('#ffe9cc', power, 9, 1.6);
    l.position.set(x, y, z);
    rdc.add(l);
  }

  return { group, rdc, etage, roof, labels, colliders, collidersEtage, bounds: { x1: -8.65, z1: -5.92, x2: 4.92, z2: 6.1 } };
}

/** Escalier à deux volées, 20 contremarches de 17 cm (la rampe reste à poser, comme sur place). */
function buildStairs(parent: THREE.Object3D, mat: THREE.Material) {
  const rise = 0.17, run = 0.28;
  const z0 = STAIR.z1;
  for (let i = 1; i <= 10; i++) {
    slab(parent, mat, 'x', STAIR.x1, -1.35, 0, i * rise, z0 + (i - 1) * run, z0 + i * run);
  }
  const zl = z0 + 10 * run; // palier intermédiaire
  const yl = 11 * rise;
  slab(parent, mat, 'x', STAIR.x1, STAIR.x2, yl - 0.2, yl, zl, STAIR.z2);
  for (let j = 1; j <= 9; j++) {
    const top = yl + j * rise;
    slab(parent, mat, 'x', -1.25, STAIR.x2, top - 0.32, top, zl - j * run, zl - (j - 1) * run);
  }
}

/** Parcelle : jardin, cour pavée, clôture et portail (aménagement indicatif). */
export function buildSurroundings(): THREE.Group {
  const g = new THREE.Group();
  const Y = -0.12;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshStandardMaterial({ color: '#8f8a78', roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = Y - 0.02;
  ground.receiveShadow = true;
  g.add(ground);

  const { x1, z1, x2, z2 } = PLOT;
  const courZ = 8.2;
  const grass = new THREE.MeshStandardMaterial({ color: '#6f8f4e', roughness: 1 });
  const paving = new THREE.MeshStandardMaterial({ color: '#b9b2a4', roughness: 0.9 });
  floorRect(g, grass, { x1, z1, x2, z2: courZ }, Y);
  floorRect(g, paving, { x1, z1: courZ, x2, z2 }, Y);
  floorRect(g, paving, { x1: -8.1, z1: 6.1, x2: -2.8, z2: courZ }, Y + 0.01);

  const fence = new THREE.MeshStandardMaterial({ color: '#e3dccd', roughness: 0.95 });
  const gateMat = new THREE.MeshStandardMaterial({ color: '#3b3733', roughness: 0.5, metalness: 0.6 });
  const h = 2.1;
  slab(g, fence, 'z', z1, z2, Y, h, x1 - 0.2, x1);
  slab(g, fence, 'z', z1, z2, Y, h, x2, x2 + 0.2);
  slab(g, fence, 'x', x1 - 0.2, x2 + 0.2, Y, h, z1 - 0.2, z1);
  // Sud : portillon piéton et portail véhicule
  slab(g, fence, 'x', x1 - 0.2, -6.4, Y, h, z2, z2 + 0.2);
  slab(g, gateMat, 'x', -6.4, -5.4, Y, h - 0.15, z2 + 0.06, z2 + 0.12);
  slab(g, fence, 'x', -5.4, -1.0, Y, h, z2, z2 + 0.2);
  slab(g, gateMat, 'x', -1.0, 3.2, Y, h - 0.15, z2 + 0.06, z2 + 0.12);
  slab(g, fence, 'x', 3.2, x2 + 0.2, Y, h, z2, z2 + 0.2);

  const leaf = new THREE.MeshStandardMaterial({ color: '#3f6b34', roughness: 0.9 });
  const leaf2 = new THREE.MeshStandardMaterial({ color: '#56803d', roughness: 0.9 });
  const trunk = new THREE.MeshStandardMaterial({ color: '#5b4633', roughness: 1 });
  const bush = (x: number, z: number, r: number, m = leaf) => {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), m);
    b.position.set(x, r * 0.7 + Y, z);
    b.scale.y = 0.85;
    b.castShadow = true;
    g.add(b);
  };
  const tree = (x: number, z: number, th: number) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, th, 8), trunk);
    t.position.set(x, th / 2 + Y, z);
    t.castShadow = true;
    g.add(t);
    for (const [dx, dy, dz, r] of [[0, 0, 0, 1.0], [0.6, -0.3, 0.3, 0.7], [-0.5, -0.2, -0.4, 0.75], [0.1, 0.5, -0.2, 0.7]]) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), dy > 0 ? leaf2 : leaf);
      c.position.set(x + dx, th + dy, z + dz);
      c.castShadow = true;
      g.add(c);
    }
  };
  // Jardin sur le pourtour
  bush(6.3, 0.8, 0.45); bush(6.4, 3.0, 0.5, leaf2); bush(6.3, 5.0, 0.45);
  bush(1.2, 6.6, 0.55, leaf2); bush(3.6, 6.7, 0.6); bush(5.6, 7.2, 0.5, leaf2);
  bush(-9.6, 0.5, 0.6); bush(-9.7, 3.2, 0.5, leaf2); bush(-9.5, -3.5, 0.55);
  bush(-6.0, -7.3, 0.5, leaf2); bush(-1.0, -7.5, 0.45); bush(4.5, -7.3, 0.55);
  tree(-9.4, 6.6, 2.8); tree(-9.3, -6.9, 3.0); tree(6.0, -7.2, 2.6);
  // Hors parcelle
  tree(10.0, 2.5, 3.2); tree(11.5, -4.0, 3.4); tree(-14.0, 1.0, 3.2); tree(3.0, -12.0, 3.4); tree(-6.0, -11.5, 3.0);
  return g;
}
