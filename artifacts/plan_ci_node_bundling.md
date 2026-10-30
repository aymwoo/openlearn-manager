# GitHub Actions CI 自动集成各平台 Node 22 方案规划

## 1. 目标与需求
在 GitHub Actions CI/CD 构建流水线中：
- 自动化下载并校验对应操作系统（Windows x64、macOS arm64 / x64、Linux x64）的官方便携式 **Node 22 LTS**。
- 将便携版 Node 自动注入 `src-tauri/resources/node/` 目录。
- 通过 GitHub 矩阵构建（Build Matrix），同时或分别输出 **Full 版（自带 Node）** 与 **Lite 版（轻量便携）** 的安装包（`.exe/.msi`、`.dmg`、`.deb/.AppImage`），并自动发布到 GitHub Releases。

---

## 2. 核心架构设计

### 2.1 跨平台 Node 准备脚本 (`scripts/prepare-node.mjs`)
借助 CI 环境中已安装的 Node/pnpm 运行时，采用单一的 `.mjs` 脚本实现跨平台下载与解包，避免维护多套易出错的 bash / powershell 脚本：
- **目标源**：官方 Node.js 镜像 `https://nodejs.org/dist/v${NODE_VERSION}/`（默认 `22.11.0` LTS）
- **映射规则**：
  - Windows: `node-v22.11.0-win-x64.zip` -> 提取 `node.exe`, `npm`, `npx`
  - Linux: `node-v22.11.0-linux-x64.tar.gz` -> 提取 `bin/node`, `bin/npm`, `bin/npx`
  - macOS arm64: `node-v22.11.0-darwin-arm64.tar.gz` -> 提取 `bin/node`, `bin/npm`, `bin/npx`
  - macOS x64: `node-v22.11.0-darwin-x64.tar.gz` -> 提取 `bin/node`, `bin/npm`, `bin/npx`
- **缓存机制**：脚本检查若已存在对应文件则跳过下载；在 CI 中结合 `actions/cache` 可实现秒级构建。

### 2.2 GitHub Actions 矩阵流 (`.github/workflows/release.yml`)
使用 GitHub Actions Matrix：
```yaml
strategy:
  matrix:
    include:
      - os: windows-latest
        target: x86_64-pc-windows-msvc
        platform: win-x64
      - os: macos-latest
        target: aarch64-apple-darwin
        platform: darwin-arm64
      - os: macos-13
        target: x86_64-apple-darwin
        platform: darwin-x64
      - os: ubuntu-22.04
        target: x86_64-unknown-linux-gnu
        platform: linux-x64
```

### 2.3 版本分流策略
可选择两种分发策略（请您确认倾向哪种）：
- **策略 A（单次发布包含双版本，推荐）**：每个平台分别构建输出：
  - `OpenLearn-Manager-v0.1.0-Full-...`（内嵌 Node 22，零门槛即装即用）
  - `OpenLearn-Manager-v0.1.0-Lite-...`（轻量体积 15MB，依赖系统环境）
- **策略 B（仅专注于 Full 安装版）**：所有 Release 产物均自动嵌入 Node 22，最大程度降低终端教师使用成本。

---

## 3. 待实施步骤
1. 创建 `scripts/prepare-node.mjs` 跨平台 Node 22 下载与提取脚本。
2. 在 `package.json` 中配置辅助命令（如 `pnpm prepare:node`）。
3. 编写 `.github/workflows/release.yml`，集成 Linux 依赖、Rust 缓存、Node 嵌入与 `tauri-apps/tauri-action`。
4. 本地验证脚本的下载与解压兼容性。
