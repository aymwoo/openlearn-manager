export interface ServiceStatus {
  is_running: bool;
  is_starting: bool;
  pid?: number | null;
  port: number;
  cli_version?: string | null;
  node_detected: boolean;
  node_path?: string | null;
  is_full_edition: boolean;
}

export type bool = boolean;

export interface PortCheckResult {
  available: boolean;
  occupied_by_self: boolean;
  message: string;
}

export interface LogEntry {
  /** 后端单调递增序号，前端按它去重，避免同一条日志渲染两次 */
  id: number;
  timestamp: string;
  stream: "stdout" | "stderr" | "system";
  message: string;
}

export interface BackupInfo {
  filename: string;
  filepath: string;
  size_bytes: number;
  created_at: string;
}

export interface AppConfig {
  port: number;
  cli_version?: string | null;
  db_path?: string | null;
  theme: string;
  npm_registry?: string | null;
}

export interface CommandOutputResult {
  success: boolean;
  output: string;
}

/** 数据落在哪个目录；portable 为 true 表示绿色版（便携）模式 */
export interface DataDirInfo {
  portable: boolean;
  path: string;
}

export type NavTab = "home" | "backups" | "logs" | "advanced" | "about";
