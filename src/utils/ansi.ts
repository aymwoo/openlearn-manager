/**
 * 极简 ANSI 转义序列解析 —— 把 CLI 输出里的 SGR 颜色/样式码转成可渲染的片段。
 *
 * 为什么不直接用 innerHTML：日志内容来自外部进程输出，属于不可信输入。
 * 这里只产出「文本 + 样式」的结构化片段，由 React 渲染成 <span>，天然不执行脚本。
 */
import type React from "react";

export interface AnsiSegment {
  text: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** CSS 颜色值（前景） */
  fg?: string;
  /** CSS 颜色值（背景） */
  bg?: string;
}

export interface AnsiStyleState {
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  fg?: string;
  bg?: string;
}

export const DEFAULT_ANSI_STATE: AnsiStyleState = {
  bold: false,
  dim: false,
  italic: false,
  underline: false,
};

const ESC = "\u001b";

/** 深色终端底下的 ANSI 16 色（VSCode Dark+ 调色板，避免纯黑在深色背景上消失） */
const NORMAL_16 = [
  "#5c6370", // black
  "#e06c75", // red
  "#98c379", // green
  "#e5c07b", // yellow
  "#61afef", // blue
  "#c678dd", // magenta
  "#56b6c2", // cyan
  "#dcdfe4", // white
];
const BRIGHT_16 = [
  "#7f848e",
  "#ff7b72",
  "#b5e890",
  "#f2cc60",
  "#7cc4ff",
  "#e39ef7",
  "#7ee0e8",
  "#ffffff",
];

const CUBIC = [0, 95, 135, 175, 215, 255];

/** xterm 256 色表：0-15 用调色板，16-231 为 6×6×6 立方，232-255 为灰度 */
function xterm256(index: number): string {
  if (index < 16) {
    const table = index < 8 ? NORMAL_16 : BRIGHT_16;
    return table[index % 8];
  }
  if (index < 232) {
    const i = index - 16;
    const r = CUBIC[Math.floor(i / 36)];
    const g = CUBIC[Math.floor((i % 36) / 6)];
    const b = CUBIC[i % 6];
    return `rgb(${r}, ${g}, ${b})`;
  }
  const v = 8 + (index - 232) * 10;
  return `rgb(${v}, ${v}, ${v})`;
}

function cloneState(s: AnsiStyleState): AnsiStyleState {
  return { bold: s.bold, dim: s.dim, italic: s.italic, underline: s.underline, fg: s.fg, bg: s.bg };
}

/** 应用一组 SGR 参数到样式状态上（就地修改） */
function applySgr(state: AnsiStyleState, params: number[]): void {
  let i = 0;
  // 缺省参数按 0 处理（例如 `ESC[m` 等价于 reset）
  if (params.length === 0) params = [0];

  while (i < params.length) {
    const p = params[i];

    if (p === 0) {
      state.bold = false;
      state.dim = false;
      state.italic = false;
      state.underline = false;
      state.fg = undefined;
      state.bg = undefined;
    } else if (p === 1) {
      state.bold = true;
    } else if (p === 2) {
      state.dim = true;
    } else if (p === 3) {
      state.italic = true;
    } else if (p === 4) {
      state.underline = true;
    } else if (p === 22) {
      state.bold = false;
      state.dim = false;
    } else if (p === 23) {
      state.italic = false;
    } else if (p === 24) {
      state.underline = false;
    } else if (p >= 30 && p <= 37) {
      state.fg = NORMAL_16[p - 30];
    } else if (p === 38) {
      const next = params[i + 1];
      if (next === 5 && params[i + 2] !== undefined) {
        state.fg = xterm256(params[i + 2]);
        i += 2;
      } else if (next === 2 && params.slice(i + 2, i + 5).every((v) => v !== undefined)) {
        state.fg = `rgb(${params[i + 2]}, ${params[i + 3]}, ${params[i + 4]})`;
        i += 4;
      }
    } else if (p === 39) {
      state.fg = undefined;
    } else if (p >= 40 && p <= 47) {
      state.bg = NORMAL_16[p - 40];
    } else if (p === 48) {
      const next = params[i + 1];
      if (next === 5 && params[i + 2] !== undefined) {
        state.bg = xterm256(params[i + 2]);
        i += 2;
      } else if (next === 2 && params.slice(i + 2, i + 5).every((v) => v !== undefined)) {
        state.bg = `rgb(${params[i + 2]}, ${params[i + 3]}, ${params[i + 4]})`;
        i += 4;
      }
    } else if (p === 49) {
      state.bg = undefined;
    } else if (p >= 90 && p <= 97) {
      state.fg = BRIGHT_16[p - 90];
    } else if (p >= 100 && p <= 107) {
      state.bg = BRIGHT_16[p - 100];
    }
    // 其余（如 5 闪烁、7 反显、9 删除线）不做处理，避免视觉噪音
    i += 1;
  }
}

/** 退格：终端会覆盖掉前一个字符，复制/搜索时的纯文本也应如此 */
function collapseBackspace(input: string): string {
  if (!input.includes("\b")) return input;
  let out = "";
  for (const ch of input) {
    if (ch === "\b") out = out.slice(0, -1);
    else out += ch;
  }
  return out;
}

/**
 * 去掉所有 ANSI/控制序列，只留纯文本 —— 用于复制、搜索、导出。
 */
export function stripAnsi(input: string): string {
  // 顺序有讲究：\r 覆盖 → \b 退格 → 最后才清掉剩下的控制符
  const cleaned = collapseBackspace(applyCarriageReturn(input));
  return cleaned
    // OSC（含超链接 OSC 8）：吞到 BEL 或 ST 为止
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?/g, "")
    // CSI
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
    // 其余两字符转义序列
    .replace(/\u001b[@-Z\\-_]/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

/**
 * 终端语义：\r 是回车覆盖（进度条常用）。只保留最后一次覆盖后的内容，
 * 与真实终端的最终显示一致。
 */
function applyCarriageReturn(line: string): string {
  const idx = line.lastIndexOf("\r");
  return idx === -1 ? line : line.slice(idx + 1);
}

export interface ParsedAnsiLine {
  segments: AnsiSegment[];
  endState: AnsiStyleState;
}

/**
 * 解析一行日志。
 *
 * @param raw 原始行（含转义序列）
 * @param initialState 上一行结束时的样式状态 —— CLI 常见的「颜色跨行未重置」才能正确延续
 */
export function parseAnsiLine(raw: string, initialState: AnsiStyleState = DEFAULT_ANSI_STATE): ParsedAnsiLine {
  const line = applyCarriageReturn(raw);
  const segments: AnsiSegment[] = [];
  const state = cloneState(initialState);
  let buffer = "";

  const flush = () => {
    if (buffer.length === 0) return;
    segments.push({
      text: buffer,
      bold: state.bold || undefined,
      dim: state.dim || undefined,
      italic: state.italic || undefined,
      underline: state.underline || undefined,
      fg: state.fg,
      bg: state.bg,
    });
    buffer = "";
  };

  let i = 0;
  while (i < line.length) {
    const ch = line[i];

    if (ch === ESC) {
      const next = line[i + 1];

      // CSI：ESC [ ... 终结符
      if (next === "[") {
        const match = /^\u001b\[([0-9;]*)([A-Za-z])/.exec(line.slice(i));
        if (match) {
          flush();
          if (match[2] === "m") {
            const params = match[1]
              .split(";")
              .filter((s) => s.length > 0)
              .map((s) => Number.parseInt(s, 10))
              .map((n) => (Number.isNaN(n) ? 0 : n));
            applySgr(state, params);
          }
          // 其余 CSI（光标移动/清行等）不产生可见文本，直接吞掉
          i += match[0].length;
          continue;
        }
        i += 1;
        continue;
      }

      // OSC：ESC ] ... BEL 或 ESC \（超链接等）
      if (next === "]") {
        const match = /^\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?/.exec(line.slice(i));
        if (match) {
          flush();
          i += match[0].length;
          continue;
        }
        i += 1;
        continue;
      }

      // 其余两字符转义（字符集选择等）
      flush();
      i += 2;
      continue;
    }

    if (ch === "\b") {
      // 退格：终端会覆盖前一个字符
      if (buffer.length > 0) {
        buffer = buffer.slice(0, -1);
      } else if (segments.length > 0) {
        const last = segments[segments.length - 1];
        last.text = last.text.slice(0, -1);
        if (last.text.length === 0) segments.pop();
      }
      i += 1;
      continue;
    }

    // 其余 C0 控制符直接丢弃
    if (ch <= "\u001f" && ch !== "\n" && ch !== "\t") {
      i += 1;
      continue;
    }

    buffer += ch;
    i += 1;
  }

  flush();
  return { segments, endState: state };
}

/** 把样式片段转成 React 可用的 inline style */
export function segmentStyle(seg: AnsiSegment): React.CSSProperties {
  const style: React.CSSProperties = {};
  if (seg.fg) style.color = seg.fg;
  if (seg.bg) style.backgroundColor = seg.bg;
  if (seg.bold) style.fontWeight = 700;
  if (seg.italic) style.fontStyle = "italic";
  if (seg.underline) style.textDecoration = "underline";
  if (seg.dim) style.opacity = 0.6;
  return style;
}

export function hasAnsi(input: string): boolean {
  return input.includes(ESC);
}
