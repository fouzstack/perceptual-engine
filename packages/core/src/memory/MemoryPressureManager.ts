/*
src/perceptual-engine/core/src/memory/MemoryPressureManager.ts
*/

export type MemoryPressureLevel = 'NORMAL' | 'MODERATE' | 'HIGH' | 'CRITICAL';

interface MemoryPressureConfig {
  normalThreshold: number;
  moderateThreshold: number;
  highThreshold: number;
  checkIntervalMs: number;
}

const DEFAULT_CONFIG: MemoryPressureConfig = {
  normalThreshold: 100,
  moderateThreshold: 200,
  highThreshold: 400,
  checkIntervalMs: 2000,
};

export class MemoryPressureManager {
  private level: MemoryPressureLevel = 'NORMAL';
  private config: MemoryPressureConfig;
  private deviceMemory: number = 4;
  private checkTimerId: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<(level: MemoryPressureLevel) => void> = new Set();

  constructor(config?: Partial<MemoryPressureConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.detectDeviceMemory();
    this.adjustConfigForDevice();
  }

  start(): void {
    this.check();
    this.checkTimerId = setInterval(() => this.check(), this.config.checkIntervalMs);
  }

  stop(): void {
    if (this.checkTimerId !== null) {
      clearInterval(this.checkTimerId);
      this.checkTimerId = null;
    }
  }

  getLevel(): MemoryPressureLevel {
    return this.level;
  }

  getDeviceMemory(): number {
    return this.deviceMemory;
  }

  getRecommendations() {
    switch (this.level) {
      case 'NORMAL':
        return {
          maxGPULayers: this.deviceMemory <= 2 ? 6 : 12,
          maxPoolSize: this.deviceMemory <= 2 ? 30 : 80,
          overscan: 6,
          enablePredictiveRendering: true,
          measurementFrequency: 'normal' as const,
          correctionThreshold: 0.15,
        };
      case 'MODERATE':
        return {
          maxGPULayers: 4,
          maxPoolSize: 20,
          overscan: 4,
          enablePredictiveRendering: true,
          measurementFrequency: 'reduced' as const,
          correctionThreshold: 0.2,
        };
      case 'HIGH':
        return {
          maxGPULayers: 2,
          maxPoolSize: 12,
          overscan: 2,
          enablePredictiveRendering: false,
          measurementFrequency: 'minimal' as const,
          correctionThreshold: 0.3,
        };
      case 'CRITICAL':
        return {
          maxGPULayers: 0,
          maxPoolSize: 6,
          overscan: 1,
          enablePredictiveRendering: false,
          measurementFrequency: 'none' as const,
          correctionThreshold: 0.5,
        };
    }
  }

  onPressureChange(callback: (level: MemoryPressureLevel) => void): () => void {
    this.listeners.add(callback);
    return () => { this.listeners.delete(callback); };
  }

  private check(): void {
    const newLevel = this.calculateLevel();
    if (newLevel !== this.level) {
      const oldLevel = this.level;
      this.level = newLevel;
      console.warn(`[MemoryPressureManager] Pressure changed: ${oldLevel} -> ${newLevel}`);
      this.listeners.forEach((cb) => cb(newLevel));
    }
  }

  private calculateLevel(): MemoryPressureLevel {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      if (memory) {
        const usedMB = memory.usedJSHeapSize / (1024 * 1024);

        if (usedMB > this.config.highThreshold) return 'CRITICAL';
        if (usedMB > this.config.moderateThreshold) return 'HIGH';
        if (usedMB > this.config.normalThreshold) return 'MODERATE';
      }
    }

    if (this.deviceMemory <= 1) {
      return 'MODERATE';
    }

    return 'NORMAL';
  }

  private detectDeviceMemory(): void {
    if (typeof navigator !== 'undefined' && 'deviceMemory' in navigator) {
      this.deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4;
    }
  }

  private adjustConfigForDevice(): void {
    if (this.deviceMemory <= 1) {
      this.config.normalThreshold = 50;
      this.config.moderateThreshold = 100;
      this.config.highThreshold = 200;
    } else if (this.deviceMemory <= 2) {
      this.config.normalThreshold = 80;
      this.config.moderateThreshold = 150;
      this.config.highThreshold = 300;
    }
  }

  destroy(): void {
    this.stop();
    this.listeners.clear();
  }
}