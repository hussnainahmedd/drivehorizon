import { JSDOM } from 'jsdom';

export class FakeAudioParam {
  value = 0;
  setTargetAtTime(value: number) { this.value = value; }
  setValueAtTime(value: number) { this.value = value; }
  linearRampToValueAtTime(value: number) { this.value = value; }
  exponentialRampToValueAtTime(value: number) { this.value = value; }
  cancelScheduledValues() {}
}

class FakeAudioNode {
  gain = new FakeAudioParam(); frequency = new FakeAudioParam();
  type = ''; buffer: unknown; loop = false; onended?: () => void;
  connections: unknown[] = [];
  connect(node: unknown) { this.connections.push(node); }
  disconnect() { this.connections = []; }
  start() {}
  stop() {}
}

export class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  currentTime = 0; sampleRate = 8000; destination = {}; state = 'suspended';
  gains: FakeAudioNode[] = []; oscillators: FakeAudioNode[] = [];
  constructor() { FakeAudioContext.instances.push(this); }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
  createGain() { const node = new FakeAudioNode(); this.gains.push(node); return node; }
  createOscillator() { const node = new FakeAudioNode(); this.oscillators.push(node); return node; }
  createBiquadFilter() { return new FakeAudioNode(); }
  createBufferSource() { return new FakeAudioNode(); }
  createBuffer(_channels: number, samples: number) { const data = new Float32Array(samples); return { getChannelData: () => data }; }
}

/** DOM + synthetic 2D canvases only. No browser, WebGL, or pixel claims. */
export function createDOM() {
  const dom = new JSDOM('<!doctype html><div id="app"><canvas id="game"></canvas><div id="ui"></div><div id="loading"></div></div>', { url: 'http://127.0.0.1:5173', pretendToBeVisual: true });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const globals: Record<string, unknown> = { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, location: dom.window.location, AudioContext: FakeAudioContext };
  let nextFrame = 1, time: number | undefined;
  const frames = new Map<number, FrameRequestCallback>();
  const requestFrame = (callback: FrameRequestCallback) => { const id = nextFrame++; frames.set(id, callback); return id; };
  globals.requestAnimationFrame = requestFrame;
  for (const [key, value] of Object.entries(globals)) { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); }
  const context = new Proxy({
    createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    measureText: (text: string) => ({ width: text.length * 8 }),
  }, { get: (target, key) => Reflect.get(target, key) ?? (() => {}) });
  Object.defineProperty(dom.window.HTMLCanvasElement.prototype, 'getContext', { value: (type: string) => type === '2d' ? context : null });
  Object.defineProperty(dom.window.document, 'hasFocus', { value: () => true });
  FakeAudioContext.instances = [];
  return {
    dom, document: dom.window.document,
    frame(seconds = 1 / 60) {
      time = (time ?? performance.now()) + seconds * 1000;
      const batch = [...frames.values()]; frames.clear(); batch.forEach(callback => callback(time!));
    },
    key(code: string, down = true) { dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code === 'Escape' ? 'Escape' : code, bubbles: true, cancelable: true })); },
    close() {
      dom.window.close();
      for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    },
  };
}
