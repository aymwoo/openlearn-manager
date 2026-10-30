import React, { useState } from "react";
import {
  Copy,
  Trash2,
  Check,
  Search,
  ArrowDownCircle,
  Terminal as TerminalIcon,
} from "lucide-react";
import type { LogEntry } from "../types";
import { LogConsole, formatLogText } from "../components/LogConsole";
import { stripAnsi } from "../utils/ansi";

interface LogsPageProps {
  logs: LogEntry[];
  onClearLogs: () => void;
}

export const LogsPage: React.FC<LogsPageProps> = ({ logs, onClearLogs }) => {
  const [filterQuery, setFilterQuery] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopyAll = async () => {
    const text = formatLogText(logs);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("复制日志失败", err);
    }
  };

  // 搜索按「去掉颜色码后的纯文本」匹配，否则搜 "ready" 会被转义序列打断
  const filteredLogs = filterQuery.trim()
    ? logs.filter((l) =>
        stripAnsi(l.message).toLowerCase().includes(filterQuery.toLowerCase())
      )
    : logs;

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-100/70 dark:bg-slate-950 p-6 space-y-4 transition-colors duration-200">
      {/* Top Controls Bar */}
      <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm dark:shadow-xl flex flex-wrap items-center justify-between gap-3 transition-colors duration-200">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <TerminalIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              服务运行日志
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              当前运行 stdout/stderr 实时日志流（滚动保留 2000 行，已还原 ANSI 彩色与 Nerd Font 图标）
            </p>
          </div>
        </div>

        {/* Search, Auto-Scroll, Copy & Clear */}
        <div className="flex items-center space-x-2.5">
          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="过滤日志关键字..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:border-blue-500 w-44"
            />
          </div>

          {/* Auto Scroll Toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition cursor-pointer ${
              autoScroll
                ? "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-600/15 dark:border-blue-500/40 dark:text-blue-400"
                : "bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
            }`}
          >
            <ArrowDownCircle className="w-3.5 h-3.5" />
            <span>自动滚动</span>
          </button>

          {/* Copy Button */}
          <button
            onClick={handleCopyAll}
            disabled={logs.length === 0}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 transition cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-emerald-600 dark:text-emerald-400">已复制</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>复制全部</span>
              </>
            )}
          </button>

          {/* Clear Button */}
          <button
            onClick={onClearLogs}
            disabled={logs.length === 0}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-rose-50 hover:text-rose-600 dark:bg-slate-800 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 disabled:opacity-40 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-700 transition cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>清空</span>
          </button>
        </div>
      </div>

      {/* Terminal Output Area —— 日志区保持深色终端底色，浅色主题下同样不反转 */}
      <LogConsole
        logs={filteredLogs}
        autoScroll={autoScroll}
        className="flex-1"
        emptyHint={filterQuery ? "未找到匹配的日志内容" : "暂无实时日志输出"}
        footer={
          <>
            <span>
              共 {filteredLogs.length} 条记录{" "}
              {filterQuery && `(已过滤，总计 ${logs.length} 条)`}
            </span>
            <span>环形缓冲区最大保留 2000 行</span>
          </>
        }
      />
    </div>
  );
};
