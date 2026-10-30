# OpenLearn Manager 跨平台桌面服务管理器开发实施报告

> **Generates Artifact: Screenshot**

基于 [openlearn-manager.md](file:///home/wuxf/Develop/openlearn-manager/openlearn-manager.md) 与 [mission.md](file:///home/wuxf/Develop/openlearn-manager/mission.md) 的设计约定与规范，已完成 **OpenLearn Manager** 跨平台桌面客户端的端到端开发与全量构建验证。

---

## 1. 界面与交互全景呈现 (UI Screenshots)

````carousel
![首页 - 服务启停与端口管理](/home/wuxf/.gemini/antigravity-cli/brain/5182562b-9ce4-432b-83d0-c80f0126a25e/screenshot_home.png)
<!-- slide -->
![备份 - 数据库快照与安全恢复](/home/wuxf/.gemini/antigravity-cli/brain/5182562b-9ce4-432b-83d0-c80f0126a25e/screenshot_backups.png)
<!-- slide -->
![日志 - 实时终端日志流与环形缓冲区](/home/wuxf/.gemini/antigravity-cli/brain/5182562b-9ce4-432b-83d0-c80f0126a25e/screenshot_logs.png)
<!-- slide -->
![高级 - CLI 拼装命令预览与系统体检修复](/home/wuxf/.gemini/antigravity-cli/brain/5182562b-9ce4-432b-83d0-c80f0126a25e/screenshot_advanced.png)
<!-- slide -->
![关于 - 诊断信息与开源仓库](/home/wuxf/.gemini/antigravity-cli/brain/5182562b-9ce4-432b-83d0-c80f0126a25e/screenshot_about.png)
````

---

## 2. 核心架构与功能落地对照

| 需求条目 | 规范约定 | 实现详情 | 对应源码文件 |
| :--- | :--- | :--- | :--- |
| **薄封装设计** | GUI 仅负责参数拼装、spawn CLI、展示 stdout/stderr | 纯粹的调度器，通过 `tokio::process::Command` 启动 `npx openlearn-next`，异步双向捕获 stdout/stderr | [process_manager.rs](file:///home/wuxf/Develop/openlearn-manager/src-tauri/src/process_manager.rs) |
| **单机单实例** | 仅运行一份本地服务，二次打开聚焦已有窗口 | 集成 `tauri-plugin-single-instance`，新开实例时唤醒已有窗口并置顶聚焦 | [lib.rs](file:///home/wuxf/Develop/openlearn-manager/src-tauri/src/lib.rs) |
| **主机与端口** | 固定 `-H 127.0.0.1`，端口可调（默认 3000） | 前端界面锁定 `127.0.0.1` 无法篡改，端口输入防呆，并在启动前通过 TCP Listener 预检 | [HomePage.tsx](file:///home/wuxf/Develop/openlearn-manager/src/pages/HomePage.tsx) |
| **端口冲突处理** | 遇占用提示更换端口，**不杀第三方进程** | 区分本 GUI 占用与第三方占用；若为第三方占用，给出安全警示建议更改端口 | [HomePage.tsx](file:///home/wuxf/Develop/openlearn-manager/src/pages/HomePage.tsx) |
| **服务状态判定** | 以本 GUI 拉起的子进程是否存活为准 | 托管 Child Process PID，通过异步 try_wait 轮询进程存活与退出码，实时推送状态改变 | [process_manager.rs](file:///home/wuxf/Develop/openlearn-manager/src-tauri/src/process_manager.rs) |
| **窗口关闭与托盘** | 拦截窗口关闭事件，询问是否停止服务 | 监听 `CloseRequested`；运行中关闭时弹窗让用户选择“彻底停止退出”或“最小化常驻托盘” | [ConfirmCloseModal.tsx](file:///home/wuxf/Develop/openlearn-manager/src/components/ConfirmCloseModal.tsx), [tray.rs](file:///home/wuxf/Develop/openlearn-manager/src-tauri/src/tray.rs) |
| **托盘三项菜单** | 打开、打开浏览器、停止并退出 | 托盘原生菜单绑定 3 项操作，左键单击托盘图标自动激活恢复主窗口 | [tray.rs](file:///home/wuxf/Develop/openlearn-manager/src-tauri/src/tray.rs) |
| **备份管理** | 固定目录 `Documents/OpenLearn/backups`，格式 `openlearn-YYYYMMDD-HHmmss.db` | 自动递归创建目录、按时间戳命名、调用系统文件管理器定位、三步安全恢复流程（先停后恢复再问重启） | [BackupsPage.tsx](file:///home/wuxf/Develop/openlearn-manager/src/pages/BackupsPage.tsx), [backup.rs](file:///home/wuxf/Develop/openlearn-manager/src-tauri/src/backup.rs) |
| **实时日志流** | 滚动保留 2000 行，复制、清空 | 内存环形滑动窗口（VecDeque 2000行），仿终端控制台，支持关键字搜索、自动滚动与一键剪贴板复制 | [LogsPage.tsx](file:///home/wuxf/Develop/openlearn-manager/src/pages/LogsPage.tsx) |
| **高级维护** | 折叠命令预览、doctor、doctor --fix、reset-admin、clean --npx | 默认折叠展示真实 CLI 组装；所有破坏性维护指令配备强制二次确认弹窗防误触 | [AdvancedPage.tsx](file:///home/wuxf/Develop/openlearn-manager/src/pages/AdvancedPage.tsx) |

---

## 3. 测试与验证证据 (Test Evidence)

构建与类型验证测试输出已归档保存至 [artifacts/logs/build_and_check.log](file:///home/wuxf/Develop/openlearn-manager/artifacts/logs/build_and_check.log)：

```
=== 1. TypeScript Validation ===
TypeScript: OK
=== 2. Vite Build Validation ===
vite v8.3.5 building client environment for production...
✓ 2039 modules transformed.
dist/index.html                   0.47 kB │ gzip:  0.30 kB
dist/assets/index-LZMh8v2R.css   43.02 kB │ gzip:  7.65 kB
dist/assets/index-C1QWvmMh.js   285.28 kB │ gzip: 85.34 kB
✓ built in 315ms
Vite: OK
=== 3. Rust Backend Cargo Check ===
    Finished `dev` profile [unoptimized] target(s) in 0.17s
Cargo: OK
```

---

## 4. 交付文件清单

```
openlearn-manager/
├── artifacts/
│   ├── logs/
│   │   └── build_and_check.log         # 构建与静态检查验证日志
│   ├── screenshots/
│   │   ├── screenshot_home.png         # 首页截图
│   │   ├── screenshot_backups.png      # 备份页截图
│   │   ├── screenshot_logs.png         # 日志页截图
│   │   ├── screenshot_advanced.png     # 高级页截图
│   │   └── screenshot_about.png        # 关于页截图
│   └── plan_openlearn_manager.md       # 实施方案工件
├── src/                                # 前端 React 19 + TypeScript + Tailwind
│   ├── components/
│   │   ├── ConfirmCloseModal.tsx       # 退出确认与缩入托盘弹窗
│   │   └── Sidebar.tsx                 # 侧边栏与实时运行指示灯
│   ├── pages/
│   │   ├── HomePage.tsx                # 首页
│   │   ├── BackupsPage.tsx             # 备份管理页
│   │   ├── LogsPage.tsx                # 实时日志页
│   │   ├── AdvancedPage.tsx            # 高级设置与体检维护页
│   │   └── AboutPage.tsx               # 关于页
│   ├── services/
│   │   └── api.ts                      # Tauri IPC 强类型封装与 Mock 预览支持
│   ├── types/
│   │   └── index.ts                    # TypeScript 类型定义
│   ├── App.tsx                         # 根组件与事件监听调度
│   ├── index.css                       # 全局样式与自定义终端滚动条
│   └── main.tsx                        # 应用入口
├── src-tauri/                          # 桌面壳 Tauri 2 (Rust)
│   ├── capabilities/
│   │   └── default.json                # 权限配置
│   ├── src/
│   │   ├── backup.rs                   # 备份快照目录与恢复管理
│   │   ├── config.rs                   # 用户目录配置文件持久化
│   │   ├── lib.rs                      # Tauri IPC 命令处理与单实例事件
│   │   ├── main.rs                     # Windows 无控制台启动入口
│   │   ├── models.rs                   # 数据传输模型 (Serde)
│   │   ├── process_manager.rs          # 子进程调度、日志分流与端口预检
│   │   └── tray.rs                     # 系统托盘菜单与唤醒逻辑
│   ├── Cargo.toml                      # 依赖与轻量构建配置
│   └── tauri.conf.json                 # Tauri 2 核心窗口与打包配置
├── openlearn-manager.md                # 原始需求共识文档
├── mission.md                          # 任务愿景规范
├── README.md                           # 开源项目说明文档
└── LICENSE                             # MIT 许可证
```
