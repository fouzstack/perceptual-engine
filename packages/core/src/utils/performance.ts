export interface FrameMetrics {
  timestamp: number;
  duration: number;
  fps: number;
  dropped: boolean;
}

export class PerformanceMonitor {
  private frames: FrameMetrics[] = [];
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  private droppedFrameCount: number = 0;
  private readonly maxStoredFrames: number;
  private readonly targetFPS: number;
  private readonly frameBudget: number;

  constructor(targetFPS: number = 60, maxStoredFrames: number = 120) {
    this.targetFPS = targetFPS;
    this.frameBudget = 1000 / targetFPS;
    this.maxStoredFrames = maxStoredFrames;
    this.lastFrameTime = performance.now();
  }

  recordFrame(): FrameMetrics {
    const now = performance.now();
    const duration = now - this.lastFrameTime;
    const fps = duration > 0 ? 1000 / duration : this.targetFPS;
    const dropped = duration > this.frameBudget * 1.5;
    const metrics: FrameMetrics = { timestamp: now, duration, fps: Math.min(fps, this.targetFPS), dropped };
    this.frames.push(metrics);
    if (this.frames.length > this.maxStoredFrames) this.frames.shift();
    if (dropped) this.droppedFrameCount++;
    this.frameCount++;
    this.lastFrameTime = now;
    return metrics;
  }

  getAverageFPS(sampleSize: number = 60): number {
    const samples = this.frames.slice(-sampleSize);
    if (samples.length === 0) return this.targetFPS;
    const totalDuration = samples[samples.length - 1].timestamp - samples[0].timestamp;
    if (totalDuration <= 0) return this.targetFPS;
    return (samples.length / totalDuration) * 1000;
  }

  getAverageFrameTime(sampleSize: number = 60): number {
    const samples = this.frames.slice(-sampleSize);
    if (samples.length === 0) return this.frameBudget;
    const totalDuration = samples.reduce((sum, f) => sum + f.duration, 0);
    return totalDuration / samples.length;
  }

  getDroppedFrames(): number { return this.droppedFrameCount; }

  getDroppedFramePercentage(sampleSize: number = 60): number {
    const samples = this.frames.slice(-sampleSize);
    if (samples.length === 0) return 0;
    const dropped = samples.filter(f => f.dropped).length;
    return (dropped / samples.length) * 100;
  }

  getFrameStability(sampleSize: number = 60): number {
    const samples = this.frames.slice(-sampleSize);
    if (samples.length < 2) return 100;
    const durations = samples.map(f => f.duration);
    const mean = durations.reduce((a, b) => a + b) / durations.length;
    const variance = durations.reduce((sum, d) => sum + (d - mean) ** 2, 0) / durations.length;
    const stdDev = Math.sqrt(variance);
    return Math.max(0, 100 - (stdDev / this.frameBudget) * 100);
  }

  getMetrics(sampleSize: number = 60) {
    return {
      fps: this.getAverageFPS(sampleSize),
      frameTime: this.getAverageFrameTime(sampleSize),
      droppedFrames: this.getDroppedFrames(),
      droppedPercentage: this.getDroppedFramePercentage(sampleSize),
      stability: this.getFrameStability(sampleSize),
      totalFrames: this.frameCount,
    };
  }

  reset(): void {
    this.frames = [];
    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.droppedFrameCount = 0;
  }
}

export function measureExecutionTime<T>(fn: () => T, label?: string): { result: T; time: number } {
  const start = performance.now();
  const result = fn();
  const time = performance.now() - start;
  if (label) console.debug(`[Perf] ${label}: ${time.toFixed(2)}ms`);
  return { result, time };
}

export async function measureAsyncExecutionTime<T>(fn: () => Promise<T>, label?: string): Promise<{ result: T; time: number }> {
  const start = performance.now();
  const result = await fn();
  const time = performance.now() - start;
  if (label) console.debug(`[Perf] ${label}: ${time.toFixed(2)}ms`);
  return { result, time };
}

export function rafDebounce<T extends (...args: any[]) => void>(fn: T, /* delay: number = 16 */): (...args: Parameters<T>) => void {
  let rafId: number | null = null;
  let lastArgs: Parameters<T> | null = null;
  return (...args: Parameters<T>) => {
    lastArgs = args;
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => { if (lastArgs) fn(...lastArgs); rafId = null; });
  };
}

export function rafThrottle<T extends (...args: any[]) => void>(fn: T): (...args: Parameters<T>) => void {
  let scheduled = false;
  return (...args: Parameters<T>) => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { fn(...args); scheduled = false; });
  };
}

export function scheduleIdleTask(callback: () => void, timeout?: number): void {
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(callback, { timeout });
  } else {
    setTimeout(callback, timeout || 50);
  }
}