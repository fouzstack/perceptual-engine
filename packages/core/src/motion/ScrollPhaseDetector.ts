/*
/core/src/motion/ScrollPhaseDetector.ts
*/

export type ScrollPhase = 'IDLE' | 'DRAGGING' | 'FLING' | 'SETTLING' | 'CORRECTING';

interface PhaseConfig {
  flingVelocityThreshold: number;
  settlingVelocityThreshold: number;
  idleTimeoutMs: number;
  correctionCooldownMs: number;
}

const DEFAULT_CONFIG: PhaseConfig = {
  flingVelocityThreshold: 0.5,
  settlingVelocityThreshold: 0.1,
  idleTimeoutMs: 150,
  correctionCooldownMs: 100,
};

export class ScrollPhaseDetector {
  private phase: ScrollPhase = 'IDLE';
  private config: PhaseConfig; //@ts-expect-error
  private lastMovementTime: number = 0;
  private lastCorrectionTime: number = 0;
  private pendingCorrections: Array<() => void> = [];
  private idleTimerId: ReturnType<typeof setTimeout> | null = null; //@ts-expect-error
  private isPointerDown: boolean = false;

  constructor(config?: Partial<PhaseConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  update(velocity: number, isPointerActive: boolean, timestamp: number): ScrollPhase {
    this.isPointerDown = isPointerActive;
    this.lastMovementTime = timestamp;

    if (this.idleTimerId !== null) {
      clearTimeout(this.idleTimerId);
      this.idleTimerId = null;
    }

    const absVelocity = Math.abs(velocity);

    if (absVelocity < this.config.settlingVelocityThreshold && this.phase !== 'CORRECTING') {
      this.phase = 'SETTLING';
      this.scheduleIdle();
    } else if (!isPointerActive && absVelocity > this.config.flingVelocityThreshold) {
      this.phase = 'FLING';
    } else if (isPointerActive && absVelocity > 0) {
      this.phase = 'DRAGGING';
    }

    return this.phase;
  }

  onPointerUp(): void {
    this.isPointerDown = false;
  }

  onPointerDown(): void {
    this.isPointerDown = true;
    this.phase = 'DRAGGING';
  }

  canApplyCorrections(): boolean {
    if (this.phase === 'IDLE' || this.phase === 'SETTLING') {
      return true;
    }
    const now = performance.now();
    return now - this.lastCorrectionTime > this.config.correctionCooldownMs;
  }

  deferCorrection(correction: () => void): void {
    if (this.phase === 'FLING' || this.phase === 'DRAGGING') {
      this.pendingCorrections.push(correction);
    } else {
      correction();
    }
  }

  flushPendingCorrections(): void {
    const corrections = this.pendingCorrections;
    this.pendingCorrections = [];
    this.lastCorrectionTime = performance.now();
    for (let i = 0; i < corrections.length; i++) {
      corrections[i]();
    }
  }

  markCorrectionApplied(): void {
    this.lastCorrectionTime = performance.now();
  }

  beginCorrection(): void {
    if (this.phase === 'FLING' || this.phase === 'DRAGGING') {
      return;
    }
    this.phase = 'CORRECTING';
  }

  endCorrection(): void {
    this.phase = 'SETTLING';
    this.scheduleIdle();
  }

  getPhase(): ScrollPhase {
    return this.phase;
  }

  isIdle(): boolean {
    return this.phase === 'IDLE';
  }

  isFlinging(): boolean {
    return this.phase === 'FLING';
  }

  private scheduleIdle(): void {
    if (this.idleTimerId !== null) {
      clearTimeout(this.idleTimerId);
    }
    this.idleTimerId = setTimeout(() => {
      this.phase = 'IDLE';
      this.idleTimerId = null;
      this.flushPendingCorrections();
    }, this.config.idleTimeoutMs);
  }

  destroy(): void {
    if (this.idleTimerId !== null) {
      clearTimeout(this.idleTimerId);
      this.idleTimerId = null;
    }
    this.pendingCorrections = [];
  }
}