import { PerceptualEngine } from '@/perceptual-engine/core/src/engine/PerceptualEngine';
import { useCallback } from 'react';
//import type { PerceptualEngine } from '@perceptual/core';

export function useScrollToIndex(
  engineRef: React.MutableRefObject<PerceptualEngine | null>
) {
  const scrollToIndex = useCallback(
    (
      index: number,
      align: 'start' | 'center' | 'end' = 'start',
      behavior: ScrollBehavior = 'smooth'
    ) => {
      engineRef.current?.scrollToIndex(index, align, behavior);
    },
    [engineRef]
  );

  const scrollToTop = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      engineRef.current?.scrollToIndex(0, 'start', behavior);
    },
    [engineRef]
  );

  const scrollToBottom = useCallback(
    (totalItems: number, behavior: ScrollBehavior = 'smooth') => {
      engineRef.current?.scrollToIndex(totalItems - 1, 'end', behavior);
    },
    [engineRef]
  );

  return { scrollToIndex, scrollToTop, scrollToBottom };
}