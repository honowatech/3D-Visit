import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/**
 * Chaîne de rendu à trois niveaux de qualité.
 * - haute : ombres de contact (occlusion ambiante), halo des sources lumineuses, anticrénelage ;
 * - moyenne : halo seul, résolution réduite ;
 * - légère : rendu direct, pour les appareils modestes.
 */

export type Quality = 'haute' | 'moyenne' | 'legere';
export const QUALITIES: Quality[] = ['haute', 'moyenne', 'legere'];

/** Étape sans rendu : après la mise en tons, les passes suivantes ne doivent plus convertir les couleurs. */
class NeutralOutput extends Pass {
  needsSwap = false;
  render(renderer: THREE.WebGLRenderer) {
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  }
}

export class Pipeline {
  quality: Quality = 'haute';
  private composer: EffectComposer | null = null;
  private scenePass!: RenderPass;
  private ao!: GTAOPass;
  private bloom!: UnrealBloomPass;
  private w = 1;
  private h = 1;

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene) {}

  private build(camera: THREE.Camera) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.scenePass = new RenderPass(this.scene, camera);
    this.ao = new GTAOPass(this.scene, camera, 1, 1);
    this.ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16 });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    this.ao.blendIntensity = 0.85;
    // Vitres, voilages et autres matériaux translucides ne doivent pas recevoir d'ombres de contact :
    // on les masque pendant le relevé des profondeurs (la scène est fixe, la liste est faite une fois).
    const ghosts: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && !Array.isArray(m) && m.transparent) ghosts.push(o);
    });
    const ao = this.ao as unknown as { _overrideVisibility(): void; _visibilityCache: THREE.Object3D[] };
    ao._overrideVisibility = () => {
      for (const g of ghosts) if (g.visible) { g.visible = false; ao._visibilityCache.push(g); }
    };
    // Le halo est appliqué après la mise en tons : il reste discret, même face à un ciel très lumineux.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.5, 0.95);
    this.composer.addPass(this.scenePass);
    this.composer.addPass(this.ao);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(new NeutralOutput());
    this.composer.addPass(this.bloom);
  }

  /** Part de la densité d'écran utilisée, selon la qualité. */
  private ratio() {
    const max = this.quality === 'haute' ? 2 : this.quality === 'moyenne' ? 1.5 : 1;
    return Math.min(devicePixelRatio, max);
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.setSize(this.w, this.h);
  }

  setSize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(this.ratio());
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.ratio());
      this.composer.setSize(w, h);
    }
  }

  render(camera: THREE.Camera) {
    if (this.quality === 'legere') {
      this.renderer.render(this.scene, camera);
      return;
    }
    if (!this.composer) {
      this.build(camera);
      this.setSize(this.w, this.h);
    }
    this.scenePass.camera = camera;
    this.ao.camera = camera;
    this.ao.enabled = this.quality === 'haute';
    const { toneMapping, outputColorSpace } = this.renderer;
    this.composer!.render();
    this.renderer.toneMapping = toneMapping;
    this.renderer.outputColorSpace = outputColorSpace;
  }
}
