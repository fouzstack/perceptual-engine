import { useMemo } from 'react';
import { useEngineStore } from '../store/engine-store';

export function useAdaptiveOverscan(baseOverscan: number = 10) {
  const velocity = useEngineStore((s) => s.scrollState.velocity);
  const direction = useEngineStore((s) => s.scrollState.direction);
  const isScrolling = useEngineStore((s) => s.scrollState.isScrolling);

  const overscan = useMemo(() => {
    if (!isScrolling) return baseOverscan;

    const absVelocity = Math.abs(velocity);

    if (absVelocity > 5) return Math.floor(baseOverscan * 4);
    if (absVelocity > 3) return Math.floor(baseOverscan * 3);
    if (absVelocity > 1.5) return Math.floor(baseOverscan * 2);
    if (absVelocity > 0.5) return Math.floor(baseOverscan * 1.5);

    return baseOverscan;
  }, [velocity, direction, isScrolling, baseOverscan]);

  return {
    overscan,
    isAdaptive: true,
    currentVelocity: velocity,
    currentDirection: direction,
  };
}