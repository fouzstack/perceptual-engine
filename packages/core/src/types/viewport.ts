export interface ViewportConfig {
  overscanSize: number;
  scrollThreshold: number;
  enableSmoothScrolling: boolean;
  scrollRestoration: 'auto' | 'manual';
  resizeDebounceMs: number;
}

export interface ScrollMetrics {
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
  scrollPercentage: number;
  maxScrollTop: number;
  isAtTop: boolean;
  isAtBottom: boolean;
}

export interface VisibleRange {
  startIndex: number;
  endIndex: number;
  totalVisible: number;
  overscanBefore: number;
  overscanAfter: number;
}

export interface ViewportBounds {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}