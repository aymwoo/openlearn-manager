# OpenLearn Manager

> 面向教师与教育工作者的 OpenLearn-Next 本地 Web 服务图形化桌面管理器。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tauri 2](https://img.shields.io/badge/Tauri-v2-24C8D8.svg?logo=tauri)](https://tauri.app/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react)](https://react.dev/)

---

## 💡 产品定位与设计理念

- **薄封装（Thin Wrapper）**：GUI 仅负责环境检测、参数拼装、子进程生命周期调度（spawn / kill）与 stdout/stderr 实时日志流展示；所有核心业务仍由 `openlearn-next` CLI 执行。
- **单机单实例**：限制仅运行一个管理器实例，重复打开自动聚焦或从系统托盘唤醒。
- **安全与防呆**：
  - 固定监听主机 `127.0.0.1`（安全回环绑定，不可被外部未授权访问）。
  - 端口冲突探测：启动前排查端口占用，遇冲突友好提示并不误杀第三方进程。
  - 高危操作（自动修复、重置管理员密码、清理缓存）提供强制二次弹窗确认。
- **优雅后台常驻与系统托盘**：
  - 点击关闭窗口时弹出交互提示，用户可选择彻底停止退出或缩至系统托盘继续保持服务可用。
  - 托盘提供「打开主窗口」、「打开浏览器」、「停止并退出」三项快捷菜单。

---

## 🖥️ 核心页面模块

1. **首页 (Home)**：
   - 端口设置（默认 3000）与端口占用防冲突检测。
   - 大按钮操作：**启动服务**、**停止服务**、**打开浏览器**。
   - 运行状态呈现、底层子进程 PID 与 `openlearn-next` 版本标签。
   - Lite 版缺 Node.js 运行时顶部醒目红条告警与下载指引。
2. **备份 (Backups)**：
   - 备份目录统一固定为 `Documents/OpenLearn/backups`。
   - 文件自动按时间戳命名（`openlearn-YYYYMMDD-HHmmss.db`）。
   - 提供「打开所在文件夹」系统调用与「恢复此备份」防呆操作流程（先停后恢复）。
3. **日志 (Logs)**：
   - 当前运行 stdout/stderr 实时终端日志流，环形内存滑动窗口保留 2000 行。
   - 提供搜索关键字过滤、自动滚动跟随、一键复制全部与日志清空。
4. **高级 (Advanced)**：
   - **将要执行的 CLI 命令预览**（默认折叠，展开可查看拼装命令）。
   - 钉死 CLI 版本（支持自定义或使用 `@latest`）。
   - 自定义数据库存储路径 `--db-path`。
   - 系统体检 `doctor`、自动修复 `doctor --fix`、重置管理员密码 `reset-admin`、清理缓存 `clean --npx`（二次确认保护）。
5. **关于 (About)**：
   - 应用版本、运行环境诊断信息与开源仓库链接。

---

## 🛠️ 技术架构

```
[ GUI (React 19 + TypeScript + Tailwind CSS) ]
                     ↓ (Tauri IPC Invoke / Events)
[ Tauri 2 核心层 (Rust)：进程管理 / 托盘 / 单实例 / 读写配置 / 备份管理 ]
                     ↓ (spawn / kill)
[ Node.js 运行时 ]  ← Full 版：内嵌 Node 22 LTS；Lite 版：本机系统 Node
                     ↓
[ openlearn-next CLI ]  ← 默认 npx openlearn-next@latest
                     ↓
[ 本地 HTTP 服务 ]  ← 固定 127.0.0.1 + 用户端口 (默认 3000)
```

---

## 🚀 本地开发与构建

### 1. 安装前端依赖
```bash
pnpm install
```

### 2. 本地开发调试
```bash
# 启动 Tauri 2 桌面调试模式
pnpm tauri dev

# 或仅启动 Web 前端预览
pnpm dev
```

### 3. 生产打包构建
```bash
# 构建前端并生成桌面安装包
pnpm tauri build
```

---

## 📄 开源许可证

本项目基于 [MIT 许可证](LICENSE) 开源发布。
