import { test } from 'node:test';
import assert from 'node:assert/strict';
import type * as THREE from 'three';
import { acquireGraphicsContext, createGraphicsRenderer, failureDetails, GraphicsUnavailableError, showFailure } from '../src/graphics';
import { createDOM } from './helpers/dom';

function context(extensions = ['ANGLE_instanced_arrays', 'OES_standard_derivatives']) {
  return { isContextLost: () => false, getExtension: (name: string) => extensions.includes(name) ? {} : null, getParameter: () => 'GPU' } as unknown as WebGLRenderingContext;
}
function canvas(contexts: Record<string, WebGLRenderingContext | null>, throws = false) {
  const calls: string[] = [], target = new EventTarget();
  const fake = Object.assign(target, { getContext(name: string) { calls.push(name); if (throws && name === 'webgl2') throw new Error('Driver rejected WebGL 2'); return contexts[name] ?? null; } });
  return { canvas: fake as unknown as HTMLCanvasElement, calls };
}

test('WebGL 2 is preferred and its explicit context is passed to the renderer exactly once', () => {
  const gl = context(), fake = canvas({ webgl2: gl }); let constructed = 0;
  const renderer = {} as THREE.WebGLRenderer;
  const result = createGraphicsRenderer(fake.canvas, parameters => {
    constructed++; assert.equal(parameters.context, gl); assert.equal(parameters.canvas, fake.canvas); assert.equal(parameters.alpha, false); return renderer;
  });
  assert.equal(result.renderer, renderer); assert.equal(result.info.api, 'WebGL 2'); assert.equal(constructed, 1); assert.deepEqual(fake.calls, ['webgl2']);
});

test('rejected WebGL 2 contexts fall back to compatible WebGL 1 without renderer retries', () => {
  for (const throwing of [false, true]) {
    const gl = context(), fake = canvas({ webgl2: null, webgl: gl }, throwing);
    const selected = acquireGraphicsContext(fake.canvas);
    assert.equal(selected.context, gl); assert.equal(selected.info.api, 'WebGL 1'); assert.deepEqual(fake.calls, ['webgl2', 'webgl']);
    assert.equal(selected.info.attempts.length, 1);
  }
});

test('missing contexts, lost contexts and missing instancing produce clear availability errors', () => {
  assert.throws(() => acquireGraphicsContext(canvas({}).canvas), GraphicsUnavailableError);
  assert.throws(() => acquireGraphicsContext(canvas({ webgl: context([]) }).canvas), /ANGLE_instanced_arrays/);
  const lost = context(); lost.isContextLost = () => true;
  assert.throws(() => acquireGraphicsContext(canvas({ webgl2: lost }).canvas), /lost context/);
});

test('driver diagnostics retain the VMware transform_feedback2 failure message', () => {
  const fake = canvas({});
  fake.canvas.getContext = ((name: string) => {
    const event = new Event('webglcontextcreationerror'); Object.defineProperty(event, 'statusMessage', { value: name === 'webgl2' ? 'WebGL 2 requires support for transform_feedback2.' : 'Error creating WebGL context.' });
    fake.canvas.dispatchEvent(event); return null;
  }) as HTMLCanvasElement['getContext'];
  try { acquireGraphicsContext(fake.canvas); assert.fail('Expected unavailable graphics'); }
  catch (error) {
    assert.ok(error instanceof GraphicsUnavailableError); assert.match(failureDetails(error).detail, /transform_feedback2/); assert.match(failureDetails(error).message, /Virtual machines/);
  }
});

test('unrelated renderer initialization errors remain code errors, without fallback retry or GPU misclassification', () => {
  const fake = canvas({ webgl2: context() }); const bug = new TypeError('Invalid renderer configuration');
  assert.throws(() => createGraphicsRenderer(fake.canvas, () => { throw bug; }), error => error === bug);
  assert.deepEqual(fake.calls, ['webgl2']); assert.equal(failureDetails(bug).title, 'The game encountered an error.');
});

test('fatal errors use safe text and retain a functional reload control', () => {
  const env = createDOM(), original = console.error; console.error = () => {};
  try {
    showFailure(new Error('<img src=x onerror=alert(1)>'));
    assert.equal(env.document.querySelector('#loading'), null); assert.equal(env.document.querySelector('img'), null);
    assert.match(env.document.querySelector('#error-detail')!.textContent!, /<img/); assert.ok(env.document.querySelector('.fatal-message button'));
  } finally { console.error = original; env.close(); }
});
