import {
  ScheduledTask,
  TaskPriority,
  TaskType,
  SchedulerConfig,
  FrameBudget,
  SchedulerStats,
} from '../types/scheduler';

export class Scheduler {
  private readonly queues: Map<TaskPriority, ScheduledTask[]> = new Map();
  private readonly pendingTasks: Map<string, ScheduledTask> = new Map();
  private frameId: number | null = null;
  private idleId: number | null = null;
  private readonly config: SchedulerConfig;
  private stats: SchedulerStats;
  private isRunning: boolean = false;
  private taskIdCounter: number = 0;
  private executionTimes: number[] = [];

  private static readonly PRIORITY_ORDER: TaskPriority[] = [
    'immediate',
    'high',
    'normal',
    'low',
    'idle',
  ];

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = {
      frameBudget: config.frameBudget || 8,
      enableTimeSlicing: config.enableTimeSlicing ?? true,
      idleTimeout: config.idleTimeout || 50,
      maxTasksPerFrame: config.maxTasksPerFrame || 10,
      starvationPrevention: config.starvationPrevention ?? true,
    };
    Scheduler.PRIORITY_ORDER.forEach((p) => this.queues.set(p, []));
    this.stats = {
      tasksExecuted: 0,
      tasksCancelled: 0,
      averageExecutionTime: 0,
      frameUtilization: 0,
      droppedFrames: 0,
    };
  }

  schedule(
    type: TaskType,
    callback: () => void,
    priority: TaskPriority = 'normal',
    customId?: string,
  ): string {
    const id = customId || `task_${++this.taskIdCounter}_${type}`;
    this.cancel(id);
    const task: ScheduledTask = {
      id,
      type,
      priority,
      callback,
      createdAt: performance.now(),
      deadline: this.calculateDeadline(priority),
      cancelled: false,
      completed: false,
    };
    if (priority === 'immediate') {
      this.executeTask(task);
      return id;
    }
    this.queues.get(priority)!.push(task);
    this.pendingTasks.set(id, task);
    if (!this.frameId && this.isRunning) this.scheduleFrame();
    return id;
  }

  cancel(id: string): void {
    const task = this.pendingTasks.get(id);
    if (task && !task.completed) {
      task.cancelled = true;
      this.pendingTasks.delete(id);
      this.stats.tasksCancelled++;
    }
  }

  cancelByType(type: TaskType): void {
    this.queues.forEach((queue, priority) => {
      this.queues.set(
        priority,
        queue.filter((t) => {
          if (t.type === type && !t.completed) {
            t.cancelled = true;
            this.pendingTasks.delete(t.id);
            this.stats.tasksCancelled++;
            return false;
          }
          return true;
        }),
      );
    });
  }

  private scheduleFrame(): void {
    if (this.frameId !== null) return;
    this.frameId = requestAnimationFrame(() => {
      this.frameId = null;
      this.processFrame();
    });
  }

  private processFrame(): void {
    if (!this.isRunning) return;
    this.cleanCancelledTasks();
    if (this.getTotalPendingTasks() === 0) {
      this.scheduleIdleTasks();
      return;
    }
    const frameStart = performance.now();
    let tasksExecuted = 0;
    const budget = this.config.frameBudget;
    for (const priority of Scheduler.PRIORITY_ORDER) {
      const queue = this.queues.get(priority)!;
      while (queue.length > 0 && tasksExecuted < this.config.maxTasksPerFrame) {
        const elapsed = performance.now() - frameStart;
        if (elapsed >= budget && this.config.enableTimeSlicing) {
          this.scheduleFrame();
          this.updateFrameStats(frameStart);
          return;
        }
        const task = queue.shift()!;
        if (!task.cancelled) {
          this.executeTask(task);
          tasksExecuted++;
          if (this.config.starvationPrevention && tasksExecuted % 5 === 0)
            this.promoteStarvedTasks();
        }
      }
    }
    this.updateFrameStats(frameStart);
    if (this.getTotalPendingTasks() > 0) this.scheduleFrame();
    else this.scheduleIdleTasks();
  }

  private updateFrameStats(frameStart: number): void {
    const d = performance.now() - frameStart;
    this.stats.frameUtilization = (d / 16.67) * 100;
    if (d > 16.67) this.stats.droppedFrames++;
  }

  private executeTask(task: ScheduledTask): void {
    if (task.cancelled || task.completed) return;
    const start = performance.now();
    try {
      task.callback();
      task.completed = true;
      task.executionTime = performance.now() - start;
      this.stats.tasksExecuted++;
      this.executionTimes.push(task.executionTime);
      if (this.executionTimes.length > 100) this.executionTimes.shift();
      this.stats.averageExecutionTime =
        this.executionTimes.reduce((a, b) => a + b, 0) /
        this.executionTimes.length;
    } catch (e) {
      console.error(`[Scheduler] Error:`, e);
      task.completed = true;
      task.executionTime = performance.now() - start;
    }
    this.pendingTasks.delete(task.id);
  }

  // Comprueba si requestIdleCallback está disponible
  private hasIdleCallback(): boolean {
    return typeof window !== 'undefined' && 'requestIdleCallback' in window;
  }

  private scheduleIdleTasks(): void {
    if (this.idleId !== null || !this.hasLowPriorityTasks()) return;

    if (this.hasIdleCallback()) {
      this.idleId = (window as any).requestIdleCallback(
        (d: IdleDeadline) => {
          this.idleId = null;
          this.processIdleTasks(d);
        },
        { timeout: this.config.idleTimeout },
      );
    } else {
      // Usar setTimeout como fallback
      this.idleId = window.setTimeout(() => {
        this.idleId = null;
        this.processIdleTasks({
          timeRemaining: () => 10,
          didTimeout: true,
        } as IdleDeadline);
      }, this.config.idleTimeout);
    }
  }

  private processIdleTasks(deadline: IdleDeadline): void {
    for (const p of ['idle', 'low'] as TaskPriority[]) {
      const q = this.queues.get(p)!;
      while (q.length > 0 && deadline.timeRemaining() > 1) {
        const t = q.shift()!;
        if (!t.cancelled) this.executeTask(t);
      }
    }
    if (this.getTotalPendingTasks() > 0) this.scheduleFrame();
  }

  private hasLowPriorityTasks(): boolean {
    return (
      (this.queues.get('idle')?.length || 0) > 0 ||
      (this.queues.get('low')?.length || 0) > 0
    );
  }

  private getTotalPendingTasks(): number {
    let c = 0;
    this.queues.forEach((q) => (c += q.length));
    return c;
  }

  private cleanCancelledTasks(): void {
    this.queues.forEach((q, p) =>
      this.queues.set(
        p,
        q.filter((t) => !t.cancelled),
      ),
    );
  }

  private calculateDeadline(p: TaskPriority): number {
    const n = performance.now();
    switch (p) {
      case 'immediate':
        return n;
      case 'high':
        return n + 16;
      case 'normal':
        return n + 50;
      case 'low':
        return n + 200;
      case 'idle':
        return n + 1000;
      default:
        return n + 50;
    }
  }

  private promoteStarvedTasks(): void {
    const now = performance.now();
    const T = 100;
    const lq = this.queues.get('low')!;
    const nq = this.queues.get('normal')!;
    const hq = this.queues.get('high')!;
    for (let i = lq.length - 1; i >= 0; i--) {
      if (now - lq[i].createdAt > T) {
        const t = lq.splice(i, 1)[0];
        t.priority = 'normal';
        nq.push(t);
      }
    }
    for (let i = nq.length - 1; i >= 0; i--) {
      if (now - nq[i].createdAt > T * 2) {
        const t = nq.splice(i, 1)[0];
        t.priority = 'high';
        hq.push(t);
      }
    }
  }

  start(): void {
    this.isRunning = true;
    if (this.getTotalPendingTasks() > 0) this.scheduleFrame();
  }

  stop(): void {
    this.isRunning = false;
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    if (this.idleId !== null) {
      if (this.hasIdleCallback()) {
        (window as any).cancelIdleCallback(this.idleId);
      } else {
        clearTimeout(this.idleId);
      }
      this.idleId = null;
    }
  }

  clear(): void {
    Scheduler.PRIORITY_ORDER.forEach((p) => this.queues.set(p, []));
    this.pendingTasks.clear();
    this.executionTimes = [];
  }

  getStats(): SchedulerStats {
    return { ...this.stats };
  }

  getPendingTaskCount(): number {
    return this.getTotalPendingTasks();
  }

  getPendingTasksByType(): Map<TaskType, number> {
    const m = new Map<TaskType, number>();
    this.queues.forEach((q) =>
      q
        .filter((t) => !t.cancelled && !t.completed)
        .forEach((t) => m.set(t.type, (m.get(t.type) || 0) + 1)),
    );
    return m;
  }

  getFrameBudget(): FrameBudget {
    const u = (this.stats.frameUtilization / 100) * 16.67;
    return {
      total: 16.67,
      used: u,
      remaining: Math.max(0, 16.67 - u),
      tasks: this.stats.tasksExecuted,
    };
  }

  destroy(): void {
    this.stop();
    this.clear();
    this.stats = {
      tasksExecuted: 0,
      tasksCancelled: 0,
      averageExecutionTime: 0,
      frameUtilization: 0,
      droppedFrames: 0,
    };
    this.executionTimes = [];
  }
}