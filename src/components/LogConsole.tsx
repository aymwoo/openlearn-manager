import React, { useEffect, useMemo, useRef } from "react";
import type { LogEntry } from "../types";
import {
  DEFAULT_ANSI_STATE,
  type AnsiSegment,
  parseAnsiLine,
  segmentStyle,
  stripAnsi,
} from "../utils/ansi";

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

/** 复制/导出用的纯文本：保留可读内容，去掉颜色码 */
export const formatLogText = (logs: LogEntry[]): string =>
  logs
    .map((l) => `[${l.timestamp}] [${l.stream.toUpperCase()}] ${stripAnsi(l.message)}`)
    .join("\n");

// stream 徽标配色（日志区固定深色终端底，不随明暗主题切换）
const STREAM_BADGE: Record<string, string> = {
  stderr: "bg-rose-950 text-rose-400",
  system: "bg-blue-950 text-cyan-400",
  stdout: "bg-slate-800 text-slate-400",
};

const STREAM_TEXT: Record<string, string> = {
  stderr: "text-rose-300",
  system: "text-cyan-300 font-medium",
  stdout: "text-slate-300",
};

export const LogConsole: React.FC<LogConsoleProps> = ({
  logs,
  autoScroll = true,
  maxRows = 300,
  emptyHint = "暂无实时日志输出",
  className = "",
  footer,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const visibleLogs = useMemo(
    () => (logs.length > maxRows ? logs.slice(logs.length - maxRows) : logs),
    [logs, maxRows]
  );

  /**
   * 逐行解析 ANSI，并把上一行结束时的样式状态带下去 ——
   * CLI 常有「颜色没在行尾重置」的情况，不延续就会出现后半截日志掉色。
   */
  const parsedLines = useMemo(() => {
    let carry = DEFAULT_ANSI_STATE;
    return visibleLogs.map((entry) => {
      const { segments, endState } = parseAnsiLine(entry.message, carry);
      carry = endState;
      return segments as AnsiSegment[];
    });
  }, [visibleLogs]);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [parsedLines, autoScroll]);

  return (
    <div
      className={`font-log flex flex-col bg-slate-950 border border-slate-800/90 rounded-2xl p-4 shadow-xl text-xs overflow-hidden ${className}`}
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
            const badge = STREAM_BADGE[entry.stream] ?? STREAM_BADGE.stdout;
            const textTone = STREAM_TEXT[entry.stream] ?? STREAM_TEXT.stdout;

            return (
              <div
                key={typeof entry.id === "number" ? entry.id : `idx-${idx}`}
                className="flex items-start space-x-3 leading-relaxed hover:bg-slate-900/40 px-1.5 py-0.5 rounded transition"
              >
                <span className="text-slate-600 shrink-0 select-none">
                  [{entry.timestamp}]
                </span>
                <span
                  className={`shrink-0 select-none text-[10px] font-semibold uppercase px-1 rounded ${badge}`}
                >
                  {entry.stream}
                </span>
                <span className={`break-all whitespace-pre-wrap min-w-0 ${textTone}`}>
                  {parsedLines[idx].length === 0 ? (
                    "\u00a0"
                  ) : (
                    parsedLines[idx].map((seg, segIdx) => {
                      const style = segmentStyle(seg);
                      // 无样式就直接输出文本，省掉一层 span
                      return Object.keys(style).length > 0 ? (
                        <span key={segIdx} style={style}>
                          {seg.text}
                        </span>
                      ) : (
                        <React.Fragment key={segIdx}>{seg.text}</React.Fragment>
                      );
                    })
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>

      {footer && (
        <div className="pt-2 mt-2 border-t border-slate-900 flex items-center justify-between text-[11px] text-slate-500">
          {footer}
        </div>
      )}
    </div>
  );
};
