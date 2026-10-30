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
}

export interface CommandOutputResult {
  success: boolean;
  output: string;
}

export type NavTab = "home" | "backups" | "logs" | "advanced" | "about";
