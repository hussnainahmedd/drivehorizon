import * as THREE from 'three';

export class GraphicsUnavailableError extends Error {
  constructor(message: string, readonly attempts: string[] = []) { super(message); this.name = 'GraphicsUnavailableError'; }
}

export interface GraphicsInfo { api: 'WebGL 2' | 'WebGL 1'; gpu: string; attempts: string[] }
export const GRAPHICS_ATTRIBUTES: WebGLContextAttributes = { antialias: true, alpha: false, depth: true, stencil: true, powerPreference: 'high-performance' };

export function acquireGraphicsContext(canvas: HTMLCanvasElement) {
  const attempts: string[] = [];
  let status = '';
  const failed = (event: Event) => { status = (event as WebGLContextEvent).statusMessage || 'Driver rejected the context'; };
  canvas.addEventListener('webglcontextcreationerror', failed);
  try {
    for (const name of ['webgl2', 'webgl'] as const) {
      status = '';
      let context: WebGLRenderingContext | WebGL2RenderingContext | null = null;
      try { context = name === 'webgl2' ? canvas.getContext('webgl2', GRAPHICS_ATTRIBUTES) : canvas.getContext('webgl', GRAPHICS_ATTRIBUTES); }
      catch (error) { status = error instanceof Error ? error.message : String(error); }
      if (!context) { attempts.push(`${name}: ${status || 'unavailable'}`); continue; }
      if (context.isContextLost()) throw new GraphicsUnavailableError('The graphics driver returned a lost context.', attempts);
      if (name === 'webgl') {
        const missing = ['ANGLE_instanced_arrays', 'OES_standard_derivatives'].filter(extension => !context.getExtension(extension));
        if (missing.length) throw new GraphicsUnavailableError(`WebGL 1 is missing required features: ${missing.join(', ')}.`, attempts);
      }
      return { context, info: { api: name === 'webgl2' ? 'WebGL 2' : 'WebGL 1', gpu: '', attempts } as GraphicsInfo };
    }
  } finally { canvas.removeEventListener('webglcontextcreationerror', failed); }
  throw new GraphicsUnavailableError('Neither WebGL 2 nor a compatible WebGL 1 context is available.', attempts);
}

/** An explicit context prevents Three.js silently trying a different API. */
export function createGraphicsRenderer(canvas: HTMLCanvasElement, factory = (parameters: THREE.WebGLRendererParameters) => new THREE.WebGLRenderer(parameters)) {
  const { context, info } = acquireGraphicsContext(canvas);
  // Deliberately do not reclassify constructor/programming errors as GPU failures.
  const renderer = factory({ canvas, context, ...GRAPHICS_ATTRIBUTES });
  const debug = context.getExtension('WEBGL_debug_renderer_info');
  if (debug) info.gpu = String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL));
  return { renderer, info };
}

export function failureDetails(error: unknown) {
  const graphics = error instanceof GraphicsUnavailableError;
  return {
    title: graphics ? 'Graphics support is unavailable.' : 'The game encountered an error.',
    message: graphics
      ? 'DriveHorizon could not start its renderer. On a capable machine, enable browser hardware acceleration and check the graphics driver. Virtual machines can expose an incomplete graphics API even with 3D acceleration enabled.'
      : 'Your saved career is retained. The technical details below identify an initialization or runtime failure.',
    detail: error instanceof Error ? error.message + (graphics && error.attempts.length ? `\n${error.attempts.join('\n')}` : '') : String(error),
  };
}

export function showFailure(error: unknown) {
  console.error(error);
  document.querySelector('#loading')?.remove();
  const app = document.querySelector('#app');
  if (!app) return;
  const details = failureDetails(error);
  app.innerHTML = '<div class="fatal-message" role="alert"><h1></h1><p></p><pre id="error-detail"></pre><button>RELOAD GAME</button></div>';
  app.querySelector('h1')!.textContent = details.title;
  app.querySelector('p')!.textContent = details.message;
  app.querySelector('pre')!.textContent = details.detail;
  app.querySelector('button')!.addEventListener('click', () => location.reload());
}
