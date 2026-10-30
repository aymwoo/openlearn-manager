import React, { useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronRight,
  Terminal,
  Save,
  Activity,
  Wrench,
  KeyRound,
  Trash,
  AlertTriangle,
  CheckCircle2,
  Copy,
} from "lucide-react";
import type { AppConfig, CommandOutputResult } from "../types";
import { api } from "../services/api";

interface AdvancedPageProps {
  config: AppConfig;
  onSaveConfig: (cfg: AppConfig) => Promise<void>;
  currentPort: number;
}

export const AdvancedPage: React.FC<AdvancedPageProps> = ({
  config,
  onSaveConfig,
  currentPort,
}) => {
  const [cliVersionInput, setCliVersionInput] = useState(config.cli_version || "");
  const [dbPathInput, setDbPathInput] = useState(config.db_path || "");
  const [previewCmd, setPreviewCmd] = useState<string>("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Maintenance command confirmation modal state
  const [activeModal, setActiveModal] = useState<
    "doctor-fix" | "reset-admin" | "clean-npx" | null
  >(null);
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [isRunningCommand, setIsRunningCommand] = useState(false);
  const [commandResult, setCommandResult] = useState<CommandOutputResult | null>(null);

  // Update preview whenever inputs or port change
  useEffect(() => {
    api
      .previewCommand(currentPort, cliVersionInput, dbPathInput)
      .then(setPreviewCmd)
      .catch(console.error);
  }, [currentPort, cliVersionInput, dbPathInput]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const newCfg: AppConfig = {
        ...config,
        cli_version: cliVersionInput.trim() ? cliVersionInput.trim() : null,
        db_path: dbPathInput.trim() ? dbPathInput.trim() : null,
      };
      await onSaveConfig(newCfg);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const executeMaintenanceCommand = async (
    cmd: string,
    extraArg?: string
  ) => {
    setIsRunningCommand(true);
    setCommandResult(null);
    try {
      const res = await api.runCliCommand(cmd, extraArg);
      setCommandResult(res);
    } catch (err: any) {
      setCommandResult({
        success: false,
        output: typeof err === "string" ? err : err?.message || "执行失败",
      });
    } finally {
      setIsRunningCommand(false);
      setActiveModal(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-950 p-8 space-y-6">
      {/* Header bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-1">
        <h2 className="text-lg font-semibold text-slate-100">高级设置与维护</h2>
        <p className="text-xs text-slate-400">
          配置底层 CLI 启动参数，运行系统体检与数据库维护命令
        </p>
      </div>

      {/* Collapsible Command Preview (Folded by default) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <button
          onClick={() => setIsPreviewOpen(!isPreviewOpen)}
          className="w-full p-5 flex items-center justify-between text-left hover:bg-slate-800/40 transition cursor-pointer"
        >
          <div className="flex items-center space-x-3">
            <Terminal className="w-4 h-4 text-blue-400" />
            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                将要执行的 CLI 命令预览
              </h3>
              <p className="text-[11px] text-slate-400">
                实时展示 GUI 拼装出的完整启动命令，默认折叠
              </p>
            </div>
          </div>
          {isPreviewOpen ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {isPreviewOpen && (
          <div className="p-5 pt-0 border-t border-slate-800/80 bg-slate-950/40 animate-in fade-in">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between font-mono text-xs text-slate-300">
              <span className="break-all">{previewCmd}</span>
              <button
                onClick={() => navigator.clipboard.writeText(previewCmd)}
                title="复制命令"
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition ml-3 shrink-0 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Runtime Configuration Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">运行时参数</h3>
            <p className="text-xs text-slate-400">修改后点击保存立即写入本地配置</p>
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center space-x-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl shadow-md shadow-blue-500/20 transition cursor-pointer"
          >
            {saveSuccess ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>已保存</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>保存配置</span>
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Pin CLI Version */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">
              钉死 CLI 版本
            </label>
            <input
              type="text"
              placeholder="默认 @latest (留空则随最新稳定版)"
              value={cliVersionInput}
              onChange={(e) => setCliVersionInput(e.target.value)}
              className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 text-xs font-mono focus:outline-hidden focus:border-blue-500 placeholder-slate-600"
            />
            <p className="text-[11px] text-slate-500">
              如填写 <code className="text-slate-400">2.1.0</code> 则锁定使用 openlearn-next@2.1.0。
            </p>
          </div>

          {/* Custom DB Path */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">
              自定义数据库路径 (--db-path)
            </label>
            <input
              type="text"
              placeholder="默认跟 CLI (留空使用默认存储位置)"
              value={dbPathInput}
              onChange={(e) => setDbPathInput(e.target.value)}
              className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 text-xs font-mono focus:outline-hidden focus:border-blue-500 placeholder-slate-600"
            />
            <p className="text-[11px] text-slate-500">
              用于迁移或指定特定目录的 SQLite 数据库文件。
            </p>
          </div>
        </div>
      </div>

      {/* Maintenance & Doctor Section */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">系统维护与排错工具</h3>
          <p className="text-xs text-slate-400">
            高危操作包含修改数据库或缓存，均设有防误触二次确认保护
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
          {/* 1. Doctor (Health Check) */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-200">系统体检 (doctor)</h4>
                <p className="text-[11px] text-slate-400">检测依赖与环境健康状况</p>
              </div>
            </div>
            <button
              onClick={() => executeMaintenanceCommand("doctor")}
              disabled={isRunningCommand}
              className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition cursor-pointer"
            >
              运行体检
            </button>
          </div>

          {/* 2. Doctor --fix (Auto Repair) */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400">
                <Wrench className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-200">故障修复 (doctor --fix)</h4>
                <p className="text-[11px] text-slate-400">自动排查并修复异常状态</p>
              </div>
            </div>
            <button
              onClick={() => setActiveModal("doctor-fix")}
              disabled={isRunningCommand}
              className="px-3 py-1.5 text-xs font-medium bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 rounded-xl border border-amber-600/40 transition cursor-pointer"
            >
              修复...
            </button>
          </div>

          {/* 3. Reset Admin Password */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-200">重置管理员密码</h4>
                <p className="text-[11px] text-slate-400">
                  留空则由 CLI 随机生成（结果见执行输出）
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setAdminPasswordInput("");
                setActiveModal("reset-admin");
              }}
              disabled={isRunningCommand}
              className="px-3 py-1.5 text-xs font-medium bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded-xl border border-purple-600/40 transition cursor-pointer"
            >
              重置密码...
            </button>
          </div>

          {/* 4. Clean NPX cache */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400">
                <Trash className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-200">清理 npx 缓存</h4>
                <p className="text-[11px] text-slate-400">释放磁盘临时运行空间</p>
              </div>
            </div>
            <button
              onClick={() => setActiveModal("clean-npx")}
              disabled={isRunningCommand}
              className="px-3 py-1.5 text-xs font-medium bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 rounded-xl border border-rose-600/40 transition cursor-pointer"
            >
              清理缓存...
            </button>
          </div>
        </div>
      </div>

      {/* Command Result Output Box */}
      {commandResult && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {commandResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              )}
              <span className="text-xs font-semibold text-slate-200">
                {commandResult.success ? "命令执行成功" : "命令执行报告异常"}
              </span>
            </div>
            <button
              onClick={() => setCommandResult(null)}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              关闭
            </button>
          </div>
          <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 font-mono text-xs text-slate-300 max-h-52 overflow-y-auto whitespace-pre-wrap">
            {commandResult.output || "（无回显内容）"}
          </pre>
        </div>
      )}

      {/* Secondary Confirmation Modal for Doctor --fix */}
      {activeModal === "doctor-fix" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start space-x-3.5">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  二次确认：执行 doctor --fix 修复？
                </h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  系统将尝试自动修复发现的环境与配置异常。此操作可能会覆盖或重置部分局部设定，建议在操作前先确认数据已备份。
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={() => executeMaintenanceCommand("doctor-fix")}
                className="px-4 py-2 text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-xl shadow-md shadow-amber-600/20 transition cursor-pointer"
              >
                确认修复
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Secondary Confirmation Modal for Reset Admin */}
      {activeModal === "reset-admin" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start space-x-3.5">
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 shrink-0">
                <KeyRound className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  二次确认：重置管理员账户密码？
                </h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  此操作将直接更新本地数据库中的内置管理员账号口令。
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">
                新密码设定（留空则由 CLI 随机生成，新密码会打印在执行输出里）
              </label>
              <input
                type="text"
                value={adminPasswordInput}
                onChange={(e) => setAdminPasswordInput(e.target.value)}
                placeholder="留空 = 随机生成"
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 text-xs font-mono focus:outline-hidden focus:border-purple-500"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={() =>
                  executeMaintenanceCommand("reset-admin", adminPasswordInput)
                }
                className="px-4 py-2 text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white rounded-xl shadow-md shadow-purple-600/20 transition cursor-pointer"
              >
                确认重置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Secondary Confirmation Modal for Clean NPX */}
      {activeModal === "clean-npx" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start space-x-3.5">
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  二次确认：清理 npx 缓存？
                </h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  将清除系统中的 npx 缓存包。清理后下次启动可能需要重新联网拉取 CLI 包。
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={() => executeMaintenanceCommand("clean-npx")}
                className="px-4 py-2 text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow-md shadow-rose-600/20 transition cursor-pointer"
              >
                确认清理
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
