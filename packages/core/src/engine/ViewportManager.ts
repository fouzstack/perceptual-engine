import { ViewportState, SpatialRegion, MeasurementResult, VirtualItem } from '../types/engine';
import { VisibleRange, ScrollMetrics, ViewportBounds } from '../types/viewport';
import { getScrollPercentage } from '../utils/geometry';
import { HeightIndexTree } from '../layout/HeightIndexTree';

interface Anchor {
  position: number;
  index: number;
}

export class ViewportManager {
  private state: ViewportState;
  private visibleRange: VisibleRange;
  private spatialRegions: Map<string, SpatialRegion> = new Map();
  private itemSize: number;
  private totalItems: number;
  private overscanSize: number;

  private heightTree: HeightIndexTree;
  private itemHeights: Float64Array;

  private anchors: Anchor[] = [];
  private readonly anchorInterval: number = 100;//@ts-expect-error
  private anchorsDirty: boolean = true;

  public onTotalHeightChange: ((totalHeight: number) => void) | null = null;

  constructor(totalItems: number, itemSize: number, overscanSize: number = 10) {
    this.totalItems = totalItems;
    this.itemSize = itemSize;
    this.overscanSize = overscanSize;

    const initialHeights = new Float64Array(Math.max(totalItems, 1));
    initialHeights.fill(itemSize);
    this.itemHeights = initialHeights;
    this.heightTree = new HeightIndexTree(initialHeights);

    this.state = this.createDefaultState();
    this.visibleRange = this.calculateVisibleRange();
  }

  update(scrollTop: number, scrollLeft: number = 0, containerWidth?: number, containerHeight?: number): ViewportState {
    this.state.scrollTop = scrollTop;
    this.state.scrollLeft = scrollLeft;

    if (containerWidth !== undefined && containerWidth > 0) {
      this.state.width = containerWidth;
      this.state.clientWidth = containerWidth;
    }
    if (containerHeight !== undefined && containerHeight > 0) {
      this.state.height = containerHeight;
      this.state.clientHeight = containerHeight;
    }

    if (this.state.height <= 0 && typeof window !== 'undefined') {
      this.state.height = window.innerHeight || 800;
      this.state.clientHeight = this.state.height;
    }

    if (this.state.width <= 0 && typeof window !== 'undefined') {
      this.state.width = window.innerWidth || 400;
      this.state.clientWidth = this.state.width;
    }

    this.state.scrollHeight = this.getTotalHeight();
    this.state.scrollWidth = containerWidth || this.state.width;
    this.visibleRange = this.calculateVisibleRange();
    this.updateSpatialRegions();

    return this.getState();
  }

  registerItemHeight(index: number, height: number): void {
    if (index >= this.totalItems || index < 0) return;
    const oldHeight = this.itemHeights[index];
    if (Math.abs(oldHeight - height) < 1) return;

    this.itemHeights[index] = height;
    this.heightTree.update(index, height);
    this.anchorsDirty = true;

    if (this.onTotalHeightChange) {
      this.onTotalHeightChange(this.getTotalHeight());
    }
  }

  registerItemHeights(measurements: MeasurementResult[]): void {
    let changed = false;
    measurements.forEach((m) => {
      if (m.index >= this.totalItems || m.index < 0) return;
      const oldHeight = this.itemHeights[m.index];
      if (Math.abs(oldHeight - m.height) < 1) return;

      this.itemHeights[m.index] = m.height;
      this.heightTree.update(m.index, m.height);
      changed = true;
    });

    if (changed) {
      this.anchorsDirty = true;
      if (this.onTotalHeightChange) {
        this.onTotalHeightChange(this.getTotalHeight());
      }
    }
  }

  batchReadHeights(container: HTMLElement): MeasurementResult[] {
    const elements = container.querySelectorAll<HTMLElement>('[data-index]');
    const measurements: MeasurementResult[] = [];
    elements.forEach((el) => {
      const index = parseInt(el.getAttribute('data-index') || '-1', 10);
      if (index >= 0 && index < this.totalItems) {
        const rect = el.getBoundingClientRect();
        measurements.push({ index, height: rect.height, width: rect.width, timestamp: performance.now(), accurate: true });
      }
    });
    this.registerItemHeights(measurements);
    return measurements;
  }
    //@ts-expect-error
  private rebuildAnchors(): void {
    this.anchors = [];
    const interval = Math.max(this.anchorInterval, Math.floor(this.totalItems / 50));
    for (let i = 0; i < this.totalItems; i += interval) {
      this.anchors.push({
        position: i > 0 ? this.heightTree.queryPrefixSum(i) : 0,
        index: i,
      });
    }
    this.anchorsDirty = false;
  }

  findIndexAtPosition(scrollTop: number): number {
    return this.heightTree.findByPrefixSum(scrollTop);
  }

  getTotalHeight(): number {
    if (this.totalItems === 0) return 0;
    return this.heightTree.getTotalHeight();
  }

  getItemTop(index: number): number {
    if (index <= 0) return 0;
    if (index >= this.totalItems) return this.getTotalHeight();
    return this.heightTree.queryPrefixSum(index);
  }

  getItemHeight(index: number): number {
    if (index < 0 || index >= this.totalItems) return this.itemSize;
    return this.heightTree.getHeight(index);
  }

  private calculateVisibleRange(): VisibleRange {
    const effectiveHeight = this.state.height > 0
      ? this.state.height
      : (typeof window !== 'undefined' ? window.innerHeight : 800);

    if (this.totalItems === 0) {
      return { startIndex: 0, endIndex: 0, totalVisible: 0, overscanBefore: 0, overscanAfter: 0 };
    }

    const startIndex = this.findIndexAtPosition(this.state.scrollTop);
    let endIndex = startIndex;
    let accumulatedHeight = this.getItemTop(startIndex);
    const viewportBottom = this.state.scrollTop + effectiveHeight;

    while (endIndex < this.totalItems - 1 && accumulatedHeight < viewportBottom) {
      accumulatedHeight += this.getItemHeight(endIndex);
      endIndex++;
    }

    const overscanStart = Math.max(0, startIndex - this.overscanSize);
    const overscanEnd = Math.min(this.totalItems - 1, endIndex + this.overscanSize);

    return {
      startIndex: overscanStart,
      endIndex: overscanEnd,
      totalVisible: overscanEnd - overscanStart + 1,
      overscanBefore: startIndex - overscanStart,
      overscanAfter: overscanEnd - endIndex,
    };
  }

  getVisibleItems(): VirtualItem[] {
    const items: VirtualItem[] = [];
    const { startIndex, endIndex } = this.visibleRange;

    for (let i = startIndex; i <= endIndex; i++) {
      items.push({
        index: i,
        key: i,
        top: this.getItemTop(i),
        left: 0,
        height: this.getItemHeight(i),
        width: this.state.width,
        estimated: this.itemHeights[i] === this.itemSize,
        state: 'active',
        element: null,
        lastUsedTimestamp: performance.now(),
        priority: this.calculateItemPriority(i, startIndex, endIndex),
        measuredHeight: this.itemHeights[i],
      });
    }

    return items;
  }

  private calculateItemPriority(index: number, startIndex: number, endIndex: number): number {
    const centerIndex = (startIndex + endIndex) / 2;
    const distanceFromCenter = Math.abs(index - centerIndex);
    const maxDistance = (endIndex - startIndex) / 2;
    if (maxDistance === 0) return 1;
    return 1 - distanceFromCenter / maxDistance;
  }

  private updateSpatialRegions(): void {
    const { startIndex, endIndex } = this.visibleRange;
    this.setRegion('active', {
      id: 'active',
      startIndex,
      endIndex,
      top: this.getItemTop(startIndex),
      bottom: this.getItemTop(Math.min(endIndex + 1, this.totalItems)),
      state: 'active',
      items: [],
    });
    if (startIndex > 0) {
      this.setRegion('dormant-top', {
        id: 'dormant-top',
        startIndex: 0,
        endIndex: startIndex - 1,
        top: 0,
        bottom: this.getItemTop(startIndex),
        state: 'dormant',
        items: [],
      });
    }
    if (endIndex < this.totalItems - 1) {
      this.setRegion('dormant-bottom', {
        id: 'dormant-bottom',
        startIndex: endIndex + 1,
        endIndex: this.totalItems - 1,
        top: this.getItemTop(endIndex + 1),
        bottom: this.getTotalHeight(),
        state: 'dormant',
        items: [],
      });
    }
  }

  private setRegion(id: string, region: SpatialRegion): void {
    this.spatialRegions.set(id, region);
  }

  isInViewport(index: number): boolean {
    return index >= this.visibleRange.startIndex && index <= this.visibleRange.endIndex;
  }

  getItemRegion(index: number): string | null {
    for (const [id, region] of this.spatialRegions) {
      if (index >= region.startIndex && index <= region.endIndex) return id;
    }
    return null;
  }

  getScrollMetrics(): ScrollMetrics {
    const scrollHeight = this.getTotalHeight();
    const maxScrollTop = Math.max(0, scrollHeight - this.state.clientHeight);
    return {
      scrollTop: this.state.scrollTop,
      scrollLeft: this.state.scrollLeft,
      scrollHeight,
      scrollWidth: this.state.scrollWidth,
      clientHeight: this.state.clientHeight,
      clientWidth: this.state.clientWidth,
      scrollPercentage: getScrollPercentage(this.state.scrollTop, scrollHeight, this.state.clientHeight),
      maxScrollTop,
      isAtTop: this.state.scrollTop <= 1,
      isAtBottom: this.state.scrollTop >= maxScrollTop - 1,
    };
  }

  getViewportBounds(): ViewportBounds {
    return {
      top: this.state.scrollTop,
      bottom: this.state.scrollTop + this.state.height,
      left: this.state.scrollLeft,
      right: this.state.scrollLeft + this.state.width,
      width: this.state.width,
      height: this.state.height,
    };
  }

  updateTotalItems(totalItems: number): void {
    if (totalItems === this.totalItems) return;

    const oldHeights = this.itemHeights;
    const newHeights = new Float64Array(totalItems);
    const copyCount = Math.min(oldHeights.length, totalItems);
    for (let i = 0; i < copyCount; i++) newHeights[i] = oldHeights[i];
    if (totalItems > oldHeights.length) newHeights.fill(this.itemSize, oldHeights.length, totalItems);

    this.itemHeights = newHeights;
    this.totalItems = totalItems;
    this.heightTree.resize(totalItems, this.itemSize);

    for (let i = 0; i < copyCount; i++) {
      if (newHeights[i] !== this.itemSize) {
        this.heightTree.update(i, newHeights[i]);
      }
    }

    this.anchorsDirty = true;

    if (this.onTotalHeightChange) {
      this.onTotalHeightChange(this.getTotalHeight());
    }
  }

  updateItemSize(itemSize: number): void {
    this.itemSize = itemSize;
    for (let i = 0; i < this.totalItems; i++) {
      if (this.itemHeights[i] === this.itemSize || this.itemHeights[i] === 0) {
        this.itemHeights[i] = itemSize;
        this.heightTree.update(i, itemSize);
      }
    }
    this.anchorsDirty = true;

    if (this.onTotalHeightChange) {
      this.onTotalHeightChange(this.getTotalHeight());
    }
  }

  updateOverscan(overscan: number): void {
    this.overscanSize = Math.max(0, Math.round(overscan));
    this.visibleRange = this.calculateVisibleRange();
  }

  getState(): ViewportState { return { ...this.state }; }
  getVisibleRange(): VisibleRange { return { ...this.visibleRange }; }
  getSpatialRegions(): Map<string, SpatialRegion> { return new Map(this.spatialRegions); }
  getItemHeights(): Float64Array { return this.itemHeights; }

  private createDefaultState(): ViewportState {
    return {
      scrollTop: 0,
      scrollLeft: 0,
      width: typeof window !== 'undefined' ? window.innerWidth : 400,
      height: typeof window !== 'undefined' ? window.innerHeight : 800,
      devicePixelRatio: typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1,
      scrollHeight: 0,
      scrollWidth: 0,
      clientHeight: typeof window !== 'undefined' ? window.innerHeight : 800,
      clientWidth: typeof window !== 'undefined' ? window.innerWidth : 400,
    };
  }

  reset(): void {
    this.state = this.createDefaultState();
    this.visibleRange = this.calculateVisibleRange();
    this.spatialRegions.clear();
    this.itemHeights.fill(this.itemSize);
    this.heightTree.fill(this.itemSize);
    this.anchorsDirty = true;
    this.anchors = [];
    this.onTotalHeightChange = null;
  }
}