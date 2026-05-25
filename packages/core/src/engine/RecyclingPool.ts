import { VirtualItem } from '../types/engine';
import {
  createOptimizedItem, markAsRecyclable, restoreFromRecycle,
  setPosition, hideElement, showElement, applyGPUAcceleration, applyContainment,
} from '../utils/dom';

interface PoolItem {
  element: HTMLDivElement;
  virtualItem: VirtualItem | null;
  lastUsed: number;
  usageCount: number;
}

export class RecyclingPool {
  private pool: PoolItem[] = [];
  private activeItems: Map<number, PoolItem> = new Map();
  private lruQueue: number[] = [];
  private readonly minSize: number;
  private readonly maxSize: number;
  private readonly container: HTMLElement;
  private readonly enableGPU: boolean;
  private hits: number = 0;
  private misses: number = 0;

  constructor(container: HTMLElement, minSize: number = 10, maxSize: number = 100, enableGPU: boolean = true) {
    this.container = container;
    this.minSize = minSize;
    this.maxSize = maxSize;
    this.enableGPU = enableGPU;
    this.ensureMinimumSize();
  }

  acquireWithOrigin(virtualItem: VirtualItem): { element: HTMLDivElement; recycled: boolean } {
    const existingItem = this.activeItems.get(virtualItem.index);
    if (existingItem) {
      this.hits++;
      this.updateLRU(virtualItem.index);
      existingItem.virtualItem = virtualItem;
      existingItem.lastUsed = performance.now();
      existingItem.usageCount++;
      this.prepareElement(existingItem.element, virtualItem);
      return { element: existingItem.element, recycled: true };
    }

    const freeItem = this.pool.find((p) => p.virtualItem === null && !this.isActive(p));
    if (freeItem) {
      this.hits++;
      freeItem.virtualItem = virtualItem;
      freeItem.lastUsed = performance.now();
      freeItem.usageCount++;
      this.activeItems.set(virtualItem.index, freeItem);
      this.updateLRU(virtualItem.index);
      this.prepareElement(freeItem.element, virtualItem);
      return { element: freeItem.element, recycled: true };
    }

    this.misses++;
    if (this.pool.length < this.maxSize) {
      const element = this.createPoolElement();
      const newPoolItem: PoolItem = { element, virtualItem, lastUsed: performance.now(), usageCount: 1 };
      this.pool.push(newPoolItem);
      this.activeItems.set(virtualItem.index, newPoolItem);
      this.updateLRU(virtualItem.index);
      this.prepareElement(element, virtualItem);
      return { element, recycled: false };
    }

    return { element: this.forceRecycle(virtualItem), recycled: true };
  }

  acquire(virtualItem: VirtualItem): HTMLDivElement {
    return this.acquireWithOrigin(virtualItem).element;
  }

  release(index: number): void {
    const poolItem = this.activeItems.get(index);
    if (!poolItem) return;
    markAsRecyclable(poolItem.element);
    hideElement(poolItem.element);
    poolItem.element.style.height = '';
    poolItem.element.style.width = '';
    poolItem.virtualItem = null;
    this.activeItems.delete(index);
    this.removeFromLRU(index);
    this.trimPool();
  }

  recycle(fromIndex: number, toItem: VirtualItem): HTMLDivElement {
    const poolItem = this.activeItems.get(fromIndex);
    if (!poolItem) return this.acquire(toItem);
    this.activeItems.delete(fromIndex);
    this.removeFromLRU(fromIndex);
    poolItem.virtualItem = toItem;
    poolItem.lastUsed = performance.now();
    poolItem.usageCount++;
    this.activeItems.set(toItem.index, poolItem);
    this.updateLRU(toItem.index);
    this.prepareElement(poolItem.element, toItem);
    return poolItem.element;
  }

  updatePosition(index: number, x: number, y: number): void {
    const poolItem = this.activeItems.get(index);
    if (!poolItem || !poolItem.virtualItem) return;
    poolItem.virtualItem.left = x;
    poolItem.virtualItem.top = y;
    setPosition(poolItem.element, x, y, this.enableGPU);
  }

  updateSize(index: number, width: number, height: number): void {
    const poolItem = this.activeItems.get(index);
    if (!poolItem || !poolItem.virtualItem) return;
    poolItem.virtualItem.width = width;
    poolItem.virtualItem.height = height;
    poolItem.element.style.width = `${width}px`;
    poolItem.element.style.height = `${height}px`;
  }

  hide(index: number): void {
    const poolItem = this.activeItems.get(index);
    if (!poolItem) return;
    hideElement(poolItem.element);
    if (poolItem.virtualItem) poolItem.virtualItem.state = 'dormant';
  }

  show(index: number): void {
    const poolItem = this.activeItems.get(index);
    if (!poolItem) return;
    showElement(poolItem.element);
    if (poolItem.virtualItem) poolItem.virtualItem.state = 'active';
  }

  private forceRecycle(virtualItem: VirtualItem): HTMLDivElement {
    if (this.lruQueue.length === 0) {
      const element = this.createPoolElement();
      const emergencyItem: PoolItem = { element, virtualItem, lastUsed: performance.now(), usageCount: 1 };
      this.pool.push(emergencyItem);
      this.activeItems.set(virtualItem.index, emergencyItem);
      return element;
    }

    let oldestIndex: number | undefined;
    let poolItem: PoolItem | undefined;

    for (const idx of this.lruQueue) {
      const candidate = this.activeItems.get(idx);
      if (candidate && !candidate.element.contains(document.activeElement)) {
        oldestIndex = idx;
        poolItem = candidate;
        break;
      }
    }

    if (oldestIndex === undefined || !poolItem) {
      oldestIndex = this.lruQueue[0];
      poolItem = this.activeItems.get(oldestIndex);
    }

    if (!poolItem) {
      this.lruQueue.shift();
      return this.forceRecycle(virtualItem);
    }

    this.activeItems.delete(oldestIndex);
    this.removeFromLRU(oldestIndex);
    poolItem.virtualItem = virtualItem;
    poolItem.lastUsed = performance.now();
    poolItem.usageCount++;
    this.activeItems.set(virtualItem.index, poolItem);
    this.updateLRU(virtualItem.index);
    this.prepareElement(poolItem.element, virtualItem);
    return poolItem.element;
  }

  private prepareElement(element: HTMLDivElement, virtualItem: VirtualItem): void {
    restoreFromRecycle(element, virtualItem.index);
    setPosition(element, virtualItem.left, virtualItem.top, this.enableGPU);
    showElement(element);
    if (virtualItem.height) element.style.height = `${virtualItem.height}px`;
    if (virtualItem.width) element.style.width = `${virtualItem.width}px`;
    virtualItem.element = element;
    virtualItem.state = 'active';
  }

  private updateLRU(index: number): void {
    this.removeFromLRU(index);
    this.lruQueue.push(index);
    if (this.lruQueue.length > this.maxSize * 2) this.lruQueue = this.lruQueue.slice(-this.maxSize);
  }

  private removeFromLRU(index: number): void {
    const pos = this.lruQueue.indexOf(index);
    if (pos !== -1) this.lruQueue.splice(pos, 1);
  }

  private createPoolElement(): HTMLDivElement {
    const element = createOptimizedItem(-1);
    if (this.enableGPU) applyGPUAcceleration(element);
    applyContainment(element);
    this.container.appendChild(element);
    return element;
  }

  private isActive(poolItem: PoolItem): boolean {
    return !!(poolItem.virtualItem && this.activeItems.has(poolItem.virtualItem.index));
  }

  private ensureMinimumSize(): void {
    while (this.pool.length < this.minSize) {
      const element = this.createPoolElement();
      this.pool.push({ element, virtualItem: null, lastUsed: 0, usageCount: 0 });
    }
  }

  private trimPool(): void {
    if (this.pool.length <= this.maxSize) return;
    const sortedPool = [...this.pool]
      .filter((p) => p.virtualItem === null)
      .sort((a, b) => b.lastUsed - a.lastUsed);
    const toKeep = Math.max(0, this.maxSize - this.activeItems.size);
    const toRemove = sortedPool.slice(toKeep);
    toRemove.forEach((item) => {
      if (item.element.parentNode) item.element.parentNode.removeChild(item.element);
      const idx = this.pool.indexOf(item);
      if (idx !== -1) this.pool.splice(idx, 1);
    });
  }

  getItemIndex(element: HTMLElement): number {
    for (const [index, poolItem] of this.activeItems) {
      if (poolItem.element === element) return index;
    }
    return -1;
  }

  getElement(index: number): HTMLDivElement | null {
    return this.activeItems.get(index)?.element || null;
  }

  getActiveItems(): VirtualItem[] {
    const items: VirtualItem[] = [];
    this.activeItems.forEach((p) => {
      if (p.virtualItem) items.push({ ...p.virtualItem });
    });
    return items;
  }

  getActiveCount(): number { return this.activeItems.size; }
  getPoolSize(): number { return this.pool.length; }

  getHitRate(): number {
    const t = this.hits + this.misses;
    return t === 0 ? 100 : (this.hits / t) * 100;
  }

  getStats() {
    return {
      poolSize: this.pool.length,
      activeCount: this.activeItems.size,
      freeCount: this.pool.length - this.activeItems.size,
      hitRate: this.getHitRate(),
      hits: this.hits,
      misses: this.misses,
      minSize: this.minSize,
      maxSize: this.maxSize,
      lruQueueSize: this.lruQueue.length,
    };
  }

  clear(): void {
    this.activeItems.clear();
    this.lruQueue = [];
    this.pool.forEach((item) => {
      if (item.element.parentNode) item.element.parentNode.removeChild(item.element);
    });
    this.pool = [];
    this.hits = 0;
    this.misses = 0;
    this.ensureMinimumSize();
  }

  destroy(): void {
    this.clear();
    this.pool = [];
    this.activeItems.clear();
    this.lruQueue = [];
  }
}