import * as THREE from 'three';

/** Textures procédurales (aucun fichier image à charger). */

type Draw = (c: CanvasRenderingContext2D, s: number, rnd: () => number) => void;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Relief associé à une texture : carte de normales, et rugosité variable le cas échéant. */
export interface Relief {
  normalMap: THREE.Texture;
  strength: number;
  roughnessMap?: THREE.Texture;
  roughnessGain?: number; // la rugosité du matériau est multipliée par ce gain, la carte la module ensuite
}

interface Options {
  repeat?: boolean;
  /** Force du relief tiré de la texture (0 : aucun). */
  bump?: number;
  /** Hauteurs dessinées à part (blanc = haut) ; à défaut, la clarté de la texture en tient lieu. */
  height?: Draw;
  /** Rugosité relative dessinée à part (blanc = mat), avec son gain. */
  rough?: { draw: Draw; gain: number };
  /** Nombre de répétitions par unité d'UV (0,5 : le motif couvre deux unités). */
  scale?: number;
}

function canvasOf(size: number, seed: number, draw: Draw) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d', { willReadFrequently: true })!, size, rng(seed));
  return cv;
}

function textureOf(cv: HTMLCanvasElement, o: Options, color: boolean) {
  const t = new THREE.CanvasTexture(cv);
  if (o.repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  if (o.scale) t.repeat.setScalar(o.scale);
  return t;
}

/** Carte de normales tirée d'un champ de hauteurs (filtre de Sobel, bords raccordés si le motif se répète). */
function normalsOf(height: HTMLCanvasElement, wrap: boolean) {
  const s = height.width;
  const src = height.getContext('2d')!.getImageData(0, 0, s, s).data;
  const h = new Float32Array(s * s);
  for (let i = 0; i < s * s; i++) h[i] = (src[i * 4] * 0.299 + src[i * 4 + 1] * 0.587 + src[i * 4 + 2] * 0.114) / 255;
  const at = (x: number, y: number) =>
    wrap ? h[((y + s) % s) * s + ((x + s) % s)] : h[Math.min(s - 1, Math.max(0, y)) * s + Math.min(s - 1, Math.max(0, x))];
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d')!;
  const out = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
    const dy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
    const nx = -dx * 2, ny = dy * 2; // l'axe v de la texture pointe vers le haut de l'image
    const l = Math.hypot(nx, ny, 1);
    const o = (y * s + x) * 4;
    out.data[o] = (nx / l * 0.5 + 0.5) * 255;
    out.data[o + 1] = (ny / l * 0.5 + 0.5) * 255;
    out.data[o + 2] = (1 / l * 0.5 + 0.5) * 255;
    out.data[o + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return cv;
}

function make(size: number, seed: number, draw: Draw, opts: Options | boolean = {}) {
  const o: Options = typeof opts === 'boolean' ? { repeat: opts } : opts;
  const cv = canvasOf(size, seed, draw);
  const t = textureOf(cv, o, true);
  if (o.bump) {
    const relief: Relief = {
      normalMap: textureOf(normalsOf(o.height ? canvasOf(size, seed, o.height) : cv, o.repeat !== false), o, false),
      strength: o.bump,
    };
    if (o.rough) {
      relief.roughnessMap = textureOf(canvasOf(size, seed, o.rough.draw), o, false);
      relief.roughnessGain = o.rough.gain;
    }
    t.userData.relief = relief;
  }
  return t;
}

/**
 * Donne à chaque matériau le relief de sa texture (normales, rugosité). À appeler une fois la
 * scène construite : les textures portent leur relief, les matériaux n'ont rien à déclarer.
 */
export function applyRelief(root: THREE.Object3D) {
  const done = new Set<THREE.Material>();
  root.traverse((obj) => {
    const m = (obj as THREE.Mesh).material;
    for (const mat of (Array.isArray(m) ? m : m ? [m] : []) as THREE.MeshStandardMaterial[]) {
      const relief = (mat.userData.relief ?? mat.map?.userData.relief) as Relief | undefined;
      if (!mat.isMeshStandardMaterial || !relief || done.has(mat)) continue;
      done.add(mat);
      if (mat.map) for (const t of [relief.normalMap, relief.roughnessMap]) t?.repeat.copy(mat.map.repeat);
      mat.normalMap = relief.normalMap;
      mat.normalScale.setScalar(relief.strength);
      if (relief.roughnessMap) {
        mat.roughnessMap = relief.roughnessMap;
        mat.roughness = Math.min(1, mat.roughness * (relief.roughnessGain ?? 1));
      }
      mat.needsUpdate = true;
    }
  });
}

function speckle(c: CanvasRenderingContext2D, s: number, rnd: () => number, n: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    c.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    c.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

/** Quatre carreaux 60×60 cm en grès poli clair, légèrement dépareillés, avec leurs joints en creux. */
const TILE_JOINT = 7;
const tileJoints = (c: CanvasRenderingContext2D, s: number, tile: string, joint: string) => {
  c.fillStyle = tile;
  c.fillRect(0, 0, s, s);
  c.strokeStyle = joint;
  c.lineWidth = TILE_JOINT;
  for (const q of [0, s / 2, s]) {
    c.beginPath();
    c.moveTo(q, 0); c.lineTo(q, s);
    c.moveTo(0, q); c.lineTo(s, q);
    c.stroke();
  }
};
export const tileTexture = () =>
  make(1024, 7, (c, s, rnd) => {
    const h = s / 2;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const k = 208 + Math.round(rnd() * 10);
      c.fillStyle = `rgb(${k + 6},${k - 2},${k - 17})`;
      c.fillRect(i * h, j * h, h, h);
      c.save();
      c.beginPath();
      c.rect(i * h, j * h, h, h);
      c.clip();
      for (let n = 0; n < 9; n++) {
        c.strokeStyle = `rgba(150,138,120,${0.05 + rnd() * 0.06})`;
        c.lineWidth = 1 + rnd() * 5;
        c.beginPath();
        c.moveTo(i * h + rnd() * h, j * h + rnd() * h);
        c.bezierCurveTo(i * h + rnd() * h, j * h + rnd() * h, i * h + rnd() * h, j * h + rnd() * h, i * h + rnd() * h, j * h + rnd() * h);
        c.stroke();
      }
      c.restore();
    }
    speckle(c, s, rnd, 6000, 0.025);
    tileJoints(c, s, 'rgba(0,0,0,0)', '#9d9484');
  }, {
    scale: 0.5,
    bump: 0.9,
    height: (c, s) => tileJoints(c, s, '#fff', '#777'),
    // Carreau brillant, joint mat ; quelques traces d'usage à peine plus mates
    rough: {
      gain: 5,
      draw: (c, s, rnd) => {
        tileJoints(c, s, '#333', '#fff');
        for (let n = 0; n < 26; n++) {
          const r = 30 + rnd() * 90;
          const x = rnd() * s, y = rnd() * s;
          const g = c.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, `rgba(255,255,255,${0.03 + rnd() * 0.05})`);
          g.addColorStop(1, 'rgba(255,255,255,0)');
          c.fillStyle = g;
          c.fillRect(x - r, y - r, 2 * r, 2 * r);
        }
        tileJoints(c, s, 'rgba(0,0,0,0)', '#fff');
      },
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
  }, { bump: 0.35 });

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
  }, { bump: 0.8 });

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
    { repeat: false },
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
    { repeat: false },
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
    { repeat: false },
  );

/** Bruit doux à plusieurs échelles, raccordé sur les bords (crépi, gravillons, herbe). */
function grain(c: CanvasRenderingContext2D, s: number, rnd: () => number, base: string, layers: [number, number, number][]) {
  c.fillStyle = base;
  c.fillRect(0, 0, s, s);
  for (const [count, radius, alpha] of layers) {
    for (let i = 0; i < count; i++) {
      const x = rnd() * s, y = rnd() * s, r = radius * (0.5 + rnd());
      c.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
      for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
        if (x + ox + r < 0 || x + ox - r > s || y + oy + r < 0 || y + oy - r > s) continue;
        c.beginPath();
        c.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
}

/** Crépi fin des murs : relief seul, la teinte reste celle du matériau (1 m par motif). */
export const plasterRelief = (strength = 0.35): Relief => make(512, 81, (c, s, rnd) =>
  grain(c, s, rnd, '#808080', [[900, 9, 0.05], [5000, 2.2, 0.09], [9000, 1, 0.1]]), { bump: strength }).userData.relief;

/** Étanchéité gravillonnée de la toiture-terrasse. */
export const roofTexture = () => make(512, 83, (c, s, rnd) =>
  grain(c, s, rnd, '#c4beb2', [[400, 16, 0.04], [7000, 2, 0.12], [9000, 1, 0.14]]), { bump: 0.9 });

/** Pelouse : touffes claires et sombres. */
export const grassTexture = () => make(512, 85, (c, s, rnd) => {
  grain(c, s, rnd, '#67884a', [[260, 26, 0.045], [2600, 5, 0.06]]);
  for (let i = 0; i < 9000; i++) {
    c.strokeStyle = rnd() > 0.5 ? `rgba(190,215,120,${0.1 + rnd() * 0.12})` : `rgba(20,45,15,${0.1 + rnd() * 0.14})`;
    const x = rnd() * s, y = rnd() * s;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + rnd() * 5 - 2.5, y - 2 - rnd() * 5);
    c.stroke();
  }
}, { bump: 1.2, scale: 0.3 });

/** Sol nu autour de la parcelle : terre battue. */
export const earthTexture = () => make(512, 87, (c, s, rnd) =>
  grain(c, s, rnd, '#97836a', [[90, 34, 0.018], [3000, 4, 0.045], [8000, 1.2, 0.08]]), { bump: 0.7 });

/** Pavés autobloquants 20×10 cm, pose à joints décalés (motif de 80 cm). */
export const pavingTexture = () => {
  const blocks = (c: CanvasRenderingContext2D, s: number, rnd: () => number, fill: (k: number) => string, joint: string) => {
    c.fillStyle = joint;
    c.fillRect(0, 0, s, s);
    const w = s / 4, h = s / 8, j = 3;
    for (let row = 0; row < 8; row++) for (let col = -1; col < 4; col++) {
      const x = col * w + (row % 2 ? w / 2 : 0);
      c.fillStyle = fill(rnd());
      c.fillRect(x + j, row * h + j, w - 2 * j, h - 2 * j);
      if (x < 0) c.fillRect(x + s + j, row * h + j, w - 2 * j, h - 2 * j);
    }
  };
  return make(512, 89, (c, s, rnd) => {
    blocks(c, s, rnd, (k) => { const v = 168 + Math.round(k * 26); return `rgb(${v + 6},${v},${v - 10})`; }, '#8d8678');
    speckle(c, s, rnd, 9000, 0.05);
  }, { bump: 1.1, scale: 0.75, height: (c, s, rnd) => blocks(c, s, rnd, (k) => `rgb(${220 + k * 30},${220 + k * 30},${220 + k * 30})`, '#555') });
};
