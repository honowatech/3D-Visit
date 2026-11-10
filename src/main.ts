import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { Walker } from './controls';
import { furnishCuisine, furnishRepas, furnishReserve, furnishSejour } from './furniture';
import { buildHouse, buildSurroundings } from './house';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;

const labelRenderer = new CSS2DRenderer({ element: document.querySelector<HTMLElement>('#labels')! });

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;

// Ciel et soleil (lumière du matin, par l'est et le sud)
const sunDir = new THREE.Vector3(0.62, 0.55, 0.56).normalize();
const sky = new Sky();
sky.scale.setScalar(1000);
Object.assign(sky.material.uniforms.turbidity, { value: 4 });
Object.assign(sky.material.uniforms.rayleigh, { value: 2.2 });
Object.assign(sky.material.uniforms.mieCoefficient, { value: 0.004 });
sky.material.uniforms.sunPosition.value.copy(sunDir);
scene.add(sky);

const center = new THREE.Vector3(-1.8, 0, 0.5);
const sun = new THREE.DirectionalLight('#fff2dc', 3.4);
sun.position.copy(sunDir).multiplyScalar(40).add(center);
sun.target.position.copy(center);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 90 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight('#dfeaf5', '#b9ab95', 0.55));

// Maison
const house = buildHouse();
house.rdc.add(
  furnishSejour(house.colliders),
  furnishRepas(house.colliders),
  furnishCuisine(house.colliders),
  furnishReserve(house.colliders),
);
scene.add(house.group, buildSurroundings());

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

const walker = new Walker(walkCam, canvas, house.colliders);
walker.place(0.45, 0.55, -Math.PI * 0.72);

// Vues
type View = 'ext' | 'eclate' | 'etage' | 'rdc' | 'walk';
const VIEWS: Record<View, { name: string; info: string }> = {
  ext: { name: 'Extérieur', info: '· terrain de 393 m²' },
  eclate: { name: 'Vue éclatée', info: '· ≈ 242 m² sur 2 niveaux' },
  etage: { name: 'Étage', info: '· ≈ 130 m² + balcon' },
  rdc: { name: 'Rez-de-chaussée', info: '· ≈ 112 m² + terrasses' },
  walk: { name: 'Visite à pied', info: '· séjour, salle à manger, cuisine et réserve' },
};
const HELP_ORBIT = '<kbd>glisser</kbd> tourner · <kbd>molette</kbd> zoomer · <kbd>clic droit</kbd> déplacer · <kbd>V</kbd> visite à pied';
const HELP_WALK = '<kbd>Z Q S D</kbd> ou <kbd>flèches</kbd> marcher · <kbd>souris</kbd> regarder · <kbd>Maj</kbd> plus vite · <kbd>V</kbd> vue d\'ensemble';
const EXPLODE = 5.5;

let view: View = 'ext';
let lastOverview: View = 'ext';
let lift = 0; // hauteur animée de l'étage en vue éclatée
const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const buttons = [...document.querySelectorAll<HTMLButtonElement>('#actions button')];

function setView(next: View) {
  view = next;
  const walk = view === 'walk';
  if (!walk) lastOverview = view;
  walker.enabled = walk;
  orbit.enabled = !walk;
  house.roof.visible = view === 'ext' || walk;
  house.etage.visible = view !== 'rdc';
  house.labels.rdc.visible = view === 'rdc' || view === 'eclate';
  house.labels.etage.visible = view === 'etage' || view === 'eclate';
  if (walk) lift = 0;
  for (const b of buttons) b.classList.toggle('active', b.dataset.view === view);
  $('#view-name').textContent = VIEWS[view].name;
  $('#view-info').textContent = VIEWS[view].info;
  $('#help').innerHTML = walk ? HELP_WALK : HELP_ORBIT;
  $('#minimap').style.display = walk ? '' : 'none';
  if (!walk && document.pointerLockElement) document.exitPointerLock();
}
setView('ext');

for (const b of buttons) {
  b.addEventListener('click', () => {
    setView(b.dataset.view as View);
    if (view === 'walk') walker.lock();
  });
}
addEventListener('keydown', (e) => {
  if (e.code === 'KeyV') setView(view === 'walk' ? lastOverview : 'walk');
});
$('#enter').addEventListener('click', () => $('#intro').classList.add('hidden'));
canvas.addEventListener('click', () => {
  if (view === 'walk' && !document.pointerLockElement && matchMedia('(pointer: fine)').matches) walker.lock();
});

// Mini-plan (visite à pied)
const mini = $<HTMLCanvasElement>('#minimap');
const mctx = mini.getContext('2d')!;
function drawMinimap() {
  const dpr = Math.min(devicePixelRatio, 2);
  const w = mini.clientWidth, h = mini.clientHeight;
  if (mini.width !== w * dpr) { mini.width = w * dpr; mini.height = h * dpr; }
  const b = house.bounds;
  const pad = 10;
  const s = Math.min((w - 2 * pad) / (b.x2 - b.x1), (h - 2 * pad) / (b.z2 - b.z1));
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mctx.clearRect(0, 0, w, h);
  mctx.translate((w - (b.x2 - b.x1) * s) / 2 - b.x1 * s, (h - (b.z2 - b.z1) * s) / 2 - b.z1 * s);
  mctx.fillStyle = 'rgba(246,242,234,0.55)';
  for (const c of house.colliders) mctx.fillRect(c.x1 * s, c.z1 * s, (c.x2 - c.x1) * s, (c.z2 - c.z1) * s);
  const p = walker.position;
  mctx.translate(p.x * s, p.z * s);
  mctx.rotate(-walker.yaw);
  mctx.fillStyle = '#e8763a';
  mctx.beginPath();
  mctx.moveTo(0, -8);
  mctx.lineTo(5, 5);
  mctx.lineTo(0, 2.5);
  mctx.lineTo(-5, 5);
  mctx.closePath();
  mctx.fill();
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  labelRenderer.setSize(w, h);
  for (const cam of [walkCam, overCam]) {
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  }
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  lift = THREE.MathUtils.damp(lift, view === 'eclate' ? EXPLODE : 0, 6, dt);
  house.etage.position.y = lift;
  const cam = view === 'walk' ? walkCam : overCam;
  if (view === 'walk') {
    walker.update(dt);
    drawMinimap();
  } else {
    orbit.update();
  }
  renderer.render(scene, cam);
  labelRenderer.render(scene, cam);
});

// Accès console pour le débogage et les tests
Object.assign(window, { visite: { walker, setView, orbit, overCam, renderer, scene } });
