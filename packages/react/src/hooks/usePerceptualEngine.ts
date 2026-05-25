import { useEffect, useRef, useCallback, useState } from 'react';
import { useEngineStore } from '../store/engine-store';
import type { UsePerceptualEngineOptions, EngineHandle } from '../types/react';
import { ScrollRestoration } from '@/perceptual-engine/core/src/engine/ScrollRestoration';
import { PerceptualEngine } from '@/perceptual-engine/core/src/engine/PerceptualEngine';
import type { PerceptualMetrics, ElementsRenderedPayload } from '@/perceptual-engine/core/src/types/engine';
import { waitForStableLayout } from '@/perceptual-engine/core/src/utils/waitForStableLayout';


export function usePerceptualEngine(
  options: UsePerceptualEngineOptions
): EngineHandle {
  const engineRef = useRef<PerceptualEngine | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerElement, setContainerElement] = useState<HTMLDivElement | null>(null);
  const scrollRestorationRef = useRef<ScrollRestoration | null>(null);
  const onElementsRenderedRef = useRef<(payload: ElementsRenderedPayload) => void>(options.onElementsRendered || (() => {}));

  onElementsRenderedRef.current = options.onElementsRendered || (() => {});

  const setEngine = useEngineStore((s) => s.setEngine);
  const updateMetrics = useEngineStore((s) => s.updateMetrics);
  const updateScrollState = useEngineStore((s) => s.updateScrollState);

  const containerRefCallback = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    setContainerElement(node);
  }, []);

  useEffect(() => {
    if (!containerElement) return;
    let cancelled = false;

    const bootstrap = async () => {
      const stable = await waitForStableLayout(containerElement, {
        timeout: 3000, minHeight: 10, minWidth: 10, stableFrames: 2,
      });

      if (cancelled || !stable) return;

      const engine = new PerceptualEngine({
        container: containerElement,
        totalItems: options.totalItems,
        estimatedItemSize: options.estimatedItemSize ?? 50,
        overscan: options.overscan ?? 'auto',
        recyclingPoolSize: options.recyclingPoolSize ?? 20,
        enableGPU: options.enableGPU ?? true,
        enableAdaptiveOverscan: options.enableAdaptiveOverscan ?? true,
        enablePredictiveRendering: options.enablePredictiveRendering ?? true,
        enableMotionAnalysis: true,
        enableLayoutPrediction: true,
        enableAdaptiveQuality: options.enableAdaptiveQuality ?? true,
        performanceMode: options.performanceMode ?? 'auto',
      });

      engine.onElementsRendered = (payload: ElementsRenderedPayload) => {
        onElementsRenderedRef.current(payload);
      };

      engine.onTotalHeightChange = (height: number) => {
        updateScrollState({ totalHeight: height });
      };

      engineRef.current = engine;
      setEngine(engine);

      engine.onMetricsUpdate((metrics: PerceptualMetrics) => updateMetrics(metrics));
      engine.onScrollUpdate((payload) => {
        const percentage = payload.totalHeight > 0 ? (payload.scrollTop / payload.totalHeight) * 100 : 0;
        updateScrollState({
          isScrolling: Math.abs(payload.velocity) > 0.05,
          velocity: payload.velocity,
          direction: payload.direction,
          scrollTop: payload.scrollTop,
          scrollPercentage: percentage,
          totalHeight: payload.totalHeight,
        });
        options.onScroll?.(payload.scrollTop);
        options.onVisibleRangeChange?.(payload.visibleRange.start, payload.visibleRange.end);
      });
      engine.onQualityChange((quality) => updateMetrics({ qualityLevel: quality }));

      engine.initialize();
      engine.start();

      if (cancelled) engine.destroy();
    };

    bootstrap();

    return () => {
      cancelled = true;
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
        setEngine(null);
      }
    };
  }, [containerElement]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.updateItems(new Array(options.totalItems));
      engineRef.current.refresh();
    }
  }, [options.totalItems]);

  useEffect(() => {
    if (!engineRef.current || !options.persistenceKey) return;
    const viewportManager = engineRef.current.getViewportManager();
    if (!viewportManager) return;
    const restoration = new ScrollRestoration({
      viewportManager,
      storage: options.persistenceStorage,
      persistenceKey: options.persistenceKey,
      strategy: options.persistenceStrategy || 'anchor',
      debounceMs: 100,
      getItemKey: options.getItemKeyForPersistence || ((index: number) => index),
    });
    scrollRestorationRef.current = restoration;
    return () => { restoration.destroy(); scrollRestorationRef.current = null; };
  }, [options.persistenceKey, options.persistenceStrategy]);

  useEffect(() => {
    if (!scrollRestorationRef.current || !options.persistenceKey) return;
    const unsubscribe = useEngineStore.subscribe(
      (state) => state.scrollState,
      (scrollState) => {
        if (scrollState.isScrolling) {
          scrollRestorationRef.current?.captureAndSave(
            scrollState.scrollTop, scrollState.velocity, scrollState.direction,
            options.totalItems, options.estimatedItemSize || 50
          );
        }
      },
      { equalityFn: (a, b) => a.scrollTop === b.scrollTop && a.isScrolling === b.isScrolling }
    );
    return unsubscribe;
  }, [options.persistenceKey, options.totalItems, options.estimatedItemSize]);

  const scrollToIndex = useCallback((index: number, align: 'start' | 'center' | 'end' = 'start', behavior: ScrollBehavior = 'smooth') => {
    engineRef.current?.scrollToIndex(index, align, behavior);
  }, []);

  const scrollTo = useCallback((top: number, behavior: ScrollBehavior = 'smooth') => {
    containerRef.current?.scrollTo({ top, behavior });
  }, []);

  const measureItem = useCallback((index: number, height: number, width?: number) => {
    engineRef.current?.measureItem(index, height, width);
  }, []);

  const refresh = useCallback(() => { engineRef.current?.refresh(); }, []);

  const saveScrollState = useCallback(() => {
    if (!scrollRestorationRef.current) return;
    const scrollState = useEngineStore.getState().scrollState;
    scrollRestorationRef.current.captureAndSave(
      scrollState.scrollTop, scrollState.velocity, scrollState.direction,
      options.totalItems, options.estimatedItemSize || 50
    );
  }, [options.totalItems, options.estimatedItemSize]);

  const restoreScrollState = useCallback((behavior: ScrollBehavior = 'auto'): boolean => {
    if (!scrollRestorationRef.current || !containerRef.current) return false;
    const keyToIndex = new Map<string | number, number>();
    const getKey = options.getItemKeyForPersistence || ((idx: number) => idx);
    for (let i = 0; i < options.totalItems; i++) keyToIndex.set(getKey(i), i);
    return scrollRestorationRef.current.restore(containerRef.current, keyToIndex, behavior);
  }, [options.totalItems, options.getItemKeyForPersistence]);

  const clearScrollState = useCallback(() => { scrollRestorationRef.current?.clear(); }, []);

  return {
    engineRef, containerRefCallback, containerElement,
    scrollToIndex, scrollTo, measureItem, refresh,
    saveScrollState, restoreScrollState, clearScrollState,
    scrollRestoration: scrollRestorationRef.current,
  };
}