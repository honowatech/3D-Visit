import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildContext } from './context';
import { Walker } from './controls';
import { buildFittings } from './details';
import {
  furnishChambreAmis, furnishCuisine, furnishEtage, furnishEtude, furnishHall, furnishRepas, furnishReserve,
  furnishSanitaires, furnishSejour, furnishTerrasses,
} from './furniture';
import { buildHouse, buildSurroundings } from './house';
import { Lighting, type Moment } from './lighting';
import { ETAGE, RDC, SLAB } from './plan';
import { PostFX } from './post';
import { Soundscape } from './sound';
import { LightProbes } from './probes';
import { buildZoneMap } from './zones';
import { applyRelief } from './textures';
import { Tour } from './tour';

// Qualité : « haute » ajoute anticrénelage, occlusion ambiante et halo ; « légère » s'en passe.
type Quality = 'haute' | 'legere';
const params = new URLSearchParams(location.search);
const stored = (() => { try { return localStorage.getItem('visite-qualite'); } catch { return null; } })();
const asked = [params.get('q'), stored].find((q): q is Quality => q === 'haute' || q === 'legere');
let quality: Quality = asked ?? (matchMedia('(pointer: coarse)').matches ? 'legere' : 'haute');
let qualityChosen = asked !== undefined;
const startedHigh = quality === 'haute';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; // scène fixe : les ombres ne sont refaites que sur demande
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const labelRenderer = new CSS2DRenderer({ element: document.querySelector<HTMLElement>('#labels')! });

const scene = new THREE.Scene();
// Environnement neutre : il ne sert qu'à activer l'éclairage indirect, fourni ensuite par les sondes.
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new THREE.Scene()).texture;

// Ciel, soleil et heure du jour
const center = new THREE.Vector3(-1.8, 0, 0.5);
const lighting = new Lighting(renderer, scene, center, startedHigh ? 4096 : 2048);

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
house.rdc.add(buildFittings([RDC]));
house.etage.add(buildFittings([ETAGE]));
scene.add(house.group, buildSurroundings(), buildContext());

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

const etageFurniture = furnishEtage(house.collidersEtage);
house.etage.add(etageFurniture);
house.roof.add(etageFurniture.userData.ceiling);

// Lumière indirecte : une sonde par pièce, captée dans la maison fermée
applyRelief(scene);
lighting.adoptLamps(scene);
scene.updateMatrixWorld();
lighting.castLampShadows([new THREE.Vector3(2.36, RDC.top - 1, 2.7), new THREE.Vector3(2.36, ETAGE.top - 1, 2.7)]);
scene.traverse((o) => {
  const m = (o as THREE.Mesh).material as THREE.Material | undefined;
  if (m?.transparent) o.userData.noAO = true;
});
const zoneMap = buildZoneMap(
  [RDC, ETAGE], [house.colliders, house.collidersEtage], new THREE.Vector3(center.x, 14, center.z),
);
const probes = new LightProbes(renderer, scene, zoneMap, {
  tile: startedHigh ? 256 : 128, capture: startedHigh ? 128 : 64, split: RDC.top + SLAB / 2, top: ETAGE.top + 0.05,
});
probes.patchAll(scene);
probes.prepare = () => {
  const roof = house.roof.visible, etage = house.etage.visible, y = house.etage.position.y;
  const open = !roof || !etage || y > 0.001;
  house.roof.visible = house.etage.visible = true;
  house.etage.position.y = 0;
  lighting.captureMode(true);
  if (open) renderer.shadowMap.needsUpdate = true;
  return () => {
    house.roof.visible = roof;
    house.etage.visible = etage;
    house.etage.position.y = y;
    lighting.captureMode(false);
    if (open) renderer.shadowMap.needsUpdate = true;
  };
};
probes.refresh(3);
renderer.shadowMap.needsUpdate = true;

const walker = new Walker(walkCam, canvas, house.colliders);
walker.place(0.45, 0.55, -Math.PI * 0.72);
const tour = new Tour(walkCam);

// Ambiance sonore (démarre au premier geste, comme l'exigent les navigateurs)
const sound = new Soundscape();
try { sound.enabled = localStorage.getItem('visite-son') !== 'non'; } catch { /* stockage indisponible */ }
walker.onStep = (running) => sound.step(running);
addEventListener('pointerdown', () => sound.start(), { once: true });
addEventListener('keydown', () => sound.start(), { once: true });

// Vues
type View = 'ext' | 'eclate' | 'etage' | 'rdc' | 'walk' | 'tour';
const VIEWS: Record<View, { name: string; info: string }> = {
  ext: { name: 'Extérieur', info: '· terrain de 393 m²' },
  eclate: { name: 'Vue éclatée', info: '· ≈ 242 m² sur 2 niveaux' },
  etage: { name: 'Étage', info: '· ≈ 130 m² + balcon' },
  rdc: { name: 'Rez-de-chaussée', info: '· ≈ 112 m² + terrasses' },
  walk: { name: 'Visite à pied', info: '· rez-de-chaussée' },
  tour: { name: 'Visite intérieure complète', info: '' },
};
const HELP: Record<'orbit' | 'walk' | 'tour', string> = {
  orbit: '<kbd>glisser</kbd> tourner · <kbd>molette</kbd> zoomer · <kbd>clic droit</kbd> déplacer · <kbd>V</kbd> visite à pied',
  walk: '<kbd>Z Q S D</kbd> ou <kbd>flèches</kbd> marcher · <kbd>souris</kbd> regarder · <kbd>Maj</kbd> plus vite · <kbd>V</kbd> vue d\'ensemble',
  tour: '<kbd>Espace</kbd> pause · <kbd>←</kbd> <kbd>→</kbd> reculer / avancer · <kbd>Échap</kbd> quitter',
};
const EXPLODE = 5.5;

let view: View = 'ext';
let lastOverview: View = 'ext';
let lift = 0; // hauteur animée de l'étage en vue éclatée
const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
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
  for (const b of buttons) b.classList.toggle('active', b.dataset.view === view);
  $('#view-name').textContent = VIEWS[view].name;
  $('#view-info').textContent = VIEWS[view].info;
  $('#help').innerHTML = HELP[film ? 'tour' : walk ? 'walk' : 'orbit'];
  $('#minimap').style.display = inside ? '' : 'none';
  $('#tourbar').style.display = film ? '' : 'none';
  document.body.classList.toggle('tour', film);
  if (!walk && document.pointerLockElement) document.exitPointerLock();
  renderer.shadowMap.needsUpdate = true;
}
setView('ext');

for (const b of buttons) {
  b.addEventListener('click', () => {
    setView(b.dataset.view as View);
    if (view === 'walk') walker.lock();
    b.blur();
  });
}
addEventListener('keydown', (e) => {
  if (view === 'tour') {
    if (e.code === 'Space') toggleTour();
    else if (e.code === 'ArrowRight') tour.skip(8);
    else if (e.code === 'ArrowLeft') tour.skip(-8);
    else if (e.code === 'Escape') setView(lastOverview);
    else return;
    e.preventDefault();
  } else if (e.code === 'KeyV') {
    setView(view === 'walk' ? lastOverview : 'walk');
  }
});
$('#enter').addEventListener('click', () => $('#intro').classList.add('hidden'));
canvas.addEventListener('click', () => {
  if (view === 'walk' && !document.pointerLockElement && matchMedia('(pointer: fine)').matches) walker.lock();
});

// Commandes de la visite filmée
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

// Mini-plan (visite à pied et visite filmée)
const mini = $<HTMLCanvasElement>('#minimap');
const mctx = mini.getContext('2d')!;
const WHOLE = { x1: -9.9, z1: -7.2, x2: 6.2, z2: 6.2 };
function drawMinimap(colliders: typeof house.colliders, b: typeof WHOLE, x: number, z: number, yaw: number) {
  const dpr = Math.min(devicePixelRatio, 2);
  const w = mini.clientWidth, h = mini.clientHeight;
  if (mini.width !== w * dpr) { mini.width = w * dpr; mini.height = h * dpr; }
  const pad = 10;
  const s = Math.min((w - 2 * pad) / (b.x2 - b.x1), (h - 2 * pad) / (b.z2 - b.z1));
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mctx.clearRect(0, 0, w, h);
  mctx.translate((w - (b.x2 - b.x1) * s) / 2 - b.x1 * s, (h - (b.z2 - b.z1) * s) / 2 - b.z1 * s);
  mctx.fillStyle = 'rgba(246,242,234,0.55)';
  for (const c of colliders) mctx.fillRect(c.x1 * s, c.z1 * s, (c.x2 - c.x1) * s, (c.z2 - c.z1) * s);
  mctx.translate(x * s, z * s);
  mctx.rotate(-yaw);
  mctx.fillStyle = '#e8763a';
  mctx.beginPath();
  mctx.moveTo(0, -8);
  mctx.lineTo(5, 5);
  mctx.lineTo(0, 2.5);
  mctx.lineTo(-5, 5);
  mctx.closePath();
  mctx.fill();
}

// Heure du jour et qualité de rendu
const post = new PostFX(renderer, scene, overCam);
const momentButtons = [...document.querySelectorAll<HTMLButtonElement>('#ambiance button[data-moment]')];
function setMoment(m: Moment, instant = false) {
  lighting.set(m, instant);
  for (const b of momentButtons) b.classList.toggle('active', b.dataset.moment === m);
}
for (const b of momentButtons) {
  b.addEventListener('click', () => {
    setMoment(b.dataset.moment as Moment);
    b.blur();
  });
}
setMoment('matin', true);
function setQuality(q: Quality) {
  quality = q;
  $('#quality').textContent = q === 'haute' ? 'Qualité haute' : 'Qualité légère';
  resize();
}
function setSound(on: boolean) {
  sound.setEnabled(on);
  $('#sound').textContent = on ? 'Son activé' : 'Son coupé';
  $('#sound').setAttribute('aria-pressed', String(on));
}
setSound(sound.enabled);
$('#sound').addEventListener('click', (e) => {
  setSound(!sound.enabled);
  try { localStorage.setItem('visite-son', sound.enabled ? 'oui' : 'non'); } catch { /* stockage indisponible */ }
  (e.currentTarget as HTMLElement).blur();
});
$('#quality').addEventListener('click', (e) => {
  qualityChosen = true;
  setQuality(quality === 'haute' ? 'legere' : 'haute');
  try { localStorage.setItem('visite-qualite', quality); } catch { /* stockage indisponible */ }
  (e.currentTarget as HTMLElement).blur();
});

function resize() {
  const w = innerWidth, h = innerHeight;
  const ratio = Math.min(devicePixelRatio, quality === 'haute' ? 2 : 1.5);
  renderer.setPixelRatio(ratio);
  renderer.setSize(w, h, false);
  post.setSize(w, h, ratio);
  labelRenderer.setSize(w, h);
  for (const cam of [walkCam, overCam]) {
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  }
}
addEventListener('resize', resize);
setQuality(quality);

const clock = new THREE.Clock();
let slow = 0; // images lentes consécutives, pour alléger le rendu de soi-même
renderer.setAnimationLoop(() => {
  const elapsed = clock.getDelta();
  const dt = Math.min(elapsed, 0.05);
  const target = view === 'eclate' ? EXPLODE : 0;
  if (Math.abs(lift - target) > 1e-3) renderer.shadowMap.needsUpdate = true;
  lift = THREE.MathUtils.damp(lift, target, 6, dt);
  house.etage.position.y = lift;
  probes.lift.value = lift;

  // Quand l'heure change, les ombres suivent et les sondes sont recaptées au fil de l'eau.
  const wasChanging = lighting.changing;
  lighting.update(dt);
  if (wasChanging) {
    renderer.shadowMap.needsUpdate = true;
    if (!lighting.changing) probes.refresh(2);
    else if (!probes.pending) probes.refresh(1);
  }
  const busy = probes.update(probes.pending > zoneMap.zones.length * 2 ? 3 : 1);

  let cam = overCam;
  if (view === 'walk') {
    cam = walkCam;
    walker.update(dt);
    drawMinimap(house.colliders, house.bounds, walker.position.x, walker.position.z, walker.yaw);
  } else if (view === 'tour') {
    cam = walkCam;
    tour.update(Math.min(elapsed, 0.25)); // le film garde son rythme même si l'affichage ralentit
    const p = tour.position;
    drawMinimap(tour.upstairs ? house.collidersEtage : house.colliders, WHOLE, p.x, p.z, tour.yaw);
    drawTourBar();
  } else {
    orbit.update();
  }
  sound.setScene(lighting.moment === 'nuit', view === 'walk' || view === 'tour');
  sound.update();
  if (quality === 'haute') post.render(cam);
  else renderer.render(scene, cam);
  labelRenderer.render(scene, cam);

  // Machine à la peine : on bascule une fois en qualité légère, sauf choix explicite.
  if (quality === 'haute' && !qualityChosen && !busy && !document.hidden) {
    slow = elapsed > 0.05 ? slow + 1 : 0;
    if (slow > 90) setQuality('legere');
  }
});

// Accès console pour le débogage et les tests
Object.assign(window, { visite: { walker, tour, house, setView, setMoment, setQuality, orbit, overCam, renderer, scene, lighting, probes, zoneMap } });
