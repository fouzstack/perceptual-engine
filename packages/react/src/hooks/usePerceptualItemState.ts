import { useCallback, useSyncExternalStore } from 'react';

interface ItemStateCacheConfig {
  maxItems: number;
  ttl: number;
}

type ItemState = Map<string, unknown>;
type Listener = () => void;

class ItemStateStore {
  private cache = new Map<string | number, ItemState>();
  private accessOrder: (string | number)[] = [];
  private listeners = new Map<string | number, Set<Listener>>();
  private readonly config: ItemStateCacheConfig;

  constructor(config: Partial<ItemStateCacheConfig> = {}) {
    this.config = {
      maxItems: config.maxItems ?? 5000,
      ttl: config.ttl ?? 600000,
    };
  }

  getOrCreate(key: string | number, initialState: Record<string, unknown>): ItemState {
    let state = this.cache.get(key);
    if (!state) {
      state = new Map<string, unknown>();
      for (const [k, v] of Object.entries(initialState)) {
        state.set(k, v);
      }
      this.cache.set(key, state);
      this.evictIfNeeded();
    }
    this.touch(key);
    return state;
  }

  update(key: string | number, updates: Record<string, unknown>): void {
    const state = this.cache.get(key);
    if (!state) return;
    for (const [k, v] of Object.entries(updates)) {
      state.set(k, v);
    }
    this.touch(key);
    this.notify(key);
  }

  getSnapshot(key: string | number): ItemState | undefined {
    return this.cache.get(key);
  }

  subscribe(key: string | number, listener: Listener): () => void {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(listener);
    return () => {
      this.listeners.get(key)?.delete(listener);
      if (this.listeners.get(key)?.size === 0) this.listeners.delete(key);
    };
  }

  remove(key: string | number): void {
    this.cache.delete(key);
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
    this.listeners.delete(key);
  }

  cleanupInactive(activeKeys: Set<string | number>): void {
    const toRemove: (string | number)[] = [];
    this.cache.forEach((_, key) => {
      if (!activeKeys.has(key)) toRemove.push(key);
    });
    toRemove.forEach((key) => this.remove(key));
  }

  cleanupExpired(): void {
    const now = Date.now();
    const toRemove: (string | number)[] = [];
    this.cache.forEach((state, key) => {
      const lastAccessed = (state.get('__lastAccessed') as number) || 0;
      if (now - lastAccessed > this.config.ttl) toRemove.push(key);
    });
    toRemove.forEach((key) => this.remove(key));
  }

  get size(): number { return this.cache.size; }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.listeners.clear();
  }

  private touch(key: string | number): void {
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
    this.accessOrder.push(key);
    const state = this.cache.get(key);
    if (state) state.set('__lastAccessed', Date.now());
  }

  private evictIfNeeded(): void {
    while (this.cache.size > this.config.maxItems) {
      const oldest = this.accessOrder.shift();
      if (oldest) {
        this.cache.delete(oldest);
        this.listeners.delete(oldest);
      } else {
        break;
      }
    }
  }

  private notify(key: string | number): void {
    this.listeners.get(key)?.forEach((listener) => listener());
  }
}

const globalItemStateStore = new ItemStateStore();

export function usePerceptualItemState<T extends Record<string, unknown>>(
  itemKey: string | number,
  initialState: T
): [T, (updates: Partial<T>) => void, () => void] {
  globalItemStateStore.getOrCreate(itemKey, initialState);

  const subscribe = useCallback(
    (listener: () => void) => globalItemStateStore.subscribe(itemKey, listener),
    [itemKey]
  );

  const getSnapshot = useCallback((): T => {
    const state = globalItemStateStore.getSnapshot(itemKey);
    if (!state) return initialState;
    const result: Record<string, unknown> = {};
    state.forEach((value, key) => {
      if (key !== '__lastAccessed') result[key] = value;
    });
    return result as T;
  }, [itemKey]);

  const state = useSyncExternalStore(subscribe, getSnapshot);

  const updateState = useCallback(
    (updates: Partial<T>) => {
      globalItemStateStore.update(itemKey, updates as Record<string, unknown>);
    },
    [itemKey]
  );

  const clearState = useCallback(() => {
    globalItemStateStore.remove(itemKey);
  }, [itemKey]);

  return [state, updateState, clearState];
}

export function cleanupItemStates(activeKeys: Set<string | number>): void {
  globalItemStateStore.cleanupInactive(activeKeys);
  globalItemStateStore.cleanupExpired();
}

export function configureItemStateCache(_config: Partial<ItemStateCacheConfig>): void {
  // La configuración se aplica en la construcción; aquí se podría reinicializar
}

export function getItemStateCacheStats() {
  return { size: globalItemStateStore.size };
}