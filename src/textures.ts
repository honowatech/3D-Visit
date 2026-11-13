import * as THREE from 'three';

/** Textures procédurales (aucun fichier image à charger). */

type Draw = (c: CanvasRenderingContext2D, s: number, rnd: () => number) => void;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Relief associé à une texture de couleur : micro-relief (normales) et, au besoin, rugosité. */
interface Relief { normal: THREE.CanvasTexture; rough?: THREE.CanvasTexture; scale: number }
const reliefs = new WeakMap<object, Relief>();

interface ReliefSpec {
  strength: number; // pente tirée de la carte de hauteur
  scale?: number; // intensité au rendu
  height?: Draw; // carte de hauteur dédiée (sinon : la luminosité de la couleur)
  rough?: Draw; // carte de rugosité (niveaux de gris)
}

function canvasOf(size: number, seed: number, draw: Draw) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d', { willReadFrequently: true })!, size, rng(seed));
  return cv;
}

/** Carte de normales calculée à partir des hauteurs (clair = haut), raccordable bord à bord. */
function normalsFrom(src: HTMLCanvasElement, strength: number) {
  const s = src.width;
  const px = src.getContext('2d')!.getImageData(0, 0, s, s).data;
  const h = new Float32Array(s * s);
  for (let i = 0; i < s * s; i++) h[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
  const out = document.createElement('canvas');
  out.width = out.height = s;
  const ctx = out.getContext('2d')!;
  const img = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) {
    const up = ((y + s - 1) % s) * s, down = ((y + 1) % s) * s;
    for (let x = 0; x < s; x++) {
      const dx = (h[y * s + ((x + 1) % s)] - h[y * s + ((x + s - 1) % s)]) * strength;
      const dy = (h[down + x] - h[up + x]) * strength;
      const k = 1 / Math.hypot(dx, dy, 1);
      const o = (y * s + x) * 4;
      img.data[o] = (-dx * k * 0.5 + 0.5) * 255;
      img.data[o + 1] = (dy * k * 0.5 + 0.5) * 255; // l'image est retournée verticalement à l'affichage
      img.data[o + 2] = (k * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function make(size: number, seed: number, draw: Draw, repeat = true, relief?: ReliefSpec) {
  const cv = canvasOf(size, seed, draw);
  const wrap = (t: THREE.CanvasTexture) => {
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  const t = wrap(new THREE.CanvasTexture(cv));
  t.colorSpace = THREE.SRGBColorSpace;
  if (relief) {
    const heights = relief.height ? canvasOf(size, seed, relief.height) : cv;
    reliefs.set(t.source, {
      normal: wrap(new THREE.CanvasTexture(normalsFrom(heights, relief.strength))),
      rough: relief.rough && wrap(new THREE.CanvasTexture(canvasOf(size, seed, relief.rough))),
      scale: relief.scale ?? 1,
    });
  }
  return t;
}

/** Donne leur relief à tous les matériaux de `root` dont la texture de couleur en possède un. */
export function applyRelief(root: THREE.Object3D) {
  const done = new Set<THREE.Material>();
  root.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!mat?.isMeshStandardMaterial || !mat.map || done.has(mat)) return;
    done.add(mat);
    const relief = reliefs.get(mat.map.source);
    if (!relief) return;
    mat.normalMap = relief.normal;
    mat.normalScale.setScalar(relief.scale);
    if (relief.rough) {
      mat.roughnessMap = relief.rough;
      mat.roughness = 1;
    }
    mat.needsUpdate = true;
  });
}

function speckle(c: CanvasRenderingContext2D, s: number, rnd: () => number, n: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    c.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    c.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

/** Un carreau 60×60 cm, grès poli clair, avec son joint. */
export const tileTexture = () =>
  make(512, 7, (c, s, rnd) => {
    c.fillStyle = '#d6cebf';
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 9; i++) {
      c.strokeStyle = `rgba(150,138,120,${0.05 + rnd() * 0.06})`;
      c.lineWidth = 1 + rnd() * 5;
      c.beginPath();
      c.moveTo(rnd() * s, rnd() * s);
      c.bezierCurveTo(rnd() * s, rnd() * s, rnd() * s, rnd() * s, rnd() * s, rnd() * s);
      c.stroke();
    }
    speckle(c, s, rnd, 1500, 0.025);
    c.strokeStyle = '#9d9484';
    c.lineWidth = 6;
    c.strokeRect(0, 0, s, s);
  }, true, {
    strength: 2.2,
    // Carreau plan, légèrement ondulé, bords adoucis ; joint en creux
    height: (c, s, rnd) => {
      c.fillStyle = '#fff';
      c.fillRect(0, 0, s, s);
      for (let i = 0; i < 40; i++) {
        c.fillStyle = `rgba(0,0,0,${0.012 + rnd() * 0.012})`;
        c.beginPath();
        c.arc(rnd() * s, rnd() * s, 30 + rnd() * 70, 0, Math.PI * 2);
        c.fill();
      }
      for (const [w, tone] of [[14, '#cfcfcf'], [10, '#8c8c8c'], [6, '#3c3c3c']] as const) {
        c.strokeStyle = tone;
        c.lineWidth = w;
        c.strokeRect(0, 0, s, s);
      }
    },
    // Grès poli brillant, joint mat
    rough: (c, s, rnd) => {
      c.fillStyle = '#2a2a2a';
      c.fillRect(0, 0, s, s);
      for (let i = 0; i < 30; i++) {
        c.fillStyle = `rgba(255,255,255,${0.02 + rnd() * 0.03})`;
        c.beginPath();
        c.arc(rnd() * s, rnd() * s, 20 + rnd() * 60, 0, Math.PI * 2);
        c.fill();
      }
      c.strokeStyle = '#e0e0e0';
      c.lineWidth = 6;
      c.strokeRect(0, 0, s, s);
    },
  });

export const woodTexture = (base: string, seed = 3) =>
  make(512, seed, (c, s, rnd) => {
    c.fillStyle = base;
    c.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 2) {
      c.fillStyle = `rgba(${rnd() > 0.5 ? '255,235,200' : '30,15,5'},${rnd() * 0.09})`;
      c.fillRect(0, y, s, 1 + rnd() * 3);
    }
    for (let i = 0; i < 14; i++) {
      c.strokeStyle = `rgba(40,20,8,${0.05 + rnd() * 0.08})`;
      c.lineWidth = 1;
      const y = rnd() * s;
      c.beginPath();
      c.moveTo(0, y);
      c.bezierCurveTo(s * 0.3, y + rnd() * 14 - 7, s * 0.7, y + rnd() * 14 - 7, s, y);
      c.stroke();
    }
  }, true, { strength: 5, scale: 0.6 });

export const fabricTexture = (base: string, seed = 11) =>
  make(256, seed, (c, s, rnd) => {
    c.fillStyle = base;
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 3) {
      c.fillStyle = `rgba(255,255,255,${0.03 + rnd() * 0.04})`;
      c.fillRect(i, 0, 1, s);
      c.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.04})`;
      c.fillRect(0, i, s, 1);
    }
    speckle(c, s, rnd, 2500, 0.05);
  }, true, { strength: 7, scale: 0.9 });

export const rugTexture = () =>
  make(
    1024,
    21,
    (c, s, rnd) => {
      c.fillStyle = '#cfc4b2';
      c.fillRect(0, 0, s, s);
      speckle(c, s, rnd, 30000, 0.05);
      c.strokeStyle = '#8a5a3c';
      c.lineWidth = 10;
      c.strokeRect(46, 46, s - 92, s - 92);
      c.lineWidth = 3;
      c.strokeRect(70, 70, s - 140, s - 140);
      c.strokeStyle = 'rgba(138,90,60,0.35)';
      c.lineWidth = 4;
      for (let i = 0; i < 7; i++) {
        const x = 160 + i * ((s - 320) / 6);
        c.beginPath();
        c.moveTo(x, 130);
        c.lineTo(x, s - 130);
        c.stroke();
      }
    },
    false,
    { strength: 3, scale: 0.8 },
  );

/** Tapis à damier gris, clin d'œil à celui de la salle d'étude actuelle. */
export const checkerRugTexture = () =>
  make(
    512,
    33,
    (c, s, rnd) => {
      const n = 8, q = s / n;
      const tones = ['#d9d6d0', '#8f8d89', '#55534f'];
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        c.fillStyle = tones[(i + j * 2) % 3];
        c.fillRect(i * q, j * q, q, q);
      }
      speckle(c, s, rnd, 9000, 0.05);
    },
    false,
    { strength: 1.5, scale: 0.8 },
  );

export const artTexture = () =>
  make(
    512,
    5,
    (c, s) => {
      c.fillStyle = '#efe7d8';
      c.fillRect(0, 0, s, s);
      c.fillStyle = '#c2622d';
      c.beginPath();
      c.arc(s * 0.36, s * 0.42, s * 0.2, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#2f4a45';
      c.fillRect(s * 0.5, s * 0.3, s * 0.3, s * 0.5);
      c.fillStyle = '#d9a441';
      c.fillRect(s * 0.18, s * 0.68, s * 0.5, s * 0.07);
      c.strokeStyle = '#23201c';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(s * 0.12, s * 0.86);
      c.lineTo(s * 0.88, s * 0.2);
      c.stroke();
    },
    false,
  );
