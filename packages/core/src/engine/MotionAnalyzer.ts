import { MotionState, ScrollDirection } from '../types/engine';
import { calculateVelocity, calculateAcceleration, predictPosition, calculateBrakingDistance, clamp } from '../utils/geometry';

export class MotionAnalyzer {
  private history: MotionState[] = [];
  private readonly maxHistorySize: number;
  private lastScrollPosition: number = 0;
  private lastTimestamp: number = 0;
  private currentState: MotionState;
  private isTracking: boolean = false;
  private static readonly DEFAULT_DECELERATION = 0.003;
  private static readonly VELOCITY_THRESHOLD = 0.01;

  constructor(maxHistorySize: number = 60) {
    this.maxHistorySize = maxHistorySize;
    this.currentState = this.createDefaultState();
  }

  update(scrollTop: number, timestamp: number = performance.now()): MotionState {
    if (!this.isTracking) { this.lastScrollPosition = scrollTop; this.lastTimestamp = timestamp; this.isTracking = true; return this.currentState; }
    const dt = timestamp - this.lastTimestamp;
    if (dt < 1) return this.currentState;
    const velocity = calculateVelocity(this.lastScrollPosition, scrollTop, this.lastTimestamp, timestamp);
    const acceleration = calculateAcceleration(this.currentState.velocity, velocity, this.lastTimestamp, timestamp);
    const jerk = acceleration - this.currentState.acceleration;
    const direction = this.determineDirection(velocity);
    const isDecelerating = this.detectDeceleration(velocity, acceleration);
    const predictedStopPosition = this.predictStopPosition(scrollTop, velocity, acceleration);
    const motionState: MotionState = { velocity, acceleration, jerk, direction, timestamp, momentum: Math.abs(velocity), isDecelerating, predictedStopPosition };
    this.history.push(motionState);
    if (this.history.length > this.maxHistorySize) this.history.shift();
    this.currentState = motionState;
    this.lastScrollPosition = scrollTop;
    this.lastTimestamp = timestamp;
    return motionState;
  }

  private determineDirection(velocity: number): ScrollDirection {
    if (Math.abs(velocity) < MotionAnalyzer.VELOCITY_THRESHOLD) return 'idle';
    return velocity > 0 ? 'down' : 'up';
  }

  private detectDeceleration(velocity: number, acceleration: number): boolean {
    return velocity * acceleration < 0 || (Math.abs(velocity) > 0.5 && Math.abs(acceleration) < 0.001);
  }

  private predictStopPosition(currentPosition: number, velocity: number, acceleration: number): number {
    if (Math.abs(velocity) < MotionAnalyzer.VELOCITY_THRESHOLD) return currentPosition;
    const deceleration = this.detectDeceleration(velocity, acceleration) ? Math.max(Math.abs(acceleration), MotionAnalyzer.DEFAULT_DECELERATION) : MotionAnalyzer.DEFAULT_DECELERATION;
    return currentPosition + Math.sign(velocity) * calculateBrakingDistance(velocity, deceleration);
  }

  predictFuturePosition(timeAheadMs: number = 100): number {
    return predictPosition(this.lastScrollPosition, this.currentState.velocity, this.currentState.acceleration, timeAheadMs);
  }

  calculateOptimalOverscan(baseOverscan: number, maxOverscan: number = 50): number {
    const { velocity, acceleration, isDecelerating } = this.currentState;
    const absVelocity = Math.abs(velocity);
    if (absVelocity < 0.5) return baseOverscan;
    const velocityFactor = Math.log2(absVelocity + 1);
    let multiplier = 1 + velocityFactor;
    if (!isDecelerating && acceleration !== 0) multiplier *= 1.3;
    else if (isDecelerating) multiplier *= 0.7;
    if (Math.abs(this.currentState.jerk) > 1) multiplier *= 1.2;
    return clamp(Math.round(baseOverscan * multiplier), baseOverscan, maxOverscan);
  }

  calculateDirectionalOverscan(baseOverscan: number, maxOverscan: number = 50): { before: number; after: number } {
    const total = this.calculateOptimalOverscan(baseOverscan, maxOverscan);
    const { direction, velocity } = this.currentState;
    if (direction === 'idle' || Math.abs(velocity) < 0.5) return { before: Math.floor(total / 2), after: Math.floor(total / 2) };
    const ratio = Math.min(0.8, 0.5 + Math.abs(velocity) * 0.1);
    return direction === 'down' ? { before: Math.floor(total * (1 - ratio)), after: Math.floor(total * ratio) } : { before: Math.floor(total * ratio), after: Math.floor(total * (1 - ratio)) };
  }

  isSignificantScroll(threshold: number = 1): boolean { return this.currentState.momentum > threshold; }
  isStable(stabilityThresholdMs: number = 150): boolean {
    const recent = this.getRecentHistory(stabilityThresholdMs);
    if (recent.length < 2) return false;
    return Math.max(...recent.map((h) => Math.abs(h.velocity))) < 0.1;
  }
  isFlickGesture(threshold: number = 3): boolean { return Math.abs(this.currentState.velocity) > threshold; }
  getMotionTrend(): 'accelerating' | 'decelerating' | 'constant' | 'idle' {
    const { velocity, acceleration } = this.currentState;
    if (Math.abs(velocity) < 0.1) return 'idle';
    if (Math.abs(acceleration) < 0.01) return 'constant';
    return acceleration > 0 ? 'accelerating' : 'decelerating';
  }
  getCurrentState(): MotionState { return { ...this.currentState }; }
  private getRecentHistory(timeWindowMs: number): MotionState[] { const cutoff = performance.now() - timeWindowMs; return this.history.filter((h) => h.timestamp >= cutoff); }
  getAverageVelocity(timeWindowMs: number = 100): number { const r = this.getRecentHistory(timeWindowMs); return r.length === 0 ? 0 : r.reduce((s, h) => s + h.velocity, 0) / r.length; }
  getMaxVelocity(timeWindowMs: number = 500): number { const r = this.getRecentHistory(timeWindowMs); return r.length === 0 ? 0 : Math.max(...r.map((h) => Math.abs(h.velocity))); }

  private createDefaultState(): MotionState {
    return { velocity: 0, acceleration: 0, jerk: 0, direction: 'idle', timestamp: 0, momentum: 0, isDecelerating: false, predictedStopPosition: 0 };
  }

  reset(): void { this.history = []; this.currentState = this.createDefaultState(); this.lastScrollPosition = 0; this.lastTimestamp = 0; this.isTracking = false; }
}