# Gitee Release 镜像同步方案与实施规划 (方案 A)

## 1. 目标
通过本地自动化脚本，将 GitHub 上已发布的 `v0.1.0` 版本（以及后续任意版本）的代码、Tag 和 100MB 以内的全套安装包完整镜像到 Gitee 仓库的 Release 页面，为国内教师用户提供高速下载渠道。

---

## 2. 核心流程与步骤

### 2.1 仓库初始化与代码镜像
- 检查/创建 Gitee 远程公开仓库 `aymwoo/openlearn-manager`。
- 将本地 `main` 分支及所有 tags（含 `v0.1.0`）推送到 Gitee。
- 设置 Gitee 仓库为 Public（开源公开）。

### 2.2 GitHub Release 产物拉取
- 使用 `gh release download <tag> --dir .cache/release-downloads/<tag>` 下载官方发布的全部安装包。

### 2.3 Gitee Release 创建与附件上传
- 检查/创建 Gitee Release（Tag：`v0.1.0`）。
- 过滤机制：过滤超过 100MB 的文件（Gitee 社区版单文件上限 100MB，Linux DEB Full 版 117MB 自动跳过，其余 Windows Setup、MSI、macOS DMG、Linux AppImage 等全部上传）。
- 通过 Gitee OpenAPI 的 `attach_files` 端点逐一上传安装包附件并显示上传进度。

### 2.4 便捷指令配置
- 编写 Node 脚本 `scripts/sync-to-gitee.mjs`。
- 在 `package.json` 中添加 `"sync:gitee": "node scripts/sync-to-gitee.mjs"`。

---

## 3. 验证与产出
- 运行同步脚本，将 `v0.1.0` 完整镜像到 Gitee。
- 验证 Gitee Releases 页面链接与附件下载功能。
- 保存同步日志至 `artifacts/logs/gitee_sync.log`。
