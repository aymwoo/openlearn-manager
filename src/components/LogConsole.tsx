import React, { useEffect, useRef } from "react";
import type { LogEntry } from "../types";

interface LogConsoleProps {
  logs: LogEntry[];
  /** 是否自动滚到底部，默认开启 */
  autoScroll?: boolean;
  /** 最多渲染的行数（取最近 N 条），避免长列表拖垮渲染 */
  maxRows?: number;
  emptyHint?: string;
  /** 外层容器附加类名（用来控制高度，如 "h-56" / "flex-1"） */
  className?: string;
  /** 底部信息栏 */
  footer?: React.ReactNode;
}

export const formatLogText = (logs: LogEntry[]): string =>
  logs
    .map((l) => `[${l.timestamp}] [${l.stream.toUpperCase()}] ${l.message}`)
    .join("\n");

export const LogConsole: React.FC<LogConsoleProps> = ({
  logs,
  autoScroll = true,
  maxRows = 300,
  emptyHint = "暂无实时日志输出",
  className = "",
  footer,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const visibleLogs = logs.length > maxRows ? logs.slice(logs.length - maxRows) : logs;

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [visibleLogs.length, autoScroll]);

  return (
    <div
      className={`flex flex-col bg-slate-950 border border-slate-800/90 rounded-2xl p-4 shadow-xl font-mono text-xs overflow-hidden ${className}`}
    >
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto space-y-1 custom-scrollbar pr-2 select-text"
      >
        {visibleLogs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-600 text-xs select-none">
            {emptyHint}
          </div>
        ) : (
          visibleLogs.map((entry, idx) => {
            const isStderr = entry.stream === "stderr";
            const isSystem = entry.stream === "system";

            return (
              <div
                key={idx}
                className="flex items-start space-x-3 leading-relaxed hover:bg-slate-900/40 px-1.5 py-0.5 rounded transition"
              >
                <span className="text-slate-600 shrink-0 select-none">
                  [{entry.timestamp}]
                </span>
                <span
                  className={`shrink-0 select-none text-[10px] font-semibold uppercase px-1 rounded ${
                    isStderr
                      ? "bg-rose-950 text-rose-400"
                      : isSystem
                      ? "bg-blue-950 text-cyan-400"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {entry.stream}
                </span>
                <span
                  className={`break-all whitespace-pre-wrap ${
                    isStderr
                      ? "text-rose-300"
                      : isSystem
                      ? "text-cyan-300 font-medium"
                      : "text-slate-300"
                  }`}
                >
                  {entry.message}
                </span>
              </div>
            );
          })
        )}
      </div>

      {footer && (
        <div className="pt-2 mt-2 border-t border-slate-900 flex items-center justify-between text-[11px] text-slate-600">
          {footer}
        </div>
      )}
    </div>
  );
};
