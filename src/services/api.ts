import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppConfig,
  BackupInfo,
  CommandOutputResult,
  DataDirInfo,
  LogEntry,
  PortCheckResult,
  ServiceStatus,
} from "../types";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// Check URL query parameters for browser-based testing (?edition=full or ?full=true)
const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
const forceFullBrowser = urlParams?.get("edition") === "full" || urlParams?.get("full") === "true";

// Fallback in-memory state for browser preview & web testing
let mockStatus: ServiceStatus = {
  is_running: false,
  is_starting: false,
  pid: null,
  port: 9000,
  cli_version: "latest",
  node_detected: true,
  node_path: forceFullBrowser ? "resources/node/node (内嵌 Node 22 LTS)" : "/usr/bin/node",
  is_full_edition: forceFullBrowser,
};

let mockConfig: AppConfig = {
  port: 9000,
  cli_version: null,
  db_path: null,
  theme: "system",
};

let mockLogs: LogEntry[] = [
  {
    id: 0,
    timestamp: "19:40:02",
    stream: "system",
    message: forceFullBrowser
      ? "OpenLearn 管理器就绪，已加载 Full 安装版内嵌 Node 22 运行时 (resources/node/node)"
      : "OpenLearn 管理器就绪，已检测到系统 Node 运行时环境 (/usr/bin/node)",
  },
  {
    id: 1,
    timestamp: "19:40:02",
    stream: "system",
    message: "默认监听地址: 127.0.0.1:9000，等待启动指令...",
  },
];

let mockNextLogId = mockLogs.length;
const pushMockLog = (stream: LogEntry["stream"], message: string) => {
  mockLogs.push({
    id: mockNextLogId++,
    timestamp: new Date().toLocaleTimeString(),
    stream,
    message,
  });
};

let mockBackups: BackupInfo[] = [
  {
    filename: "openlearn-20261029-153022.db",
    filepath: "/home/wuxf/Documents/OpenLearn/backups/openlearn-20261029-153022.db",
    size_bytes: 4194304,
    created_at: "2026-10-29 15:30:22",
  },
  {
    filename: "openlearn-20261028-101500.db",
    filepath: "/home/wuxf/Documents/OpenLearn/backups/openlearn-20261028-101500.db",
    size_bytes: 2097152,
    created_at: "2026-10-28 10:15:00",
  },
];

export const api = {
  getStatus: async (): Promise<ServiceStatus> => {
    if (!isTauri) return { ...mockStatus };
    return await invoke<ServiceStatus>("get_status");
  },

  checkPort: async (port: number): Promise<PortCheckResult> => {
    if (!isTauri) {
      if (mockStatus.is_running && mockStatus.port === port) {
        return {
          available: false,
          occupied_by_self: true,
          message: `端口 ${port} 正在被当前 OpenLearn 管理器服务使用`,
        };
      }
      return {
        available: true,
        occupied_by_self: false,
        message: `端口 ${port} 可用`,
      };
    }
    return await invoke<PortCheckResult>("check_port", { port });
  },

  startService: async (
    port: number,
    cliVersion?: string | null,
    dbPath?: string | null,
    npmRegistry?: string | null
  ): Promise<void> => {
    if (!isTauri) {
      mockStatus.is_starting = true;
      await new Promise((r) => setTimeout(r, 600));
      mockStatus.is_running = true;
      mockStatus.is_starting = false;
      mockStatus.port = port;
      mockStatus.pid = 48921;
      mockStatus.cli_version = cliVersion || "latest";
      pushMockLog(
        "system",
        `服务已在端口 ${port} 启动 [PID: 48921]，访问地址: http://127.0.0.1:${port}`
      );
      return;
    }
    return await invoke<void>("start_service", {
      port,
      cliVersion: cliVersion || null,
      dbPath: dbPath || null,
      npmRegistry: npmRegistry || null,
    });
  },

  stopService: async (): Promise<void> => {
    if (!isTauri) {
      mockStatus.is_running = false;
      mockStatus.is_starting = false;
      mockStatus.pid = null;
      pushMockLog("system", "本地服务已完全停止。");
      return;
    }
    return await invoke<void>("stop_service");
  },

  getLogs: async (): Promise<LogEntry[]> => {
    if (!isTauri) return [...mockLogs];
    return await invoke<LogEntry[]>("get_logs");
  },

  clearLogs: async (): Promise<void> => {
    if (!isTauri) {
      mockLogs = [];
      return;
    }
    return await invoke<void>("clear_logs");
  },

  getConfig: async (): Promise<AppConfig> => {
    if (!isTauri) return { ...mockConfig };
    return await invoke<AppConfig>("get_config");
  },

  getDataDir: async (): Promise<DataDirInfo> => {
    if (!isTauri) return { portable: false, path: "" };
    return await invoke<DataDirInfo>("get_data_dir");
  },

  saveConfig: async (cfg: AppConfig): Promise<void> => {
    if (!isTauri) {
      mockConfig = { ...cfg };
      return;
    }
    return await invoke<void>("save_config", { cfg });
  },

  getBackups: async (): Promise<BackupInfo[]> => {
    if (!isTauri) return [...mockBackups];
    return await invoke<BackupInfo[]>("get_backups");
  },

  createBackup: async (): Promise<BackupInfo> => {
    if (!isTauri) {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
        now.getDate()
      )}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const filename = `openlearn-${stamp}.db`;
      const newBackup: BackupInfo = {
        filename,
        filepath: `/home/wuxf/Documents/OpenLearn/backups/${filename}`,
        size_bytes: 4210000,
        created_at: now.toLocaleString(),
      };
      mockBackups.unshift(newBackup);
      return newBackup;
    }
    return await invoke<BackupInfo>("create_backup");
  },

  restoreBackup: async (filepath: string, force = false): Promise<void> => {
    if (!isTauri) {
      mockStatus.is_running = false;
      mockStatus.pid = null;
      pushMockLog(
        "system",
        `数据库快照恢复成功: ${filepath}${force ? "（已放行迁移兼容性拦截）" : ""}`
      );
      return;
    }
    return await invoke<void>("restore_backup", { filepath, force });
  },

  openBackupDirectory: async (): Promise<void> => {
    if (!isTauri) {
      console.log("Mock openBackupDirectory");
      return;
    }
    return await invoke<void>("open_backup_directory");
  },

  runCliCommand: async (
    commandType: string,
    extraArg?: string | null
  ): Promise<CommandOutputResult> => {
    if (!isTauri) {
      return {
        success: true,
        output: `[CLI 执行报告] 命令: ${commandType} ${extraArg || ""}\n状态: 正常通过\nNode.js: v24.1.0\n依赖包: openlearn-next@latest\n检查结果: 所有体检项均符合预期。`,
      };
    }
    return await invoke<CommandOutputResult>("run_cli_command", {
      commandType,
      extraArg: extraArg || null,
    });
  },

  previewCommand: async (
    port: number,
    cliVersion?: string | null,
    dbPath?: string | null
  ): Promise<string> => {
    const pkg = cliVersion?.trim() ? `openlearn-next@${cliVersion.trim()}` : "openlearn-next@latest";
    // openlearn-next 启动服务不带子命令（没有 `start`）
    let cmd = `npx ${pkg} -p ${port} -H 127.0.0.1`;
    if (dbPath?.trim()) {
      cmd += ` --db-path "${dbPath.trim()}"`;
    }
    return cmd;
  },

  openBrowser: async (port: number): Promise<void> => {
    if (!isTauri) {
      window.open(`http://127.0.0.1:${port}`, "_blank");
      return;
    }
    return await invoke<void>("open_browser", { port });
  },

  exitApp: async (stopServiceFirst: boolean): Promise<void> => {
    if (!isTauri) {
      console.log(`Mock exitApp (stopFirst: ${stopServiceFirst})`);
      return;
    }
    return await invoke<void>("exit_app", { stopServiceFirst });
  },

  hideToTray: async (): Promise<void> => {
    if (!isTauri) {
      console.log("Mock hideToTray");
      return;
    }
    return await invoke<void>("hide_to_tray");
  },

  // Event Listeners
  onLogLine: (callback: (entry: LogEntry) => void): Promise<UnlistenFn> => {
    if (!isTauri) {
      return Promise.resolve(() => {});
    }
    return listen<LogEntry>("app:log-line", (event) => callback(event.payload));
  },

  onServiceStatusChanged: (callback: () => void): Promise<UnlistenFn> => {
    if (!isTauri) {
      return Promise.resolve(() => {});
    }
    return listen("app:service-status-changed", () => callback());
  },

  onConfirmClose: (callback: () => void): Promise<UnlistenFn> => {
    if (!isTauri) {
      return Promise.resolve(() => {});
    }
    return listen("app:confirm-close", () => callback());
  },
};
