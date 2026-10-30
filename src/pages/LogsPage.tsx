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

  const filteredLogs = filterQuery.trim()
    ? logs.filter((l) =>
        l.message.toLowerCase().includes(filterQuery.toLowerCase())
      )
    : logs;

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 p-6 space-y-4">
      {/* Top Controls Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
            <TerminalIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">服务运行日志</h2>
            <p className="text-[11px] text-slate-400">
              当前运行 stdout/stderr 实时日志流（滚动保留 2000 行）
            </p>
          </div>
        </div>

        {/* Search, Auto-Scroll, Copy & Clear */}
        <div className="flex items-center space-x-2.5">
          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="过滤日志关键字..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-950/70 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-blue-500 w-44"
            />
          </div>

          {/* Auto Scroll Toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition cursor-pointer ${
              autoScroll
                ? "bg-blue-600/15 border-blue-500/40 text-blue-400"
                : "bg-slate-800/80 border-slate-700 text-slate-400"
            }`}
          >
            <ArrowDownCircle className="w-3.5 h-3.5" />
            <span>自动滚动</span>
          </button>

          {/* Copy Button */}
          <button
            onClick={handleCopyAll}
            disabled={logs.length === 0}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 rounded-xl border border-slate-700 transition cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">已复制</span>
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
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-rose-950/40 hover:text-rose-400 disabled:opacity-40 text-slate-300 rounded-xl border border-slate-700 transition cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>清空</span>
          </button>
        </div>
      </div>

      {/* Terminal Output Area */}
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
