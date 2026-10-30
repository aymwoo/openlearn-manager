import React, { useState, useEffect } from "react";
import {
  Play,
  Square,
  ExternalLink,
  Lock,
  RefreshCw,
  AlertTriangle,
  FileText,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { NavTab, ServiceStatus } from "../types";
import { api } from "../services/api";

interface HomePageProps {
  status: ServiceStatus | null;
  onRefreshStatus: () => Promise<void>;
  onNavigateTab: (tab: NavTab) => void;
  configuredPort: number;
  onUpdatePort: (port: number) => void;
  cliVersion?: string | null;
  dbPath?: string | null;
}

export const HomePage: React.FC<HomePageProps> = ({
  status,
  onRefreshStatus,
  onNavigateTab,
  configuredPort,
  onUpdatePort,
  cliVersion,
  dbPath,
}) => {
  const [portInput, setPortInput] = useState<number>(configuredPort);
  const [isStartingOrStopping, setIsStartingOrStopping] = useState(false);
  const [portCheckResult, setPortCheckResult] = useState<{
    tested: boolean;
    available: boolean;
    message: string;
  } | null>(null);
  const [failureError, setFailureError] = useState<string | null>(null);

  useEffect(() => {
    setPortInput(configuredPort);
  }, [configuredPort]);

  const handleCheckPort = async () => {
    try {
      const res = await api.checkPort(portInput);
      setPortCheckResult({
        tested: true,
        available: res.available || res.occupied_by_self,
        message: res.message,
      });
    } catch (err) {
      setPortCheckResult({
        tested: true,
        available: false,
        message: `检查失败: ${err}`,
      });
    }
  };

  const handleStart = async () => {
    setFailureError(null);
    setIsStartingOrStopping(true);
    try {
      // Check port first
      const pRes = await api.checkPort(portInput);
      if (!pRes.available && !pRes.occupied_by_self) {
        setPortCheckResult({
          tested: true,
          available: false,
          message: pRes.message,
        });
        setIsStartingOrStopping(false);
        return;
      }

      await api.startService(portInput, cliVersion, dbPath);
      onUpdatePort(portInput);
      await onRefreshStatus();
    } catch (err: any) {
      setFailureError(typeof err === "string" ? err : err?.message || "启动服务发生未知异常");
    } finally {
      setIsStartingOrStopping(false);
    }
  };

  const handleStop = async () => {
    setIsStartingOrStopping(true);
    try {
      await api.stopService();
      await onRefreshStatus();
    } catch (err: any) {
      setFailureError(typeof err === "string" ? err : err?.message || "停止服务失败");
    } finally {
      setIsStartingOrStopping(false);
    }
  };

  const handleOpenBrowser = async () => {
    try {
      await api.openBrowser(status?.port || portInput);
    } catch (err) {
      console.error(err);
    }
  };

  const isRunning = status?.is_running ?? false;
  const isStarting = status?.is_starting || isStartingOrStopping;
  const isNodeMissing = !(status?.node_detected ?? true);

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-950 p-8 space-y-6">
      {/* Top Red Banner for Missing Node (Lite Mode) */}
      {isNodeMissing && (
        <div className="bg-rose-950/80 border border-rose-800/80 rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-rose-950/40 animate-in fade-in">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400">
              <XCircle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-rose-200">
                未检测到系统 Node.js 运行时
              </h4>
              <p className="text-xs text-rose-300/80 mt-0.5">
                当前运行为 Lite 便携版，依赖本机 Node.js 22 LTS 环境。请先安装后再启动服务。
              </p>
            </div>
          </div>
          <button
            onClick={() => api.openBrowser(1420).catch(() => window.open("https://nodejs.org", "_blank"))}
            className="flex items-center space-x-1.5 text-xs font-medium text-rose-300 bg-rose-900/60 hover:bg-rose-800 px-3 py-1.5 rounded-lg border border-rose-700 transition cursor-pointer"
          >
            <span>前往下载 Node.js</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Status & Hero Section */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-5">
          <div className="space-y-1">
            <div className="flex items-center space-x-2.5">
              <h2 className="text-lg font-semibold text-slate-100">服务运行状态</h2>
              {/* Badge for CLI version */}
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-blue-950 text-blue-400 border border-blue-800/60 font-medium">
                {cliVersion ? `v${cliVersion}` : "openlearn-next@latest"}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              单机单实例薄封装管理，直接调度底层 openlearn-next CLI
            </p>
          </div>

          <button
            onClick={onRefreshStatus}
            title="刷新状态"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* State Indicator Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 bg-slate-950/60 border border-slate-800/80 rounded-2xl p-5 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                  isRunning
                    ? "bg-emerald-500/15 text-emerald-400 ring-2 ring-emerald-500/20"
                    : isStarting
                    ? "bg-amber-500/15 text-amber-400 ring-2 ring-amber-500/20 animate-pulse"
                    : failureError
                    ? "bg-rose-500/15 text-rose-400 ring-2 ring-rose-500/20"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                {isRunning ? (
                  <CheckCircle2 className="w-6 h-6" />
                ) : isStarting ? (
                  <RefreshCw className="w-6 h-6 animate-spin" />
                ) : failureError ? (
                  <XCircle className="w-6 h-6" />
                ) : (
                  <Square className="w-6 h-6" />
                )}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-base font-semibold text-slate-100">
                    {isRunning
                      ? "本地服务运行中"
                      : isStarting
                      ? "正在拉起本地服务..."
                      : failureError
                      ? "服务启动失败"
                      : "本地服务未启动"}
                  </span>
                  {status?.pid && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      PID: {status.pid}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {isRunning
                    ? `服务正在监听 http://127.0.0.1:${status?.port}`
                    : "点击右侧按钮启动本地 OpenLearn 服务"}
                </p>
              </div>
            </div>

            {/* Quick Open Browser Pill */}
            {isRunning && (
              <button
                onClick={handleOpenBrowser}
                className="flex items-center space-x-1.5 text-xs font-medium text-blue-400 bg-blue-950/50 hover:bg-blue-900/60 px-3.5 py-2 rounded-xl border border-blue-800/60 transition cursor-pointer"
              >
                <span>立即进入</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Runtime Type Card */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <span className="text-xs text-slate-400 font-medium">版本分发模式</span>
            <div className="mt-1">
              <span className="text-sm font-semibold text-slate-200">
                {status?.is_full_edition ? "Full 安装版 (内嵌 Node 22)" : "Lite 便携版 (系统 Node)"}
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate" title={status?.node_path || "未检测到"}>
                {status?.node_path || "未绑定 Node 路径"}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls Cluster */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {!isRunning ? (
            <button
              onClick={handleStart}
              disabled={isStarting || isNodeMissing}
              className="flex-1 min-w-[160px] flex items-center justify-center space-x-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-medium text-sm py-3 px-6 rounded-2xl shadow-lg shadow-blue-600/20 transition cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{isStarting ? "正在启动..." : "启动服务"}</span>
            </button>
          ) : (
            <button
              onClick={handleStop}
              disabled={isStarting}
              className="flex-1 min-w-[160px] flex items-center justify-center space-x-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-medium text-sm py-3 px-6 rounded-2xl shadow-lg shadow-rose-600/20 transition cursor-pointer"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>{isStarting ? "正在停止..." : "停止服务"}</span>
            </button>
          )}

          <button
            onClick={handleOpenBrowser}
            disabled={!isRunning}
            className="flex-1 min-w-[160px] flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-medium text-sm py-3 px-6 rounded-2xl border border-slate-700 transition cursor-pointer"
          >
            <ExternalLink className="w-4 h-4" />
            <span>打开浏览器</span>
          </button>
        </div>
      </div>

      {/* Network & Port Settings Section */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
        <h3 className="text-sm font-semibold text-slate-200">网络与端口配置</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Host - Fixed to 127.0.0.1 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 flex items-center justify-between">
              <span>监听主机 (-H)</span>
              <span className="text-[11px] text-slate-500 flex items-center space-x-1">
                <Lock className="w-3 h-3" />
                <span>固定安全绑定</span>
              </span>
            </label>
            <div className="flex items-center space-x-2 bg-slate-950/70 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-400 text-sm font-mono">
              <Lock className="w-4 h-4 text-slate-500" />
              <span>127.0.0.1</span>
            </div>
            <p className="text-[11px] text-slate-500">
              为保障教学电脑安全，本应用严格限制仅监听本机回环地址。
            </p>
          </div>

          {/* Port input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 flex items-center justify-between">
              <span>本地端口 (-p)</span>
              <span className="text-[11px] text-slate-500">默认 3000</span>
            </label>
            <div className="flex space-x-2">
              <input
                type="number"
                min={1024}
                max={65535}
                disabled={isRunning || isStarting}
                value={portInput}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 3000;
                  setPortInput(val);
                  setPortCheckResult(null);
                }}
                className="flex-1 bg-slate-950/70 border border-slate-800 disabled:opacity-50 rounded-xl px-3.5 py-2.5 text-slate-100 text-sm font-mono focus:outline-hidden focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleCheckPort}
                disabled={isRunning}
                className="px-3.5 py-2.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-xl border border-slate-700 transition cursor-pointer shrink-0"
              >
                检测占用
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              服务启动前将自动探测端口可用性。
            </p>
          </div>
        </div>

        {/* Port Conflict Alert */}
        {portCheckResult && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-start space-x-2.5 animate-in fade-in ${
              portCheckResult.available
                ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
                : "bg-amber-950/40 border-amber-800/60 text-amber-300"
            }`}
          >
            {portCheckResult.available ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            )}
            <div>
              <p className="font-medium">{portCheckResult.message}</p>
              {!portCheckResult.available && (
                <p className="text-[11px] text-amber-400/80 mt-1">
                  提示：本应用不会主动强杀非本程序创建的外部进程，请尝试调整端口号（例如 3001 或 8080）。
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Start Failure Notice Modal / Box */}
      {failureError && (
        <div className="bg-rose-950/60 border border-rose-800 rounded-2xl p-4 flex items-center justify-between shadow-xl animate-in fade-in">
          <div className="flex items-center space-x-3">
            <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-rose-200">启动服务出现错误</p>
              <p className="text-xs text-rose-300/80 mt-0.5 max-w-xl truncate">
                {failureError}
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab("logs")}
            className="flex items-center space-x-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>查看完整日志</span>
          </button>
        </div>
      )}
    </div>
  );
};
