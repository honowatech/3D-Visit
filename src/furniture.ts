import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Rect } from './builders';
import { SEJOUR } from './house';
import { artTexture, fabricTexture, rugTexture, woodTexture } from './textures';

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
function seating(seats: number, seatW = 0.64) {
  const g = new THREE.Group();
  const arm = 0.18, depth = 0.92;
  const w = seats * seatW + 2 * arm;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    cyl(g, M.black, 0.02, 0.015, 0.12, sx * (w / 2 - 0.08), 0, sz * (depth / 2 - 0.08));
  }
  box(g, M.sofa, w, 0.2, depth, 0, 0.12, 0, 0.05);
  box(g, M.sofa, w, 0.52, 0.2, 0, 0.3, -depth / 2 + 0.1, 0.07);
  for (const s of [-1, 1]) box(g, M.sofa, arm, 0.32, depth, s * (w / 2 - arm / 2), 0.3, 0, 0.07);
  for (let i = 0; i < seats; i++) {
    const x = (i - (seats - 1) / 2) * seatW;
    box(g, M.cushion, seatW - 0.02, 0.15, 0.68, x, 0.31, 0.1, 0.06);
    const back = box(g, M.cushion, seatW - 0.04, 0.4, 0.15, x, 0.46, -0.24, 0.07);
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
