import { ScrollPersistState, ScrollRestorationStrategy, ScrollDirection } from '../types/engine';
import { ViewportManager } from './ViewportManager';

export interface PersistenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class ScrollRestoration {
  private readonly viewportManager: ViewportManager;
  private readonly storage: PersistenceStorage;
  private readonly key: string;
  private readonly strategy: ScrollRestorationStrategy;
  private readonly debounceMs: number;
  private saveTimeout: number | null = null;
  private readonly getItemKey: (index: number) => string | number;
  private lastSavedState: ScrollPersistState | null = null;

  constructor(options: {
    viewportManager: ViewportManager;
    storage?: PersistenceStorage;
    persistenceKey: string;
    strategy?: ScrollRestorationStrategy;
    debounceMs?: number;
    getItemKey: (index: number) => string | number;
  }) {
    this.viewportManager = options.viewportManager;
    this.storage = options.storage || this.getDefaultStorage();
    this.key = `perceptual-scroll-${options.persistenceKey}`;
    this.strategy = options.strategy || 'anchor';
    this.debounceMs = options.debounceMs || 100;
    this.getItemKey = options.getItemKey;
  }

  private getDefaultStorage(): PersistenceStorage {
    if (typeof window === 'undefined') {
      return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    }
    try {
      const k = '__perceptual_test__';
      localStorage.setItem(k, 'test');
      localStorage.removeItem(k);
      return {
        getItem: (key: string) => localStorage.getItem(key),
        setItem: (key: string, value: string) => localStorage.setItem(key, value),
        removeItem: (key: string) => localStorage.removeItem(key),
      };
    } catch {
      return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    }
  }

  capture(scrollTop: number, velocity: number, direction: string, totalItems: number, estimatedItemSize: number): ScrollPersistState {
    if (totalItems === 0) return this.createEmptyState(totalItems, estimatedItemSize);
    const visibleRange = this.viewportManager.getVisibleRange();
    const startIndex = Math.max(0, Math.min(visibleRange.startIndex, totalItems - 1));
    const state: ScrollPersistState = { strategy: this.strategy, timestamp: Date.now(), totalItems, estimatedItemSize };

    switch (this.strategy) {
      case 'absolute': state.scrollTop = Math.max(0, Math.round(scrollTop)); break;
      case 'index': state.startIndex = startIndex; break;
      case 'anchor': case 'perceptual': {
        const anchorKey = this.getItemKey(startIndex);
        const itemTop = this.viewportManager.getItemTop(startIndex);
        state.anchorItemKey = anchorKey;
        state.anchorOffset = Math.max(0, Math.round(scrollTop - itemTop));
        if (this.strategy === 'perceptual') { state.velocity = velocity; state.direction = direction as ScrollDirection; }
        break;
      }
    }
    return state;
  }

  save(state: ScrollPersistState): void {
    if (this.isStateEqual(state, this.lastSavedState)) return;
    if (this.saveTimeout !== null) clearTimeout(this.saveTimeout);
    this.saveTimeout = window.setTimeout(() => {
      try { this.storage.setItem(this.key, JSON.stringify(state)); this.lastSavedState = state; }
      catch (e) { console.warn('[ScrollRestoration] Save failed:', e); }
      this.saveTimeout = null;
    }, this.debounceMs);
  }

  captureAndSave(scrollTop: number, velocity: number, direction: string, totalItems: number, estimatedItemSize: number): ScrollPersistState {
    const s = this.capture(scrollTop, velocity, direction, totalItems, estimatedItemSize);
    this.save(s);
    return s;
  }

  load(): ScrollPersistState | null {
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return null;
      const state: ScrollPersistState = JSON.parse(raw);
      if (!this.isValidState(state)) return null;
      if (Date.now() - state.timestamp > 86400000) { this.clear(); return null; }
      return state;
    } catch { return null; }
  }

  computeRestorePosition(state: ScrollPersistState, keyToIndex: Map<string | number, number>): { scrollTop: number; animated: boolean } | null {
    switch (state.strategy) {
      case 'absolute': return state.scrollTop != null ? { scrollTop: Math.max(0, state.scrollTop), animated: false } : null;
      case 'index': return state.startIndex != null ? { scrollTop: this.viewportManager.getItemTop(Math.min(Math.max(0, state.startIndex), state.totalItems - 1)), animated: false } : null;
      case 'anchor': case 'perceptual': {
        if (state.anchorItemKey == null) return this.fallbackRestore(state);
        const idx = keyToIndex.get(state.anchorItemKey);
        if (idx !== undefined && idx >= 0) return { scrollTop: Math.max(0, this.viewportManager.getItemTop(idx) + (state.anchorOffset || 0)), animated: this.strategy === 'perceptual' };
        return this.fallbackRestore(state);
      }
      default: return null;
    }
  }

  private fallbackRestore(state: ScrollPersistState): { scrollTop: number; animated: boolean } | null {
    if (state.startIndex != null) return { scrollTop: this.viewportManager.getItemTop(Math.min(Math.max(0, state.startIndex), state.totalItems - 1)), animated: false };
    if (state.scrollTop != null) return { scrollTop: state.scrollTop, animated: false };
    return null;
  }

  async waitForMeasurementsStable(timeoutMs: number = 2000): Promise<boolean> {
    const start = performance.now();
    let lastTotalHeight = -1;
    let stableCount = 0;
    const requiredStableFrames = 2;

    return new Promise((resolve) => {
      const check = () => {
        const currentHeight = this.viewportManager.getTotalHeight();
        if (currentHeight > 0 && currentHeight === lastTotalHeight) stableCount++;
        else stableCount = 0;
        lastTotalHeight = currentHeight;
        if (stableCount >= requiredStableFrames) { resolve(true); return; }
        if (performance.now() - start > timeoutMs) { resolve(currentHeight > 0); return; }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }

  restore(scrollContainer: HTMLElement, keyToIndex: Map<string | number, number>, behavior: ScrollBehavior = 'auto'): boolean {
    const state = this.load();
    if (!state) return false;
    const pos = this.computeRestorePosition(state, keyToIndex);
    if (!pos) return false;
    const doScroll = () => {
      const max = scrollContainer.scrollHeight - scrollContainer.clientHeight;
      scrollContainer.scrollTo({ top: Math.max(0, Math.min(pos.scrollTop, Math.max(0, max))), behavior: pos.animated ? 'smooth' : behavior });
    };
    if (document.readyState === 'complete') { requestAnimationFrame(() => requestAnimationFrame(doScroll)); }
    else { window.addEventListener('load', doScroll, { once: true }); }
    return true;
  }

  async restoreWithStableMeasurements(scrollContainer: HTMLElement, keyToIndex: Map<string | number, number>, behavior: ScrollBehavior = 'auto'): Promise<boolean> {
    const measurementsStable = await this.waitForMeasurementsStable(2000);
    if (!measurementsStable) return false;
    return this.restore(scrollContainer, keyToIndex, behavior);
  }

  clear(): void { try { this.storage.removeItem(this.key); } catch {} this.lastSavedState = null; }
  getLastSavedState(): ScrollPersistState | null { return this.lastSavedState; }

  private isStateEqual(a: ScrollPersistState | null, b: ScrollPersistState | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    switch (a.strategy) {
      case 'absolute': return a.strategy === b.strategy && a.scrollTop === b.scrollTop;
      case 'index': return a.strategy === b.strategy && a.startIndex === b.startIndex;
      case 'anchor': case 'perceptual': return a.strategy === b.strategy && a.anchorItemKey === b.anchorItemKey && a.anchorOffset === b.anchorOffset;
      default: return false;
    }
  }

  private isValidState(state: any): state is ScrollPersistState {
    return state && typeof state === 'object' && state.strategy && state.timestamp && ['absolute', 'index', 'anchor', 'perceptual'].includes(state.strategy);
  }

  private createEmptyState(totalItems: number, estimatedItemSize: number): ScrollPersistState {
    return { strategy: this.strategy, scrollTop: 0, startIndex: 0, anchorItemKey: undefined, anchorOffset: 0, velocity: 0, direction: 'idle', timestamp: Date.now(), totalItems, estimatedItemSize };
  }

  destroy(): void {
    if (this.saveTimeout !== null) { clearTimeout(this.saveTimeout); this.saveTimeout = null; }
    this.lastSavedState = null;
  }
}