import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { usePerceptualEngine } from '../hooks/usePerceptualEngine';
import { PerformanceOverlay } from './PerformanceOverlay';
import type { PerceptualListProps, PerceptualListHandle } from '../types/react';

const MAX_PORTAL_CACHE_SIZE = 150;

const PerceptualItemWrapper = React.memo(function PerceptualItemWrapper({
  item, index, renderItem,
}: { item: unknown; index: number; renderItem: (item: unknown, index: number) => React.ReactNode }) {
  return <>{renderItem(item, index)}</>;
});

interface PortalEntry {
  element: HTMLElement;
  index: number;
  needsRebind: boolean;
}

let globalPoolIdCounter = 0;

function generateStableKey(existingKey?: string | null): string {
  if (existingKey) return existingKey;
  return `pool-${++globalPoolIdCounter}`;
}

function PerceptualListInner<T>(props: PerceptualListProps<T>, ref: React.ForwardedRef<PerceptualListHandle>) {
  const {
    items, renderItem, estimatedItemSize = 50, overscan = 'auto',
    className = '', style, showPerformanceOverlay = false,
    persistenceKey, persistenceStrategy, persistenceStorage,
    restoreScrollOnMount = true, onScroll, onVisibleRangeChange, onScrollRestored,
    getItemKey = (_: T, index: number) => index,
    enableGPUCompositing = true,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const portalCacheRef = useRef<Map<string, React.ReactPortal>>(new Map());
  const portalEntriesRef = useRef<Map<string, PortalEntry>>(new Map());
  const [portalCacheVersion, setPortalCacheVersion] = useState(0);
  const [totalHeight, setTotalHeight] = useState(items.length * estimatedItemSize);
  const hasRestoredRef = useRef(false);

  const sharedResizeObserverRef = useRef<ResizeObserver | null>(null);
  const observedElementsRef = useRef<WeakSet<HTMLElement>>(new WeakSet());

  const measureBatchRef = useRef<Array<{ index: number; height: number; width: number }>>([]);
  const measureRafRef = useRef<number | null>(null);

  const flushMeasurements = useCallback((measureItemFn: (index: number, height: number, width?: number) => void) => {
    if (measureBatchRef.current.length === 0) return;
    const batch = measureBatchRef.current;
    measureBatchRef.current = [];
    batch.forEach((m) => measureItemFn(m.index, m.height, m.width));
    measureRafRef.current = null;
  }, []);

  const handleVisibleRangeChange = useCallback((start: number, end: number) => {
    onVisibleRangeChange?.(start, end);
  }, [onVisibleRangeChange]);

  const getItemKeyForPersistence = useCallback((index: number) => {
    if (index < 0 || index >= items.length) return index;
    return getItemKey(items[index] as T, index);
  }, [items, getItemKey]);

  const handleElementsRendered = useCallback((
    payload: { created: HTMLElement[]; recycled: HTMLElement[]; updated: HTMLElement[]; removed: number[] }
  ) => {
    let structuralChange = false;

    payload.created.forEach((el) => {
      const idx = parseInt(el.getAttribute('data-index') || '-1', 10);
      if (idx >= 0 && idx < items.length) {
        const key = generateStableKey(el.getAttribute('data-pool-id'));
        el.setAttribute('data-pool-id', key);
        portalEntriesRef.current.set(key, { element: el, index: idx, needsRebind: true });
        structuralChange = true;
      }
    });

    payload.recycled.forEach((el) => {
      const idx = parseInt(el.getAttribute('data-index') || '-1', 10);
      if (idx >= 0 && idx < items.length) {
        let key = el.getAttribute('data-pool-id');
        if (!key) { key = generateStableKey(null); el.setAttribute('data-pool-id', key); }
        const existing = portalEntriesRef.current.get(key);
        if (existing) { existing.index = idx; existing.needsRebind = true; }
        else { portalEntriesRef.current.set(key, { element: el, index: idx, needsRebind: true }); }
        structuralChange = true;
      }
    });

    payload.removed.forEach((index) => {
      for (const [key, entry] of portalEntriesRef.current) {
        if (entry.index === index) {
          if (sharedResizeObserverRef.current) sharedResizeObserverRef.current.unobserve(entry.element);
          portalEntriesRef.current.delete(key);
          portalCacheRef.current.delete(key);
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

    if (structuralChange && portalEntriesRef.current.size > 50) {
      const toDelete: string[] = [];
      portalEntriesRef.current.forEach((entry, key) => {
        if (!entry.element.isConnected) toDelete.push(key);
      });
      toDelete.forEach((key) => { portalEntriesRef.current.delete(key); portalCacheRef.current.delete(key); });
    }

    if (portalCacheRef.current.size > MAX_PORTAL_CACHE_SIZE) {
      const entriesToEvict = portalCacheRef.current.size - MAX_PORTAL_CACHE_SIZE;
      const keys = Array.from(portalCacheRef.current.keys());
      for (let i = 0; i < entriesToEvict && i < keys.length; i++) {
        portalCacheRef.current.delete(keys[i]);
      }
    }

    if (structuralChange) setPortalCacheVersion((v) => v + 1);
  }, [items.length]);

  const {
    containerRefCallback, containerElement, scrollToIndex, scrollTo,
    measureItem, refresh, saveScrollState, restoreScrollState, clearScrollState,
  } = usePerceptualEngine({
    totalItems: items.length, estimatedItemSize, overscan,
    persistenceKey, persistenceStrategy, persistenceStorage,
    getItemKeyForPersistence, onScroll,
    onVisibleRangeChange: handleVisibleRangeChange,
    onElementsRendered: handleElementsRendered,
  });

  const batchedMeasureItem = useCallback((index: number, height: number, width: number) => {
    measureBatchRef.current.push({ index, height, width });
    if (measureRafRef.current === null) {
      measureRafRef.current = requestAnimationFrame(() => flushMeasurements(measureItem));
    }
  }, [measureItem, flushMeasurements]);

  useImperativeHandle(ref, () => ({
    scrollToIndex, scrollTo, refresh, saveScrollState, restoreScrollState, clearScrollState,
  }), [scrollToIndex, scrollTo, refresh, saveScrollState, restoreScrollState, clearScrollState]);

  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    containerRefCallback(node);
  }, [containerRefCallback]);

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const el = entry.target as HTMLElement;
        const currentIndex = parseInt(el.getAttribute('data-index') || '-1', 10);
        if (currentIndex >= 0) {
          const height = entry.contentRect.height;
          if (height > 0) batchedMeasureItem(currentIndex, height, entry.contentRect.width);
        }
      });
    });
    sharedResizeObserverRef.current = ro;
    return () => { ro.disconnect(); sharedResizeObserverRef.current = null; observedElementsRef.current = new WeakSet(); };
  }, [batchedMeasureItem]);

  useEffect(() => {
    if (!restoreScrollOnMount || !containerElement || hasRestoredRef.current) return;
    const timer = setTimeout(() => {
      const restored = restoreScrollState('auto');
      hasRestoredRef.current = true;
      if (restored && containerRef.current) onScrollRestored?.(containerRef.current.scrollTop);
    }, 100);
    return () => clearTimeout(timer);
  }, [containerElement, restoreScrollOnMount, restoreScrollState, onScrollRestored]);

  const containerStyle: React.CSSProperties = useMemo(() => ({
    height: '100%', width: '100%', overflow: 'auto', position: 'relative',
    ...(enableGPUCompositing && { transform: 'translateZ(0)', WebkitOverflowScrolling: 'touch' }),
    willChange: 'scroll-position',
    ...style,
  }), [style, enableGPUCompositing]);

  const portalElements = useMemo(() => {
    const elements: React.ReactNode[] = [];
    portalEntriesRef.current.forEach((entry, stableKey) => {
      const item = items[entry.index];
      if (item === undefined) return;

      if (entry.needsRebind) {
        const portal = ReactDOM.createPortal(
          <PerceptualItemWrapper item={item} index={entry.index} renderItem={renderItem as (item: unknown, index: number) => React.ReactNode} />,
          entry.element, stableKey
        );
        portalCacheRef.current.set(stableKey, portal);
        entry.needsRebind = false;
        elements.push(portal);
      } else {
        const cached = portalCacheRef.current.get(stableKey);
        if (cached) { elements.push(cached); }
        else {
          const portal = ReactDOM.createPortal(
            <PerceptualItemWrapper item={item} index={entry.index} renderItem={renderItem as (item: unknown, index: number) => React.ReactNode} />,
            entry.element, stableKey
          );
          portalCacheRef.current.set(stableKey, portal);
          elements.push(portal);
        }
      }
    });
    return elements;
  }, [items, renderItem, portalCacheVersion]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }} className={className}>
      <div ref={setContainerRef} style={containerStyle} data-perceptual-container="true">
        <div style={{ height: totalHeight, width: '100%', position: 'relative' }} aria-hidden="true" role="presentation" />
      </div>
      {portalElements}
      {showPerformanceOverlay && <PerformanceOverlay />}
    </div>
  );
}

export const PerceptualList = forwardRef(PerceptualListInner) as <T>(
  props: PerceptualListProps<T> & { ref?: React.ForwardedRef<PerceptualListHandle> }
) => React.ReactElement;