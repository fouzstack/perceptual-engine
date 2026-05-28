/*
12
src/perceptual-engine/core/src/rendering/VisibilityPriority.ts
*/

export enum VisibilityPriority {
  CRITICAL = 0,
  NEAR_VIEWPORT = 1,
  PREDICTIVE = 2,
  OFFSCREEN = 3,
  FROZEN = 4,
}

interface PriorityConfig {
  nearViewportRadius: number;
  predictiveRadius: number;
  maxCriticalItems: number;
  maxNearViewportItems: number;
}

const DEFAULT_CONFIG: PriorityConfig = {
  nearViewportRadius: 3,
  predictiveRadius: 10,
  maxCriticalItems: 20,
  maxNearViewportItems: 10,
};

export class VisibilityPrioritizer {
  private config: PriorityConfig;
  private scrollDirection: 'up' | 'down' | 'idle' = 'idle';

  constructor(config?: Partial<PriorityConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  updateDirection(direction: 'up' | 'down' | 'idle'): void {
    this.scrollDirection = direction;
  }

  getPriority(
    index: number,
    visibleStart: number,
    visibleEnd: number
  ): VisibilityPriority {
    if (index >= visibleStart && index <= visibleEnd) {
      return VisibilityPriority.CRITICAL;
    }

    const distanceToStart = visibleStart - index;
    const distanceToEnd = index - visibleEnd;

    if (
      (distanceToStart > 0 && distanceToStart <= this.config.nearViewportRadius) ||
      (distanceToEnd > 0 && distanceToEnd <= this.config.nearViewportRadius)
    ) {
      return VisibilityPriority.NEAR_VIEWPORT;
    }

    if (this.scrollDirection === 'down' && index > visibleEnd) {
      const predictiveDistance = index - visibleEnd;
      if (predictiveDistance <= this.config.predictiveRadius) {
        return VisibilityPriority.PREDICTIVE;
      }
    }
    if (this.scrollDirection === 'up' && index < visibleStart) {
      const predictiveDistance = visibleStart - index;
      if (predictiveDistance <= this.config.predictiveRadius) {
        return VisibilityPriority.PREDICTIVE;
      }
    }

    return VisibilityPriority.OFFSCREEN;
  }

  sortByPriority(items: Array<{ index: number; priority: VisibilityPriority }>): Array<{ index: number; priority: VisibilityPriority }> {
    return items.sort((a, b) => a.priority - b.priority);
  }

  getRenderBudget(priority: VisibilityPriority): number {
    switch (priority) {
      case VisibilityPriority.CRITICAL:
        return 8;
      case VisibilityPriority.NEAR_VIEWPORT:
        return 3;
      case VisibilityPriority.PREDICTIVE:
        return 1;
      case VisibilityPriority.OFFSCREEN:
        return 0;
      case VisibilityPriority.FROZEN:
        return 0;
    }
  }

  shouldMeasure(priority: VisibilityPriority, measurementFrequency: 'normal' | 'reduced' | 'minimal' | 'none'): boolean {
    if (measurementFrequency === 'none') return false;
    if (measurementFrequency === 'minimal') return priority <= VisibilityPriority.CRITICAL;
    if (measurementFrequency === 'reduced') return priority <= VisibilityPriority.NEAR_VIEWPORT;
    return priority <= VisibilityPriority.PREDICTIVE;
  }
}


