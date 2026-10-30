# Full 版本（内嵌 Node 22 LTS）测试方案与实施计划

## 1. 目标与背景
OpenLearn Manager 设计区分为两种分发形态：
- **Lite 便携版**：体积小（约 15~20MB），依赖宿主机预装 Node 20+，未检测到时弹出红色警告横幅。
- **Full 安装版**：内嵌便携版 Node 22 LTS（打包在 `resources/node/` 目录下），开箱即用，无需用户配置任何运行环境。

用户希望测试 Full 版本在管理器中的行为、界面呈现及进程调度。

---

## 2. 四层测试方案

### 层次一：纯浏览器 Mock 预览（零环境依赖，1秒验证 UI）
- **操作方式**：运行 `pnpm dev`，在浏览器访问 `http://localhost:1420/?edition=full`
- **预期效果**：
  - 首页「版本分发模式」卡片显示：`Full 安装版 (内嵌 Node 22)`
  - 路径提示显示：`resources/node/node (内嵌 Node 22 LTS)`
  - 红色「未安装 Node」警示条绝不出现
  - 关于页面环境诊断表格显示：`版本架构: Full (内嵌 Node 22)`

### 层次二：Tauri 本地开发模式环境变量模拟（无缝联调真实进程）
- **操作方式**：
  ```bash
  OPENLEARN_FORCE_FULL=1 pnpm tauri dev
  # 或者指定具体嵌入路径测试：
  OPENLEARN_EMBEDDED_NODE=/path/to/node pnpm tauri dev
  ```
- **预期效果**：Rust 后端在初始化探测 Node 时识别测试环境变量，直接以 Full 版模式运行，并拉起本地服务。

### 层次三：本地文件系统真实内嵌目录模拟（完全模拟打包环境）
- **操作方式**：
  在工程中创建 `src-tauri/resources/node/`，将当前环境的 node 可执行文件软链接进去：
  ```bash
  mkdir -p src-tauri/resources/node
  ln -sf $(which node) src-tauri/resources/node/node
  pnpm tauri dev
  ```
- **预期效果**：Tauri 在开发模式下优先探测到工程根目录及资源目录的 `node/node`，自动激活 Full 版并将其作为优先运行时拉起子进程。

### 层次四：生产安装包打包构建测试
- **操作方式**：
  配置 `tauri.conf.json` 的 `bundle.resources`，放入便携版 Node 22 二进制后运行 `pnpm tauri build`。

---

## 3. 实施步骤
1. **代码增强**：
   - 修改 `src/services/api.ts`：支持 URL 参数 `edition=full`。
   - 修改 `src-tauri/src/process_manager.rs`：增强 `detect_node()`，支持环境变量和工程相对资源路径探测。
   - 修改 `src-tauri/tauri.conf.json`：配置 `resources` 打包规则。
   - 修改 `package.json`：增加便捷调试脚本 `dev:full`。
2. **测试验证**：
   - 验证 Browser 模式 `?edition=full`。
   - 验证本地软链接及环境变量探测。
   - 运行类型检查与构建，保存日志至 `artifacts/logs/full_edition_test.log`。
   - 抓取 Full 版本界面的测试截图至 `artifacts/screenshots/screenshot_full_edition.png`。
