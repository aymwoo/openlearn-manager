import React from "react";
import { Server, ExternalLink, ShieldCheck, Cpu } from "lucide-react";
import type { ServiceStatus } from "../types";
import { api } from "../services/api";

interface AboutPageProps {
  status: ServiceStatus | null;
}

const GithubIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    stroke="currentColor"
    strokeWidth="2"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

export const AboutPage: React.FC<AboutPageProps> = ({ status }) => {
  const repoUrl = "https://github.com/aymwoo/openlearn-manager";

  const handleOpenRepo = async () => {
    try {
      await api.openBrowser(1420).catch(() => window.open(repoUrl, "_blank"));
    } catch {
      window.open(repoUrl, "_blank");
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-100/70 dark:bg-slate-950 p-8 space-y-6 transition-colors duration-200">
      {/* Brand & Introduction Card */}
      <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-sm dark:shadow-xl flex flex-col items-center text-center space-y-4 transition-colors duration-200">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-xl shadow-blue-500/25">
          <Server className="w-8 h-8" />
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            OpenLearn Manager
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            OpenLearn-Next 本地 Web 服务图形化管理客户端
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <span className="px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60 font-mono font-medium">
            v0.1.0
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium flex items-center space-x-1 border border-slate-200 dark:border-slate-700">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>MIT License</span>
          </span>
        </div>

        <p className="max-w-md text-xs text-slate-600 dark:text-slate-400 leading-relaxed pt-2">
          专为教师与非开发者用户打造，提供开箱即用、一键启停、端口冲突排查、数据快照备份与系统排错能力的本地服务薄封装控制台。
        </p>

        <button
          onClick={handleOpenRepo}
          className="flex items-center space-x-2 text-xs font-medium text-slate-700 hover:text-slate-900 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 transition cursor-pointer mt-2"
        >
          <GithubIcon className="w-4 h-4" />
          <span>GitHub: aymwoo/openlearn-manager</span>
          <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>

      {/* Runtime Environment Info */}
      <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm dark:shadow-xl space-y-4 transition-colors duration-200">
        <div className="flex items-center space-x-2.5 text-slate-800 dark:text-slate-200 font-semibold text-sm">
          <Cpu className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h3>运行环境诊断信息</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 space-y-1">
            <span className="text-slate-500 font-medium">桌面外壳</span>
            <p className="text-slate-800 dark:text-slate-200 font-medium">Tauri 2 (Rust) + WebKit</p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 space-y-1">
            <span className="text-slate-500 font-medium">前端框架</span>
            <p className="text-slate-800 dark:text-slate-200 font-medium">React 19 + TypeScript + Tailwind CSS</p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 space-y-1">
            <span className="text-slate-500 font-medium">打包模式</span>
            <p className="text-slate-800 dark:text-slate-200 font-medium">
              {status?.is_full_edition ? "Full 安装版（内嵌 Node 22 LTS）" : "Lite 便携版（系统 Node）"}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 space-y-1">
            <span className="text-slate-500 font-medium">Node 运行时位置</span>
            <p
              className="text-slate-800 dark:text-slate-200 font-mono text-[11px] truncate"
              title={status?.node_path || "未检测到"}
            >
              {status?.node_path || "未找到可用 Node.js 路径"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
