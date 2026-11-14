/**
 * Ambiance sonore entièrement synthétisée (aucun fichier) : souffle du vent et oiseaux le jour,
 * grillons la nuit, étouffés à l'intérieur ; bruits de pas sur le carrelage en visite à pied.
 */
export class Soundscape {
  enabled = true;

  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private outdoor!: BiquadFilterNode; // filtre d'ambiance : ouvert dehors, sourd dedans
  private wind!: GainNode;
  private crickets!: GainNode;
  private noise!: AudioBuffer;
  private night = false;
  private inside = false;
  private nextBird = 0;

  /** À appeler sur un geste de l'utilisateur : les navigateurs n'autorisent le son qu'à ce moment. */
  start() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = this.ctx = new Ctor();
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 1 : 0;
    this.master.connect(ctx.destination);
    this.outdoor = ctx.createBiquadFilter();
    this.outdoor.type = 'lowpass';
    this.outdoor.connect(this.master);

    // Bruit brun de quelques secondes, bouclé
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 420;
    band.Q.value = 0.4;
    this.wind = ctx.createGain();
    // Rafales lentes
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = 0.07;
    depth.gain.value = 0.05;
    lfo.connect(depth).connect(this.wind.gain);
    src.connect(band).connect(this.wind).connect(this.outdoor);
    src.start();
    lfo.start();

    // Grillons : un sifflement aigu haché
    const tone = ctx.createOscillator(), chop = ctx.createOscillator(), chopDepth = ctx.createGain(), pulse = ctx.createGain();
    tone.frequency.value = 4300;
    chop.type = 'square';
    chop.frequency.value = 38;
    chopDepth.gain.value = 0.5;
    pulse.gain.value = 0.5;
    chop.connect(chopDepth).connect(pulse.gain);
    this.crickets = ctx.createGain();
    this.crickets.gain.value = 0;
    tone.connect(pulse).connect(this.crickets).connect(this.outdoor);
    tone.start();
    chop.start();

    this.apply(0);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.15);
  }

  /** Heure et lieu d'écoute. */
  setScene(night: boolean, inside: boolean) {
    if (night === this.night && inside === this.inside) return;
    this.night = night;
    this.inside = inside;
    this.apply(0.6);
  }

  private apply(smooth: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (p: AudioParam, v: number) => (smooth ? p.setTargetAtTime(v, t, smooth) : p.setValueAtTime(v, t));
    set(this.outdoor.frequency, this.inside ? 650 : 9000);
    set(this.wind.gain, (this.night ? 0.07 : 0.11) * (this.inside ? 0.5 : 1));
    set(this.crickets.gain, this.night ? (this.inside ? 0.012 : 0.022) : 0);
  }

  /** Oiseaux : à appeler à chaque image ; un chant bref de temps à autre, le jour. */
  update() {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || ctx.state !== 'running') return;
    if (ctx.currentTime < this.nextBird) return;
    this.nextBird = ctx.currentTime + 2.5 + Math.random() * 7;
    if (this.night) return;
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2400 + Math.random() * 1800;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.outdoor);
    for (let i = 0; i < notes; i++) {
      const t = ctx.currentTime + i * (0.11 + Math.random() * 0.05);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(base * (1 + Math.random() * 0.25), t);
      o.frequency.exponentialRampToValueAtTime(base * (0.75 + Math.random() * 0.6), t + 0.09);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.035, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.1);
      o.connect(g).connect(pan);
      o.start(t);
      o.stop(t + 0.12);
    }
  }

  /** Un pas sur le carrelage : talon sourd puis claquement bref. */
  step(running: boolean) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const offset = Math.random() * 3;
    const tap = ctx.createBiquadFilter();
    tap.type = 'bandpass';
    tap.frequency.value = 900 + Math.random() * 500;
    tap.Q.value = 1.2;
    const g = ctx.createGain();
    const level = (running ? 0.5 : 0.32) * (0.8 + Math.random() * 0.4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    src.connect(tap).connect(g).connect(this.master);
    src.start(t, offset, 0.14);

    const thud = ctx.createOscillator(), tg = ctx.createGain();
    thud.frequency.setValueAtTime(95, t);
    thud.frequency.exponentialRampToValueAtTime(48, t + 0.08);
    tg.gain.setValueAtTime(level * 0.5, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    thud.connect(tg).connect(this.master);
    thud.start(t);
    thud.stop(t + 0.1);
  }
}
