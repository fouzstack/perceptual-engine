const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function angle(x1: number, y1: number, x2: number, y2: number): number {
  return Math.atan2(y2 - y1, x2 - x1);
}

export function toDegrees(radians: number): number { return radians * RAD_TO_DEG; }
export function toRadians(degrees: number): number { return degrees * DEG_TO_RAD; }

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number { return value < 0 ? 0 : value > 1 ? 1 : value; }

export function lerp(a: number, b: number, t: number): number { return a + (b - a) * clamp01(t); }

export function smoothLerp(a: number, b: number, t: number, smoothness: number = 0.3): number {
  const factor = 1 - Math.pow(1 - clamp01(t), smoothness * 10);
  return a + (b - a) * factor;
}

export function getStartIndex(scrollTop: number, itemSize: number): number {
  return Math.max(0, Math.floor(scrollTop / itemSize));
}

export function getVisibleCount(viewportHeight: number, itemSize: number): number {
  return Math.ceil(viewportHeight / itemSize) + 1;
}

export function getVisibleRange(scrollTop: number, viewportHeight: number, itemSize: number, totalItems: number, overscan: number): { start: number; end: number } {
  const startIndex = getStartIndex(scrollTop, itemSize);
  const visibleCount = getVisibleCount(viewportHeight, itemSize);
  const start = Math.max(0, startIndex - overscan);
  const end = Math.min(totalItems - 1, startIndex + visibleCount + overscan);
  return { start, end };
}

export function getTotalHeight(totalItems: number, itemSize: number): number { return totalItems * itemSize; }
export function getItemTop(index: number, itemSize: number): number { return index * itemSize; }
export function roundToMultiple(value: number, multiple: number): number { return Math.round(value / multiple) * multiple; }

export function getScrollPercentage(scrollTop: number, totalHeight: number, clientHeight: number): number {
  const maxScroll = Math.max(0, totalHeight - clientHeight);
  if (maxScroll === 0) return 0;
  return clamp01(scrollTop / maxScroll) * 100;
}

export function calculateVelocity(position1: number, position2: number, time1: number, time2: number): number {
  const dt = time2 - time1;
  if (dt === 0) return 0;
  return (position2 - position1) / dt;
}

export function calculateAcceleration(velocity1: number, velocity2: number, time1: number, time2: number): number {
  const dt = time2 - time1;
  if (dt === 0) return 0;
  return (velocity2 - velocity1) / dt;
}

export function predictPosition(currentPosition: number, velocity: number, acceleration: number, timeMs: number): number {
  const t = timeMs / 1000;
  return currentPosition + velocity * t + 0.5 * acceleration * t * t;
}

export function calculateBrakingDistance(velocity: number, deceleration: number): number {
  if (deceleration === 0) return Infinity;
  return (velocity * velocity) / (2 * Math.abs(deceleration));
}

export function isPointInRect(x: number, y: number, rectX: number, rectY: number, rectWidth: number, rectHeight: number): boolean {
  return x >= rectX && x <= rectX + rectWidth && y >= rectY && y <= rectY + rectHeight;
}

export function rectsIntersect(aX: number, aY: number, aW: number, aH: number, bX: number, bY: number, bW: number, bH: number): boolean {
  return !(aX + aW < bX || bX + bW < aX || aY + aH < bY || bY + bH < aY);
}