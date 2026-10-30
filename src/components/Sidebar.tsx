import React from "react";
import {
  Home,
  Archive,
  Terminal,
  Sliders,
  Info,
  Server,
  AlertCircle,
  ZoomIn,
  Plus,
  Minus,
} from "lucide-react";
import type { NavTab, ServiceStatus } from "../types";

interface SidebarProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  status: ServiceStatus | null;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  status,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}) => {
  const navItems: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    { id: "home", label: "首页", icon: <Home className="w-4 h-4" /> },
    { id: "backups", label: "备份", icon: <Archive className="w-4 h-4" /> },
    { id: "logs", label: "日志", icon: <Terminal className="w-4 h-4" /> },
    { id: "advanced", label: "高级", icon: <Sliders className="w-4 h-4" /> },
    { id: "about", label: "关于", icon: <Info className="w-4 h-4" /> },
  ];

  return (
    <aside className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col justify-between select-none shrink-0 h-full">
      {/* Brand Header */}
      <div>
        <div className="p-4 border-b border-slate-800/80 flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-semibold text-slate-100 text-sm tracking-tight leading-tight">
              OpenLearn
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">服务管理器</p>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="p-2 space-y-1">
          {navItems.map((item) => {
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                    : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Service Status Indicator */}
      <div className="p-3 border-t border-slate-800/80">
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium text-slate-400">服务状态</span>
            {status?.is_running && (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-semibold">
                :{status.port}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {status?.is_starting ? (
              <>
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                <span className="text-xs text-amber-400 font-medium">启动中...</span>
              </>
            ) : status?.is_running ? (
              <>
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/80 animate-pulse" />
                <span className="text-xs text-emerald-300 font-medium">运行中</span>
              </>
            ) : !status?.node_detected ? (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-xs text-rose-400 font-medium">缺 Node 运行时</span>
              </>
            ) : (
              <>
                <div className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                <span className="text-xs text-slate-400 font-medium">未运行</span>
              </>
            )}
          </div>

          {/* Zoom controls */}
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center space-x-1">
              <ZoomIn className="w-3 h-3 text-slate-400" />
              <span>缩放</span>
            </span>
            <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 px-1 py-0.5 rounded-lg">
              <button
                onClick={onZoomOut}
                title="缩小 (Ctrl + -)"
                className="p-1 hover:text-slate-100 hover:bg-slate-800 rounded transition cursor-pointer"
              >
                <Minus className="w-2.5 h-2.5" />
              </button>
              <button
                onClick={onResetZoom}
                title="重置缩放 (Ctrl + 0)"
                className="font-mono text-[10px] px-1 hover:text-blue-400 transition cursor-pointer font-medium"
              >
                {Math.round(zoomLevel * 100)}%
              </button>
              <button
                onClick={onZoomIn}
                title="放大 (Ctrl + +)"
                className="p-1 hover:text-slate-100 hover:bg-slate-800 rounded transition cursor-pointer"
              >
                <Plus className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
