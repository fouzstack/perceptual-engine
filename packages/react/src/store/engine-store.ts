import { PerceptualEngine } from '@/perceptual-engine/core/src/engine/PerceptualEngine';
import { PerceptualMetrics } from '@/perceptual-engine/core/src/types/engine';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

interface ScrollState {
  isScrolling: boolean;
  velocity: number;
  direction: string;
  scrollTop: number;
  scrollPercentage: number;
  totalHeight: number;
}

interface EngineUIState {
  engine: PerceptualEngine | null;
  metrics: PerceptualMetrics;
  scrollState: ScrollState;

  setEngine: (engine: PerceptualEngine | null) => void;
  updateMetrics: (metrics: Partial<PerceptualMetrics>) => void;
  updateScrollState: (state: Partial<ScrollState>) => void;
  reset: () => void;
}

const defaultMetrics: PerceptualMetrics = {
  fps: 60, frameTime: 16, droppedFrames: 0, layoutThrashing: 0,
  poolUtilization: 0, predictiveAccuracy: 100, recyclingRate: 100,
  averageRenderTime: 16, memoryUsage: 0, visibleItems: 0,
  totalPoolItems: 0, gpuLayerCount: 0, qualityLevel: 'high',
};

const defaultScrollState: ScrollState = {
  isScrolling: false, velocity: 0, direction: 'idle',
  scrollTop: 0, scrollPercentage: 0, totalHeight: 0,
};

export const useEngineStore = create<EngineUIState>()(
  subscribeWithSelector((set) => ({
    engine: null,
    metrics: { ...defaultMetrics },
    scrollState: { ...defaultScrollState },

    setEngine: (engine) => set({ engine }),

    updateMetrics: (metrics) =>
      set((state) => ({ metrics: { ...state.metrics, ...metrics } })),

    updateScrollState: (update) =>
      set((state) => ({ scrollState: { ...state.scrollState, ...update } })),

    reset: () =>
      set({ metrics: { ...defaultMetrics }, scrollState: { ...defaultScrollState } }),
  }))
);

export const useFPS = () => useEngineStore((s) => s.metrics.fps);
export const useFrameTime = () => useEngineStore((s) => s.metrics.frameTime);
export const useDroppedFrames = () => useEngineStore((s) => s.metrics.droppedFrames);
export const usePoolUtilization = () => useEngineStore((s) => s.metrics.poolUtilization);
export const usePredictiveAccuracy = () => useEngineStore((s) => s.metrics.predictiveAccuracy);
export const useRecyclingRate = () => useEngineStore((s) => s.metrics.recyclingRate);
export const useQualityLevel = () => useEngineStore((s) => s.metrics.qualityLevel);
export const useVisibleItems = () => useEngineStore((s) => s.metrics.visibleItems);
export const useTotalPoolItems = () => useEngineStore((s) => s.metrics.totalPoolItems);
export const useGpuLayerCount = () => useEngineStore((s) => s.metrics.gpuLayerCount);
export const useIsScrolling = () => useEngineStore((s) => s.scrollState.isScrolling);
export const useScrollVelocity = () => useEngineStore((s) => s.scrollState.velocity);
export const useScrollDirection = () => useEngineStore((s) => s.scrollState.direction);
export const useScrollTop = () => useEngineStore((s) => s.scrollState.scrollTop);
export const useScrollPercentage = () => useEngineStore((s) => s.scrollState.scrollPercentage);
export const useTotalHeight = () => useEngineStore((s) => s.scrollState.totalHeight);
export const useEngine = () => useEngineStore((s) => s.engine);