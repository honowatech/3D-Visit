import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { Walker } from './controls';
import { Daylight, HOURS, type Hour } from './daylight';
import {
  furnishChambreAmis, furnishCuisine, furnishEtage, furnishEtude, furnishHall, furnishRepas, furnishReserve,
  furnishSanitaires, furnishSejour, furnishTerrasses,
} from './furniture';
import { buildHouse, buildSurroundings } from './house';
import { Nav, RDC, STAIRS, UP, type Spot, type Zone } from './nav';
import { ETAGE, STAIR, type Room } from './plan';
import { Pipeline, QUALITIES, type Quality } from './render';
import { applyRelief } from './textures';
import { Tour } from './tour';

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } },
};
/** État transmis par un lien partagé (#vue=…&pos=…). */
const link = new URLSearchParams(location.hash.slice(1));
const numbers = (key: string, count: number) => {
  const n = (link.get(key) ?? '').split(',').map(Number);
  return n.length === count && n.every(Number.isFinite) ? n : null;
};

const canvas = $<HTMLCanvasElement>('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; // la scène est fixe : les ombres ne sont recalculées qu'au besoin
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const labelRenderer = new CSS2DRenderer({ element: $('#labels') });

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const center = new THREE.Vector3(-1.8, 0, 0.5);
const daylight = new Daylight(renderer, scene, center);
const pipeline = new Pipeline(renderer, scene);

// Maison
const house = buildHouse();
house.rdc.add(
  furnishSejour(house.colliders),
  furnishRepas(house.colliders),
  furnishCuisine(house.colliders),
  furnishReserve(house.colliders),
  furnishHall(house.colliders),
  furnishEtude(house.colliders),
  furnishChambreAmis(house.colliders),
  furnishSanitaires(house.colliders),
  furnishTerrasses(house.colliders),
);
const etageFurniture = furnishEtage(house.collidersEtage);
house.etage.add(etageFurniture);
house.roof.add(etageFurniture.userData.ceiling);
scene.add(house.group, buildSurroundings());
applyRelief(scene);
daylight.adopt(house.group);

// Caméras
const walkCam = new THREE.PerspectiveCamera(68, 1, 0.05, 400);
const overCam = new THREE.PerspectiveCamera(40, 1, 0.2, 400);
overCam.position.set(15, 17, 23);
const orbit = new OrbitControls(overCam, canvas);
orbit.target.set(center.x, 2.2, center.z);
orbit.maxPolarAngle = Math.PI / 2 - 0.06;
orbit.minDistance = 5;
orbit.maxDistance = 70;
orbit.enableDamping = true;
orbit.update();

const nav = new Nav(house.colliders, house.collidersEtage);
const walker = new Walker(walkCam, canvas, nav, $('#joy'));
const START = { x: 0.45, z: 0.55, yaw: -Math.PI * 0.72 };
walker.place(START.x, START.z, START.yaw);
const tour = new Tour(walkCam);
// Le premier trajet demande un repérage de toute la maison : on le prépare pendant un temps mort.
(window.requestIdleCallback ?? setTimeout)(() => nav.warm());

const touch = matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch', touch);
addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });

// ── Ombres et qualité d'affichage ────────────────────────────────────────────
let shadowsDirty = 3; // nombre d'images pendant lesquelles recalculer les ombres
const SHADOW_SIZE: Record<Quality, number> = { haute: 4096, moyenne: 2048, legere: 1024 };
const lampShadows = daylight.lights.slice(0, 5); // les lampes principales portent des ombres en haute qualité
for (const l of lampShadows) {
  l.shadow.mapSize.set(512, 512);
  l.shadow.camera.near = 0.08;
  l.shadow.camera.far = l.distance || 9;
  l.shadow.bias = -0.004;
  l.shadow.normalBias = 0.03;
}

type QualityChoice = Quality | 'auto';
const isQuality = (q: string | null): q is Quality => QUALITIES.includes(q as Quality);
const asked = link.get('q') ?? store.get('visite.qualite');
let qualityChoice: QualityChoice = isQuality(asked) ? asked : 'auto';

function applyQuality(q: Quality) {
  pipeline.setQuality(q);
  const size = SHADOW_SIZE[q];
  const shadow = daylight.sun.shadow;
  if (shadow.mapSize.x !== size) {
    shadow.mapSize.set(size, size);
    shadow.map?.dispose();
    shadow.map = null;
  }
  for (const l of lampShadows) l.castShadow = q === 'haute';
  shadowsDirty = 3;
  $('#quality-now').textContent = qualityChoice === 'auto' ? `· ${QUALITY_NAME[q].toLowerCase()}` : '';
}
const QUALITY_NAME: Record<Quality, string> = { haute: 'Haute', moyenne: 'Moyenne', legere: 'Légère' };
const qualitySelect = $<HTMLSelectElement>('#quality');
qualitySelect.value = qualityChoice;
qualitySelect.addEventListener('change', () => {
  qualityChoice = qualitySelect.value as QualityChoice;
  store.set('visite.qualite', qualityChoice);
  applyQuality(qualityChoice === 'auto' ? startQuality : qualityChoice);
  qualitySelect.blur();
});
const startQuality: Quality = touch || Math.min(screen.width, screen.height) < 700 ? 'moyenne' : 'haute';
applyQuality(qualityChoice === 'auto' ? startQuality : qualityChoice);

/** En mode automatique, baisse la qualité d'un cran si l'affichage reste sous ~26 images/s. */
const perf = { time: 0, frames: 0, slow: 0, settle: 3 };
function watchPerformance(elapsed: number) {
  if (qualityChoice !== 'auto' || pipeline.quality === 'legere' || document.hidden || elapsed > 1) return;
  if (perf.settle > 0) { perf.settle -= elapsed; return; } // on laisse passer le chargement
  perf.time += elapsed;
  perf.frames++;
  if (perf.time < 2) return;
  perf.slow = perf.frames / perf.time < 26 ? perf.slow + 1 : 0;
  perf.time = perf.frames = 0;
  if (perf.slow >= 2) {
    perf.slow = 0;
    perf.settle = 2;
    applyQuality(QUALITIES[QUALITIES.indexOf(pipeline.quality) + 1]);
    toast(`Affichage allégé pour rester fluide (qualité ${QUALITY_NAME[pipeline.quality].toLowerCase()})`);
  }
}

// ── Vues ─────────────────────────────────────────────────────────────────────
type View = 'ext' | 'eclate' | 'etage' | 'rdc' | 'walk' | 'tour';
const VIEWS: Record<View, { name: string; info: string }> = {
  ext: { name: 'Extérieur', info: '· terrain de 393 m²' },
  eclate: { name: 'Vue éclatée', info: '· ≈ 242 m² sur 2 niveaux' },
  etage: { name: 'Étage', info: '· ≈ 130 m² + balcon' },
  rdc: { name: 'Rez-de-chaussée', info: '· ≈ 112 m² + terrasses' },
  walk: { name: 'Visite à pied', info: '' },
  tour: { name: 'Visite intérieure complète', info: '' },
};
const HELP: Record<'orbit' | 'walk' | 'tour', string> = {
  orbit: '<kbd>glisser</kbd> tourner · <kbd>molette</kbd> zoomer · <kbd>clic droit</kbd> déplacer · <kbd>V</kbd> visite à pied',
  walk: '<kbd>clic</kbd> aller à ce point · <kbd>glisser</kbd> regarder · <kbd>Z Q S D</kbd> marcher · <kbd>M</kbd> souris captive · <kbd>V</kbd> vue d\'ensemble',
  tour: '<kbd>Espace</kbd> pause · <kbd>←</kbd> <kbd>→</kbd> reculer / avancer · <kbd>Échap</kbd> quitter',
};
const EXPLODE = 5.5;
const LEVEL_NAME = ['rez-de-chaussée', 'étage'];

let view: View = 'ext';
let lastOverview: View = 'ext';
let lift = 0; // hauteur animée de l'étage en vue éclatée
const buttons = [...document.querySelectorAll<HTMLButtonElement>('#actions button')];

function setView(next: View) {
  view = next;
  const walk = view === 'walk', film = view === 'tour';
  const inside = walk || film;
  if (!inside) lastOverview = view;
  walker.enabled = walk;
  orbit.enabled = !inside;
  house.roof.visible = view === 'ext' || inside;
  house.etage.visible = view !== 'rdc';
  house.labels.rdc.visible = view === 'rdc' || view === 'eclate';
  house.labels.etage.visible = view === 'etage' || view === 'eclate';
  if (inside) lift = 0;
  if (film) tour.seek(0);
  tour.playing = film;
  for (const b of buttons) {
    b.classList.toggle('active', b.dataset.view === view);
    if (b.dataset.view === view) b.scrollIntoView({ inline: 'center', block: 'nearest' }); // barre défilante sur téléphone
  }
  $('#view-name').textContent = VIEWS[view].name;
  $('#view-info').textContent = VIEWS[view].info;
  $('#help').innerHTML = HELP[film ? 'tour' : walk ? 'walk' : 'orbit'];
  $('#mapbox').style.display = inside ? '' : 'none';
  $('#tourbar').style.display = film ? '' : 'none';
  document.body.classList.toggle('tour', film);
  document.body.classList.toggle('walk', walk);
  if (!walk && document.pointerLockElement) document.exitPointerLock();
  ring.visible = false;
  here = undefined;
  shadowsDirty = 3;
  if (walk && !store.get('visite.guide') && $('#intro').classList.contains('hidden')) showCoach();
}

for (const b of buttons) {
  b.addEventListener('click', () => {
    setView(b.dataset.view as View);
    b.blur();
  });
}
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
  if (view === 'tour') {
    if (e.code === 'Space') toggleTour();
    else if (e.code === 'ArrowRight') tour.skip(8);
    else if (e.code === 'ArrowLeft') tour.skip(-8);
    else if (e.code === 'Escape') setView(lastOverview);
    else return;
    e.preventDefault();
  } else if (e.code === 'KeyV') {
    setView(view === 'walk' ? lastOverview : 'walk');
  } else if (e.code === 'KeyM' && view === 'walk') {
    if (walker.locked) document.exitPointerLock();
    else walker.lock();
  }
});
document.addEventListener('pointerlockchange', () => document.body.classList.toggle('locked', walker.locked));
$('#enter').addEventListener('click', () => {
  $('#intro').classList.add('hidden');
  if (view === 'walk' && !store.get('visite.guide')) showCoach();
});

// ── Mode d'emploi de la visite à pied (premier lancement, puis bouton Aide) ──
function showCoach() {
  const steps = document.body.classList.contains('touch')
    ? [
      ['Touchez le sol', 'pour aller à cet endroit, escalier compris'],
      ['Manette en bas à gauche', 'pour marcher librement'],
      ["Glissez sur l'image", 'pour regarder autour de vous'],
      ['Touchez le plan', 'pour passer directement dans une pièce'],
    ]
    : [
      ['Cliquez sur le sol', 'pour aller à cet endroit, escalier compris'],
      ['Glissez la souris', 'pour regarder autour de vous'],
      ['Z Q S D ou flèches', 'pour marcher librement (Maj : plus vite)'],
      ['Cliquez sur le plan', 'pour passer directement dans une pièce'],
    ];
  $('#coach ul').innerHTML = steps.map(([a, b]) => `<li><b>${a}</b> ${b}</li>`).join('');
  $('#coach').classList.remove('hidden');
}
$('#coach button').addEventListener('click', () => {
  $('#coach').classList.add('hidden');
  store.set('visite.guide', '1');
});
$('#tool-help').addEventListener('click', (e) => {
  if (view !== 'walk') setView('walk');
  showCoach();
  (e.currentTarget as HTMLElement).blur();
});

// ── Commandes de la visite filmée ────────────────────────────────────────────
function toggleTour() {
  if (!tour.playing && tour.progress >= 1) tour.seek(0);
  tour.playing = !tour.playing;
}
const track = $('#tour-track');
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
$('#tour-play').addEventListener('click', (e) => {
  toggleTour();
  (e.currentTarget as HTMLElement).blur();
});
track.addEventListener('pointerdown', (e) => {
  const seek = (ev: PointerEvent) => {
    const r = track.getBoundingClientRect();
    tour.seek((ev.clientX - r.left) / r.width);
  };
  seek(e);
  track.setPointerCapture(e.pointerId);
  track.onpointermove = seek;
  track.onpointerup = () => (track.onpointermove = null);
});
const speed = $<HTMLInputElement>('#tour-speed input');
speed.addEventListener('input', () => {
  tour.rate = Number(speed.value);
  $('#tour-speed span').textContent = `×${String(tour.rate).replace('.', ',')}`;
});
speed.addEventListener('change', () => speed.blur());
function drawTourBar() {
  $('#tour-play').textContent = tour.playing ? '❚❚' : '▶';
  $('#tour-fill').style.width = `${tour.progress * 100}%`;
  $('#tour-time').textContent = `${mmss(tour.progress * tour.duration)} / ${mmss(tour.duration)}`;
  const info = `${tour.room} · ${tour.upstairs ? 'étage' : 'rez-de-chaussée'}`;
  if ($('#tour-room').textContent !== info) $('#tour-room').textContent = info;
}

// ── Clic pour avancer ────────────────────────────────────────────────────────
const ring = new THREE.Mesh(
  new THREE.RingGeometry(0.15, 0.2, 48).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: '#e8763a', transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false }),
);
ring.visible = false;
ring.renderOrder = 2;
scene.add(ring);

const ray = new THREE.Raycaster();
ray.far = 30;
const pointer = { x: 0, y: 0, over: false };
canvas.addEventListener('mousemove', (e) => Object.assign(pointer, { x: e.clientX, y: e.clientY, over: true }));
canvas.addEventListener('mouseleave', () => (pointer.over = false));

/** Point où l'on peut se rendre, à partir d'un point de l'écran. */
function pick(cx: number, cy: number): Spot | null {
  ray.setFromCamera(new THREE.Vector2((cx / innerWidth) * 2 - 1, 1 - (cy / innerHeight) * 2), walkCam);
  const hit = ray.intersectObject(house.group, true).find((h) => {
    const m = (h.object as THREE.Mesh).material as THREE.Material | undefined;
    return h.face && m && !(m.transparent && m.opacity < 0.5); // on vise à travers les vitres
  });
  if (!hit) return null;
  let { x, z } = hit.point;
  const y = hit.point.y;
  const up = hit.face!.normal.clone().transformDirection(hit.object.matrixWorld).y > 0.7;
  const inStair = (px: number, pz: number) => px > STAIR.x1 && px < STAIR.x2 && pz > STAIR.z1 && pz < STAIR.z2;
  const onFloor = up && (Math.abs(y) < 0.06 || Math.abs(y - ETAGE.base) < 0.06 || inStair(x, z));
  if (!onFloor) {
    // Mur ou meuble : on s'arrête juste devant
    const back = new THREE.Vector2(walkCam.position.x - x, walkCam.position.z - z).setLength(0.45);
    x += back.x;
    z += back.y;
  }
  const zone: Zone = inStair(x, z) ? STAIRS : y > ETAGE.base - 0.15 ? UP : RDC;
  return nav.nearest(zone, x, z, onFloor ? 0.9 : 1.6);
}

let goal: Spot | null = null;
function showRing(s: Spot, opacity: number) {
  ring.position.set(s.x, nav.floor(s.zone, s.x, s.z) + 0.012, s.z);
  (ring.material as THREE.MeshBasicMaterial).opacity = opacity;
  ring.visible = true;
}
walker.onTap = (cx, cy) => {
  if (view !== 'walk') return;
  const target = pick(cx, cy);
  const path = target && nav.route(walker.spot, target);
  if (!target || !path) return;
  goal = target;
  walker.goTo(path);
};
function updateRing() {
  if (walker.walking && goal) {
    showRing(goal, 0.55 + 0.35 * Math.sin(performance.now() / 110));
    return;
  }
  const hover = walker.locked ? pick(innerWidth / 2, innerHeight / 2)
    : pointer.over && !document.body.classList.contains('touch') ? pick(pointer.x, pointer.y) : null;
  if (hover) showRing(hover, 0.85);
  else ring.visible = false;
}

/** Déplacement instantané, avec un bref fondu. */
function teleport(s: Spot, yaw = walker.yaw, pitch = 0) {
  const fade = $('#fade');
  fade.classList.add('on');
  setTimeout(() => {
    walker.place(s.x, s.z, yaw, s.zone, pitch);
    fade.classList.remove('on');
  }, 150);
}

// ── Mini-plan : niveau affiché, pièce courante, clic pour s'y rendre ─────────
const mini = $<HTMLCanvasElement>('#minimap');
const mctx = mini.getContext('2d')!;
const WHOLE = { x1: -9.95, z1: -7.2, x2: 6.25, z2: 6.3 };
const tabs = [...document.querySelectorAll<HTMLButtonElement>('#map-tabs button')];
let mapLevel: 0 | 1 = 0;
let mapScale = { s: 1, ox: 0, oz: 0 };
let hovered: Room | null = null;

function setMapLevel(level: 0 | 1) {
  mapLevel = level;
  for (const b of tabs) b.classList.toggle('active', Number(b.dataset.level) === level);
}
for (const b of tabs) b.addEventListener('click', () => { setMapLevel(Number(b.dataset.level) as 0 | 1); b.blur(); });
setMapLevel(0);

function drawMinimap(level: 0 | 1, x: number, z: number, yaw: number, onLevel: boolean) {
  const dpr = Math.min(devicePixelRatio, 2);
  const w = mini.clientWidth, h = mini.clientHeight;
  if (mini.width !== Math.round(w * dpr)) { mini.width = Math.round(w * dpr); mini.height = Math.round(h * dpr); }
  const b = WHOLE, pad = 8;
  const s = Math.min((w - 2 * pad) / (b.x2 - b.x1), (h - 2 * pad) / (b.z2 - b.z1));
  mapScale = { s, ox: (w - (b.x2 - b.x1) * s) / 2 - b.x1 * s, oz: (h - (b.z2 - b.z1) * s) / 2 - b.z1 * s };
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mctx.clearRect(0, 0, w, h);
  mctx.translate(mapScale.ox, mapScale.oz);
  const fill = (r: { x1: number; z1: number; x2: number; z2: number }) =>
    mctx.fillRect(r.x1 * s, r.z1 * s, (r.x2 - r.x1) * s, (r.z2 - r.z1) * s);
  // Pièce survolée ou pièce où l'on se trouve
  const lit = hovered ?? (onLevel ? nav.room(level, x, z) : null);
  if (lit) {
    mctx.fillStyle = hovered ? 'rgba(232,118,58,0.42)' : 'rgba(232,118,58,0.22)';
    lit.rects.forEach(fill);
  }
  mctx.fillStyle = 'rgba(246,242,234,0.6)';
  for (const c of house[level ? 'collidersEtage' : 'colliders']) fill(c);
  // Marches de l'escalier
  mctx.strokeStyle = 'rgba(246,242,234,0.5)';
  mctx.lineWidth = 1;
  mctx.beginPath();
  for (let k = 0; k <= 10; k++) {
    const zs = (STAIR.z1 + k * 0.28) * s;
    mctx.moveTo(STAIR.x1 * s, zs);
    mctx.lineTo(-1.35 * s, zs);
    if (k < 10) { mctx.moveTo(-1.25 * s, zs); mctx.lineTo(STAIR.x2 * s, zs); }
  }
  mctx.stroke();
  // Visiteur
  mctx.translate(x * s, z * s);
  mctx.rotate(-yaw);
  mctx.fillStyle = onLevel ? '#e8763a' : 'rgba(232,118,58,0.35)';
  mctx.beginPath();
  mctx.moveTo(0, -8);
  mctx.lineTo(5, 5);
  mctx.lineTo(0, 2.5);
  mctx.lineTo(-5, 5);
  mctx.closePath();
  mctx.fill();
}

const mapPoint = (e: MouseEvent) => {
  const r = mini.getBoundingClientRect();
  return { x: (e.clientX - r.left - mapScale.ox) / mapScale.s, z: (e.clientY - r.top - mapScale.oz) / mapScale.s };
};
mini.addEventListener('pointermove', (e) => {
  const p = mapPoint(e);
  hovered = e.pointerType === 'mouse' ? nav.room(mapLevel, p.x, p.z) : null;
});
mini.addEventListener('pointerleave', () => (hovered = null));
mini.addEventListener('click', (e) => {
  const p = mapPoint(e);
  const spot = nav.nearest(mapLevel, p.x, p.z, 3, true);
  if (!spot) return;
  if (view !== 'walk') {
    // Depuis le film : on reprend la visite à pied à cet endroit
    const yaw = tour.yaw;
    setView('walk');
    walker.place(spot.x, spot.z, yaw, spot.zone);
  } else {
    teleport(spot);
  }
});

/** Texte « pièce · surface · niveau ». */
const describe = (room: Room | null, level: 0 | 1) =>
  [room?.name, room?.area && `${room.area} m²`, LEVEL_NAME[level]].filter(Boolean).join(' · ');
let here: string | undefined;
function showWhere(level: 0 | 1, x: number, z: number) {
  const text = describe(nav.room(level, x, z), level);
  const caption = hovered ? describe(hovered, hovered.level) : text;
  if ($('#map-room').textContent !== caption) $('#map-room').textContent = caption;
  if (text === here) return;
  here = text;
  if (view === 'walk') $('#view-info').textContent = `· ${text}`;
}

// ── Heure de la journée ──────────────────────────────────────────────────────
const hourButtons = [...document.querySelectorAll<HTMLButtonElement>('#hours button')];
function setHour(hour: Hour, instant = false) {
  daylight.set(hour, instant);
  for (const b of hourButtons) b.classList.toggle('active', b.dataset.hour === hour);
  shadowsDirty = 3;
}
for (const b of hourButtons) b.addEventListener('click', () => { setHour(b.dataset.hour as Hour); b.blur(); });

// ── Lien partageable et photo ────────────────────────────────────────────────
let toastTimer = 0;
function toast(text: string) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('on'), 2600);
}

const f2 = (n: number) => String(Math.round(n * 100) / 100);
/** État courant sous forme de fragment d'adresse : vue, position, heure. */
function stateHash() {
  const parts = [`vue=${view}`];
  if (view === 'walk') {
    const p = walker.position;
    parts.push(`pos=${[p.x, p.z, walker.yaw, walker.pitch].map(f2).join(',')},${walker.zone}`);
  } else if (view === 'tour') {
    parts.push(`t=${Math.round(tour.progress * 1000) / 1000}`);
  } else {
    parts.push(`cam=${[...overCam.position.toArray(), ...orbit.target.toArray()].map(f2).join(',')}`);
  }
  if (daylight.hour !== 'matin') parts.push(`heure=${daylight.hour}`);
  return `#${parts.join('&')}`;
}
let lastHash = '';
let hashTimer = 0;
function saveState(elapsed: number) {
  hashTimer += elapsed;
  if (hashTimer < 0.5) return;
  hashTimer = 0;
  const hash = stateHash();
  if (hash === lastHash) return;
  lastHash = hash;
  history.replaceState(null, '', hash);
}

$('#tool-link').addEventListener('click', async (e) => {
  (e.currentTarget as HTMLElement).blur();
  history.replaceState(null, '', (lastHash = stateHash()));
  const url = location.href;
  try {
    if (document.body.classList.contains('touch') && navigator.share) {
      await navigator.share({ title: document.title, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast('Lien copié : il ouvre la maison exactement sur cette vue');
  } catch (err) {
    if ((err as Error).name !== 'AbortError') prompt('Copiez ce lien pour partager cette vue :', url);
  }
});

$('#tool-photo').addEventListener('click', async (e) => {
  (e.currentTarget as HTMLElement).blur();
  ring.visible = false;
  pipeline.render(currentCamera()); // l'image doit être lue juste après son rendu
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png'));
  if (!blob) return toast("La photo n'a pas pu être enregistrée");
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const place = view === 'walk' && here ? here.split(' · ')[0] : VIEWS[view].name;
  a.download = `maison-logbessou-${place.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('Photo enregistrée dans vos téléchargements');
});

// ── Reprise depuis un lien partagé ───────────────────────────────────────────
{
  const hour = link.get('heure') as Hour;
  setHour(HOURS.includes(hour) ? hour : 'matin', true);
  const wanted = link.get('vue') as View;
  setView(wanted in VIEWS ? wanted : 'ext');
  if (wanted in VIEWS) $('#intro').classList.add('hidden'); // le lien mène droit à la vue
  const pos = numbers('pos', 5), cam = numbers('cam', 6), t = Number(link.get('t'));
  const shown = view as View;
  if (shown === 'walk') {
    const zone = (pos && [RDC, UP, STAIRS].includes(pos[4]) ? pos[4] : RDC) as Zone;
    const spot = pos && nav.nearest(zone, pos[0], pos[1], 1);
    if (pos && spot) walker.place(spot.x, spot.z, pos[2], spot.zone, THREE.MathUtils.clamp(pos[3], -1.35, 1.35));
    if (!store.get('visite.guide')) showCoach();
  } else if (shown === 'tour') {
    if (t > 0 && t < 1) tour.seek(t);
  } else if (cam) {
    overCam.position.set(cam[0], cam[1], cam[2]);
    orbit.target.set(cam[3], cam[4], cam[5]);
    orbit.update();
  }
}

function resize() {
  const w = innerWidth, h = innerHeight;
  pipeline.setSize(w, h);
  labelRenderer.setSize(w, h);
  for (const cam of [walkCam, overCam]) {
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  }
}
addEventListener('resize', resize);
resize();

const currentCamera = () => (view === 'walk' || view === 'tour' ? walkCam : overCam);
let lastLevel: 0 | 1 = 0;
let lastFrame = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const elapsed = (now - lastFrame) / 1000;
  lastFrame = now;
  const dt = Math.min(elapsed, 0.05);
  const liftTo = view === 'eclate' ? EXPLODE : 0;
  if (Math.abs(lift - liftTo) > 0.002) shadowsDirty = 2;
  lift = THREE.MathUtils.damp(lift, liftTo, 6, dt);
  house.etage.position.y = lift;
  if (daylight.update(dt)) shadowsDirty = 2;

  if (view === 'walk') {
    walker.update(dt, Math.min(elapsed, 0.25)); // un trajet calculé garde son allure même si l'affichage ralentit
    const p = walker.position;
    const level = nav.level(walker.zone, p.x, p.z);
    if (level !== lastLevel) setMapLevel((lastLevel = level)); // le plan suit le visiteur d'un niveau à l'autre
    drawMinimap(mapLevel, p.x, p.z, walker.yaw, level === mapLevel);
    showWhere(level, p.x, p.z);
    updateRing();
  } else if (view === 'tour') {
    tour.update(Math.min(elapsed, 0.25)); // le film garde son rythme même si l'affichage ralentit
    const p = tour.position;
    const level = tour.upstairs ? 1 : 0;
    if (level !== lastLevel) setMapLevel((lastLevel = level));
    drawMinimap(mapLevel, p.x, p.z, tour.yaw, level === mapLevel);
    showWhere(level, p.x, p.z);
    drawTourBar();
  } else {
    orbit.update();
  }
  if (shadowsDirty > 0) {
    shadowsDirty--;
    renderer.shadowMap.needsUpdate = true;
  }
  pipeline.render(currentCamera());
  labelRenderer.render(scene, currentCamera());
  watchPerformance(elapsed);
  saveState(elapsed);
});

// Accès console pour le débogage et les tests
Object.assign(window, { visite: { walker, tour, house, nav, daylight, pipeline, setView, setHour, orbit, overCam, renderer, scene, pick } });
