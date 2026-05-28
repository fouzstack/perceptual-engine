/*
core/src/transaction/RenderEpochManager.ts
*/

//#6

export class RenderEpochManager {
  private epoch: number = 0;
  private activeCallbacks: Map<number, Set<() => void>> = new Map();
  private cancelledEpochs: Set<number> = new Set();

  beginEpoch(): number {
    if (this.epoch > 0) {
      this.cancelledEpochs.add(this.epoch);
    }

    this.epoch++;
    this.activeCallbacks.set(this.epoch, new Set());

    if (this.cancelledEpochs.size > 20) {
      this.cleanup();
    }

    return this.epoch;
  }

  getCurrentEpoch(): number {
    return this.epoch;
  }

  isValid(epoch: number): boolean {
    return epoch === this.epoch && !this.cancelledEpochs.has(epoch);
  }

  registerCallback(epoch: number, callback: () => void): void {
    if (!this.isValid(epoch)) return;
    const callbacks = this.activeCallbacks.get(epoch);
    if (callbacks) {
      callbacks.add(callback);
    }
  }

  cancelEpoch(epoch: number): void {
    this.cancelledEpochs.add(epoch);
    this.activeCallbacks.delete(epoch);
  }

  executeIfValid(epoch: number, callback: () => void): boolean {
    if (!this.isValid(epoch)) return false;
    callback();
    return true;
  }

  createGuard(epoch: number): { isValid: () => boolean } {
    return {
      isValid: (): boolean => this.isValid(epoch),
    };
  }

  getStats(): { currentEpoch: number; activeEpochs: number; cancelledEpochs: number } {
    return {
      currentEpoch: this.epoch,
      activeEpochs: this.activeCallbacks.size,
      cancelledEpochs: this.cancelledEpochs.size,
    };
  }

  private cleanup(): void {
    const toDelete: number[] = [];
    this.cancelledEpochs.forEach((epoch) => {
      if (epoch < this.epoch - 30) {
        toDelete.push(epoch);
      }
    });
    for (let i = 0; i < toDelete.length; i++) {
      this.cancelledEpochs.delete(toDelete[i]);
      this.activeCallbacks.delete(toDelete[i]);
    }
  }

  destroy(): void {
    this.activeCallbacks.clear();
    this.cancelledEpochs.clear();
    this.epoch = 0;
  }
}