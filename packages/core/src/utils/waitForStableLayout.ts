export async function waitForStableLayout(
  element: HTMLElement,
  options?: {
    timeout?: number;
    minHeight?: number;
    minWidth?: number;
    stableFrames?: number;
  }
): Promise<boolean> {
  const { timeout = 2000, minHeight = 10, minWidth = 10, stableFrames = 2 } = options || {};

  return new Promise((resolve) => {
    let frame = 0;
    let stableCount = 0;
    let lastWidth = -1;
    let lastHeight = -1;
    const start = performance.now();

    const check = () => {
      if (!element.isConnected) { resolve(false); return; }

      const width = element.clientWidth;
      const height = element.clientHeight;
      const valid = width >= minWidth && height >= minHeight;
      const stable = width === lastWidth && height === lastHeight;

      if (valid && stable) stableCount++;
      else stableCount = 0;

      lastWidth = width;
      lastHeight = height;

      if (stableCount >= stableFrames) { resolve(true); return; }
      if (performance.now() - start > timeout) { resolve(valid); return; }

      frame++;
      requestAnimationFrame(check);
    };

    requestAnimationFrame(check);
  });
}