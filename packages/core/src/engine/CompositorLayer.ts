interface CompositedElement {
  element: HTMLElement;
  layerId: string;
  promoted: boolean;
  visible: boolean;
  transform: { x: number; y: number; z: number };
  promotedAt: number;
}

export class CompositorLayer {
  private elements: Map<string, CompositedElement> = new Map();
  private layerPromotions: Map<string, number> = new Map();
  private enabled: boolean;
  private readonly maxPromotedLayers: number;
  private promotionCount: number = 0;
  private demotionCount: number = 0;

  constructor(enabled: boolean = true, maxPromotedLayers: number = 50) {
    this.enabled = enabled;
    this.maxPromotedLayers = maxPromotedLayers;
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.layerPromotions.forEach((_, id) => this.demoteFromLayer(id));
      this.layerPromotions.clear();
    }
  }

  isEnabled(): boolean { return this.enabled; }

  register(id: string, element: HTMLElement): void {
    this.elements.set(id, {
      element, layerId: id, promoted: false, visible: true,
      transform: { x: 0, y: 0, z: 0 }, promotedAt: 0,
    });
    if (this.enabled) this.applyBaseOptimizations(element);
  }

  updateTransform(id: string, x: number, y: number, z: number = 0): void {
    const c = this.elements.get(id);
    if (!c) return;
    c.transform = { x, y, z };
    if (this.enabled && c.visible) this.applyTransform(c);
  }

  promoteToLayer(id: string): boolean {
    if (!this.enabled) return false;
    const c = this.elements.get(id);
    if (!c || c.promoted) return false;
    if (this.layerPromotions.size >= this.maxPromotedLayers) this.demoteOldestLayer();
    const el = c.element;
    el.style.willChange = 'transform';
    el.style.transform = 'translateZ(0)';
    el.style.backfaceVisibility = 'hidden';
    el.style.perspective = '1000px';
    c.promoted = true;
    c.promotedAt = performance.now();
    this.layerPromotions.set(id, c.promotedAt);
    this.promotionCount++;
    return true;
  }

  demoteFromLayer(id: string): void {
    const c = this.elements.get(id);
    if (!c || !c.promoted) return;
    c.element.style.willChange = 'auto';
    c.element.style.perspective = '';
    c.element.style.backfaceVisibility = '';
    c.promoted = false;
    c.promotedAt = 0;
    this.layerPromotions.delete(id);
    this.demotionCount++;
  }

  promoteTemporarily(id: string, durationMs: number = 500): void {
    if (this.promoteToLayer(id)) setTimeout(() => this.demoteFromLayer(id), durationMs);
  }

  hide(id: string): void {
    const c = this.elements.get(id);
    if (!c) return;
    c.visible = false;
    if (this.enabled) {
      c.element.style.visibility = 'hidden';
      c.element.style.pointerEvents = 'none';
      c.element.style.contentVisibility = 'hidden';
      if (c.promoted) this.demoteFromLayer(id);
    }
  }

  show(id: string): void {
    const c = this.elements.get(id);
    if (!c) return;
    c.visible = true;
    if (this.enabled) {
      c.element.style.visibility = 'visible';
      c.element.style.pointerEvents = '';
      c.element.style.contentVisibility = 'auto';
      this.applyTransform(c);
    }
  }

  private applyBaseOptimizations(element: HTMLElement): void {
    element.style.contain = 'layout style paint';
    element.style.contentVisibility = 'auto';
    element.style.willChange = 'auto';
  }

  private applyTransform(c: CompositedElement): void {
    const { x, y, z } = c.transform;
    c.element.style.transform = z !== 0
      ? `translate3d(${x}px, ${y}px, ${z}px)`
      : c.promoted
        ? `translate3d(${x}px, ${y}px, 0)`
        : `translate(${x}px, ${y}px)`;
  }

  private demoteOldestLayer(): void {
    let oldestId: string | null = null, oldestTime = Infinity;
    this.layerPromotions.forEach((t, id) => { if (t < oldestTime) { oldestTime = t; oldestId = id; } });
    if (oldestId) this.demoteFromLayer(oldestId);
  }

  demoteUnusedLayers(timeThresholdMs: number = 2000): void {
    const now = performance.now();
    this.layerPromotions.forEach((t, id) => { if (now - t > timeThresholdMs) this.demoteFromLayer(id); });
  }

  unregister(id: string): void {
    const c = this.elements.get(id);
    if (!c) return;
    if (c.promoted) this.demoteFromLayer(id);
    const el = c.element;
    el.style.willChange = '';
    el.style.contain = '';
    el.style.contentVisibility = '';
    el.style.transform = '';
    el.style.backfaceVisibility = '';
    el.style.perspective = '';
    this.elements.delete(id);
  }

  pause(): void { this.elements.forEach((c) => { c.element.style.animationPlayState = 'paused'; }); }
  resume(): void { this.elements.forEach((c) => { c.element.style.animationPlayState = 'running'; }); }

  prepareForActiveScroll(activeIds: string[]): void {
    const s = new Set(activeIds);
    this.elements.forEach((c, id) => {
      if (s.has(id)) { if (!c.promoted) this.promoteToLayer(id); c.element.style.contentVisibility = 'visible'; }
      else { c.element.style.contentVisibility = 'hidden'; if (c.promoted) this.demoteFromLayer(id); }
    });
  }

  restoreAfterScroll(): void {
    this.elements.forEach((c) => { c.element.style.contentVisibility = 'auto'; });
    this.demoteUnusedLayers(1000);
  }

  getPromotedLayerCount(): number { return this.layerPromotions.size; }
  getElementCount(): number { return this.elements.size; }
  isPromoted(id: string): boolean { return this.layerPromotions.has(id); }

  getStats() {
    return {
      totalElements: this.elements.size, promotedLayers: this.layerPromotions.size,
      maxPromotedLayers: this.maxPromotedLayers, promotions: this.promotionCount,
      demotions: this.demotionCount, enabled: this.enabled,
      utilization: this.maxPromotedLayers > 0 ? (this.layerPromotions.size / this.maxPromotedLayers) * 100 : 0,
    };
  }

  clear(): void {
    this.elements.forEach((_, id) => this.unregister(id));
    this.elements.clear();
    this.layerPromotions.clear();
    this.promotionCount = 0;
    this.demotionCount = 0;
  }

  destroy(): void { this.clear(); }
}