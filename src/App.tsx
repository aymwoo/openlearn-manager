import React, { useState, useEffect, useCallback } from "react";
import type { AppConfig, LogEntry, NavTab, ServiceStatus } from "./types";
import { api } from "./services/api";
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
  const [config, setConfig] = useState<AppConfig>({
    port: 3000,
    cli_version: null,
    db_path: null,
    theme: "system",
  });
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
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 antialiased font-sans">
      {/* Left Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        status={status}
      />

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
