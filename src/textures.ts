import * as THREE from 'three';

/** Textures procédurales (aucun fichier image à charger). */

type Draw = (c: CanvasRenderingContext2D, s: number, rnd: () => number) => void;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function make(size: number, seed: number, draw: Draw, repeat = true) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d')!, size, rng(seed));
  const t = new THREE.CanvasTexture(cv);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
  });

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
  });

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
