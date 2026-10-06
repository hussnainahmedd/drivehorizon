import { mkdirSync, writeFileSync } from 'node:fs';

export function recordRenderingStatus(status, reason, suite = 'browser gameplay') {
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/rendering-status.json', JSON.stringify({ status, reason, suite, timestamp: new Date().toISOString() }, null, 2) + '\n');
}

export function skipBlockedRendering(suite) {
  if (process.env.HARBORLINE_RENDER_BLOCKED !== 'vmware') return;
  const reason = 'Known Ubuntu 20.04 VMware graphics limitation: WebGL 2 requires transform_feedback2; the guest reports Accelerated: no, video memory 1 MB, OpenGL 3.3 / ES 2.0. Rendering was not retried.';
  recordRenderingStatus('environment-blocked', reason, suite);
  console.log(`ENVIRONMENT-BLOCKED: ${suite}\n${reason}\nThis is not a passed rendering test. See test-results/rendering-status.json.`);
  process.exit(0);
}
