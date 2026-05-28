/* 
core/src/layout/HeightIndexTree.ts
*/


export class HeightIndexTree {
  private tree: Float64Array;
  private heights: Float64Array;
  private _size: number;

  constructor(initialHeights: Float64Array) {
    this._size = initialHeights.length;
    this.tree = new Float64Array(this._size + 1);
    this.heights = new Float64Array(this._size);

    for (let i = 0; i < this._size; i++) {
      this.heights[i] = initialHeights[i];
    }
    for (let i = 0; i < this._size; i++) {
      this.addToTree(i + 1, initialHeights[i]);
    }
  }

  get size(): number {
    return this._size;
  }

  update(index: number, newHeight: number): void {
    if (index < 0 || index >= this._size) return;

    const delta = newHeight - this.heights[index];
    if (delta === 0) return;

    this.heights[index] = newHeight;
    this.addToTree(index + 1, delta);
  }

  queryPrefixSum(index: number): number {
    if (index <= 0) return 0;
    if (index > this._size) index = this._size;
    return this.prefixSum(index);
  }

  getTotalHeight(): number {
    return this.prefixSum(this._size);
  }

  findByPrefixSum(offset: number): number {
    if (offset <= 0) return 0;

    let idx = 0;
    let remaining = offset;
    let bitMask = this.highestPowerOfTwo(this._size);

    while (bitMask > 0) {
      const nextIdx = idx + bitMask;
      if (nextIdx <= this._size && this.tree[nextIdx] < remaining) {
        remaining -= this.tree[nextIdx];
        idx = nextIdx;
      }
      bitMask >>= 1;
    }

    return Math.min(idx, this._size - 1);
  }

  getHeight(index: number): number {
    if (index < 0 || index >= this._size) return 0;
    return this.heights[index];
  }

  resize(newSize: number, defaultHeight: number): void {
    const oldSize = this._size;
    const oldHeights = this.heights;
    const newHeights = new Float64Array(newSize);

    const copyCount = Math.min(oldSize, newSize);
    for (let i = 0; i < copyCount; i++) {
      newHeights[i] = oldHeights[i];
    }
    for (let i = copyCount; i < newSize; i++) {
      newHeights[i] = defaultHeight;
    }

    this._size = newSize;
    this.tree = new Float64Array(newSize + 1);
    this.heights = newHeights;

    for (let i = 0; i < newSize; i++) {
      this.addToTree(i + 1, newHeights[i]);
    }
  }

  fill(height: number): void {
    this.heights.fill(height);
    this.tree.fill(0);
    for (let i = 0; i < this._size; i++) {
      this.addToTree(i + 1, height);
    }
  }

  private addToTree(index: number, delta: number): void {
    while (index <= this._size) {
      this.tree[index] += delta;
      index += index & -index;
    }
  }

  private prefixSum(index: number): number {
    let sum = 0;
    while (index > 0) {
      sum += this.tree[index];
      index -= index & -index;
    }
    return sum;
  }

  private highestPowerOfTwo(n: number): number {
    let power = 1;
    while (power <= n) {
      power <<= 1;
    }
    return power >> 1;
  }
}