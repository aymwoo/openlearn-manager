import React from "react";
import { AlertTriangle, Power, Minimize2, X } from "lucide-react";

interface ConfirmCloseModalProps {
  isOpen: boolean;
  onStopAndExit: () => void;
  onMinimizeToTray: () => void;
  onCancel: () => void;
}

export const ConfirmCloseModal: React.FC<ConfirmCloseModalProps> = ({
  isOpen,
  onStopAndExit,
  onMinimizeToTray,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-start space-x-3.5">
          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              本地服务正在后台运行中
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              关闭窗口时，您可以选择彻底停止本地服务并退出，或将管理器隐藏至系统托盘以保持服务继续运行。
            </p>
          </div>
        </div>

        <div className="pt-2 flex flex-col space-y-2">
          <button
            onClick={onMinimizeToTray}
            className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs py-2.5 px-4 rounded-xl transition shadow-md shadow-blue-500/20 cursor-pointer"
          >
            <Minimize2 className="w-4 h-4" />
            <span>保持服务运行（最小化至托盘）</span>
          </button>

          <button
            onClick={onStopAndExit}
            className="w-full flex items-center justify-center space-x-2 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/15 dark:hover:bg-rose-500/25 text-rose-700 dark:text-rose-400 font-medium text-xs py-2.5 px-4 rounded-xl transition border border-rose-200 dark:border-rose-500/30 cursor-pointer"
          >
            <Power className="w-4 h-4" />
            <span>停止本地服务并完全退出</span>
          </button>

          <button
            onClick={onCancel}
            className="w-full flex items-center justify-center space-x-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-xs py-2.5 px-4 rounded-xl transition border border-slate-200 dark:border-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>取消</span>
          </button>
        </div>
      </div>
    </div>
  );
};
