import { MeasurementResult, LayoutPrediction } from '../types/engine';

interface SizeStats { count: number; total: number; min: number; max: number; average: number; median: number; variance: number; standardDeviation: number; }

export class LayoutPredictor {
  private measurements: Map<number, MeasurementResult> = new Map();
  private predictions: Map<number, LayoutPrediction> = new Map();
  private sizeDistribution: Map<number, number> = new Map();
  private categoryStats: Map<string, SizeStats> = new Map();
  private readonly maxMeasurements: number;
  private readonly predictionConfidenceThreshold: number;
  private totalPredictions: number = 0;
  private successfulPredictions: number = 0;
  private predictionCache: Map<string, number> = new Map();
  private cacheHits: number = 0;
  private cacheMisses: number = 0;

  constructor(maxMeasurements: number = 1000, predictionConfidenceThreshold: number = 0.7) {
    this.maxMeasurements = maxMeasurements;
    this.predictionConfidenceThreshold = predictionConfidenceThreshold;
  }

  recordMeasurement(index: number, height: number, width?: number): void {
    const h = Math.round(height);
    this.measurements.set(index, { index, height: h, width: width || 0, timestamp: performance.now(), accurate: true });
    const bucket = Math.round(h / 10) * 10;
    this.sizeDistribution.set(bucket, (this.sizeDistribution.get(bucket) || 0) + 1);
    if (this.measurements.size > this.maxMeasurements) this.pruneOldMeasurements();
    this.predictionCache.delete(`index_${index}`);
    this.updatePredictionWithMeasurement(index, h);
  }

  recordMeasurements(measurements: MeasurementResult[]): void { measurements.forEach((m) => this.recordMeasurement(m.index, m.height, m.width)); }

  recordCategory(categoryId: string, measurements: number[]): void {
    if (measurements.length === 0) return;
    const sorted = [...measurements].sort((a, b) => a - b);
    const total = sorted.reduce((a, b) => a + b, 0);
    const average = total / sorted.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    const variance = sorted.reduce((s, h) => s + (h - average) ** 2, 0) / sorted.length;
    this.categoryStats.set(categoryId, { count: sorted.length, total, min: sorted[0], max: sorted[sorted.length - 1], average, median, variance, standardDeviation: Math.sqrt(variance) });
    this.predictionCache.delete(`category_${categoryId}`);
  }

  predictHeight(index: number): LayoutPrediction {
    const cacheKey = `index_${index}`;
    const cached = this.predictionCache.get(cacheKey);
    if (cached !== undefined) { this.cacheHits++; return { index, predictedHeight: cached, confidence: 0.9, basedOnSamples: this.measurements.size, lastUpdated: performance.now() }; }
    this.cacheMisses++;
    const existing = this.predictions.get(index);
    if (existing && this.isPredictionValid(existing)) { this.predictionCache.set(cacheKey, existing.predictedHeight); return existing; }
    const nearby = this.predictFromNearby(index);
    if (nearby && nearby.confidence >= 0.6) { this.predictions.set(index, nearby); this.predictionCache.set(cacheKey, nearby.predictedHeight); return nearby; }
    const global = this.predictFromDistribution();
    const p: LayoutPrediction = { index, predictedHeight: global, confidence: 0.4, basedOnSamples: this.measurements.size, lastUpdated: performance.now() };
    this.predictions.set(index, p);
    this.predictionCache.set(cacheKey, p.predictedHeight);
    this.totalPredictions++;
    return p;
  }

  private predictFromNearby(index: number): LayoutPrediction | null {
    const nearby: number[] = [];
    for (let i = index - 50; i <= index + 50; i++) { const m = this.measurements.get(i); if (m) nearby.push(m.height); }
    if (nearby.length < 3) return null;
    const sorted = [...nearby].sort((a, b) => a - b);
    const predictedHeight = Math.round(sorted[Math.floor(sorted.length / 2)]);
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const variance = sorted.reduce((s, h) => s + (h - avg) ** 2, 0) / sorted.length;
    let confidence = 1 - Math.min(1, Math.sqrt(variance) / avg);
    confidence *= Math.min(1, nearby.length / 10);
    confidence = Math.max(0.1, Math.min(0.99, confidence));
    this.totalPredictions++;
    return { index, predictedHeight, confidence, basedOnSamples: nearby.length, lastUpdated: performance.now() };
  }

  private predictFromDistribution(): number {
    if (this.measurements.size === 0) return 50;
    let maxCount = 0, mostCommon = 50;
    this.sizeDistribution.forEach((c, h) => { if (c > maxCount) { maxCount = c; mostCommon = h; } });
    return maxCount > 5 ? mostCommon : this.getMedianHeight();
  }

  predictFromCategory(categoryId: string): number | null {
    const ck = `category_${categoryId}`;
    const cached = this.predictionCache.get(ck);
    if (cached !== undefined) { this.cacheHits++; return cached; }
    this.cacheMisses++;
    const stats = this.categoryStats.get(categoryId);
    if (!stats) return null;
    const p = Math.round(stats.median);
    this.predictionCache.set(ck, p);
    return p;
  }

  private updatePredictionWithMeasurement(index: number, actualHeight: number): void {
    const p = this.predictions.get(index);
    if (!p) return;
    const error = Math.abs(p.predictedHeight - actualHeight);
    const rel = actualHeight > 0 ? error / actualHeight : 0;
    if (rel < 0.15) { this.successfulPredictions++; p.confidence = Math.min(0.99, p.confidence + 0.1); }
    else if (rel < 0.3) p.confidence = Math.max(0.3, p.confidence - 0.1);
    else p.confidence = Math.max(0.1, p.confidence - 0.3);
    p.predictedHeight = actualHeight;
    p.lastUpdated = performance.now();
    p.basedOnSamples++;
    this.predictionCache.set(`index_${index}`, actualHeight);
  }

  private isPredictionValid(p: LayoutPrediction): boolean {
    return performance.now() - p.lastUpdated < 30000 && p.confidence >= this.predictionConfidenceThreshold;
  }

  private pruneOldMeasurements(): void {
    const entries = Array.from(this.measurements.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, Math.floor(entries.length * 0.3));
    toRemove.forEach(([i]) => { this.measurements.delete(i); this.predictionCache.delete(`index_${i}`); });
    this.rebuildDistribution();
  }

  private rebuildDistribution(): void {
    this.sizeDistribution.clear();
    this.measurements.forEach((m) => { const b = Math.round(m.height / 10) * 10; this.sizeDistribution.set(b, (this.sizeDistribution.get(b) || 0) + 1); });
  }

  getAverageHeight(): number { if (this.measurements.size === 0) return 50; let t = 0; this.measurements.forEach((m) => t += m.height); return Math.round(t / this.measurements.size); }
  getMedianHeight(): number { if (this.measurements.size === 0) return 50; const h = Array.from(this.measurements.values()).map((m) => m.height).sort((a, b) => a - b); const mid = Math.floor(h.length / 2); return h.length % 2 === 0 ? Math.round((h[mid - 1] + h[mid]) / 2) : h[mid]; }
  getPredictionAccuracy(): number { return this.totalPredictions === 0 ? 100 : (this.successfulPredictions / this.totalPredictions) * 100; }
  getSizeDistribution(): Map<number, number> { return new Map(this.sizeDistribution); }
  getCacheStats() { const t = this.cacheHits + this.cacheMisses; return { hits: this.cacheHits, misses: this.cacheMisses, hitRate: t > 0 ? (this.cacheHits / t) * 100 : 0, cacheSize: this.predictionCache.size }; }
  clear(): void { this.measurements.clear(); this.predictions.clear(); this.sizeDistribution.clear(); this.categoryStats.clear(); this.predictionCache.clear(); this.totalPredictions = 0; this.successfulPredictions = 0; this.cacheHits = 0; this.cacheMisses = 0; }
}