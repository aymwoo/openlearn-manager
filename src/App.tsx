import React, { useState, useEffect, useCallback } from "react";
import { ZoomIn } from "lucide-react";
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
    port: 3000,
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

    // 3. Load initial logs
    api
      .getLogs()
      .then(setLogs)
      .catch((err) => console.error("获取日志失败", err));

    // 4. Setup Event Listeners
    let unlistenLog: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;
    let unlistenClose: (() => void) | undefined;

    api.onLogLine((entry) => {
      setLogs((prev) => {
        const next = [...prev, entry];
        return next.length > 2000 ? next.slice(next.length - 2000) : next;
      });
    }).then((un) => {
      unlistenLog = un;
    });

    api.onServiceStatusChanged(() => {
      refreshStatus();
    }).then((un) => {
      unlistenStatus = un;
    });

    api.onConfirmClose(() => {
      setShowConfirmClose(true);
    }).then((un) => {
      unlistenClose = un;
    });

    return () => {
      unlistenLog?.();
      unlistenStatus?.();
      unlistenClose?.();
    };
  }, [refreshStatus]);

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
    await api.clearLogs();
    setLogs([]);
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
            onRefreshStatus={refreshStatus}
            onNavigateTab={setCurrentTab}
            configuredPort={config.port}
            onUpdatePort={handleUpdatePort}
            cliVersion={config.cli_version}
            dbPath={config.db_path}
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
