export interface ServerProcess {
  id: string;
  user: string;
  host?: string;
  database?: string;
  state: string;
  command?: string;
  durationSeconds: number;
  query?: string;
  waitEvent?: string;
  isBlocked: boolean;
}

export interface ActivitySummary {
  totalConnections: number;
  activeCount: number;
  idleCount: number;
  waitingCount: number;
  longRunningCount: number;
}
