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
  Terminal as TerminalIcon,
  Copy,
  Check,
} from "lucide-react";
import type { LogEntry, NavTab, ServiceStatus } from "../types";
import { api } from "../services/api";
import { LogConsole, formatLogText } from "../components/LogConsole";
import { stripAnsi } from "../utils/ansi";

interface HomePageProps {
  status: ServiceStatus | null;
  logs: LogEntry[];
  onRefreshStatus: () => Promise<void>;
  onNavigateTab: (tab: NavTab) => void;
  configuredPort: number;
  onUpdatePort: (port: number) => void;
  cliVersion?: string | null;
  dbPath?: string | null;
  npmRegistry?: string | null;
}

export const HomePage: React.FC<HomePageProps> = ({
  status,
  logs,
  onRefreshStatus,
  onNavigateTab,
  configuredPort,
  onUpdatePort,
  cliVersion,
  dbPath,
  npmRegistry,
}) => {
  const [portInput, setPortInput] = useState<number>(configuredPort);
  // idle | start | stop —— 用于区分「正在等待服务就绪」和「正在停止」
  const [opMode, setOpMode] = useState<"idle" | "start" | "stop">("idle");
  const [startElapsed, setStartElapsed] = useState(0);
  const [portCheckResult, setPortCheckResult] = useState<{
    tested: boolean;
    available: boolean;
    message: string;
  } | null>(null);
  const [failureError, setFailureError] = useState<string | null>(null);

  const isStartingOrStopping = opMode !== "idle";

  // 启动等待计时：后端会一直阻塞到端口真正监听或超时，这里如实反映等待时长
  useEffect(() => {
    if (opMode !== "start") {
      setStartElapsed(0);
      return;
    }
    const timer = window.setInterval(() => setStartElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [opMode]);

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
    setOpMode("start");
    try {
      const pRes = await api.checkPort(portInput);
      if (!pRes.available && !pRes.occupied_by_self) {
        setPortCheckResult({
          tested: true,
          available: false,
          message: pRes.message,
        });
        setOpMode("idle");
        return;
      }

      // 后端只在「端口真的开始监听」后才 resolve，否则抛错
      await api.startService(portInput, cliVersion, dbPath, npmRegistry);
      onUpdatePort(portInput);
      await onRefreshStatus();
    } catch (err: any) {
      setFailureError(typeof err === "string" ? err : err?.message || "启动服务发生未知异常");
      await onRefreshStatus();
    } finally {
      setOpMode("idle");
    }
  };

  const handleStop = async () => {
    setOpMode("stop");
    try {
      await api.stopService();
      await onRefreshStatus();
    } catch (err: any) {
      setFailureError(typeof err === "string" ? err : err?.message || "停止服务失败");
    } finally {
      setOpMode("idle");
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
  const [logCopied, setLogCopied] = useState(false);

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(formatLogText(logs));
      setLogCopied(true);
      setTimeout(() => setLogCopied(false), 2000);
    } catch (err) {
      console.error("复制日志失败", err);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-100/70 dark:bg-slate-950 p-8 space-y-6 transition-colors duration-200">
      {/* Top Red Banner for Missing Node (Lite Mode) */}
      {isNodeMissing && (
        <div className="bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800/80 rounded-2xl p-4 flex items-center justify-between shadow-sm dark:shadow-lg dark:shadow-rose-950/40 animate-in fade-in">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400">
              <XCircle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                未检测到系统 Node.js 运行时
              </h4>
              <p className="text-xs text-rose-700/80 dark:text-rose-300/80 mt-0.5">
                当前运行为 Lite 便携版，依赖本机 Node.js 22 LTS 环境。请先安装后再启动服务。
              </p>
            </div>
          </div>
          <button
            onClick={() => window.open("https://nodejs.org", "_blank")}
            className="flex items-center space-x-1.5 text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-100 hover:bg-rose-200 dark:bg-rose-900/60 dark:hover:bg-rose-800 px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-700 transition cursor-pointer"
          >
            <span>前往下载 Node.js</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Status & Hero Section */}
      <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm dark:shadow-xl space-y-6 transition-colors duration-200">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-5">
          <div className="space-y-1">
            <div className="flex items-center space-x-2.5">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                服务运行状态
              </h2>
              {/* Badge for CLI version */}
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60 font-medium">
                {cliVersion ? `v${cliVersion}` : "openlearn-next@latest"}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              单机单实例薄封装管理，直接调度底层 openlearn-next CLI
            </p>
          </div>

          <button
            onClick={onRefreshStatus}
            title="刷新状态"
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/60 transition cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* State Indicator Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                  isRunning
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-2 ring-emerald-500/20"
                    : isStarting
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-2 ring-amber-500/20 animate-pulse"
                    : failureError
                    ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 ring-2 ring-rose-500/20"
                    : "bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
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
                  <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {isRunning
                      ? "本地服务运行中"
                      : isStarting
                      ? "正在拉起本地服务..."
                      : failureError
                      ? "服务启动失败"
                      : "本地服务未启动"}
                  </span>
                  {status?.pid && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      PID: {status.pid}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {isRunning
                    ? `已确认服务正在监听 http://127.0.0.1:${status?.port}`
                    : opMode === "start"
                    ? `正在等待端口 ${portInput} 真正开始响应... 已等待 ${startElapsed}s（首次启动需下载 CLI 包，上限 180s）`
                    : "点击右侧按钮启动本地 OpenLearn 服务"}
                </p>
              </div>
            </div>

            {/* Quick Open Browser Pill */}
            {isRunning && (
              <button
                onClick={handleOpenBrowser}
                className="flex items-center space-x-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 px-3.5 py-2 rounded-xl border border-blue-200 dark:border-blue-800/60 transition cursor-pointer"
              >
                <span>立即进入</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Runtime Type Card */}
          <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              版本分发模式
            </span>
            <div className="mt-1">
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {status?.is_full_edition ? "Full 安装版 (内嵌 Node 22)" : "Lite 便携版 (系统 Node)"}
              </span>
              <p
                className="text-[11px] text-slate-500 mt-0.5 truncate font-mono"
                title={status?.node_path || "未检测到"}
              >
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
              className="flex-1 min-w-[160px] flex items-center justify-center space-x-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-medium text-sm py-3 px-6 rounded-2xl shadow-md shadow-blue-600/20 transition cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>
                {opMode === "start"
                  ? `等待服务就绪... ${startElapsed}s`
                  : "启动服务"}
              </span>
            </button>
          ) : (
            <button
              onClick={handleStop}
              disabled={isStarting}
              className="flex-1 min-w-[160px] flex items-center justify-center space-x-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-medium text-sm py-3 px-6 rounded-2xl shadow-md shadow-rose-600/20 transition cursor-pointer"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>{opMode === "stop" ? "正在停止..." : "停止服务"}</span>
            </button>
          )}

          <button
            onClick={handleOpenBrowser}
            disabled={!isRunning}
            className="flex-1 min-w-[160px] flex items-center justify-center space-x-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-800 dark:text-slate-200 font-medium text-sm py-3 px-6 rounded-2xl border border-slate-300 dark:border-slate-700 transition cursor-pointer"
          >
            <ExternalLink className="w-4 h-4" />
            <span>打开浏览器</span>
          </button>
        </div>
      </div>

      {/* 内嵌实时日志：启动/停止过程中的真实输出直接在首页可见 */}
      <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm dark:shadow-xl space-y-3 transition-colors duration-200">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <TerminalIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-200">
                运行日志
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                CLI 实时输出（最近 {Math.min(logs.length, 200)} 条，完整内容见日志页）
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopyLogs}
              disabled={logs.length === 0}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-300 dark:border-slate-700 transition cursor-pointer"
            >
              {logCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-600 dark:text-emerald-400">已复制</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>复制</span>
                </>
              )}
            </button>
            <button
              onClick={() => onNavigateTab("logs")}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-300 dark:border-slate-700 transition cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>完整日志</span>
            </button>
          </div>
        </div>

        <LogConsole
          logs={logs}
          maxRows={200}
          className="h-52"
          emptyHint="暂无日志输出，点击「启动服务」后将在此实时显示 CLI 输出"
          footer={
            <>
              <span>共 {logs.length} 条记录</span>
              <span>自动滚动至最新</span>
            </>
          }
        />
      </div>

      {/* Network & Port Settings Section */}
      <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm dark:shadow-xl space-y-5 transition-colors duration-200">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-200">
          网络与端口配置
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Host - Fixed to 127.0.0.1 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center justify-between">
              <span>监听主机 (-H)</span>
              <span className="text-[11px] text-slate-500 flex items-center space-x-1">
                <Lock className="w-3 h-3" />
                <span>固定安全绑定</span>
              </span>
            </label>
            <div className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-600 dark:text-slate-400 text-sm font-mono">
              <Lock className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              <span>127.0.0.1</span>
            </div>
            <p className="text-[11px] text-slate-500">
              为保障教学电脑安全，本应用严格限制仅监听本机回环地址。
            </p>
          </div>

          {/* Port input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center justify-between">
              <span>本地端口 (-p)</span>
              <span className="text-[11px] text-slate-500">默认 9000</span>
            </label>
            <div className="flex space-x-2">
              <input
                type="number"
                min={1024}
                max={65535}
                disabled={isRunning || isStarting}
                value={portInput}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 9000;
                  setPortInput(val);
                  setPortCheckResult(null);
                }}
                className="flex-1 bg-slate-50 dark:bg-slate-950/70 border border-slate-300 dark:border-slate-800 disabled:opacity-50 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-hidden focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleCheckPort}
                disabled={isRunning}
                className="px-3.5 py-2.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 transition cursor-pointer shrink-0"
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
                ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300"
                : "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300"
            }`}
          >
            {portCheckResult.available ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            )}
            <div>
              <p className="font-medium">{portCheckResult.message}</p>
              {!portCheckResult.available && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400/80 mt-1">
                  提示：本应用不会主动强杀非本程序创建的外部进程，请尝试调整端口号（例如 3001 或 8080）。
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Start Failure Notice Modal / Box */}
      {failureError && (
        <div className="bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-2xl p-4 flex items-start justify-between gap-4 shadow-sm dark:shadow-xl animate-in fade-in">
          <div className="flex items-start space-x-3 min-w-0">
            <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-rose-900 dark:text-rose-200">
                服务未能真正启动
              </p>
              <p className="text-xs text-rose-700 dark:text-rose-300/80 mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                {stripAnsi(failureError)}
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab("logs")}
            className="flex items-center space-x-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 transition cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>查看完整日志</span>
          </button>
        </div>
      )}
    </div>
  );
};
