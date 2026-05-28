/*
src/perceptual-engine/core/src/transaction/RenderTransaction.ts
*/

// #7

export interface RenderTransaction {
  id: number;
  frameId: number;
  startTime: number;
  phase: 'render' | 'measure' | 'correct' | 'recycle';
  committed: boolean;
  rolledBack: boolean;
  rollback(): void;
}

interface TransactionSnapshot {
  visibleRange: { startIndex: number; endIndex: number };
  scrollTop: number;
  activeItemCount: number;
  correctionCount: number;
}

export class TransactionManager {
  private transactions: Map<number, RenderTransaction> = new Map();
  private nextId: number = 0;
  private currentFrameId: number = 0;
  private snapshots: Map<number, TransactionSnapshot> = new Map();
  private recoveryAttempts: number = 0;
  private readonly maxRecoveryAttempts: number = 3;

  private onRecoverLayout: (() => void) | null = null;
  private onForceVisibleRecalculation: (() => void) | null = null;
  private onClearRecycledNodes: (() => void) | null = null;

  setRecoveryCallbacks(callbacks: {
    onRecoverLayout: () => void;
    onForceVisibleRecalculation: () => void;
    onClearRecycledNodes: () => void;
  }): void {
    this.onRecoverLayout = callbacks.onRecoverLayout;
    this.onForceVisibleRecalculation = callbacks.onForceVisibleRecalculation;
    this.onClearRecycledNodes = callbacks.onClearRecycledNodes;
  }

  beginFrame(): number {
    this.currentFrameId++;
    return this.currentFrameId;
  }

  beginTransaction(
    phase: RenderTransaction['phase'],
    snapshot: TransactionSnapshot
  ): RenderTransaction {
    const id = ++this.nextId;
    const frameId = this.currentFrameId;

    const transaction: RenderTransaction = {
      id,
      frameId,
      startTime: performance.now(),
      phase,
      committed: false,
      rolledBack: false,
      rollback: (): void => this.performRollback(id),
    };

    this.transactions.set(id, transaction);
    this.snapshots.set(id, { ...snapshot });

    return transaction;
  }

  commit(id: number): void {
    const txn = this.transactions.get(id);
    if (txn && !txn.rolledBack) {
      txn.committed = true;
      this.snapshots.delete(id);
      if (this.transactions.size > 50) {
        this.cleanup();
      }
    }
  }

  private performRollback(id: number): void {
    const txn = this.transactions.get(id);
    if (!txn || txn.committed) return;

    txn.rolledBack = true;
    this.recoveryAttempts++;

    console.warn(`[TransactionManager] Rolling back transaction ${id} (phase: ${txn.phase})`);

    switch (txn.phase) {
      case 'correct':
        this.onForceVisibleRecalculation?.();
        break;
      case 'recycle':
        this.onClearRecycledNodes?.();
        break;
      case 'render':
        this.onRecoverLayout?.();
        break;
      case 'measure':
        break;
    }

    this.snapshots.delete(id);
  }

  detectLayoutCorruption(state: {
    scrollTop: number;
    totalHeight: number;
    visibleStartIndex: number;
    visibleEndIndex: number;
  }): boolean {
    if (!Number.isFinite(state.scrollTop) || state.scrollTop < 0) return true;
    if (!Number.isFinite(state.totalHeight) || state.totalHeight < 0) return true;
    if (!Number.isFinite(state.visibleStartIndex) || state.visibleStartIndex < 0) return true;
    if (!Number.isFinite(state.visibleEndIndex) || state.visibleEndIndex < 0) return true;
    if (state.visibleStartIndex > state.visibleEndIndex) return true;
    return false;
  }

  recoverFromCorruption(): boolean {
    if (this.recoveryAttempts >= this.maxRecoveryAttempts) {
      console.error('[TransactionManager] Max recovery attempts reached. Resetting engine.');
      this.recoveryAttempts = 0;
      this.transactions.clear();
      this.snapshots.clear();
      return false;
    }

    console.warn('[TransactionManager] Attempting recovery...');
    this.onRecoverLayout?.();
    this.onForceVisibleRecalculation?.();
    return true;
  }

  validateOperation(operation: string, ...values: number[]): boolean {
    for (let i = 0; i < values.length; i++) {
      if (!Number.isFinite(values[i])) {
        console.error(`[TransactionManager] Invalid value in ${operation}: ${values[i]}`);
        return false;
      }
    }
    return true;
  }

  getStats(): { activeTransactions: number; recoveryAttempts: number; currentFrameId: number } {
    return {
      activeTransactions: this.transactions.size,
      recoveryAttempts: this.recoveryAttempts,
      currentFrameId: this.currentFrameId,
    };
  }

  private cleanup(): void {
    const toDelete: number[] = [];
    this.transactions.forEach((txn, id) => {
      if (txn.committed || txn.rolledBack) {
        toDelete.push(id);
      }
    });
    for (let i = 0; i < toDelete.length; i++) {
      this.transactions.delete(toDelete[i]);
    }
  }

  destroy(): void {
    this.transactions.clear();
    this.snapshots.clear();
    this.recoveryAttempts = 0;
    this.onRecoverLayout = null;
    this.onForceVisibleRecalculation = null;
    this.onClearRecycledNodes = null;
  }
}