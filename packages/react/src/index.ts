// Componentes
export { PerceptualList } from './components/PerceptualList';
export { PerceptualGrid } from './components/PerceptualGrid';
export { PerformanceOverlay } from './components/PerformanceOverlay';

// Hooks
export { usePerceptualEngine } from './hooks/usePerceptualEngine';
export { useScrollToIndex } from './hooks/useScrollToIndex';
export {
  usePerceptualItemState,
  cleanupItemStates,
  configureItemStateCache,
  getItemStateCacheStats,
} from './hooks/usePerceptualItemState';

// Store
export {
  useEngineStore,
  useFPS,
  useFrameTime,
  useDroppedFrames,
  usePoolUtilization,
  usePredictiveAccuracy,
  useRecyclingRate,
  useQualityLevel,
  useVisibleItems,
  useTotalPoolItems,
  useGpuLayerCount,
  useIsScrolling,
  useScrollVelocity,
  useScrollDirection,
  useScrollTop,
  useScrollPercentage,
  useEngine,
} from './store/engine-store';

// Tipos
export type {
  PerceptualListProps,
  PerceptualListHandle,
  PerceptualGridProps,
  PerceptualGridHandle,
  UsePerceptualEngineOptions,
  EngineHandle,
} from './types/react';