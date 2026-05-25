export { PerceptualEngine } from './engine/PerceptualEngine';
export { Scheduler } from './engine/Scheduler';
export { RecyclingPool } from './engine/RecyclingPool';
export { MotionAnalyzer } from './engine/MotionAnalyzer';
export { LayoutPredictor } from './engine/LayoutPredictor';
export { ViewportManager } from './engine/ViewportManager';
export { CompositorLayer } from './engine/CompositorLayer';
export { ScrollRestoration } from './engine/ScrollRestoration';
export * from './utils/geometry';
export * from './utils/performance';
export * from './utils/dom';

export type {
  EngineConfig,
  EngineInitOptions,
  PerceptualMetrics,
  ScrollUpdatePayload,
  VirtualItem,
  ViewportState,
  MotionState,
  ItemState,
  ScrollDirection,
  OverscanMode,
  QualityLevel,
  PerformanceMode,
  ScrollIntent,
  ScrollRestorationStrategy,
  ScrollPersistState,
  EngineError,
  LayoutPrediction,
  MeasurementResult,
  SpatialRegion,
} from './types/engine';

export type {
  ScheduledTask,
  TaskPriority,
  TaskType,
  SchedulerConfig,
  FrameBudget,
  SchedulerStats,
} from './types/scheduler';
export type {
  ViewportConfig,
  ScrollMetrics,
  VisibleRange,
  ViewportBounds,
} from './types/viewport';
export type { PersistenceStorage } from './engine/ScrollRestoration';
