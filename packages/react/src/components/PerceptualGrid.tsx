import React, {
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useState,
  useMemo,
} from 'react';
import ReactDOM from 'react-dom';
import { usePerceptualEngine } from '../hooks/usePerceptualEngine';
import type {
  PerceptualGridProps,
  PerceptualGridHandle,
} from '../types/react';

const GridItemWrapper = React.memo(function GridItemWrapper({
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

function PerceptualGridInner<T>(
  props: PerceptualGridProps<T>,
  ref: React.ForwardedRef<PerceptualGridHandle>
) {
  const {
    items,
    renderItem,
    columns = 3,
    estimatedItemSize = 200,
    gap = 16,
    className = '',
    style,
    persistenceKey,
    persistenceStrategy,
    persistenceStorage,
    restoreScrollOnMount = true,
    onScroll,
    onScrollRestored,
    getItemKey = (_: T, index: number) => index,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const portalsRef = useRef<Map<string, { element: HTMLElement; index: number }>>(new Map());
  const [, forceUpdate] = React.useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const syncScheduledRef = useRef(false);
  const itemMeasureRefs = useRef<Map<string, ResizeObserver>>(new Map());
  const hasRestoredRef = useRef(false);

  const getItemKeyForPersistence = useCallback(
    (index: number) => {
      if (index < 0 || index >= items.length) return index;
      return getItemKey(items[index] as T, index);
    },
    [items, getItemKey]
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
  } = usePerceptualEngine({
    totalItems: items.length,
    estimatedItemSize,
    overscan: 5,
    persistenceKey,
    persistenceStrategy,
    persistenceStorage,
    getItemKeyForPersistence,
    onScroll,
  });

  useImperativeHandle(ref, () => ({
    scrollToIndex, scrollTo, refresh,
    saveScrollState, restoreScrollState, clearScrollState,
  }), [scrollToIndex, scrollTo, refresh, saveScrollState, restoreScrollState, clearScrollState]);

  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      containerRefCallback(node);
    },
    [containerRefCallback]
  );

  useEffect(() => {
    if (!containerElement) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(containerElement);
    return () => ro.disconnect();
  }, [containerElement]);

  const getOrCreateStableKey = useCallback((element: HTMLElement): string => {
    let key = element.getAttribute('data-pool-id');
    if (!key) {
      key = `grid-pool-${Math.random().toString(36).slice(2, 9)}`;
      element.setAttribute('data-pool-id', key);
    }
    return key;
  }, []);

  const syncPortalsFromDOM = useCallback(
    (container: HTMLElement) => {
      const domElements = container.querySelectorAll<HTMLElement>('[data-index]');
      const next = new Map<string, { element: HTMLElement; index: number }>();
      let changed = false;

      domElements.forEach((el) => {
        const idx = parseInt(el.getAttribute('data-index') || '-1', 10);
        if (idx >= 0 && idx < items.length) {
          const stableKey = getOrCreateStableKey(el);
          next.set(stableKey, { element: el, index: idx });
          const existing = portalsRef.current.get(stableKey);
          if (!existing || existing.index !== idx || existing.element !== el) changed = true;
        }
      });

      if (next.size !== portalsRef.current.size) changed = true;
      if (changed) { portalsRef.current = next; forceUpdate((n) => n + 1); }
    },
    [items.length, getOrCreateStableKey]
  );

  useEffect(() => {
    if (!containerElement) return;
    const observer = new MutationObserver(() => {
      if (syncScheduledRef.current) return;
      syncScheduledRef.current = true;
      requestAnimationFrame(() => {
        syncPortalsFromDOM(containerElement);
        syncScheduledRef.current = false;
      });
    });
    observer.observe(containerElement, {
      childList: true, subtree: false, attributes: true, attributeFilter: ['data-index'],
    });
    syncPortalsFromDOM(containerElement);
    return () => observer.disconnect();
  }, [containerElement, syncPortalsFromDOM]);

  useEffect(() => {
    const currentKeys = new Set<string>();
    portalsRef.current.forEach(({ element }, stableKey) => {
      currentKeys.add(stableKey);
      if (!itemMeasureRefs.current.has(stableKey)) {
        const ro = new ResizeObserver((entries) => {
          entries.forEach((entry) => {
            const el = entry.target as HTMLElement;
            const currentIndex = parseInt(el.getAttribute('data-index') || '-1', 10);
            if (currentIndex >= 0) {
              const height = entry.contentRect.height;
              if (height > 0) measureItem(currentIndex, height, entry.contentRect.width);
            }
          });
        });
        ro.observe(element);
        itemMeasureRefs.current.set(stableKey, ro);
      }
    });
    itemMeasureRefs.current.forEach((ro, key) => {
      if (!currentKeys.has(key)) { ro.disconnect(); itemMeasureRefs.current.delete(key); }
    });
  }, [measureItem]);

  useEffect(() => {
    return () => {
      itemMeasureRefs.current.forEach((ro) => ro.disconnect());
      itemMeasureRefs.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!restoreScrollOnMount || !containerElement || hasRestoredRef.current) return;
    const timer = setTimeout(() => {
      const restored = restoreScrollState('auto');
      hasRestoredRef.current = true;
      if (restored && containerRef.current) onScrollRestored?.(containerRef.current.scrollTop);
    }, 100);
    return () => clearTimeout(timer);
  }, [containerElement, restoreScrollOnMount, restoreScrollState, onScrollRestored]);

  const itemWidth = containerWidth ? (containerWidth - gap * (columns - 1)) / columns : 0;
  const rowsPerItem = Math.ceil(items.length / columns);
  const totalGridHeight = rowsPerItem * (estimatedItemSize + gap);

  const containerStyle: React.CSSProperties = useMemo(() => ({
    height: '100%', width: '100%', overflow: 'auto',
    position: 'relative' as const, transform: 'translateZ(0)',
    WebkitOverflowScrolling: 'touch', contain: 'strict', ...style,
  }), [style]);

  const portalElements = useMemo(() => {
    const elements: React.ReactNode[] = [];
    portalsRef.current.forEach(({ element, index }, stableKey) => {
      const item = items[index];
      if (item === undefined) return;
      const col = index % columns;
      const row = Math.floor(index / columns);
      element.style.position = 'absolute';
      element.style.left = `${col * (itemWidth + gap)}px`;
      element.style.top = `${row * (estimatedItemSize + gap)}px`;
      element.style.width = `${itemWidth}px`;
      elements.push(
        ReactDOM.createPortal(
          <GridItemWrapper item={item} index={index} renderItem={renderItem as (item: unknown, index: number) => React.ReactNode} />,
          element,
          stableKey
        )
      );
    });
    return elements;
  }, [items, renderItem, itemWidth, columns, gap, estimatedItemSize]);

  return (
    <div className={`relative h-full w-full ${className}`}>
      <div ref={setContainerRef} style={containerStyle} data-perceptual-container="true">
        <div
          style={{ height: totalGridHeight, width: '100%', position: 'relative' as const }}
          aria-hidden="true"
          role="presentation"
        />
      </div>
      {portalElements}
    </div>
  );
}

export const PerceptualGrid = forwardRef(PerceptualGridInner) as <T>(
  props: PerceptualGridProps<T> & { ref?: React.ForwardedRef<PerceptualGridHandle> }
) => React.ReactElement;