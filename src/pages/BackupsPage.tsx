import React, { useState, useEffect } from "react";
import {
  FolderOpen,
  Plus,
  RefreshCw,
  Archive,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  HardDrive,
} from "lucide-react";
import type { BackupInfo } from "../types";
import { api } from "../services/api";

interface BackupsPageProps {
  onRefreshStatus: () => Promise<void>;
}

export const BackupsPage: React.FC<BackupsPageProps> = ({
  onRefreshStatus,
}) => {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupInfo | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccessPrompt, setRestoreSuccessPrompt] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadBackups = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const list = await api.getBackups();
      setBackups(list);
    } catch (err: any) {
      setErrorMessage(`加载备份列表失败: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBackups();
  }, []);

  const handleCreateBackup = async () => {
    setIsBackingUp(true);
    setErrorMessage(null);
    try {
      await api.createBackup();
      await loadBackups();
    } catch (err: any) {
      setErrorMessage(`创建备份失败: ${err}`);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await api.openBackupDirectory();
    } catch (err: any) {
      setErrorMessage(`打开备份目录失败: ${err}`);
    }
  };

  const handleConfirmRestore = async () => {
    if (!restoreTarget) return;
    setIsRestoring(true);
    setErrorMessage(null);
    try {
      // 1. Auto stops service if running (handled in Rust backend as well)
      await api.restoreBackup(restoreTarget.filepath);
      await onRefreshStatus();
      setRestoreTarget(null);
      setRestoreSuccessPrompt(true);
    } catch (err: any) {
      setErrorMessage(`恢复备份失败: ${err}`);
      setRestoreTarget(null);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleRestartService = async () => {
    setRestoreSuccessPrompt(false);
    try {
      const cfg = await api.getConfig();
      await api.startService(cfg.port, cfg.cli_version, cfg.db_path);
      await onRefreshStatus();
    } catch (err: any) {
      setErrorMessage(`重启服务失败: ${err}`);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-950 p-8 space-y-6">
      {/* Header bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center space-x-2.5">
            <h2 className="text-lg font-semibold text-slate-100">数据库备份与恢复</h2>
            <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
              {backups.length} 个快照
            </span>
          </div>
          <p className="text-xs text-slate-400">
            备份目录固定为本地 Documents/OpenLearn/backups，文件按时间戳自动命名
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleOpenFolder}
            className="flex items-center space-x-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2.5 rounded-xl border border-slate-700 transition cursor-pointer"
          >
            <FolderOpen className="w-4 h-4 text-blue-400" />
            <span>打开所在文件夹</span>
          </button>

          <button
            onClick={handleCreateBackup}
            disabled={isBackingUp}
            className="flex items-center space-x-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl shadow-md shadow-blue-500/20 transition cursor-pointer"
          >
            {isBackingUp ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            <span>{isBackingUp ? "正在备份..." : "新建备份"}</span>
          </button>
        </div>
      </div>

      {/* Error alert */}
      {errorMessage && (
        <div className="bg-rose-950/60 border border-rose-800 rounded-2xl p-4 text-xs text-rose-300 flex items-center space-x-3 animate-in fade-in">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Backup list container */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl flex-1 flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
          <div className="flex items-center space-x-2 text-xs font-medium text-slate-300">
            <HardDrive className="w-4 h-4 text-slate-400" />
            <span>备份快照列表</span>
          </div>
          <button
            onClick={loadBackups}
            disabled={isLoading}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {backups.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center space-y-3 text-slate-500">
            <Archive className="w-10 h-10 stroke-[1.5] text-slate-600" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-400">暂无备份文件</p>
              <p className="text-xs text-slate-500">
                点击右上角“新建备份”按钮，创建首个数据库安全快照
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60 overflow-y-auto">
            {backups.map((b) => (
              <div
                key={b.filename}
                className="py-3.5 flex items-center justify-between hover:bg-slate-800/30 px-3 rounded-xl transition"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-950/60 border border-blue-800/40 flex items-center justify-center text-blue-400 shrink-0">
                    <Archive className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-medium font-mono text-slate-200">
                      {b.filename}
                    </p>
                    <div className="flex items-center space-x-3 text-[11px] text-slate-400 mt-0.5">
                      <span>{b.created_at}</span>
                      <span>•</span>
                      <span>{formatSize(b.size_bytes)}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setRestoreTarget(b)}
                  className="flex items-center space-x-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 bg-amber-950/40 hover:bg-amber-900/50 px-3 py-1.5 rounded-lg border border-amber-800/40 transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>恢复此备份</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Restore Confirmation Dialog */}
      {restoreTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start space-x-3.5">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-slate-100">
                  确认恢复数据库快照？
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed font-mono">
                  目标文件: {restoreTarget.filename}
                </p>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-400 space-y-1.5">
              <p className="font-semibold text-slate-300">恢复执行规则：</p>
              <p>1. 若当前本地服务正在运行，系统将首先<span className="text-amber-400">自动安全停止服务</span>；</p>
              <p>2. 执行底层 CLI restore 操作，将现有数据替换为快照数据；</p>
              <p>3. 恢复成功后，系统将提示您是否立即重启服务。</p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setRestoreTarget(null)}
                disabled={isRestoring}
                className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleConfirmRestore}
                disabled={isRestoring}
                className="flex items-center space-x-1.5 px-4 py-2 text-xs font-medium bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl shadow-md shadow-amber-600/20 transition cursor-pointer"
              >
                {isRestoring && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isRestoring ? "正在恢复中..." : "确认恢复"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Success -> Ask to Restart Dialog */}
      {restoreSuccessPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start space-x-3.5">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-slate-100">
                  数据库快照已成功恢复
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  数据恢复操作已完成。由于数据已更新，是否立即重新拉起本地 OpenLearn 服务？
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setRestoreSuccessPrompt(false)}
                className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                暂不启动
              </button>
              <button
                onClick={handleRestartService}
                className="px-4 py-2 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md shadow-blue-600/20 transition cursor-pointer"
              >
                立即重新启动服务
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
