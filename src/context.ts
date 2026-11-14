import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLOT } from './plan';
import { earthTexture, plasterRelief } from './textures';

/**
 * Voisinage indicatif de Logbessou : rue en latérite au sud, maisons voisines, végétation
 * tropicale et collines à l'horizon. Rien n'est relevé : c'est un décor pour les vues et les fenêtres.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const Y = -0.12; // niveau du terrain

/** Houppier irrégulier : une sphère dont les sommets sont bosselés. */
function canopy(radius: number, rnd: () => number, mat: THREE.Material) {
  const geo = new THREE.IcosahedronGeometry(radius, 3);
  const pos = geo.attributes.position;
  const lumps = Array.from({ length: 7 }, () => new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize());
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    let k = 1;
    for (const l of lumps) k += 0.16 * Math.max(0, n.dot(l)) ** 3;
    k *= 1 - 0.18 * Math.max(0, -n.y); // dessous aplati
    v.multiplyScalar(k);
    pos.setXYZ(i, v.x, v.y * 0.82, v.z);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

export function buildContext(): THREE.Group {
  const g = new THREE.Group();
  const rnd = rng(2024);
  const M = {
    trunk: new THREE.MeshStandardMaterial({ color: '#5b4633', roughness: 1 }),
    palmTrunk: new THREE.MeshStandardMaterial({ color: '#7a6a55', roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#3f6b34', roughness: 0.85 }),
    leaf2: new THREE.MeshStandardMaterial({ color: '#56803d', roughness: 0.85 }),
    frond: new THREE.MeshStandardMaterial({ color: '#4c7a36', roughness: 0.8, side: THREE.DoubleSide }),
    banana: new THREE.MeshStandardMaterial({ color: '#6a9a3e', roughness: 0.7, side: THREE.DoubleSide }),
    road: new THREE.MeshStandardMaterial({ map: earthTexture(), color: '#d79a6c', roughness: 1 }),
    walls: ['#e9e2d2', '#d9cbb0', '#e6d3b8', '#cfd6cf', '#e2c9a6'].map((color) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
      m.userData.relief = plasterRelief(0.5);
      return m;
    }),
    roofs: ['#8c4a38', '#6d7377', '#9a5a3f', '#55606a'].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.2 })),
    window: new THREE.MeshStandardMaterial({ color: '#27323a', roughness: 0.15, metalness: 0.5 }),
    pole: new THREE.MeshStandardMaterial({ color: '#4d463e', roughness: 0.9 }),
    hill: new THREE.MeshStandardMaterial({ color: '#5f7a55', roughness: 1 }),
  };
  const add = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => {
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  const placed = (geo: THREE.BufferGeometry, at: THREE.Vector3, tilt: number, turn: number) =>
    geo.applyMatrix4(new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, turn, 0, 'YXZ')), new THREE.Vector3(1, 1, 1)));
  const cast = (m: THREE.Mesh) => { m.castShadow = m.receiveShadow = true; return m; };

  // Arbre à houppier (manguier, avocatier…)
  const tree = (x: number, z: number, h: number, r: number) => {
    const t = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, h, 8), M.trunk));
    add(t, x, Y + h / 2, z).rotation.z = (rnd() - 0.5) * 0.08;
    add(canopy(r, rnd, M.leaf), x, Y + h + r * 0.45, z);
    add(canopy(r * 0.7, rnd, M.leaf2), x + r * 0.55, Y + h + r * 0.75, z + r * 0.25);
    add(canopy(r * 0.65, rnd, M.leaf), x - r * 0.5, Y + h + r * 0.3, z - r * 0.4);
  };

  // Palmier : stipe légèrement courbe et couronne de palmes retombantes
  const palm = (x: number, z: number, h: number) => {
    const p = new THREE.Group();
    const lean = (rnd() - 0.5) * 0.5, dir = rnd() * Math.PI * 2;
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, h * 0.6, 0), new THREE.Vector3(Math.cos(dir) * lean, h, Math.sin(dir) * lean),
    );
    p.add(cast(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.11, 7), M.palmTrunk)));
    const top = curve.getPoint(1);
    const fronds: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 11; i++) {
      const len = 1.7 + rnd() * 0.7;
      const geo = new THREE.PlaneGeometry(0.5, len, 2, 6);
      geo.translate(0, len / 2, 0);
      const pos = geo.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const t = pos.getY(k) / len;
        pos.setZ(k, t * t * len * 0.6 + Math.abs(pos.getX(k)) * 0.5); // retombée et pli central
        pos.setX(k, pos.getX(k) * (1 - t * 0.85));
      }
      geo.computeVertexNormals();
      fronds.push(placed(geo, top, 0.75 + rnd() * 0.7, (i / 11) * Math.PI * 2 + rnd() * 0.3));
    }
    p.add(cast(new THREE.Mesh(mergeGeometries(fronds), M.frond)));
    add(p, x, Y, z);
  };

  // Bananier : grandes feuilles en bouquet
  const banana = (x: number, z: number) => {
    const b = new THREE.Group();
    b.add(cast(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.3, 7), M.banana)).translateY(0.65));
    const leaves: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const len = 1.1 + rnd() * 0.5;
      const geo = new THREE.PlaneGeometry(0.42, len, 2, 5);
      geo.translate(0, len / 2, 0);
      const pos = geo.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const t = pos.getY(k) / len;
        pos.setZ(k, t * t * len * 0.45 + Math.abs(pos.getX(k)) * 0.35);
        pos.setX(k, pos.getX(k) * (0.5 + Math.sin(t * Math.PI) * 0.7));
      }
      geo.computeVertexNormals();
      leaves.push(placed(geo, new THREE.Vector3(0, 1.25, 0), 0.35 + rnd() * 0.6, (i / 6) * Math.PI * 2 + rnd() * 0.5));
    }
    b.add(cast(new THREE.Mesh(mergeGeometries(leaves), M.banana)));
    add(b, x, Y, z);
  };

  // Maison voisine : volume crépi, toit débordant, baies sombres, mur de clôture
  const neighbour = (x: number, z: number, w: number, d: number, floors: number, rot: number) => {
    const n = new THREE.Group();
    const wall = M.walls[Math.floor(rnd() * M.walls.length)], roof = M.roofs[Math.floor(rnd() * M.roofs.length)];
    const h = floors * 3.1;
    n.add(cast(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall)).translateY(h / 2));
    // Toit à quatre pans : pyramide de base carrée unité, étirée à l'emprise débordante
    const hip = cast(new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4), roof));
    hip.scale.set(w + 1.2, 1.6, d + 1.2);
    hip.position.y = h + 0.8;
    n.add(hip);
    const wins: THREE.BufferGeometry[] = [];
    for (let f = 0; f < floors; f++) for (const side of [-1, 1]) {
      const count = Math.max(2, Math.round(w / 3));
      for (let i = 0; i < count; i++) {
        wins.push(new THREE.BoxGeometry(1.3, 1.3, 0.06).translate((i + 0.5) * (w / count) - w / 2, f * 3.1 + 1.65, side * (d / 2 + 0.01)));
      }
    }
    n.add(new THREE.Mesh(mergeGeometries(wins), M.window));
    const fence = cast(new THREE.Mesh(new THREE.BoxGeometry(w + 6, 1.9, 0.2), wall));
    fence.position.set(0, 0.95, d / 2 + 3.5);
    n.add(fence);
    add(n, x, Y, z).rotation.y = rot;
  };

  const { x1, z1, x2, z2 } = PLOT;

  // Rue en latérite devant le portail, avec ses poteaux
  const roadZ = z2 + 4.2;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(260, 6.4), M.road);
  road.material.map!.repeat.set(110, 2.7);
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  add(road, 0, Y + 0.012, roadZ);
  for (let x = -70; x <= 70; x += 28) {
    add(cast(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 7.5, 8), M.pole)), x + 5, Y + 3.75, roadZ + 3.9);
    add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.08), M.pole), x + 5, Y + 7.0, roadZ + 3.9);
  }

  // Maisons du quartier
  neighbour(x2 + 13, 2, 11, 9, 2, Math.PI / 2);
  neighbour(x2 + 15, -18, 12, 10, 1, Math.PI / 2);
  neighbour(x1 - 13, 4, 10, 9, 1, -Math.PI / 2);
  neighbour(x1 - 15, -16, 12, 9, 2, -Math.PI / 2);
  neighbour(-3, z1 - 14, 13, 9, 2, Math.PI);
  neighbour(20, z1 - 16, 10, 9, 1, Math.PI);
  neighbour(-24, z1 - 15, 11, 8, 1, Math.PI);
  for (let i = 0; i < 6; i++) neighbour(-50 + i * 20 + rnd() * 4, roadZ + 15 + rnd() * 4, 9 + rnd() * 4, 8 + rnd() * 2, 1 + Math.round(rnd()), 0);
  for (let i = 0; i < 8; i++) {
    const a = rnd() * Math.PI * 2, r = 55 + rnd() * 50;
    neighbour(Math.cos(a) * r, Math.sin(a) * r, 9 + rnd() * 5, 8 + rnd() * 3, 1 + Math.round(rnd()), Math.round(rnd() * 4) * Math.PI / 2);
  }

  // Végétation du jardin
  tree(-9.4, 6.6, 2.6, 1.15);
  tree(-9.3, -6.9, 2.9, 1.2);
  palm(6.0, -7.0, 4.6);
  palm(5.9, 9.6, 5.2);
  banana(-9.7, 9.4);
  banana(-9.4, 10.6);
  banana(6.3, 12.4);
  // … et du quartier
  tree(10.5, 8.5, 3.2, 1.5);
  tree(-14.5, -5.0, 3.4, 1.6);
  tree(4.0, -12.5, 3.6, 1.7);
  palm(11.2, -6.0, 6.2);
  palm(-13.6, 11.0, 5.6);
  palm(-7.0, -12.0, 6.6);
  banana(9.6, -11.0);
  for (let i = 0; i < 32; i++) {
    const a = rnd() * Math.PI * 2, r = 24 + rnd() * 80;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(z - roadZ) < 5) continue;
    const kind = rnd();
    if (kind < 0.5) tree(x, z, 2.8 + rnd() * 1.6, 1.3 + rnd() * 1.1);
    else if (kind < 0.85) palm(x, z, 5 + rnd() * 3);
    else banana(x, z);
  }

  // Collines boisées à l'horizon
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rnd() * 0.3, r = 210 + rnd() * 70;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.hill);
    hill.scale.set(60 + rnd() * 50, 12 + rnd() * 20, 50 + rnd() * 40);
    add(hill, Math.cos(a) * r, Y - 1, Math.sin(a) * r);
  }
  return g;
}
