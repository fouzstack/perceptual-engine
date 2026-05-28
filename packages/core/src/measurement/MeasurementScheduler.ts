/*
src/perceptual-engine/core/src/measurement/MeasurementScheduler.ts
#8
*/

export interface MeasurementTask {
  index: number;
  priority: number;
  epoch: number;
  element: HTMLElement;
  onMeasured: (index: number, height: number, width: number) => void;
}

interface EpochGuard {
  isValid: (epoch: number) => boolean;
}

export class MeasurementScheduler {
  private queue: Map<number, MeasurementTask> = new Map();
  private pendingFlush: boolean = false;
  private flushFrameId: number | null = null;
  private maxMeasurementsPerFrame: number = 5;
  private epochManager: EpochGuard | null = null;

  setEpochManager(manager: EpochGuard): void {
    this.epochManager = manager;
  }

  enqueue(task: MeasurementTask): void {
    if (this.epochManager && !this.epochManager.isValid(task.epoch)) {
      return;
    }

    const existing = this.queue.get(task.index);

    if (!existing || existing.priority > task.priority) {
      this.queue.set(task.index, task);
    }

    if (!this.pendingFlush) {
      this.scheduleFlush();
    }
  }

  flush(frameBudgetMs: number = 3): number {
    if (this.queue.size === 0) return 0;

    const tasks = Array.from(this.queue.values())
      .filter((t) => !this.epochManager || this.epochManager.isValid(t.epoch))
      .sort((a, b) => a.priority - b.priority);

    const startTime = performance.now();
    let measured = 0;

    const measurements: Array<{ task: MeasurementTask; height: number; width: number }> = [];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      if (performance.now() - startTime > frameBudgetMs) break;
      if (measured >= this.maxMeasurementsPerFrame) break;

      const rect = task.element.getBoundingClientRect();
      if (rect.height > 0) {
        measurements.push({
          task,
          height: Math.round(rect.height),
          width: Math.round(rect.width),
        });
      }

      this.queue.delete(task.index);
      measured++;
    }

    for (let i = 0; i < measurements.length; i++) {
      const m = measurements[i];
      m.task.onMeasured(m.task.index, m.height, m.width);
    }

    if (this.queue.size > 0) {
      this.scheduleFlush();
    } else {
      this.pendingFlush = false;
    }

    return measured;
  }

  cancelAll(): void {
    this.queue.clear();
    this.pendingFlush = false;
    if (this.flushFrameId !== null) {
      cancelAnimationFrame(this.flushFrameId);
      this.flushFrameId = null;
    }
  }

  cancelIndices(indices: Set<number>): void {
    indices.forEach((idx) => this.queue.delete(idx));
  }

  getQueueSize(): number {
    return this.queue.size;
  }

  private scheduleFlush(): void {
    if (this.flushFrameId !== null) return;
    this.pendingFlush = true;

    this.flushFrameId = requestAnimationFrame(() => {
      this.flushFrameId = null;
      this.flush(3);
    });
  }

  destroy(): void {
    this.cancelAll();
    this.epochManager = null;
  }
}