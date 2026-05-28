/*
11
src/perceptual-engine/core/src/quality/AdaptiveQualityManager.ts
*/


import type { MemoryPressureLevel } from '../memory/MemoryPressureManager';
import type { ScrollPhase } from '../motion/ScrollPhaseDetector';

export type QualityLevel = 'ULTRA' | 'HIGH' | 'BALANCED' | 'LOW' | 'MINIMAL' | 'EMERGENCY';

export interface QualityConfig {
  level: QualityLevel;
  overscan: number;
  maxGPULayers: number;
  maxPoolSize: number;
  enablePredictiveRendering: boolean;
  enableGPUCompositing: boolean;
  measurementFrequency: 'normal' | 'reduced' | 'minimal' | 'none';
  correctionThreshold: number;
  frameBudgetTarget: number;
  maxMeasurementsPerFrame: number;
}

const QUALITY_PRESETS: Record<QualityLevel, Omit<QualityConfig, 'level'>> = {
  ULTRA: {
    overscan: 12,
    maxGPULayers: 20,
    maxPoolSize: 150,
    enablePredictiveRendering: true,
    enableGPUCompositing: true,
    measurementFrequency: 'normal',
    correctionThreshold: 0.1,
    frameBudgetTarget: 12,
    maxMeasurementsPerFrame: 10,
  },
  HIGH: {
    overscan: 8,
    maxGPULayers: 12,
    maxPoolSize: 80,
    enablePredictiveRendering: true,
    enableGPUCompositing: true,
    measurementFrequency: 'normal',
    correctionThreshold: 0.15,
    frameBudgetTarget: 8,
    maxMeasurementsPerFrame: 5,
  },
  BALANCED: {
    overscan: 5,
    maxGPULayers: 6,
    maxPoolSize: 40,
    enablePredictiveRendering: true,
    enableGPUCompositing: true,
    measurementFrequency: 'reduced',
    correctionThreshold: 0.2,
    frameBudgetTarget: 6,
    maxMeasurementsPerFrame: 3,
  },
  LOW: {
    overscan: 3,
    maxGPULayers: 3,
    maxPoolSize: 20,
    enablePredictiveRendering: false,
    enableGPUCompositing: false,
    measurementFrequency: 'minimal',
    correctionThreshold: 0.3,
    frameBudgetTarget: 4,
    maxMeasurementsPerFrame: 2,
  },
  MINIMAL: {
    overscan: 2,
    maxGPULayers: 1,
    maxPoolSize: 12,
    enablePredictiveRendering: false,
    enableGPUCompositing: false,
    measurementFrequency: 'none',
    correctionThreshold: 0.5,
    frameBudgetTarget: 3,
    maxMeasurementsPerFrame: 1,
  },
  EMERGENCY: {
    overscan: 1,
    maxGPULayers: 0,
    maxPoolSize: 6,
    enablePredictiveRendering: false,
    enableGPUCompositing: false,
    measurementFrequency: 'none',
    correctionThreshold: 1.0,
    frameBudgetTarget: 2,
    maxMeasurementsPerFrame: 0,
  },
};

export class AdaptiveQualityManager {
  private currentLevel: QualityLevel = 'HIGH';
  private config: QualityConfig;
  private degradationCount: number = 0;
  private recoveryCount: number = 0;
  private readonly degradationThreshold: number = 3;
  private readonly recoveryThreshold: number = 5;
  private listeners: Set<(config: QualityConfig) => void> = new Set();

  constructor(initialLevel: QualityLevel = 'HIGH') {
    this.currentLevel = initialLevel;
    this.config = { level: initialLevel, ...QUALITY_PRESETS[initialLevel] };
  }

  evaluate(
    fps: number,
    memoryPressure: MemoryPressureLevel,
    scrollPhase: ScrollPhase,
    _averageCorrectionDelta: number
  ): QualityConfig {
    const previousLevel = this.currentLevel;

    if (memoryPressure === 'CRITICAL') {
      this.setLevel('EMERGENCY');
    } else if (memoryPressure === 'HIGH') {
      this.setLevel('MINIMAL');
    } else if (memoryPressure === 'MODERATE' && this.currentLevel === 'ULTRA') {
      this.setLevel('HIGH');
    }

    if (fps < 25) {
      this.degradationCount++;
      if (this.degradationCount >= this.degradationThreshold) {
        this.degrade();
        this.degradationCount = 0;
      }
    } else if (fps > 50) {
      this.recoveryCount++;
      this.degradationCount = Math.max(0, this.degradationCount - 1);
      if (this.recoveryCount >= this.recoveryThreshold) {
        this.upgrade();
        this.recoveryCount = 0;
      }
    } else {
      this.degradationCount = Math.max(0, this.degradationCount - 1);
      this.recoveryCount = Math.max(0, this.recoveryCount - 1);
    }

    if (scrollPhase === 'FLING' && this.currentLevel === 'ULTRA') {
      this.setLevel('HIGH');
    }

    if (this.currentLevel !== previousLevel) {
      this.notifyListeners();
    }

    return this.config;
  }

  getConfig(): QualityConfig {
    return this.config;
  }

  getLevel(): QualityLevel {
    return this.currentLevel;
  }

  onQualityChange(callback: (config: QualityConfig) => void): () => void {
    this.listeners.add(callback);
    return () => { this.listeners.delete(callback); };
  }

  forceLevel(level: QualityLevel): void {
    this.setLevel(level);
    this.notifyListeners();
  }

  private setLevel(level: QualityLevel): void {
    if (level === this.currentLevel) return;
    this.currentLevel = level;
    this.config = { level, ...QUALITY_PRESETS[level] };
  }

  private degrade(): void {
    const levels: QualityLevel[] = ['ULTRA', 'HIGH', 'BALANCED', 'LOW', 'MINIMAL', 'EMERGENCY'];
    const idx = levels.indexOf(this.currentLevel);
    if (idx < levels.length - 1) {
      this.setLevel(levels[idx + 1]);
    }
  }

  private upgrade(): void {
    const levels: QualityLevel[] = ['ULTRA', 'HIGH', 'BALANCED', 'LOW', 'MINIMAL', 'EMERGENCY'];
    const idx = levels.indexOf(this.currentLevel);
    if (idx > 0) {
      this.setLevel(levels[idx - 1]);
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach((cb) => cb(this.config));
  }

  destroy(): void {
    this.listeners.clear();
  }
}