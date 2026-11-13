import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/** L'occlusion ambiante ignore le ciel et les vitrages (`userData.noAO`). */
class AmbientOcclusion extends GTAOPass {
  private hidden: THREE.Object3D[] = [];
  _overrideVisibility() {
    this.scene.traverse((o) => {
      const skip = o.userData.noAO || (o as THREE.Points).isPoints || (o as THREE.Line).isLine;
      if (skip && o.visible) { o.visible = false; this.hidden.push(o); }
    });
  }
  _restoreVisibility() {
    for (const o of this.hidden) o.visible = true;
    this.hidden.length = 0;
  }
}

/** Chaîne de rendu soignée : anticrénelage, occlusion ambiante, halo des sources, tons filmiques. */
export class PostFX {
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly ao: AmbientOcclusion;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.renderPass = new RenderPass(scene, camera);
    this.ao = new AmbientOcclusion(scene, camera, 1, 1);
    this.ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16 });
    this.ao.blendIntensity = 0.9;
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.12, 0.45, 2.2);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.ao);
    this.composer.addPass(bloom);
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number, pixelRatio: number) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
  }

  render(camera: THREE.Camera) {
    this.renderPass.camera = camera;
    this.ao.camera = camera;
    this.composer.render();
  }
}
