import React, {
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import ReactDOM from 'react-dom';
import { usePerceptualEngine } from '../hooks/usePerceptualEngine';
import { PerformanceOverlay } from './PerformanceOverlay';
import type { PerceptualListProps, PerceptualListHandle } from '../types/react';

const PerceptualItemWrapper = React.memo(function PerceptualItemWrapper({
  item,
  index,
  renderItem,
}: {
  item: unknown;
  index: number;
  renderItem: (item: unknown, index: number) => React.ReactNode;
}) {
  return <>{renderItem(item, index)}</>;
});

interface PortalEntry {
  element: HTMLElement;
  index: number;
  epoch: number;
}

let globalPoolIdCounter = 0;
let globalEpochCounter = 0;

function generateStableKey(existingKey?: string | null): string {
  if (existingKey) return existingKey;
  return `pool-${++globalPoolIdCounter}`;
}

function PerceptualListInner<T>(
  props: PerceptualListProps<T>,
  ref: React.ForwardedRef<PerceptualListHandle>
) {
  const {
    items,
    renderItem,
    estimatedItemSize = 50,
    overscan = 'auto',
    className = '',
    style,
    showPerformanceOverlay = false,
    persistenceKey,
    persistenceStrategy,
    persistenceStorage,
    restoreScrollOnMount = true,
    onScroll,
    onVisibleRangeChange,
    onScrollRestored,
    getItemKey = (_: T, index: number) => index,
    enableGPUCompositing = true,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const portalEntriesRef = useRef<Map<string, PortalEntry>>(new Map());
  const elementToEntryMapRef = useRef<WeakMap<HTMLElement, PortalEntry>>(new WeakMap());
  const spacerRef = useRef<HTMLDivElement | null>(null);
  const [version, setVersion] = useState(0);
  const hasRestoredRef = useRef(false);
  const sharedResizeObserverRef = useRef<ResizeObserver | null>(null);
  const observedElementsRef = useRef<WeakSet<HTMLElement>>(new WeakSet());

  const measureBatchRef = useRef<
    Array<{ index: number; height: number; width: number }>
  >([]);
  const measureRafRef = useRef<number | null>(null);

  const flushMeasurements = useCallback(
    (measureItemFn: (index: number, height: number, width?: number) => void) => {
      if (measureBatchRef.current.length === 0) return;
      const batch = measureBatchRef.current;
      measureBatchRef.current = [];
      batch.forEach((m) => measureItemFn(m.index, m.height, m.width));
      measureRafRef.current = null;
    },
    []
  );

  const handleVisibleRangeChange = useCallback(
    (start: number, end: number) => {
      onVisibleRangeChange?.(start, end);
    },
    [onVisibleRangeChange]
  );

  const getItemKeyForPersistence = useCallback(
    (index: number) => {
      if (index < 0 || index >= items.length) return index;
      return getItemKey(items[index] as T, index);
    },
    [items, getItemKey]
  );

  // 🔥 Invalidar medición de un índice en el engine
  const invalidateItemMeasurement = useCallback(
    (index: number) => {
      // Forzar re-medición con tamaño estimado para limpiar cache stale
      measureBatchRef.current.push({
        index,
        height: estimatedItemSize,
        width: 0,
      });
    },
    [estimatedItemSize]
  );

  const handleElementsRendered = useCallback(
    (payload: {
      created: HTMLElement[];
      recycled: HTMLElement[];
      updated: HTMLElement[];
      removed: number[];
    }) => {
      let structuralChange = false;

      payload.created.forEach((el) => {
        const idx = parseInt(el.getAttribute('data-index') || '-1', 10);
        if (idx >= 0 && idx < items.length) {
          const key = generateStableKey(el.getAttribute('data-pool-id'));
          el.setAttribute('data-pool-id', key);

          const epoch = ++globalEpochCounter;
          const entry: PortalEntry = { element: el, index: idx, epoch };
          portalEntriesRef.current.set(key, entry);
          elementToEntryMapRef.current.set(el, entry);

          // 🔥 Resetear altura del elemento para evitar cache residual del navegador
          el.style.height = 'auto';
          el.style.minHeight = '0px';

          structuralChange = true;
        }
      });

      payload.recycled.forEach((el) => {
        const idx = parseInt(el.getAttribute('data-index') || '-1', 10);
        if (idx >= 0 && idx < items.length) {
          let key = el.getAttribute('data-pool-id');
          if (!key) {
            key = generateStableKey(null);
            el.setAttribute('data-pool-id', key);
          }

          const epoch = ++globalEpochCounter;

          // 🔥 Invalidar medición del índice anterior antes de reciclar
          const oldEntry = elementToEntryMapRef.current.get(el);
          if (oldEntry) {
            invalidateItemMeasurement(oldEntry.index);
          }

          const entry: PortalEntry = { element: el, index: idx, epoch };
          portalEntriesRef.current.set(key, entry);
          elementToEntryMapRef.current.set(el, entry);

          // 🔥 Resetear altura del elemento reciclado
          el.style.height = 'auto';
          el.style.minHeight = '0px';

          // 🔥 Invalidar medición del nuevo índice para forzar re-medición
          invalidateItemMeasurement(idx);

          structuralChange = true;
        }
      });

      payload.removed.forEach((index) => {
        for (const [key, entry] of portalEntriesRef.current) {
          if (entry.index === index) {
            if (sharedResizeObserverRef.current) {
              sharedResizeObserverRef.current.unobserve(entry.element);
            }
            elementToEntryMapRef.current.delete(entry.element);
            portalEntriesRef.current.delete(key);
            structuralChange = true;
            break;
          }
        }
      });

      [...payload.created, ...payload.recycled].forEach((el) => {
        if (!observedElementsRef.current.has(el) && sharedResizeObserverRef.current) {
          observedElementsRef.current.add(el);
          sharedResizeObserverRef.current.observe(el);
        }
      });

      if (portalEntriesRef.current.size > 50) {
        const toDelete: string[] = [];
        portalEntriesRef.current.forEach((entry, key) => {
          if (!entry.element.isConnected) toDelete.push(key);
        });
        toDelete.forEach((key) => {
          const entry = portalEntriesRef.current.get(key);
          if (entry) {
            elementToEntryMapRef.current.delete(entry.element);
          }
          portalEntriesRef.current.delete(key);
        });
      }

      if (structuralChange) {
        setVersion((v) => v + 1);
      }
    },
    [items.length, invalidateItemMeasurement]
  );

  const {
    containerRefCallback,
    containerElement,
    scrollToIndex,
    scrollTo,
    measureItem,
    refresh,
    saveScrollState,
    restoreScrollState,
    clearScrollState,
    totalHeight: engineTotalHeight,
  } = usePerceptualEngine({
    totalItems: items.length,
    estimatedItemSize,
    overscan,
    persistenceKey,
    persistenceStrategy,
    persistenceStorage,
    getItemKeyForPersistence,
    onScroll,
    onVisibleRangeChange: handleVisibleRangeChange,
    onElementsRendered: handleElementsRendered,
  });

  useEffect(() => {
    if (spacerRef.current && engineTotalHeight !== undefined && engineTotalHeight > 0) {
      spacerRef.current.style.height = `${engineTotalHeight}px`;
    }
  }, [engineTotalHeight]);

  const batchedMeasureItem = useCallback(
    (index: number, height: number, width: number) => {
      measureBatchRef.current.push({ index, height, width });
      if (measureRafRef.current === null) {
        measureRafRef.current = requestAnimationFrame(() =>
          flushMeasurements(measureItem)
        );
      }
    },
    [measureItem, flushMeasurements]
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex,
      scrollTo,
      refresh,
      saveScrollState,
      restoreScrollState,
      clearScrollState,
    }),
    [scrollToIndex, scrollTo, refresh, saveScrollState, restoreScrollState, clearScrollState]
  );

  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      containerRefCallback(node);
    },
    [containerRefCallback]
  );

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const el = entry.target as HTMLElement;

        // 🔥 CORRECCIÓN: Guardar epoch en el momento de la observación
        const portalEntry = elementToEntryMapRef.current.get(el);
        if (!portalEntry) return;

        const observedEpoch = portalEntry.epoch;
        const observedIndex = portalEntry.index;

        // Validación asíncrona: verificar que el epoch NO cambió después
        requestAnimationFrame(() => {
          const currentEntry = elementToEntryMapRef.current.get(el);
          if (!currentEntry) return;
          if (currentEntry.epoch !== observedEpoch) return;
          if (currentEntry.index !== observedIndex) return;

          const height = entry.contentRect.height;
          if (height > 0) {
            batchedMeasureItem(observedIndex, height, entry.contentRect.width);
          }
        });
      });
    });
    sharedResizeObserverRef.current = ro;
    return () => {
      ro.disconnect();
      sharedResizeObserverRef.current = null;
      observedElementsRef.current = new WeakSet();
    };
  }, [batchedMeasureItem]);

  useEffect(() => {
    if (!restoreScrollOnMount || !containerElement || hasRestoredRef.current) return;
    const timer = setTimeout(() => {
      const restored = restoreScrollState('auto');
      hasRestoredRef.current = true;
      if (restored && containerRef.current) {
        onScrollRestored?.(containerRef.current.scrollTop);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [containerElement, restoreScrollOnMount, restoreScrollState, onScrollRestored]);

  const containerStyle: React.CSSProperties = useMemo(
    () => ({
      height: '100%',
      width: '100%',
      overflow: 'auto',
      position: 'relative',
      ...(enableGPUCompositing && {
        transform: 'translateZ(0)',
        WebkitOverflowScrolling: 'touch',
      }),
      willChange: 'scroll-position',
      ...style,
    }),
    [style, enableGPUCompositing]
  );

  // 🔥 CORRECCIÓN CRÍTICA: Renderizar portales ORDENADOS por índice visual
  const portalElements = useMemo(() => {
    const elements: React.ReactNode[] = [];

    // Ordenar por índice para garantizar orden de reconciliación correcto
    const orderedEntries = [...portalEntriesRef.current.entries()].sort(
      (a, b) => a[1].index - b[1].index
    );

    orderedEntries.forEach(([stableKey, entry]) => {
      const item = items[entry.index];
      if (item === undefined) return;

      elements.push(
        ReactDOM.createPortal(
          <PerceptualItemWrapper
            item={item}
            index={entry.index}
            renderItem={renderItem as (item: unknown, index: number) => React.ReactNode}
          />,
          entry.element,
          stableKey
        )
      );
    });
    return elements;
  }, [items, renderItem, version]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }} className={className}>
      <div ref={setContainerRef} style={containerStyle} data-perceptual-container="true">
        <div
          ref={spacerRef}
          style={{
            height: items.length * estimatedItemSize,
            width: '100%',
            position: 'relative',
            pointerEvents: 'none',
          }}
          aria-hidden="true"
          role="presentation"
        />
      </div>
      {portalElements}
      {showPerformanceOverlay && <PerformanceOverlay />}
    </div>
  );
}

export const PerceptualList = forwardRef(PerceptualListInner) as <T>(
  props: PerceptualListProps<T> & { ref?: React.ForwardedRef<PerceptualListHandle> }
) => React.ReactElement;