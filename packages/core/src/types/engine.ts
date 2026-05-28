export type ItemState = 'frozen' | 'active' | 'dormant' | 'recycled' | 'free';
export type ScrollDirection = 'up' | 'down' | 'left' | 'right' | 'idle';
export type OverscanMode = 'fixed' | 'adaptive' | 'predictive';
export type QualityLevel = 'high' | 'medium' | 'low' | 'minimal';
export type PerformanceMode = 'auto' | 'ultra' | 'balanced' | 'battery';
export type ScrollIntent = 'reading' | 'skimming' | 'flicking' | 'seeking' | 'reversing';
export type ScrollRestorationStrategy = 'absolute' | 'index' | 'anchor' | 'perceptual';

export interface VirtualItem {
  index: number;
  key: string | number;
  top: number;
  left: number;
  height: number;
  width: number;
  estimated: boolean;
  state: ItemState;
  element: HTMLElement | null;
  lastUsedTimestamp: number;
  priority: number;
  measuredHeight?: number;
}

export interface ViewportState {
  scrollTop: number;
  scrollLeft: number;
  width: number;
  height: number;
  devicePixelRatio: number;
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
}

export interface MotionState {
  velocity: number;
  acceleration: number;
  jerk: number;
  direction: ScrollDirection;
  timestamp: number;
  momentum: number;
  isDecelerating: boolean;
  predictedStopPosition: number;
  intent?: ScrollIntent;
}

export interface ScrollPersistState {
  strategy: ScrollRestorationStrategy;
  scrollTop?: number;
  startIndex?: number;
  anchorItemKey?: string | number;
  anchorOffset?: number;
  velocity?: number;
  direction?: ScrollDirection;
  timestamp: number;
  totalItems: number;
  estimatedItemSize: number;
}

export interface EngineConfig {
  totalItems: number;
  estimatedItemSize: number;
  estimatedItemWidth?: number;
  overscan: number | 'auto';
  overscanMode: OverscanMode;
  minOverscan: number;
  maxOverscan: number;
  scrollDirection: 'vertical' | 'horizontal' | 'both';
  scrollThreshold: number;
  enableGPUCompositing: boolean;
  enableAdaptiveOverscan: boolean;
  enablePredictiveRendering: boolean;
  enableMotionAnalysis: boolean;
  enableLayoutPrediction: boolean;
  enableAdaptiveQuality: boolean;
  performanceMode: PerformanceMode;
  recyclingPoolSize: number;
  poolMinSize: number;
  poolMaxSize: number;
  batchSize: number;
  frameBudget: number;
  debounceScrollMs: number;
  useContentVisibility: boolean;
  useContainment: boolean;
}

export interface PerceptualMetrics {
  fps: number;
  frameTime: number;
  droppedFrames: number;
  layoutThrashing: number;
  poolUtilization: number;
  predictiveAccuracy: number;
  recyclingRate: number;
  averageRenderTime: number;
  memoryUsage: number;
  visibleItems: number;
  totalPoolItems: number;
  gpuLayerCount: number;
  qualityLevel: QualityLevel;
}

export interface ScrollUpdatePayload {
  scrollTop: number;
  scrollLeft: number;
  totalHeight: number;
  totalWidth: number;
  visibleRange: { start: number; end: number };
  velocity: number;
  direction: ScrollDirection;
}

export interface EngineError {
  code: string;
  message: string;
  timestamp: number;
  recoverable: boolean;
}

export interface EngineInitOptions {
  container: HTMLElement;
  totalItems: number;
  estimatedItemSize: number;
  estimatedItemWidth?: number;
  overscan?: number | 'auto';
  overscanMode?: OverscanMode;
  scrollDirection?: 'vertical' | 'horizontal' | 'both';
  recyclingPoolSize?: number;
  batchSize?: number;
  enableGPU?: boolean;
  enableAdaptiveOverscan?: boolean;
  enablePredictiveRendering?: boolean;
  enableMotionAnalysis?: boolean;
  enableLayoutPrediction?: boolean;
  enableAdaptiveQuality?: boolean;
  performanceMode?: PerformanceMode;
  frameBudget?: number;
  debounceScrollMs?: number;
}

export interface MeasurementResult {
  index: number;
  height: number;
  width: number;
  timestamp: number;
  accurate: boolean;
}

export interface LayoutPrediction {
  index: number;
  predictedHeight: number;
  confidence: number;
  basedOnSamples: number;
  lastUpdated: number;
}

export interface SpatialRegion {
  id: string;
  startIndex: number;
  endIndex: number;
  top: number;
  bottom: number;
  state: 'active' | 'dormant' | 'frozen';
  items: VirtualItem[];
}

export interface ElementsRenderedPayload {
  created: HTMLElement[];
  recycled: HTMLElement[];
  updated: HTMLElement[];
  removed: number[];
}

export interface RuntimeMetrics {
  renderEpoch: { currentEpoch: number; activeEpochs: number; cancelledEpochs: number };
  measurements: { queueSize: number };
  quality: { level: string };
  transaction: { activeTransactions: number; recoveryAttempts: number; currentFrameId: number };
  memory: { pressureLevel: string };
  performance: { fps: number; frameTime: number; droppedFrames: number; droppedPercentage: number; stability: number; totalFrames: number };
  pool: { poolSize: number; activeCount: number; freeCount: number; hitRate: number; hits: number; misses: number; minSize: number; maxSize: number; lruQueueSize: number };
  viewport: { startIndex: number; endIndex: number; totalVisible: number; overscanBefore: number; overscanAfter: number };
}