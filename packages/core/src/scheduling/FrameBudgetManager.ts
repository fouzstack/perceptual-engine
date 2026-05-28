/*
src/perceptual-engine/core/src/scheduling/FrameBudgetManager.ts
*/

// 10
export interface FrameBudget {
  totalMs: number;
  usedMs: number;
  remainingMs: number;
  startTime: number;
  targetFPS: number;
  consecutiveDropped: number;
}

export class FrameBudgetManager {
  private budget: FrameBudget;
  private frameHistory: number[] = [];
  private readonly maxHistorySize: number = 60;
  private deviceMemory: number = 4;

  constructor(targetFPS: number = 60) {
    this.budget = this.createBudget(targetFPS);
    this.detectDeviceCapabilities();
  }

  beginFrame(): FrameBudget {
    const now = performance.now();
    const totalMs = 1000 / this.budget.targetFPS;

    this.budget = {
      totalMs,
      usedMs: 0,
      remainingMs: totalMs,
      startTime: now,
      targetFPS: this.budget.targetFPS,
      consecutiveDropped: this.budget.consecutiveDropped,
    };

    return this.budget;
  }

  canContinue(minRequiredMs: number = 1): boolean {
    const elapsed = performance.now() - this.budget.startTime;
    this.budget.usedMs = elapsed;
    this.budget.remainingMs = Math.max(0, this.budget.totalMs - elapsed);

    return this.budget.remainingMs >= minRequiredMs;
  }

  endFrame(): void {
    const elapsed = performance.now() - this.budget.startTime;
    this.frameHistory.push(elapsed);

    if (this.frameHistory.length > this.maxHistorySize) {
      this.frameHistory.shift();
    }

    if (elapsed > this.budget.totalMs * 1.5) {
      this.budget.consecutiveDropped++;

      if (this.budget.consecutiveDropped > 10 && this.budget.targetFPS > 30) {
        this.budget.targetFPS = Math.max(30, this.budget.targetFPS - 5);
        this.budget.consecutiveDropped = 0;
      }
    } else {
      this.budget.consecutiveDropped = Math.max(0, this.budget.consecutiveDropped - 1);

      if (this.budget.consecutiveDropped === 0 && this.budget.targetFPS < 60) {
        this.budget.targetFPS = Math.min(60, this.budget.targetFPS + 1);
      }
    }
  }

  getRemainingBudget(): number {
    const elapsed = performance.now() - this.budget.startTime;
    return Math.max(0, this.budget.totalMs - elapsed);
  }

  getAverageFPS(): number {
    if (this.frameHistory.length === 0) return this.budget.targetFPS;
    const sum = this.frameHistory.reduce((a, b) => a + b, 0);
    const avgMs = sum / this.frameHistory.length;
    return avgMs > 0 ? 1000 / avgMs : this.budget.targetFPS;
  }

  getStats() {
    return {
      targetFPS: this.budget.targetFPS,
      averageFPS: this.getAverageFPS(),
      consecutiveDropped: this.budget.consecutiveDropped,
      deviceMemory: this.deviceMemory,
      recommendedMaxLayers: this.getRecommendedMaxGPULayers(),
      recommendedOverscan: this.getRecommendedOverscan(),
    };
  }

  getRecommendedMaxGPULayers(): number {
    if (this.deviceMemory <= 1) return 4;
    if (this.deviceMemory <= 2) return 6;
    if (this.deviceMemory <= 4) return 12;
    return 20;
  }

  getRecommendedOverscan(): number {
    const avgFPS = this.getAverageFPS();
    if (avgFPS < 30) return 2;
    if (avgFPS < 45) return 3;
    if (avgFPS < 55) return 5;
    return 8;
  }

  private createBudget(targetFPS: number): FrameBudget {
    return {
      totalMs: 1000 / targetFPS,
      usedMs: 0,
      remainingMs: 1000 / targetFPS,
      startTime: performance.now(),
      targetFPS,
      consecutiveDropped: 0,
    };
  }

  private detectDeviceCapabilities(): void {
    if (typeof navigator !== 'undefined' && 'deviceMemory' in navigator) {
      this.deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4;
    }

    if (this.deviceMemory <= 1) {
      this.budget.targetFPS = 30;
    } else if (this.deviceMemory <= 2) {
      this.budget.targetFPS = 45;
    }
  }

  destroy(): void {
    this.frameHistory = [];
  }
}