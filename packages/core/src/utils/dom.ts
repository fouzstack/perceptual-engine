export function applyGPUAcceleration(element: HTMLElement): void {
  element.style.transform = 'translateZ(0)';
  element.style.backfaceVisibility = 'hidden';
  element.style.perspective = '1000px';
}

export function removeGPUAcceleration(element: HTMLElement): void {
  element.style.transform = '';
  element.style.backfaceVisibility = '';
  element.style.perspective = '';
}

export function applyContainment(element: HTMLElement): void {
  element.style.contain = 'layout style paint';
  element.style.contentVisibility = 'auto';
}

export function setPosition(element: HTMLElement, x: number, y: number, useGPU: boolean = true): void {
  const safeX = isNaN(x) ? 0 : x;
  const safeY = isNaN(y) ? 0 : y;
  if (useGPU) {
    element.style.transform = `translate3d(${safeX}px, ${safeY}px, 0)`;
  } else {
    element.style.transform = `translate(${safeX}px, ${safeY}px)`;
  }
}

export function setSize(element: HTMLElement, width: number, height: number): void {
  element.style.width = `${isNaN(width) ? 0 : width}px`;
  element.style.height = `${isNaN(height) ? 0 : height}px`;
}

export function hideElement(element: HTMLElement): void {
  element.style.visibility = 'hidden';
  element.style.pointerEvents = 'none';
  element.setAttribute('aria-hidden', 'true');
}

export function showElement(element: HTMLElement): void {
  element.style.visibility = 'visible';
  element.style.pointerEvents = '';
  element.removeAttribute('aria-hidden');
}

export function markAsRecyclable(element: HTMLElement): void {
  element.setAttribute('data-recycled', 'true');
  element.style.opacity = '0';
}

export function restoreFromRecycle(element: HTMLElement, index: number): void {
  element.removeAttribute('data-recycled');
  element.style.opacity = '';
  element.setAttribute('data-index', String(isNaN(index) ? 0 : index));
}

export function createOptimizedContainer(className?: string): HTMLDivElement {
  const container = document.createElement('div');
  if (className) container.className = className;
  container.style.position = 'relative';
  container.style.width = '100%';
  container.style.contain = 'layout style paint';
  return container;
}

export function createOptimizedItem(index: number): HTMLDivElement {
  const item = document.createElement('div');
  item.setAttribute('data-index', String(isNaN(index) ? 0 : index));
  item.setAttribute('data-pool-id', `pool-${Math.random().toString(36).slice(2, 9)}`);
  item.style.position = 'absolute';
  item.style.top = '0';
  item.style.left = '0';
  item.style.width = '100%';
  item.style.willChange = 'transform';
  item.style.contain = 'layout style paint';
  return item;
}

export function getItemIndex(element: HTMLElement): number {
  return parseInt(element.getAttribute('data-index') || '0', 10);
}

export function getElementHeight(element: HTMLElement): number {
  return element.getBoundingClientRect().height;
}

export function getElementWidth(element: HTMLElement): number {
  return element.getBoundingClientRect().width;
}

export function isInViewport(element: HTMLElement, viewportHeight: number, scrollTop: number): boolean {
  const rect = element.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < viewportHeight;
}

export function smoothScrollTo(element: HTMLElement, top: number, behavior: ScrollBehavior = 'smooth'): void {
  element.scrollTo({ top: isNaN(top) ? 0 : top, behavior });
}

export function createDocumentFragment(): DocumentFragment {
  return document.createDocumentFragment();
}

export function clearChildren(element: HTMLElement): void {
  while (element.firstChild) element.removeChild(element.firstChild);
}

export function cloneTemplate(templateId: string): HTMLElement | null {
  const template = document.getElementById(templateId) as HTMLTemplateElement;
  if (!template) return null;
  const clone = template.content.firstElementChild?.cloneNode(true) as HTMLElement;
  return clone || null;
}

export function createScrollDebouncer(
  callback: (scrollTop: number, scrollLeft: number) => void,
  delay: number = 16
): (scrollTop: number, scrollLeft: number) => void {
  let rafId: number | null = null;
  let pendingScrollTop = 0;
  let pendingScrollLeft = 0;
  return (scrollTop: number, scrollLeft: number) => {
    pendingScrollTop = isNaN(scrollTop) ? 0 : scrollTop;
    pendingScrollLeft = isNaN(scrollLeft) ? 0 : scrollLeft;
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        callback(pendingScrollTop, pendingScrollLeft);
        rafId = null;
      });
    }
  };
}