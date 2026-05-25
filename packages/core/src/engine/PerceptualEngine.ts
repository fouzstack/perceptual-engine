import {
  EngineConfig, EngineInitOptions, PerceptualMetrics, ScrollUpdatePayload,
  VirtualItem, EngineError, QualityLevel, MeasurementResult, ElementsRenderedPayload,
} from '../types/engine';
import { Scheduler } from './Scheduler';
import { RecyclingPool } from './RecyclingPool';
import { MotionAnalyzer } from './MotionAnalyzer';
import { LayoutPredictor } from './LayoutPredictor';
import { ViewportManager } from './ViewportManager';
import { CompositorLayer } from './CompositorLayer';
import { PerformanceMonitor } from '../utils/performance';
import { createScrollDebouncer } from '../utils/dom';

export class PerceptualEngine {
  private readonly scheduler: Scheduler;
  private readonly recyclingPool: RecyclingPool;
  private readonly motionAnalyzer: MotionAnalyzer;
  private readonly layoutPredictor: LayoutPredictor;
  private readonly viewportManager: ViewportManager;
  private readonly compositorLayer: CompositorLayer;
  private readonly performanceMonitor: PerformanceMonitor;

  private config: EngineConfig;
  private readonly container: HTMLElement; //@ts-expect-error
  private items: any[] = [];
  private isRunning: boolean = false;
  private isDestroyed: boolean = false;
  private isInitialized: boolean = false;
  private resizeObserver: ResizeObserver | null = null;
  private scrollHandler: ((e: Event) => void) | null = null;
  private readonly eventListeners: Map<string, Set<Function>> = new Map();
  private metricsInterval: number | null = null;
  private renderScheduled: boolean = false;
  private mutationQueue: Array<{
    type: 'create' | 'update' | 'recycle' | 'measure';
    item?: VirtualItem;
    index?: number;
    position?: { x: number; y: number };
  }> = [];
  private mutationFrameId: number | null = null;
  private measurementQueue: MeasurementResult[] = [];
  private currentQuality: QualityLevel = 'high';
  private qualityDropCount: number = 0;
  private qualityRecoveryCount: number = 0;
  private renderCount: number = 0;

  public onElementsRendered: ((payload: ElementsRenderedPayload) => void) | null = null;
  public onTotalHeightChange: ((totalHeight: number) => void) | null = null;

  constructor(options: EngineInitOptions) {
    this.container = options.container;
    this.config = this.normalizeConfig(options);

    this.scheduler = new Scheduler({ frameBudget: this.config.frameBudget, enableTimeSlicing: true });
    this.recyclingPool = new RecyclingPool(this.container, this.config.poolMinSize, this.config.poolMaxSize, this.config.enableGPUCompositing);
    this.motionAnalyzer = new MotionAnalyzer();
    this.layoutPredictor = new LayoutPredictor();
    this.viewportManager = new ViewportManager(
      this.config.totalItems,
      this.config.estimatedItemSize,
      typeof this.config.overscan === 'number' ? this.config.overscan : 10
    );
    this.compositorLayer = new CompositorLayer(this.config.enableGPUCompositing);
    this.performanceMonitor = new PerformanceMonitor();
  }

  private normalizeConfig(options: EngineInitOptions): EngineConfig {
    const presets = this.getPerformancePresets(options.performanceMode || 'auto');
    return {
      totalItems: options.totalItems,
      estimatedItemSize: options.estimatedItemSize,
      estimatedItemWidth: options.estimatedItemWidth,
      overscan: options.overscan ?? 'auto',
      overscanMode: options.overscanMode ?? 'adaptive',
      minOverscan: 3,
      maxOverscan: presets.maxOverscan,
      scrollDirection: options.scrollDirection ?? 'vertical',
      scrollThreshold: 1,
      enableGPUCompositing: options.enableGPU ?? true,
      enableAdaptiveOverscan: options.enableAdaptiveOverscan ?? true,
      enablePredictiveRendering: options.enablePredictiveRendering ?? true,
      enableMotionAnalysis: options.enableMotionAnalysis ?? true,
      enableLayoutPrediction: options.enableLayoutPrediction ?? true,
      enableAdaptiveQuality: options.enableAdaptiveQuality ?? true,
      performanceMode: options.performanceMode ?? 'auto',
      recyclingPoolSize: options.recyclingPoolSize ?? presets.poolSize,
      poolMinSize: presets.poolMinSize,
      poolMaxSize: presets.poolMaxSize,
      batchSize: options.batchSize ?? 10,
      frameBudget: options.frameBudget ?? presets.frameBudget,
      debounceScrollMs: options.debounceScrollMs ?? 16,
      useContentVisibility: true,
      useContainment: true,
    };
  }

  private getPerformancePresets(mode: string) {
    switch (mode) {
      case 'ultra': return { frameBudget: 12, maxOverscan: 60, poolSize: 40, poolMinSize: 20, poolMaxSize: 150 };
      case 'balanced': return { frameBudget: 8, maxOverscan: 40, poolSize: 20, poolMinSize: 10, poolMaxSize: 80 };
      case 'battery': return { frameBudget: 4, maxOverscan: 20, poolSize: 10, poolMinSize: 5, poolMaxSize: 40 };
      default: return { frameBudget: 8, maxOverscan: 50, poolSize: 20, poolMinSize: 10, poolMaxSize: 100 };
    }
  }

  getViewportManager(): ViewportManager {
    return this.viewportManager;
  }

  updateConfig(partial: Partial<EngineInitOptions>): void {
    if (partial.estimatedItemSize !== undefined) {
      this.config.estimatedItemSize = partial.estimatedItemSize;
      this.viewportManager.updateItemSize(partial.estimatedItemSize);
    }
    if (partial.overscan !== undefined) this.config.overscan = partial.overscan;
    if (partial.enableGPU !== undefined) {
      this.config.enableGPUCompositing = partial.enableGPU;
      this.compositorLayer.setEnabled(partial.enableGPU);
    }
    if (partial.enableAdaptiveOverscan !== undefined) this.config.enableAdaptiveOverscan = partial.enableAdaptiveOverscan;
    if (partial.enablePredictiveRendering !== undefined) this.config.enablePredictiveRendering = partial.enablePredictiveRendering;
    if (partial.enableAdaptiveQuality !== undefined) this.config.enableAdaptiveQuality = partial.enableAdaptiveQuality;
    if (partial.performanceMode !== undefined) this.config.performanceMode = partial.performanceMode;
    if (partial.recyclingPoolSize !== undefined) this.config.recyclingPoolSize = partial.recyclingPoolSize;
    if (partial.totalItems !== undefined) {
      this.updateItems(new Array(partial.totalItems));
    }
  }

  initialize(): void {
    if (this.isDestroyed) return;
    if (this.isInitialized) return;

    const w = this.container.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 400);
    const h = this.container.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 800);

    this.viewportManager.update(this.container.scrollTop, this.container.scrollLeft, w, h);

    this.viewportManager.onTotalHeightChange = (height: number) => {
      this.onTotalHeightChange?.(height);
    };

    this.setupResizeObserver();
    this.scheduler.start();
    this.startMetricsMonitoring();

    this.isInitialized = true;
  }

  start(): void {
    if (this.isRunning || this.isDestroyed) return;
    if (!this.isInitialized) {
      this.initialize();
    }

    this.isRunning = true;
    this.setupScrollHandler();
    this.render();
    this.emit('ready');
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this.viewportManager.update(
            this.container.scrollTop,
            this.container.scrollLeft,
            width,
            height
          );
          this.scheduleRender('normal');
        }
      }
    });
    this.resizeObserver.observe(this.container);
  }

  private setupScrollHandler(): void {
    const debouncedUpdate = createScrollDebouncer(
      (scrollTop: number, scrollLeft: number) => {
        if (!this.isRunning) return;
        this.performanceMonitor.recordFrame();
        const motionState = this.motionAnalyzer.update(scrollTop, performance.now());

        if (this.config.enableAdaptiveOverscan) {
          this.viewportManager.updateOverscan(
            this.motionAnalyzer.calculateOptimalOverscan(
              typeof this.config.overscan === 'number' ? this.config.overscan : 10,
              this.config.maxOverscan
            )
          );
        }

        this.viewportManager.update(
          scrollTop,
          scrollLeft,
          this.container.clientWidth,
          this.container.clientHeight
        );

        this.processMeasurementQueue();

        const sm = this.viewportManager.getScrollMetrics();
        const vr = this.viewportManager.getVisibleRange();

        this.emit('scrollUpdate', {
          scrollTop: sm.scrollTop,
          scrollLeft: sm.scrollLeft,
          totalHeight: sm.scrollHeight,
          totalWidth: sm.scrollWidth,
          visibleRange: { start: vr.startIndex, end: vr.endIndex },
          velocity: motionState.velocity,
          direction: motionState.direction,
        });

        this.scheduleRender(motionState.isDecelerating ? 'normal' : 'high');
      },
      this.config.debounceScrollMs
    );

    this.scrollHandler = () => {
      debouncedUpdate(this.container.scrollTop, this.container.scrollLeft);
    };

    this.container.addEventListener('scroll', this.scrollHandler, { passive: true });
  }

  private startMetricsMonitoring(): void {
    this.metricsInterval = window.setInterval(() => {
      this.updateMetrics();
      if (this.config.enableAdaptiveQuality) this.checkPerformancePressure();
    }, 500);
  }

  private updateMetrics(): void {
    if (!this.isRunning) return;
    const pm = this.performanceMonitor.getMetrics();
    const ps = this.recyclingPool.getStats();
    const vr = this.viewportManager.getVisibleRange();
    const cs = this.compositorLayer.getStats();
    this.emit('metricsUpdate', {
      fps: pm.fps,
      frameTime: pm.frameTime,
      droppedFrames: pm.droppedFrames,
      layoutThrashing: 0,
      poolUtilization: ps.activeCount / Math.max(1, ps.poolSize),
      predictiveAccuracy: this.layoutPredictor.getPredictionAccuracy(),
      recyclingRate: ps.hitRate,
      averageRenderTime: pm.frameTime,
      memoryUsage: 0,
      visibleItems: vr.totalVisible,
      totalPoolItems: ps.poolSize,
      gpuLayerCount: cs.promotedLayers,
      qualityLevel: this.currentQuality,
    });
  }

  private checkPerformancePressure(): void {
    const fps = this.performanceMonitor.getAverageFPS(30);
    if (fps < 30) {
      this.qualityDropCount++;
      if (this.qualityDropCount >= 3) {
        this.degradeQuality();
        this.qualityDropCount = 0;
      }
    } else if (fps >= 55) {
      this.qualityRecoveryCount++;
      if (this.qualityRecoveryCount >= 5) {
        this.restoreQuality();
        this.qualityRecoveryCount = 0;
      }
    } else {
      this.qualityDropCount = Math.max(0, this.qualityDropCount - 1);
      this.qualityRecoveryCount = Math.max(0, this.qualityRecoveryCount - 1);
    }
  }

  private degradeQuality(): void {
    const levels: QualityLevel[] = ['high', 'medium', 'low', 'minimal'];
    const idx = levels.indexOf(this.currentQuality);
    if (idx < levels.length - 1) {
      this.currentQuality = levels[idx + 1];
      this.applyQualitySettings(this.currentQuality);
      this.emit('qualityChange', this.currentQuality);
    }
  }

  private restoreQuality(): void {
    const levels: QualityLevel[] = ['high', 'medium', 'low', 'minimal'];
    const idx = levels.indexOf(this.currentQuality);
    if (idx > 0) {
      this.currentQuality = levels[idx - 1];
      this.applyQualitySettings(this.currentQuality);
      this.emit('qualityChange', this.currentQuality);
    }
  }

  private applyQualitySettings(quality: QualityLevel): void {
    switch (quality) {
      case 'high':
        this.viewportManager.updateOverscan(typeof this.config.overscan === 'number' ? this.config.overscan : 10);
        this.config.enablePredictiveRendering = true;
        this.config.enableGPUCompositing = true;
        this.compositorLayer.setEnabled(true);
        break;
      case 'medium':
        this.viewportManager.updateOverscan(Math.max(5, Math.floor(Number(this.config.overscan) * 0.7)));
        break;
      case 'low':
        this.viewportManager.updateOverscan(Math.max(3, Math.floor(Number(this.config.overscan) * 0.4)));
        this.config.enablePredictiveRendering = false;
        this.config.enableGPUCompositing = false;
        this.compositorLayer.setEnabled(false);
        this.compositorLayer.demoteUnusedLayers(500);
        break;
      case 'minimal':
        this.viewportManager.updateOverscan(2);
        this.config.enableAdaptiveOverscan = false;
        this.compositorLayer.demoteUnusedLayers(100);
        break;
    }
  }

  private scheduleRender(priority: 'immediate' | 'high' | 'normal' = 'normal'): void {
    if (this.renderScheduled && priority !== 'immediate') return;
    this.renderScheduled = true;
    this.scheduler.schedule(
      'render',
      () => {
        this.renderScheduled = false;
        this.render();
      },
      priority,
      'render_task'
    );
  }

  private render(): void {
    if (!this.isRunning || this.isDestroyed) return;

    this.renderCount++;
    const visibleItems = this.viewportManager.getVisibleItems();
    const currentActive = this.recyclingPool.getActiveItems();
    const { toRecycle, toCreate, toUpdate } = this.diffItems(currentActive, visibleItems);

    this.mutationQueue = [];
    toRecycle.forEach((item) => this.mutationQueue.push({ type: 'recycle', index: item.index }));
    toCreate.forEach((item) => this.mutationQueue.push({ type: 'create', item }));
    toUpdate.forEach((item) =>
      this.mutationQueue.push({
        type: 'update',
        index: item.index,
        position: { x: item.left, y: item.top },
      })
    );

    this.scheduleMutations();

    if (this.config.enablePredictiveRendering) this.predictFutureRange();
  }

  private scheduleMutations(): void {
    if (this.mutationFrameId !== null) return;
    this.mutationFrameId = requestAnimationFrame(() => {
      this.mutationFrameId = null;
      this.applyMutationBatch();
    });
  }

  private applyMutationBatch(): void {
    const created: HTMLElement[] = [];
    const recycled: HTMLElement[] = [];
    const updated: HTMLElement[] = [];
    const removed: number[] = [];

    this.mutationQueue.forEach((m) => {
      switch (m.type) {
        case 'recycle':
          if (m.index !== undefined) {
            this.recyclingPool.release(m.index);
            removed.push(m.index);
          }
          break;
        case 'create':
          if (m.item) {
            const { element, recycled: isRecycled } = this.recyclingPool.acquireWithOrigin(m.item);
            if (element) {
              if (isRecycled) {
                recycled.push(element);
              } else {
                created.push(element);
              }
            }
          }
          break;
        case 'update':
          if (m.index !== undefined && m.position) {
            const el = this.recyclingPool.getElement(m.index);
            if (el) {
              this.recyclingPool.updatePosition(m.index, m.position.x, m.position.y);
              updated.push(el);
            }
          }
          break;
      }
    });

    this.mutationQueue = [];

    if ((created.length > 0 || recycled.length > 0 || removed.length > 0) && this.onElementsRendered) {
      this.onElementsRendered({
        created,
        recycled,
        updated: [],
        removed,
      });
    }
  }

  private predictFutureRange(): void {
    const futurePosition = this.motionAnalyzer.predictFuturePosition(200);
    const vm = this.viewportManager as any;
    const futureIndex = vm.findIndexAtPosition?.(futurePosition) ?? 0;
    for (let i = Math.max(0, futureIndex - 10); i <= Math.min(this.config.totalItems - 1, futureIndex + 20); i++) {
      this.layoutPredictor.predictHeight(i);
    }
  }

  private diffItems(current: VirtualItem[], desired: VirtualItem[]) {
    const cm = new Map(current.map((i) => [i.index, i]));
    const dm = new Map(desired.map((i) => [i.index, i]));
    const toRecycle: VirtualItem[] = [];
    const toCreate: VirtualItem[] = [];
    const toUpdate: VirtualItem[] = [];

    current.forEach((i) => {
      if (!dm.has(i.index)) toRecycle.push(i);
    });
    desired.forEach((i) => {
      if (!cm.has(i.index)) toCreate.push(i);
      else toUpdate.push(i);
    });

    return { toRecycle, toCreate, toUpdate };
  }

  private processMeasurementQueue(): void {
    if (this.measurementQueue.length === 0) return;
    const m = [...this.measurementQueue];
    this.measurementQueue = [];
    this.viewportManager.registerItemHeights(m);
    m.forEach((x) => this.layoutPredictor.recordMeasurement(x.index, x.height, x.width));
  }

  measureItem(index: number, height: number, width?: number): void {
    this.measurementQueue.push({
      index,
      height: Math.round(height),
      width: width || 0,
      timestamp: performance.now(),
      accurate: true,
    });
    this.scheduleRender('normal');
  }

  scrollToIndex(index: number, align: 'start' | 'center' | 'end' = 'start', behavior: ScrollBehavior = 'smooth'): void {
    const ci = Math.max(0, Math.min(index, this.config.totalItems - 1));
    const itemTop = this.viewportManager.getItemTop(ci);
    const itemHeight = this.viewportManager.getItemHeight(ci);
    const vh = this.container.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 800);
    let st = itemTop;
    if (align === 'center') st = itemTop - vh / 2 + itemHeight / 2;
    else if (align === 'end') st = itemTop - vh + itemHeight;
    this.container.scrollTo({ top: Math.max(0, st), behavior });
  }

  updateItems(items: any[]): void {
    this.items = items;
    this.viewportManager.updateTotalItems(items.length);
    this.config.totalItems = items.length;
  }

  refresh(): void {
    const w = this.container.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 400);
    const h = this.container.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 800);
    this.viewportManager.update(this.container.scrollTop, this.container.scrollLeft, w, h);
    this.render();
  }

  on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) this.eventListeners.set(event, new Set());
    this.eventListeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  private emit(event: string, data?: any): void {
    this.eventListeners.get(event)?.forEach((cb) => {
      try { cb(data); } catch (e) { console.error(`[PerceptualEngine] Event "${event}" error:`, e); }
    });
  }

  onMetricsUpdate(callback: (metrics: PerceptualMetrics) => void): void { this.on('metricsUpdate', callback); }
  onScrollUpdate(callback: (payload: ScrollUpdatePayload) => void): void { this.on('scrollUpdate', callback); }
  onError(callback: (error: EngineError) => void): void { this.on('error', callback); }
  onQualityChange(callback: (quality: QualityLevel) => void): void { this.on('qualityChange', callback); }

  destroy(): void {
    if (this.isDestroyed) return;
    this.isRunning = false;
    this.isDestroyed = true;
    this.isInitialized = false;

    this.emit('destroy');

    this.scheduler.destroy();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.scrollHandler) {
      this.container.removeEventListener('scroll', this.scrollHandler);
      this.scrollHandler = null;
    }
    if (this.metricsInterval !== null) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    if (this.mutationFrameId !== null) {
      cancelAnimationFrame(this.mutationFrameId);
      this.mutationFrameId = null;
    }
    this.recyclingPool.destroy();
    this.compositorLayer.destroy();
    this.motionAnalyzer.reset();
    this.layoutPredictor.clear();
    this.viewportManager.reset();
    this.performanceMonitor.reset();

    this.eventListeners.clear();
    this.measurementQueue = [];
    this.mutationQueue = [];
    this.onElementsRendered = null;
    this.onTotalHeightChange = null;
  }
}