export type TaskPriority = 'immediate' | 'high' | 'normal' | 'low' | 'idle';
export type TaskType = 'scroll' | 'render' | 'measure' | 'recycle' | 'predict' | 'cleanup' | 'metrics';

export interface ScheduledTask {
  id: string;
  type: TaskType;
  priority: TaskPriority;
  callback: () => void;
  createdAt: number;
  deadline: number;
  cancelled: boolean;
  completed: boolean;
  executionTime?: number;
}

export interface SchedulerConfig {
  frameBudget: number;
  enableTimeSlicing: boolean;
  idleTimeout: number;
  maxTasksPerFrame: number;
  starvationPrevention: boolean;
}

export interface FrameBudget {
  total: number;
  used: number;
  remaining: number;
  tasks: number;
}

export interface SchedulerStats {
  tasksExecuted: number;
  tasksCancelled: number;
  averageExecutionTime: number;
  frameUtilization: number;
  droppedFrames: number;
}