import React, { useState, useEffect, useCallback, useRef } from "react";
import { ZoomIn } from "lucide-react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { AppConfig, LogEntry, NavTab, ServiceStatus } from "./types";
import { api } from "./services/api";
import { useZoom } from "./hooks/useZoom";
import { useTheme } from "./hooks/useTheme";
import { Sidebar } from "./components/Sidebar";
import { ConfirmCloseModal } from "./components/ConfirmCloseModal";
import { HomePage } from "./pages/HomePage";
import { BackupsPage } from "./pages/BackupsPage";
import { LogsPage } from "./pages/LogsPage";
import { AdvancedPage } from "./pages/AdvancedPage";
import { AboutPage } from "./pages/AboutPage";

export const App: React.FC = () => {
  const getInitialTab = (): NavTab => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace("#", "");
      if (["home", "backups", "logs", "advanced", "about"].includes(hash)) {
        return hash as NavTab;
      }
    }
    return "home";
  };

  const [currentTab, setCurrentTabState] = useState<NavTab>(getInitialTab);

  const setCurrentTab = (tab: NavTab) => {
    setCurrentTabState(tab);
    if (typeof window !== "undefined") {
      window.location.hash = tab;
    }
  };
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const { zoomLevel, zoomIn, zoomOut, resetZoom, toastMessage } = useZoom();
  const [config, setConfig] = useState<AppConfig>({
    port: 9000,
    cli_version: null,
    db_path: null,
    theme: "system",
  });

  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme(
    config.theme,
    (newTheme) => {
      const updated = { ...config, theme: newTheme };
      api.saveConfig(updated).catch(console.error);
      setConfig(updated);
    }
  );
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  // 已渲染过的最大日志 id。后端序号单调递增，重复投递的同 id 条目直接丢弃
  const lastLogIdRef = useRef(-1);

  /** 追加日志：按 id 去重后并入，并维持 2000 行上限 */
  const appendLogs = useCallback((incoming: LogEntry[]) => {
    if (incoming.length === 0) return;
    const fresh = incoming.filter((e) => {
      const id = typeof e.id === "number" ? e.id : -1;
      if (id < 0) return true; // 老数据没有 id，无法去重，直接放行
      if (id <= lastLogIdRef.current) return false;
      lastLogIdRef.current = id;
      return true;
    });
    if (fresh.length === 0) return;
    setLogs((prev) => {
      const next = [...prev, ...fresh];
      return next.length > 2000 ? next.slice(next.length - 2000) : next;
    });
  }, []);

  // Refresh status from Tauri backend
  const refreshStatus = useCallback(async () => {
    try {
      const res = await api.getStatus();
      setStatus(res);
    } catch (err) {
      console.error("获取服务状态失败", err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    // 1. Load config
    api
      .getConfig()
      .then((cfg) => {
        setConfig(cfg);
      })
      .catch((err) => console.error("获取配置失败", err));

    // 2. Load status
    refreshStatus();

    // 3. Load initial logs（用同一条去重通道，避免与实时事件重叠时重复渲染）
    api
      .getLogs()
      .then((initial) => {
        lastLogIdRef.current = -1;
        setLogs([]);
        appendLogs(initial);
      })
      .catch((err) => console.error("获取日志失败", err));

    // 4. Setup Event Listeners
    // 注意：listen() 是异步的，而 StrictMode（以及 HMR）会在 promise 落地之前
    // 就先跑 cleanup。若 cleanup 只调用「已保存的 unlisten」，第一次注册的监听
    // 就会泄漏，导致每条日志被两个 handler 各追加一次 —— 也就是看到两遍。
    let disposed = false;
    const teardowns: UnlistenFn[] = [];
    const register = (p: Promise<UnlistenFn>) => {
      p.then((un) => {
        if (disposed) {
          // 已卸载：立刻撤销这次迟到的注册
          un();
          return;
        }
        teardowns.push(un);
      }).catch((err) => console.error("注册事件监听失败", err));
    };

    register(api.onLogLine((entry) => appendLogs([entry])));
    register(api.onServiceStatusChanged(() => refreshStatus()));
    register(api.onConfirmClose(() => setShowConfirmClose(true)));

    return () => {
      disposed = true;
      teardowns.forEach((un) => un());
      teardowns.length = 0;
    };
  }, [refreshStatus, appendLogs]);

  const handleSaveConfig = async (newCfg: AppConfig) => {
    await api.saveConfig(newCfg);
    setConfig(newCfg);
  };

  const handleUpdatePort = async (newPort: number) => {
    const updated = { ...config, port: newPort };
    await api.saveConfig(updated);
    setConfig(updated);
  };

  const handleClearLogs = async () => {
    // 先清本地再让后端清：后端清空后会推送一条「日志已被清空。」，
    // 若等它回来再置空，这条提示会被一起抹掉
    setLogs([]);
    await api.clearLogs();
  };

  const handleStopAndExit = async () => {
    setShowConfirmClose(false);
    await api.exitApp(true);
  };

  const handleMinimizeToTray = async () => {
    setShowConfirmClose(false);
    await api.hideToTray();
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased font-sans transition-colors duration-200">
      {/* Left Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        status={status}
        zoomLevel={zoomLevel}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={resetZoom}
        theme={theme}
        resolvedTheme={resolvedTheme}
        onToggleTheme={toggleTheme}
      />

      {/* Floating Zoom Toast */}
      {toastMessage && (
        <div className="fixed top-5 right-6 z-50 bg-slate-900/95 border border-blue-500/50 text-blue-300 font-medium text-xs px-3.5 py-2 rounded-xl shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 pointer-events-none flex items-center space-x-2">
          <ZoomIn className="w-3.5 h-3.5 text-blue-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden">
        {currentTab === "home" && (
          <HomePage
            status={status}
            logs={logs}
            onRefreshStatus={refreshStatus}
            onNavigateTab={setCurrentTab}
            configuredPort={config.port}
            onUpdatePort={handleUpdatePort}
            cliVersion={config.cli_version}
            dbPath={config.db_path}
            npmRegistry={config.npm_registry}
          />
        )}
        {currentTab === "backups" && (
          <BackupsPage onRefreshStatus={refreshStatus} />
        )}
        {currentTab === "logs" && (
          <LogsPage logs={logs} onClearLogs={handleClearLogs} />
        )}
        {currentTab === "advanced" && (
          <AdvancedPage
            config={config}
            onSaveConfig={handleSaveConfig}
            currentPort={status?.port || config.port}
            theme={theme}
            onSetTheme={setTheme}
          />
        )}
        {currentTab === "about" && <AboutPage status={status} />}
      </main>

      {/* Window Close Confirmation Modal */}
      <ConfirmCloseModal
        isOpen={showConfirmClose}
        onStopAndExit={handleStopAndExit}
        onMinimizeToTray={handleMinimizeToTray}
        onCancel={() => setShowConfirmClose(false)}
      />
    </div>
  );
};

export default App;
