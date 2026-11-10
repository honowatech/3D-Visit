import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Rect } from './builders';
import { SEJOUR } from './house';
import { artTexture, checkerRugTexture, fabricTexture, rugTexture, woodTexture } from './textures';

/** Ameublement sobre du séjour, disposé comme sur le plan (canapé au nord, face au meuble TV). */

const M = {
  sofa: new THREE.MeshStandardMaterial({ map: fabricTexture('#8f8b84'), roughness: 0.95 }),
  cushion: new THREE.MeshStandardMaterial({ map: fabricTexture('#a19d95', 12), roughness: 0.95 }),
  accent: new THREE.MeshStandardMaterial({ map: fabricTexture('#b9623a', 13), roughness: 0.95 }),
  deep: new THREE.MeshStandardMaterial({ map: fabricTexture('#33504b', 14), roughness: 0.95 }),
  wood: new THREE.MeshStandardMaterial({ map: woodTexture('#8a5a36'), roughness: 0.5 }),
  black: new THREE.MeshStandardMaterial({ color: '#1d1c1b', roughness: 0.45, metalness: 0.6 }),
  screen: new THREE.MeshStandardMaterial({ color: '#07080a', roughness: 0.08, metalness: 0.4 }),
  ceramic: new THREE.MeshStandardMaterial({ color: '#ece6da', roughness: 0.35 }),
  terracotta: new THREE.MeshStandardMaterial({ color: '#a8603c', roughness: 0.8 }),
  leaf: new THREE.MeshStandardMaterial({ color: '#3c6a36', roughness: 0.7, side: THREE.DoubleSide }),
  linen: new THREE.MeshStandardMaterial({
    color: '#f4efe6', roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.86,
  }),
  shade: new THREE.MeshStandardMaterial({
    color: '#f3e6cf', emissive: '#ffd9a0', emissiveIntensity: 0.9, roughness: 1, side: THREE.DoubleSide,
  }),
};

function box(parent: THREE.Object3D, mat: THREE.Material, w: number, h: number, d: number,
  x: number, y: number, z: number, r = 0) {
  const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 4, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y + h / 2, z); // y = dessous de l'objet
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

function cyl(parent: THREE.Object3D, mat: THREE.Material, rTop: number, rBot: number, h: number,
  x: number, y: number, z: number, open = false) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 28, 1, open), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Canapé ou fauteuil : `seats` places, façade vers +z. */
function seating(seats: number, seatW = 0.64, body: THREE.Material = M.sofa, cushion: THREE.Material = M.cushion) {
  const g = new THREE.Group();
  const arm = 0.18, depth = 0.92;
  const w = seats * seatW + 2 * arm;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    cyl(g, M.black, 0.02, 0.015, 0.12, sx * (w / 2 - 0.08), 0, sz * (depth / 2 - 0.08));
  }
  box(g, body, w, 0.2, depth, 0, 0.12, 0, 0.05);
  box(g, body, w, 0.52, 0.2, 0, 0.3, -depth / 2 + 0.1, 0.07);
  for (const s of [-1, 1]) box(g, body, arm, 0.32, depth, s * (w / 2 - arm / 2), 0.3, 0, 0.07);
  for (let i = 0; i < seats; i++) {
    const x = (i - (seats - 1) / 2) * seatW;
    box(g, cushion, seatW - 0.02, 0.15, 0.68, x, 0.31, 0.1, 0.06);
    const back = box(g, cushion, seatW - 0.04, 0.4, 0.15, x, 0.46, -0.24, 0.07);
    back.rotation.x = -0.14;
  }
  return g;
}

function throwPillow(parent: THREE.Object3D, mat: THREE.Material, x: number, z: number, tilt: number) {
  const p = box(parent, mat, 0.4, 0.4, 0.12, x, 0.47, z, 0.06);
  p.rotation.set(-0.3, tilt, 0);
}

function coffeeTable() {
  const g = new THREE.Group();
  box(g, M.wood, 1.1, 0.04, 0.6, 0, 0.36, 0, 0.012);
  box(g, M.wood, 0.96, 0.025, 0.46, 0, 0.12, 0, 0.01);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, M.black, 0.025, 0.36, 0.025, sx * 0.5, 0, sz * 0.25);
  box(g, M.deep, 0.26, 0.03, 0.19, -0.25, 0.4, 0.05).rotation.y = 0.2;
  box(g, M.ceramic, 0.24, 0.025, 0.17, -0.25, 0.43, 0.05).rotation.y = -0.1;
  cyl(g, M.terracotta, 0.11, 0.06, 0.07, 0.28, 0.4, -0.05);
  return g;
}

function tvUnit() {
  const g = new THREE.Group();
  box(g, M.wood, 1.8, 0.36, 0.4, 0, 0.12, 0, 0.012);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, M.black, 0.018, 0.014, 0.12, sx * 0.8, 0, sz * 0.14);
  for (const x of [-0.6, 0, 0.6]) box(g, M.black, 0.1, 0.012, 0.012, x, 0.4, 0.203);
  // Téléviseur sur pied
  box(g, M.black, 0.5, 0.015, 0.2, 0, 0.48, 0);
  box(g, M.black, 0.06, 0.1, 0.03, 0, 0.49, -0.02);
  box(g, M.black, 1.24, 0.72, 0.035, 0, 0.57, 0, 0.008);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.21, 0.69), M.screen);
  screen.position.set(0, 0.93, 0.019);
  g.add(screen);
  cyl(g, M.ceramic, 0.05, 0.07, 0.2, 0.74, 0.48, 0.02);
  return g;
}

function floorLamp() {
  const g = new THREE.Group();
  cyl(g, M.black, 0.14, 0.15, 0.025, 0, 0, 0);
  cyl(g, M.black, 0.012, 0.012, 1.45, 0, 0.02, 0);
  cyl(g, M.shade, 0.16, 0.2, 0.28, 0, 1.38, 0, true).castShadow = false;
  const light = new THREE.PointLight('#ffd3a0', 2.2, 5, 1.8);
  light.position.set(0, 1.45, 0);
  g.add(light);
  return g;
}

function sideTable() {
  const g = new THREE.Group();
  cyl(g, M.wood, 0.24, 0.24, 0.03, 0, 0.5, 0);
  cyl(g, M.black, 0.015, 0.015, 0.5, 0, 0, 0);
  cyl(g, M.black, 0.16, 0.17, 0.015, 0, 0, 0);
  cyl(g, M.ceramic, 0.04, 0.075, 0.2, 0, 0.53, 0);
  return g;
}

function plant() {
  const g = new THREE.Group();
  cyl(g, M.ceramic, 0.21, 0.15, 0.4, 0, 0, 0);
  cyl(g, new THREE.MeshStandardMaterial({ color: '#3a2c20', roughness: 1 }), 0.19, 0.19, 0.02, 0, 0.385, 0);
  const leafGeo = new THREE.SphereGeometry(1, 12, 8);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + (i % 2) * 0.3;
    const lean = 0.25 + (i % 3) * 0.22;
    const len = 0.55 + (i % 4) * 0.12;
    const stem = new THREE.Group();
    stem.position.y = 0.4;
    stem.rotation.set(0, a, 0);
    const l = new THREE.Mesh(leafGeo, M.leaf);
    l.scale.set(0.085, len / 2, 0.012);
    l.position.set(0, (len / 2) * Math.cos(lean) + 0.1, (len / 2) * Math.sin(lean));
    l.rotation.x = lean;
    l.castShadow = true;
    stem.add(l);
    g.add(stem);
  }
  return g;
}

/** Voilage plissé, dans le plan XY, centré en x, bas posé à y = 0. */
function curtain(width: number, height: number) {
  const geo = new THREE.PlaneGeometry(width, height, 48, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / width) * Math.PI * 14) * 0.035);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, M.linen);
  m.position.y = height / 2;
  m.receiveShadow = true;
  return new THREE.Group().add(m);
}

function wallArt(w: number, h: number) {
  const g = new THREE.Group();
  box(g, M.black, w + 0.05, h + 0.05, 0.03, 0, -h / 2 - 0.025, 0);
  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: artTexture(), roughness: 0.9 }));
  canvas.position.z = 0.017;
  g.add(canvas);
  return g;
}

/** Chaise de salle à manger, façade vers +z. */
function diningChair() {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    box(g, M.wood, 0.035, 0.44, 0.035, sx * 0.2, 0, 0.2);
    box(g, M.wood, 0.035, 0.92, 0.035, sx * 0.2, 0, -0.2);
  }
  box(g, M.cushion, 0.46, 0.07, 0.46, 0, 0.42, 0, 0.025);
  box(g, M.sofa, 0.44, 0.34, 0.045, 0, 0.58, -0.2, 0.02);
  return g;
}

function diningTable(length: number, width: number) {
  const g = new THREE.Group();
  box(g, M.wood, length, 0.045, width, 0, 0.705, 0, 0.012);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(g, M.wood, 0.07, 0.705, 0.07, sx * (length / 2 - 0.1), 0, sz * (width / 2 - 0.1));
  }
  box(g, M.linen, length * 0.75, 0.004, 0.36, 0, 0.75, 0); // chemin de table
  cyl(g, M.terracotta, 0.17, 0.09, 0.09, 0, 0.754, 0);
  return g;
}

function sideboard() {
  const g = new THREE.Group();
  box(g, M.wood, 1.7, 0.66, 0.42, 0, 0.14, 0, 0.012);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, M.black, 0.018, 0.014, 0.14, sx * 0.75, 0, sz * 0.15);
  for (const x of [-0.57, 0, 0.57]) box(g, M.black, 0.012, 0.16, 0.012, x, 0.48, 0.213);
  cyl(g, M.ceramic, 0.05, 0.09, 0.3, -0.55, 0.8, 0);
  cyl(g, M.deep, 0.07, 0.07, 0.16, -0.33, 0.8, 0.04);
  box(g, M.ceramic, 0.3, 0.03, 0.22, 0.5, 0.8, 0, 0.01);
  return g;
}

/** Suspension : câble depuis le plafond (hauteur `drop`) et abat-jour éclairé. */
function pendant(drop: number) {
  const g = new THREE.Group();
  cyl(g, M.black, 0.004, 0.004, drop, 0, -drop, 0).castShadow = false;
  cyl(g, M.black, 0.05, 0.05, 0.02, 0, -0.02, 0);
  cyl(g, M.black, 0.07, 0.3, 0.2, 0, -drop - 0.2, 0, true).castShadow = false;
  const glow = cyl(g, M.shade, 0.06, 0.285, 0.19, 0, -drop - 0.2, 0, true);
  glow.castShadow = false;
  return g;
}

function roundMirror(radius: number) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.025, radius + 0.025, 0.03, 48), M.black);
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 0.034, 48),
    new THREE.MeshStandardMaterial({ color: '#e9eef0', roughness: 0.04, metalness: 1 }),
  );
  frame.rotation.x = glass.rotation.x = Math.PI / 2;
  g.add(frame, glass);
  return g;
}

/** Salle à manger : table pour six, buffet sur le mur nord, suspension et voilages. */
export function furnishRepas(colliders: Rect[]): THREE.Group {
  const g = new THREE.Group();
  const W = SEJOUR.w;
  const cx = 3.05, cz = -1.85;
  const put = (o: THREE.Object3D, x: number, z: number, rotY = 0, y = 0) => {
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    g.add(o);
    return o;
  };

  put(diningTable(1.9, 0.95), cx, cz, Math.PI / 2);
  for (const dz of [-0.6, 0, 0.6]) {
    put(diningChair(), cx - 0.6, cz + dz, Math.PI / 2);
    put(diningChair(), cx + 0.6, cz + dz, -Math.PI / 2);
  }
  colliders.push({ x1: cx - 0.85, z1: cz - 0.95, x2: cx + 0.85, z2: cz + 0.95 });

  put(sideboard(), cx, -3.95 + 0.24);
  colliders.push({ x1: cx - 0.85, z1: -3.95, x2: cx + 0.85, z2: -3.5 });
  put(roundMirror(0.42), cx, -3.95 + 0.02, 0, 1.6);

  put(pendant(1.15), cx, cz, 0, SEJOUR.h);

  // Voilages de la fenêtre est
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.6, 10), M.black);
  rod.rotation.x = Math.PI / 2;
  rod.position.set(W - 0.09, 2.62, -2.05);
  g.add(rod);
  put(curtain(0.6, 2.58), W - 0.09, -3.0, Math.PI / 2, 0.03);
  put(curtain(0.6, 2.58), W - 0.09, -1.1, Math.PI / 2, 0.03);

  return g;
}

const K = {
  front: new THREE.MeshStandardMaterial({ color: '#e7e1d5', roughness: 0.55 }),
  top: new THREE.MeshStandardMaterial({ color: '#45423e', roughness: 0.3 }),
  steel: new THREE.MeshStandardMaterial({ color: '#b5b3ae', roughness: 0.32, metalness: 0.85 }),
  splash: new THREE.MeshStandardMaterial({ color: '#f3efe7', roughness: 0.2 }),
};

/**
 * Linéaire de meubles (bas ou hauts) le long de +x, dos à z = 0, façades vers +z.
 * Origine à l'extrémité gauche, au sol.
 */
function cabinetRun(length: number, y: number, height: number, depth: number, worktop: boolean) {
  const g = new THREE.Group();
  const plinth = y === 0 ? 0.1 : 0;
  if (plinth) box(g, M.black, length, plinth, depth - 0.06, length / 2, 0, depth / 2 - 0.03);
  box(g, K.front, length, height - plinth, depth, length / 2, y + plinth, depth / 2);
  if (worktop) box(g, K.top, length + 0.02, 0.04, depth + 0.03, length / 2, y + height, depth / 2 + 0.005);
  const n = Math.max(1, Math.round(length / 0.6));
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) * length) / n;
    if (i > 0) box(g, M.black, 0.006, height - plinth - 0.02, 0.004, (i * length) / n, y + plinth + 0.01, depth);
    const hy = y === 0 ? y + height - 0.1 : y + 0.06;
    box(g, K.steel, 0.16, 0.012, 0.02, x, hy, depth + 0.01);
  }
  return g;
}

function fridge() {
  const g = new THREE.Group();
  box(g, K.steel, 0.7, 1.85, 0.66, 0, 0.02, 0, 0.02);
  box(g, M.black, 0.7, 0.008, 0.01, 0, 0.72, 0.331);
  for (const [y, h] of [[0.82, 0.5], [0.3, 0.34]]) box(g, M.black, 0.02, h, 0.03, -0.27, y, 0.345);
  return g;
}

/** Cuisine : proposition d'aménagement (meubles, plan de travail et évier restent à poser sur place). */
export function furnishCuisine(colliders: Rect[]): THREE.Group {
  const g = new THREE.Group();
  const X1 = -2.6, ZN = -5.72, ZS = -0.2; // faces intérieures ouest, nord et sud
  const put = (o: THREE.Object3D, x: number, z: number, rotY = 0, y = 0) => {
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    g.add(o);
    return o;
  };

  // Linéaire nord, sous la fenêtre : évier
  const northLen = 3.1;
  put(cabinetRun(northLen, 0, 0.86, 0.6, true), X1, ZN);
  colliders.push({ x1: X1, z1: ZN, x2: X1 + northLen, z2: ZN + 0.62 });
  box(g, K.steel, 0.78, 0.012, 0.44, -0.5, 0.895, ZN + 0.32);
  box(g, M.black, 0.7, 0.004, 0.36, -0.5, 0.905, ZN + 0.32);
  cyl(g, K.steel, 0.014, 0.014, 0.28, -0.5, 0.9, ZN + 0.08);
  box(g, K.steel, 0.022, 0.022, 0.2, -0.5, 1.17, ZN + 0.17);

  // Retour ouest : plaque de cuisson, hotte, meubles hauts et crédence
  const westLen = 2.35;
  put(cabinetRun(westLen, 0, 0.86, 0.6, true), X1, ZN + 0.6 + westLen, Math.PI / 2);
  colliders.push({ x1: X1, z1: ZN + 0.6, x2: X1 + 0.62, z2: ZN + 0.6 + westLen });
  const hobZ = -4.3;
  box(g, M.screen, 0.5, 0.008, 0.58, X1 + 0.32, 0.9, hobZ);
  box(g, K.steel, 0.42, 0.3, 0.6, X1 + 0.21, 1.6, hobZ);
  box(g, K.steel, 0.24, 0.6, 0.24, X1 + 0.12, 1.9, hobZ);
  box(g, K.splash, 0.012, 0.6, westLen + 0.6, X1 + 0.006, 0.9, ZN + (westLen + 0.6) / 2);
  put(cabinetRun(0.95, 1.5, 0.7, 0.35, false), X1, hobZ + 0.3 + 0.95 + 0.05, Math.PI / 2);
  put(cabinetRun(1.0, 1.5, 0.7, 0.35, false), X1, hobZ - 0.35, Math.PI / 2);

  // Mur sud : réfrigérateur et colonne de rangement
  put(fridge(), -1.3, ZS - 0.35, Math.PI);
  const column = cabinetRun(0.7, 0, 2.1, 0.62, false);
  put(column, -0.25, ZS, Math.PI);
  colliders.push({ x1: -1.67, z1: ZS - 0.7, x2: -0.25, z2: ZS });

  // Table de cuisine pour quatre
  const cx = -0.35, cz = -2.95;
  put(diningTable(1.4, 0.8), cx, cz, Math.PI / 2);
  for (const dz of [-0.35, 0.35]) {
    put(diningChair(), cx - 0.52, cz + dz, Math.PI / 2);
    put(diningChair(), cx + 0.52, cz + dz, -Math.PI / 2);
  }
  colliders.push({ x1: cx - 0.8, z1: cz - 0.72, x2: cx + 0.8, z2: cz + 0.72 });
  put(pendant(1.15), cx, cz, 0, SEJOUR.h);

  return g;
}

/**
 * Étagères de rangement le long de +x, dos à z = 0, ouvertes vers +z, garnies de façon sobre.
 * Origine à l'extrémité gauche, au sol.
 */
function shelving(length: number, depth: number, height: number) {
  const g = new THREE.Group();
  const carton = new THREE.MeshStandardMaterial({ color: '#b08d62', roughness: 0.9 });
  const basket = new THREE.MeshStandardMaterial({ map: fabricTexture('#9a7b4f', 31), roughness: 1 });
  const bays = Math.max(1, Math.round(length / 0.95));
  const bay = length / bays;
  for (let i = 0; i <= bays; i++) {
    for (const z of [0.02, depth - 0.02]) box(g, M.black, 0.03, height, 0.03, i * bay, 0, z);
  }
  const levels = [0.12, 0.58, 1.04, 1.5, 1.96].filter((y) => y < height);
  let n = 0;
  for (const y of levels) {
    box(g, M.wood, length, 0.03, depth, length / 2, y, depth / 2);
    if (y > 1.9) continue; // tablette haute laissée libre
    for (let i = 0; i < bays; i++, n++) {
      const x0 = i * bay + 0.1, top = y + 0.03, zc = depth / 2;
      switch (n % 5) {
        case 0:
          box(g, carton, 0.42, 0.3, depth - 0.1, x0 + 0.21, top, zc);
          box(g, carton, 0.28, 0.22, depth - 0.14, x0 + 0.6, top, zc);
          break;
        case 1:
          for (let k = 0; k < 4; k++) cyl(g, k % 2 ? M.ceramic : M.terracotta, 0.055, 0.055, 0.2, x0 + 0.08 + k * 0.17, top, zc);
          break;
        case 2:
          box(g, basket, 0.36, 0.24, depth - 0.1, x0 + 0.18, top, zc, 0.03);
          box(g, basket, 0.36, 0.24, depth - 0.1, x0 + 0.57, top, zc, 0.03);
          break;
        case 3:
          box(g, K.front, 0.5, 0.18, depth - 0.12, x0 + 0.27, top, zc, 0.02);
          box(g, K.front, 0.5, 0.14, depth - 0.12, x0 + 0.27, top + 0.18, zc, 0.02);
          break;
        default:
          for (let k = 0; k < 3; k++) cyl(g, M.deep, 0.07, 0.07, 0.26, x0 + 0.1 + k * 0.22, top, zc);
      }
    }
  }
  return g;
}

/** Réserve : étagères sur le mur ouest, quelques caisses au fond. */
export function furnishReserve(colliders: Rect[]): THREE.Group {
  const g = new THREE.Group();
  const X1 = -4.28, ZN = -5.72;
  const len = 3.8, depth = 0.45;
  const unit = shelving(len, depth, 2.05);
  unit.position.set(X1, 0, ZN + len);
  unit.rotation.y = Math.PI / 2;
  g.add(unit);
  colliders.push({ x1: X1, z1: ZN, x2: X1 + depth, z2: ZN + len });

  const crate = new THREE.MeshStandardMaterial({ map: woodTexture('#a98458', 9), roughness: 0.8 });
  box(g, crate, 0.5, 0.32, 0.38, -3.1, 0, ZN + 0.24);
  box(g, crate, 0.5, 0.32, 0.38, -3.08, 0.32, ZN + 0.25).rotation.y = 0.08;
  cyl(g, K.splash, 0.16, 0.16, 0.42, -3.55, 0, ZN + 0.22);
  colliders.push({ x1: -3.75, z1: ZN, x2: -2.8, z2: ZN + 0.46 });

  const spot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.012, 20),
    new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff1d6', emissiveIntensity: 2.2 }),
  );
  spot.position.set(-3.4, SEJOUR.h - 0.006, -3.8);
  const light = new THREE.PointLight('#ffe9cc', 3, 7, 1.6);
  light.position.set(-3.4, SEJOUR.h - 0.9, -3.8);
  g.add(spot, light);
  return g;
}

/** Hall d'entrée : console et miroir à l'est, banc et patères à l'ouest, paillasson devant la porte. */
export function furnishHall(colliders: Rect[]): THREE.Group {
  const g = new THREE.Group();
  const XW = -4.28, XE = -2.8; // faces intérieures ouest et est

  // Console et miroir, contre le mur de l'escalier
  const cz = 2.5;
  box(g, M.wood, 0.28, 0.03, 1.0, XE - 0.15, 0.82, cz, 0.008);
  for (const s of [-1, 1]) {
    box(g, M.black, 0.02, 0.82, 0.02, XE - 0.03, 0, cz + s * 0.47);
    box(g, M.black, 0.02, 0.82, 0.02, XE - 0.27, 0, cz + s * 0.47);
  }
  cyl(g, M.ceramic, 0.045, 0.08, 0.26, XE - 0.15, 0.85, cz - 0.3);
  cyl(g, M.terracotta, 0.1, 0.06, 0.05, XE - 0.15, 0.85, cz + 0.28);
  const mirror = roundMirror(0.32);
  mirror.position.set(XE - 0.02, 1.55, cz);
  mirror.rotation.y = -Math.PI / 2;
  g.add(mirror);
  colliders.push({ x1: XE - 0.3, z1: cz - 0.5, x2: XE, z2: cz + 0.5 });

  // Banc et patères
  const bz = 2.45;
  box(g, M.wood, 0.34, 0.04, 0.9, XW + 0.18, 0.42, bz, 0.01);
  for (const s of [-1, 1]) for (const t of [0.04, 0.32]) box(g, M.black, 0.025, 0.42, 0.025, XW + t, 0, bz + s * 0.41);
  box(g, M.cushion, 0.3, 0.05, 0.5, XW + 0.18, 0.46, bz - 0.15, 0.02);
  const basket = new THREE.MeshStandardMaterial({ map: fabricTexture('#9a7b4f', 31), roughness: 1 });
  box(g, basket, 0.28, 0.24, 0.4, XW + 0.18, 0, bz + 0.15, 0.03);
  box(g, M.wood, 0.02, 0.09, 0.9, XW + 0.01, 1.62, bz);
  for (const dz of [-0.33, -0.11, 0.11, 0.33]) {
    const peg = cyl(g, M.black, 0.012, 0.012, 0.07, XW + 0.055, 1.653, bz + dz);
    peg.rotation.z = Math.PI / 2;
  }
  box(g, M.deep, 0.07, 0.42, 0.3, XW + 0.075, 1.2, bz - 0.33, 0.03);
  box(g, M.accent, 0.05, 0.5, 0.22, XW + 0.06, 1.12, bz + 0.11, 0.02);
  colliders.push({ x1: XW, z1: bz - 0.47, x2: XW + 0.36, z2: bz + 0.47 });

  // Paillasson devant la porte d'entrée
  const mat = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 0.012, 0.5),
    new THREE.MeshStandardMaterial({ map: fabricTexture('#6f5a41', 41), roughness: 1 }),
  );
  mat.position.set(-3.55, 0.008, 2.9);
  mat.receiveShadow = true;
  g.add(mat);

  const spot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.012, 20),
    new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff1d6', emissiveIntensity: 2.2 }),
  );
  spot.position.set(-3.54, SEJOUR.h - 0.006, 1.8);
  const light = new THREE.PointLight('#ffe9cc', 3, 7, 1.6);
  light.position.set(-3.54, SEJOUR.h - 0.9, 1.8);
  g.add(spot, light);
  return g;
}

/** Bibliothèque le long de +x, dos à z = 0, ouverte vers +z ; origine à l'extrémité gauche, au sol. */
function bookcase(length: number, depth: number, height: number) {
  const g = new THREE.Group();
  for (const x of [0.015, length - 0.015]) box(g, M.wood, 0.03, height, depth, x, 0, depth / 2);
  box(g, M.wood, length, 0.03, depth, length / 2, height - 0.03, depth / 2);
  const palette = ['#33504b', '#b9623a', '#d9a441', '#e8e2d6', '#2f4a78', '#7a3b34', '#8f8b84']
    .map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  let seed = 17;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let y = 0.08; y < height - 0.35; y += 0.4) {
    box(g, M.wood, length - 0.06, 0.025, depth, length / 2, y, depth / 2);
    const end = 0.05 + (length - 0.1) * (0.6 + rnd() * 0.35);
    for (let x = 0.05; x < end; ) {
      const w = 0.025 + rnd() * 0.03;
      box(g, palette[Math.floor(rnd() * palette.length)], w, 0.2 + rnd() * 0.1, depth * 0.72, x + w / 2, y + 0.025, depth * 0.45);
      x += w + 0.003;
    }
  }
  return g;
}

/** Salle d'étude : bureau sous la fenêtre, bibliothèque, canapé bleu et tapis à damier. */
export function furnishEtude(colliders: Rect[]): THREE.Group {
  const g = new THREE.Group();
  const XW = -7.9, XE = -4.48, ZS = 4.14; // faces intérieures
  const put = (o: THREE.Object3D, x: number, z: number, rotY = 0, y = 0) => {
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    g.add(o);
    return o;
  };
  const solid = (x: number, z: number, hw: number, hd: number) =>
    colliders.push({ x1: x - hw, z1: z - hd, x2: x + hw, z2: z + hd });

  const rug = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.012, 1.5),
    new THREE.MeshStandardMaterial({ map: checkerRugTexture(), roughness: 1 }),
  );
  rug.receiveShadow = true;
  put(rug, -6.5, 1.85, 0, 0.006);

  // Canapé deux places sur le mur nord, tableau au-dessus
  const blue = new THREE.MeshStandardMaterial({ map: fabricTexture('#2f4a78', 51), roughness: 0.95 });
  const blue2 = new THREE.MeshStandardMaterial({ map: fabricTexture('#3a578a', 52), roughness: 0.95 });
  const sofa = seating(2, 0.64, blue, blue2);
  throwPillow(sofa, M.cushion, 0.42, 0.08, -0.3);
  put(sofa, -6.6, 0.52);
  solid(-6.6, 0.52, 0.84, 0.48);
  put(wallArt(1.0, 0.7), -6.6, 0.016, 0, 1.75);
  put(plant(), -5.4, 0.36);
  solid(-5.4, 0.36, 0.22, 0.22);

  // Bureau sous la fenêtre sud
  const dx = -6.2, dz = ZS - 0.36;
  box(g, M.wood, 1.4, 0.035, 0.65, dx, 0.72, dz, 0.01);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, M.black, 0.03, 0.72, 0.03, dx + sx * 0.65, 0, dz + sz * 0.28);
  box(g, K.steel, 0.32, 0.014, 0.22, dx, 0.755, dz - 0.08);
  const screen = box(g, M.screen, 0.32, 0.2, 0.008, dx, 0.765, dz + 0.06);
  screen.rotation.x = -0.25;
  box(g, M.deep, 0.2, 0.03, 0.27, dx - 0.45, 0.755, dz).rotation.y = 0.15;
  box(g, M.accent, 0.19, 0.025, 0.26, dx - 0.45, 0.785, dz).rotation.y = -0.1;
  cyl(g, M.black, 0.07, 0.07, 0.015, dx + 0.5, 0.755, dz + 0.1);
  cyl(g, M.black, 0.008, 0.008, 0.32, dx + 0.5, 0.77, dz + 0.1);
  cyl(g, M.shade, 0.05, 0.1, 0.12, dx + 0.5, 1.07, dz + 0.1, true).castShadow = false;
  colliders.push({ x1: dx - 0.72, z1: dz - 0.34, x2: dx + 0.72, z2: ZS });
  put(diningChair(), dx, dz - 0.62);
  solid(dx, dz - 0.62, 0.25, 0.25);

  // Bibliothèque sur le mur est
  put(bookcase(1.6, 0.32, 2.05), XE, 2.0, -Math.PI / 2);
  colliders.push({ x1: XE - 0.34, z1: 2.0, x2: XE, z2: 3.6 });

  // Voilages de la fenêtre sud
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 3.0, 10), M.black);
  rod.rotation.z = Math.PI / 2;
  rod.position.set(-6.15, 2.62, ZS - 0.09);
  g.add(rod);
  put(curtain(0.55, 2.58), -7.4, ZS - 0.09, 0, 0.03);
  put(curtain(0.55, 2.58), -4.9, ZS - 0.09, 0, 0.03);

  const spot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.012, 20),
    new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff1d6', emissiveIntensity: 2.2 }),
  );
  spot.position.set(-6.2, SEJOUR.h - 0.006, 2.0);
  const light = new THREE.PointLight('#ffe9cc', 5, 8, 1.6);
  light.position.set(-6.2, SEJOUR.h - 0.9, 2.0);
  g.add(spot, light);
  void XW;
  return g;
}

/** Lit double (1,50 × 2,00 m), tête vers -z, centré sur l'origine. */
function bed(duvet: THREE.Material) {
  const g = new THREE.Group();
  const sheet = new THREE.MeshStandardMaterial({ map: fabricTexture('#efeae0', 61), roughness: 1 });
  box(g, M.wood, 1.58, 0.22, 2.06, 0, 0.08, 0, 0.02);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, M.wood, 0.06, 0.08, 0.06, sx * 0.72, 0, sz * 0.95);
  box(g, M.sofa, 1.66, 1.05, 0.08, 0, 0, -1.07, 0.03); // tête de lit
  box(g, sheet, 1.5, 0.22, 2.0, 0, 0.3, 0, 0.07);
  box(g, duvet, 1.56, 0.1, 1.35, 0, 0.46, 0.34, 0.05);
  box(g, sheet, 1.56, 0.06, 0.22, 0, 0.5, -0.38, 0.03); // revers du drap
  for (const sx of [-1, 1]) {
    box(g, sheet, 0.62, 0.14, 0.4, sx * 0.37, 0.5, -0.74, 0.07).rotation.x = -0.12;
  }
  return g;
}

function nightstand() {
  const g = new THREE.Group();
  box(g, M.wood, 0.42, 0.3, 0.36, 0, 0.16, 0, 0.012);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, M.black, 0.014, 0.012, 0.16, sx * 0.17, 0, sz * 0.14);
  box(g, M.black, 0.1, 0.01, 0.012, 0, 0.36, 0.183);
  cyl(g, M.ceramic, 0.06, 0.07, 0.14, 0, 0.46, 0);
  cyl(g, M.shade, 0.07, 0.11, 0.14, 0, 0.62, 0, true).castShadow = false;
  return g;
}

/** Chambre d'amis : lit double tête à l'ouest, chevets, penderie à l'est comme sur le plan. */
export function furnishChambreAmis(colliders: Rect[]): THREE.Group {
  const g = new THREE.Group();
  const XW = -8.45, XE = -4.48, ZN = -5.72;
  const put = (o: THREE.Object3D, x: number, z: number, rotY = 0, y = 0) => {
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    g.add(o);
    return o;
  };

  const rug = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.012, 2.2),
    new THREE.MeshStandardMaterial({ map: fabricTexture('#cfc4b2', 62), roughness: 1 }),
  );
  rug.receiveShadow = true;
  put(rug, -6.15, -4.25, 0, 0.006);

  const bz = -4.25;
  put(bed(M.deep), XW + 1.12, bz, Math.PI / 2);
  colliders.push({ x1: XW, z1: bz - 0.8, x2: XW + 2.17, z2: bz + 0.8 });
  for (const s of [-1, 1]) {
    put(nightstand(), XW + 0.23, bz + s * 1.05, Math.PI / 2);
    colliders.push({ x1: XW, z1: bz + s * 1.05 - 0.22, x2: XW + 0.42, z2: bz + s * 1.05 + 0.22 });
  }
  put(wallArt(0.9, 0.6), XW + 0.016, bz, Math.PI / 2, 1.8);

  // Penderie contre le mur est
  put(cabinetRun(1.5, 0, 2.2, 0.6, false), XE, ZN, -Math.PI / 2);
  colliders.push({ x1: XE - 0.62, z1: ZN, x2: XE, z2: ZN + 1.5 });

  // Voilages de la fenêtre nord
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.3, 10), M.black);
  rod.rotation.z = Math.PI / 2;
  rod.position.set(-6.2, 2.62, ZN + 0.09);
  g.add(rod);
  put(curtain(0.5, 2.58), -7.1, ZN + 0.09, 0, 0.03);
  put(curtain(0.5, 2.58), -5.3, ZN + 0.09, 0, 0.03);

  const spot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.012, 20),
    new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff1d6', emissiveIntensity: 2.2 }),
  );
  spot.position.set(-6.0, SEJOUR.h - 0.006, -4.25);
  const light = new THREE.PointLight('#ffe9cc', 4.5, 8, 1.6);
  light.position.set(-6.0, SEJOUR.h - 0.9, -4.25);
  g.add(spot, light);
  return g;
}

const S = {
  mirror: new THREE.MeshStandardMaterial({ color: '#e9eef0', roughness: 0.04, metalness: 1 }),
  glass: new THREE.MeshStandardMaterial({
    color: '#cfe3e6', transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false,
  }),
  planter: new THREE.MeshStandardMaterial({ color: '#4a4743', roughness: 0.8 }),
  plaster: new THREE.MeshStandardMaterial({ color: '#f1ece2', roughness: 0.92 }),
};

function ceilingSpot(parent: THREE.Object3D, x: number, z: number) {
  const spot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.012, 20),
    new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff1d6', emissiveIntensity: 2.2 }),
  );
  spot.position.set(x, SEJOUR.h - 0.006, z);
  parent.add(spot);
}

/** Cuvette de WC : dos à z = 0, façade vers +z, origine au sol. */
function toilet() {
  const g = new THREE.Group();
  box(g, M.ceramic, 0.38, 0.38, 0.16, 0, 0.4, 0.08, 0.02);
  box(g, M.ceramic, 0.36, 0.4, 0.44, 0, 0, 0.38, 0.08);
  box(g, K.front, 0.37, 0.03, 0.43, 0, 0.4, 0.38, 0.012);
  box(g, K.steel, 0.08, 0.008, 0.05, 0, 0.78, 0.08);
  return g;
}

/** Lavabo (sur meuble ou lave-mains) et son miroir : dos à z = 0, façade vers +z. */
function basin(width: number, depth: number, cabinet: boolean) {
  const g = new THREE.Group();
  if (cabinet) box(g, K.front, width - 0.04, 0.42, depth - 0.05, 0, 0.36, depth / 2 - 0.02);
  box(g, M.ceramic, width, 0.12, depth, 0, 0.78, depth / 2, 0.03);
  box(g, K.top, width - 0.12, 0.004, depth - 0.14, 0, 0.899, depth / 2 + 0.02);
  cyl(g, K.steel, 0.012, 0.012, 0.14, 0, 0.9, 0.05);
  box(g, K.steel, 0.02, 0.02, 0.1, 0, 1.02, 0.09);
  box(g, S.mirror, width, 0.62, 0.012, 0, 1.2, 0.006);
  return g;
}

/** Salle d'eau de la chambre d'amis et WC visiteurs. */
export function furnishSanitaires(colliders: Rect[]): THREE.Group {
  const g = new THREE.Group();
  const XW = -8.45;
  const put = (o: THREE.Object3D, x: number, z: number, rotY = 0) => {
    o.position.set(x, 0, z);
    o.rotation.y = rotY;
    g.add(o);
    return o;
  };

  // Salle d'eau : douche à l'ouest, WC et lavabo sur le mur nord
  const ZN = -2.57, ZS = -1.35, depth = ZS - ZN;
  box(g, M.ceramic, 0.9, 0.05, depth, XW + 0.45, 0, ZN + depth / 2);
  box(g, K.top, 0.08, 0.004, 0.08, XW + 0.45, 0.05, ZN + depth / 2);
  box(g, K.splash, 0.9, 2.1, 0.01, XW + 0.45, 0, ZN + 0.005);
  box(g, K.splash, 0.9, 2.1, 0.01, XW + 0.45, 0, ZS - 0.005);
  box(g, K.splash, 0.01, 1.46, depth, XW + 0.005, 0, ZN + depth / 2);
  box(g, S.glass, 0.01, 1.95, 0.75, XW + 0.9, 0.05, ZN + 0.375).castShadow = false;
  colliders.push({ x1: XW + 0.88, z1: ZN, x2: XW + 0.92, z2: ZN + 0.75 });
  cyl(g, K.steel, 0.012, 0.012, 1.1, XW + 0.45, 1.0, ZN + 0.035);
  box(g, K.steel, 0.02, 0.02, 0.24, XW + 0.45, 2.09, ZN + 0.14);
  cyl(g, K.steel, 0.1, 0.1, 0.015, XW + 0.45, 2.06, ZN + 0.26);
  put(toilet(), -7.15, ZN);
  colliders.push({ x1: -7.36, z1: ZN, x2: -6.94, z2: ZN + 0.58 });
  put(basin(0.6, 0.46, true), -6.5, ZN);
  colliders.push({ x1: -6.8, z1: ZN, x2: -6.2, z2: ZN + 0.46 });
  ceilingSpot(g, -7.0, ZN + depth / 2);

  // WC visiteurs : cuvette à l'ouest, lave-mains sur le mur nord
  const WN = -1.15, wz = -0.675;
  put(toilet(), XW, wz, Math.PI / 2);
  colliders.push({ x1: XW, z1: wz - 0.2, x2: XW + 0.6, z2: wz + 0.2 });
  put(basin(0.36, 0.25, false), -6.9, WN);
  colliders.push({ x1: -7.08, z1: WN, x2: -6.72, z2: WN + 0.25 });
  ceilingSpot(g, -7.2, wz);

  // Une seule source, à cheval sur la cloison, éclaire les deux pièces
  const light = new THREE.PointLight('#ffe9cc', 4, 6, 1.6);
  light.position.set(-7.2, 2.3, -1.25);
  g.add(light);
  return g;
}

/** Jardinière le long de +x, centrée sur l'origine. */
function planter(length: number) {
  const g = new THREE.Group();
  box(g, S.planter, length, 0.4, 0.34, 0, 0, 0, 0.02);
  const n = Math.max(2, Math.round(length / 0.32));
  for (let i = 0; i < n; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), M.leaf);
    b.position.set((i + 0.5) * (length / n) - length / 2, 0.5 + (i % 2) * 0.05, (i % 2 ? 1 : -1) * 0.02);
    b.scale.set(1, 0.85 + (i % 3) * 0.12, 0.8);
    b.castShadow = true;
    g.add(b);
  }
  return g;
}

/** Terrasse principale (entrée) et terrasse de la cuisine, bordées de jardinières. */
export function furnishTerrasses(colliders: Rect[]): THREE.Group {
  const g = new THREE.Group();
  const put = (o: THREE.Object3D, x: number, z: number, rotY = 0) => {
    o.position.set(x, 0, z);
    o.rotation.y = rotY;
    g.add(o);
    return o;
  };
  const solid = (x: number, z: number, hw: number, hd: number) =>
    colliders.push({ x1: x - hw, z1: z - hd, x2: x + hw, z2: z + hd });

  // Terrasse principale : deux fauteuils devant la salle d'étude, poteau d'angle
  put(seating(1, 0.6), -7.05, 4.86);
  solid(-7.05, 4.86, 0.48, 0.48);
  put(seating(1, 0.6), -5.75, 4.86);
  solid(-5.75, 4.86, 0.48, 0.48);
  put(sideTable(), -6.4, 4.75);
  solid(-6.4, 4.75, 0.2, 0.2);
  box(g, S.plaster, 0.2, SEJOUR.h, 0.2, -8.0, 0, 6.0);
  put(planter(0.85), -7.93, 5.4, Math.PI / 2);
  put(planter(1.3), -6.95, 5.93);
  put(planter(1.3), -5.45, 5.93);
  // Limites de la terrasse (bords libres compris)
  colliders.push({ x1: -8.3, z1: 4.14, x2: -7.72, z2: 6.3 }, { x1: -8.3, z1: 5.72, x2: -2.6, z2: 6.3 });

  // Terrasse de la cuisine : table bistrot, jardinière et poteau d'angle
  const tx = 3.3, tz = -5.0;
  cyl(g, M.wood, 0.34, 0.34, 0.03, tx, 0.72, tz);
  cyl(g, M.black, 0.02, 0.02, 0.72, tx, 0, tz);
  cyl(g, M.black, 0.2, 0.22, 0.02, tx, 0, tz);
  put(diningChair(), tx - 0.6, tz, Math.PI / 2);
  put(diningChair(), tx + 0.6, tz, -Math.PI / 2);
  solid(tx, tz, 0.85, 0.36);
  box(g, S.plaster, 0.2, SEJOUR.h, 0.2, 4.82, 0, -5.82);
  put(planter(2.4), 3.1, -5.72);
  colliders.push({ x1: 1.32, z1: -6.1, x2: 5.1, z2: -5.52 }, { x1: 4.72, z1: -6.1, x2: 5.1, z2: -4.15 });

  return g;
}

export function furnishSejour(colliders: Rect[]): THREE.Group {
  const g = new THREE.Group();
  const { w: W, d: D } = SEJOUR;
  const cx = 2.36;
  const put = (o: THREE.Object3D, x: number, z: number, rotY = 0, y = 0) => {
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    g.add(o);
    return o;
  };
  const solid = (x: number, z: number, hw: number, hd: number) =>
    colliders.push({ x1: x - hw, z1: z - hd, x2: x + hw, z2: z + hd });

  // Tapis
  const rug = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.012, 2.1), new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1 }));
  rug.receiveShadow = true;
  put(rug, cx, 3.0, 0, 0.006);

  // Canapé 3 places, dos au coin repas
  const sofa = seating(3);
  throwPillow(sofa, M.accent, -0.72, 0.08, 0.35);
  throwPillow(sofa, M.deep, 0.74, 0.08, -0.3);
  put(sofa, cx, 1.5);
  solid(cx, 1.5, 1.16, 0.48);

  // Deux fauteuils, légèrement tournés vers la télévision
  put(seating(1, 0.6), 0.72, 3.2, Math.PI / 2 - 0.3);
  solid(0.72, 3.2, 0.48, 0.5);
  put(seating(1, 0.6), W - 0.72, 3.2, -Math.PI / 2 + 0.3);
  solid(W - 0.72, 3.2, 0.48, 0.5);

  put(coffeeTable(), cx, 3.05);
  solid(cx, 3.05, 0.55, 0.3);

  put(tvUnit(), cx, D - 0.24, Math.PI);
  solid(cx, D - 0.24, 0.9, 0.22);

  put(floorLamp(), 0.42, 1.25);
  solid(0.42, 1.25, 0.14, 0.14);
  put(sideTable(), W - 0.5, 1.45);
  solid(W - 0.5, 1.45, 0.22, 0.22);
  put(plant(), W - 0.42, D - 0.45);
  solid(W - 0.42, D - 0.45, 0.22, 0.22);

  // Tableau sur le mur de l'escalier
  put(wallArt(1.1, 0.8), 0.016, 3.6, Math.PI / 2, 1.95);

  // Voilages de part et d'autre de la baie est, et leur tringle
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 3.4, 10), M.black);
  rod.rotation.x = Math.PI / 2;
  rod.position.set(W - 0.09, 2.62, 2.6);
  g.add(rod);
  put(curtain(0.75, 2.58), W - 0.09, 1.3, Math.PI / 2, 0.03);
  put(curtain(0.75, 2.58), W - 0.09, 3.9, Math.PI / 2, 0.03);

  return g;
}
