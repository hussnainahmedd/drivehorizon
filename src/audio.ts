import { clamp } from './math';
import type { VehiclePhysics } from './physics';

/** All sounds are synthesized; there are no downloaded samples or runtime network requests. */
export class GameAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private driving?: GainNode;
  private engine?: OscillatorNode;
  private engine2?: OscillatorNode;
  private engineGain?: GainNode;
  private filter?: BiquadFilterNode;
  private roadGain?: GainNode;
  private tireGain?: GainNode;
  private noise?: AudioBuffer;
  private starting?: Promise<void>;
  private ready = false;

  async start() {
    if (this.starting) return this.starting;
    if (this.context && this.ready) { await this.context.resume(); return; }
    this.starting = this.initialize();
    try { await this.starting; this.ready = true; }
    catch (error) {
      const context = this.context; this.ready = false;
      this.context = undefined; this.master = this.driving = this.engineGain = this.roadGain = this.tireGain = undefined;
      this.engine = this.engine2 = undefined; this.filter = undefined; this.noise = undefined;
      try { await context?.close(); } catch { /* Audio may already be unavailable. */ }
      throw error;
    } finally { this.starting = undefined; }
  }

  private async initialize() {
    this.context = new AudioContext(); const ctx = this.context;
    this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
    this.driving = ctx.createGain(); this.driving.gain.value = 0; this.driving.connect(this.master);
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 260;
    this.engineGain = ctx.createGain(); this.engineGain.gain.value = 0.08; this.filter.connect(this.engineGain); this.engineGain.connect(this.driving);
    this.engine = ctx.createOscillator(); this.engine.type = 'sawtooth'; this.engine.frequency.value = 35; this.engine.connect(this.filter); this.engine.start();
    this.engine2 = ctx.createOscillator(); this.engine2.type = 'triangle'; this.engine2.frequency.value = 70; this.engine2.connect(this.filter); this.engine2.start();
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const data = this.noise.getChannelData(0);
    let brown = 0; for (let i = 0; i < data.length; i++) { brown = (brown + (Math.random() * 2 - 1) * 0.02) / 1.02; data[i] = brown * 4; }
    const road = ctx.createBufferSource(); road.buffer = this.noise; road.loop = true; this.roadGain = ctx.createGain(); this.roadGain.gain.value = 0; road.connect(this.roadGain); this.roadGain.connect(this.driving); road.start();
    const tire = ctx.createOscillator(); tire.type = 'triangle'; tire.frequency.value = 680; this.tireGain = ctx.createGain(); this.tireGain.gain.value = 0; tire.connect(this.tireGain); this.tireGain.connect(this.driving); tire.start();
    await ctx.resume();
  }

  mute() { if (this.context && this.master) { this.master.gain.cancelScheduledValues(this.context.currentTime); this.master.gain.setValueAtTime(0, this.context.currentTime); } }
  pauseDriving() { if (this.context && this.driving) { this.driving.gain.cancelScheduledValues(this.context.currentTime); this.driving.gain.setValueAtTime(0, this.context.currentTime); } }

  update(car: VehiclePhysics, volume: number, paused: boolean) {
    if (!this.ready || !this.context || !this.master) return;
    const t = this.context.currentTime;
    this.master.gain.setTargetAtTime(volume, t, 0.1);
    this.driving!.gain.setTargetAtTime(paused ? 0 : 1, t, 0.05);
    this.engine!.frequency.setTargetAtTime(car.rpm / 28, t, 0.05);
    this.engine2!.frequency.setTargetAtTime(car.rpm / 14 + 1.2, t, 0.05);
    this.filter!.frequency.setTargetAtTime(180 + car.rpm * 0.09 + car.throttle * 300, t, 0.07);
    this.engineGain!.gain.setTargetAtTime(car.fuel > 0 && car.health > 0 ? 0.07 + car.throttle * 0.045 : 0, t, 0.1);
    this.roadGain!.gain.setTargetAtTime(Math.min(0.35, car.speed * 0.006) * (car.onRoad ? 1 : 1.6), t, 0.1);
    this.tireGain!.gain.setTargetAtTime(clamp((car.slip - 0.16) * 0.15, 0, 0.06), t, 0.05);
  }

  impact(speed: number) {
    if (!this.ready || !this.context || !this.noise || !this.master) return;
    const ctx = this.context, src = ctx.createBufferSource(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
    src.buffer = this.noise; filter.type = 'lowpass'; filter.frequency.value = 350;
    gain.gain.setValueAtTime(clamp(speed / 12, 0.05, 0.9), ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    src.connect(filter); filter.connect(gain); gain.connect(this.master); src.start(); src.stop(ctx.currentTime + 0.45);
    src.onended = () => { src.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  chime(success = false) {
    if (!this.ready || !this.context || !this.master) return;
    const ctx = this.context;
    for (const [i, hz] of (success ? [523.25, 659.25, 783.99] : [587.33, 783.99]).entries()) {
      const osc = ctx.createOscillator(), gain = ctx.createGain(), t = ctx.currentTime + i * 0.11;
      osc.type = 'sine'; osc.frequency.value = hz; gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.17, t + 0.012); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      osc.connect(gain); gain.connect(this.master); osc.start(t); osc.stop(t + 0.45); osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }
  }

  horn() {
    if (!this.ready || !this.context || !this.master) return;
    const ctx = this.context;
    for (const hz of [349, 440]) { const osc = ctx.createOscillator(), gain = ctx.createGain(); osc.type = 'sawtooth'; osc.frequency.value = hz; gain.gain.setValueAtTime(0.035, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38); osc.connect(gain); gain.connect(this.master); osc.start(); osc.stop(ctx.currentTime + 0.4); osc.onended = () => { osc.disconnect(); gain.disconnect(); }; }
  }
}
