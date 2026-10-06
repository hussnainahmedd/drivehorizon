export const FIXED_DT = 1 / 120;

/** Cap long stalls, but keep physics independent of display rate and render limits. */
export class FixedStepper {
  private accumulator = 0;

  advance(seconds: number, step: (dt: number) => void) {
    if (!Number.isFinite(seconds) || seconds <= 0) return 0;
    this.accumulator += Math.min(seconds, 0.25);
    let count = 0;
    while (this.accumulator + 1e-10 >= FIXED_DT && count < 30) {
      step(FIXED_DT); this.accumulator = Math.max(0, this.accumulator - FIXED_DT); count++;
    }
    return count;
  }

  reset() { this.accumulator = 0; }
}

export class RenderCadence {
  private next = 0;
  private limit = -1;

  due(now: number, limit: number) {
    if (limit !== this.limit) { this.limit = limit; this.next = now; }
    if (!limit) return true;
    const interval = 1 / limit;
    if (now + 0.0005 < this.next) return false;
    this.next += Math.max(1, Math.floor((now - this.next + 0.0005) / interval) + 1) * interval;
    return true;
  }

  reset() { this.next = 0; this.limit = -1; }
}
