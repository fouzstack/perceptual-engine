import type {
  PerceptualEngine,
  ScrollRestoration,
  ScrollRestorationStrategy,
  PersistenceStorage,
} from '@perceptual/core';
import type { ElementsRenderedPayload } from '@/perceptual-engine/core/src/types/engine';

export interface PerceptualListProps<T = unknown> {
  items: readonly T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  estimatedItemSize?: number;
  overscan?: number | 'auto';
  className?: string;
  style?: React.CSSProperties;
  showPerformanceOverlay?: boolean;
  persistenceKey?: string;
  persistenceStrategy?: ScrollRestorationStrategy;
  persistenceStorage?: PersistenceStorage;
  restoreScrollOnMount?: boolean;
  onScroll?: (scrollTop: number) => void;
  onVisibleRangeChange?: (start: number, end: number) => void;
  onScrollRestored?: (scrollTop: number) => void;
  getItemKey?: (item: T, index: number) => string | number;
  enableGPUCompositing?: boolean;
}

export interface PerceptualListHandle {
  scrollToIndex: (
    index: number,
    align?: 'start' | 'center' | 'end',
    behavior?: ScrollBehavior,
  ) => void;
  scrollTo: (top: number, behavior?: ScrollBehavior) => void;
  refresh: () => void;
  saveScrollState: () => void;
  restoreScrollState: (behavior?: ScrollBehavior) => boolean;
  clearScrollState: () => void;
}

export interface PerceptualGridProps<T = unknown> {
  items: readonly T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  columns?: number;
  estimatedItemSize?: number;
  gap?: number;
  className?: string;
  style?: React.CSSProperties;
  persistenceKey?: string;
  persistenceStrategy?: ScrollRestorationStrategy;
  persistenceStorage?: PersistenceStorage;
  restoreScrollOnMount?: boolean;
  onScroll?: (scrollTop: number) => void;
  onScrollRestored?: (scrollTop: number) => void;
  getItemKey?: (item: T, index: number) => string | number;
  enableGPUCompositing?: boolean;
}

export interface PerceptualGridHandle {
  scrollToIndex: (
    index: number,
    align?: 'start' | 'center' | 'end',
    behavior?: ScrollBehavior,
  ) => void;
  scrollTo: (top: number, behavior?: ScrollBehavior) => void;
  refresh: () => void;
  saveScrollState: () => void;
  restoreScrollState: (behavior?: ScrollBehavior) => boolean;
  clearScrollState: () => void;
}

export interface UsePerceptualEngineOptions {
  totalItems: number;
  estimatedItemSize?: number;
  overscan?: number | 'auto';
  recyclingPoolSize?: number;
  enableGPU?: boolean;
  enableAdaptiveOverscan?: boolean;
  enablePredictiveRendering?: boolean;
  enableAdaptiveQuality?: boolean;
  performanceMode?: 'auto' | 'ultra' | 'balanced' | 'battery';
  persistenceKey?: string;
  persistenceStrategy?: ScrollRestorationStrategy;
  persistenceStorage?: PersistenceStorage;
  getItemKeyForPersistence?: (index: number) => string | number;
  onScroll?: (scrollTop: number) => void;
  onVisibleRangeChange?: (start: number, end: number) => void;
  onElementsRendered?: (payload: ElementsRenderedPayload) => void;
}

export interface EngineHandle {
  engineRef: React.MutableRefObject<PerceptualEngine | null>;
  containerRefCallback: (node: HTMLDivElement | null) => void;
  containerElement: HTMLDivElement | null;
  scrollToIndex: PerceptualListHandle['scrollToIndex'];
  scrollTo: PerceptualListHandle['scrollTo'];
  measureItem: (index: number, height: number, width?: number) => void;
  refresh: () => void;
  saveScrollState: () => void;
  restoreScrollState: (behavior?: ScrollBehavior) => boolean;
  clearScrollState: () => void;
  scrollRestoration: ScrollRestoration | null;
}
