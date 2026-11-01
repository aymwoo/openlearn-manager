#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const MAX_ATTACHMENT_SIZE_BYTES = 100 * 1024 * 1024; // 100MB limit on Gitee

// 1. Resolve Gitee Access Token
function getGiteeToken() {
  if (process.env.GITEE_TOKEN) return process.env.GITEE_TOKEN.trim();
  const credPath = path.join(os.homedir(), ".config", "gitee", "credentials.yml");
  if (fs.existsSync(credPath)) {
    const content = fs.readFileSync(credPath, "utf8");
    const m = content.match(/token:\s*([^\s]+)/);
    if (m) return m[1].trim();
  }
  throw new Error("Gitee Access Token not found in GITEE_TOKEN or ~/.config/gitee/credentials.yml");
}

const token = getGiteeToken();

// Parse target tag from CLI arguments
const args = process.argv.slice(2);
// `--no-push` 只镜像 Release 与安装包，不推送代码/标签
const skipPush = args.includes("--no-push");
// Windows 上 gh 常不在 PATH（例如装在 C:\Program Files\GitHub CLI），可用 GH_BIN 指定绝对路径
const GH_BIN = process.env.GH_BIN || "gh";

let targetTag = args.find((a) => !a.startsWith("--"));
if (!targetTag) {
  try {
    targetTag = execSync("git describe --tags --abbrev=0", { encoding: "utf8" }).trim();
  } catch {
    targetTag = "v0.1.0";
  }
}

const owner = "aymwoo";
const repo = "openlearn-manager";

// Gitee 社区版「仓库附件总配额」只有 1GB，而一个全平台版本就要 ~370MB，
// 发到第 4 个版本就会撞上限（API 返回 400：文件大小已超出仓库附件配额）。
// 因此每次同步前只保留最近 KEEP_RELEASES 个版本的附件，更老的只留 Release/tag 元信息。
const KEEP_RELEASES = Number(process.env.KEEP_RELEASES || 2);

console.log(`[sync-gitee] Starting Gitee Release Mirror for tag: ${targetTag}`);
console.log(`[sync-gitee] Target Repo: ${owner}/${repo}`);

async function apiRequest(endpoint, options = {}) {
  const url = new URL(`https://gitee.com/api/v5${endpoint}`);
  const method = options.method || "GET";
  const headers = { ...options.headers };

  if (method === "GET" || method === "DELETE") {
    url.searchParams.set("access_token", token);
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: options.body,
  });

  return res;
}

async function ensureGiteeRepo() {
  console.log(`[sync-gitee] Checking if Gitee repository exists...`);
  const checkRes = await apiRequest(`/repos/${owner}/${repo}`);

  if (checkRes.status === 404) {
    console.log(`[sync-gitee] Repo does not exist, creating Gitee repository ${owner}/${repo}...`);
    const createRes = await apiRequest("/user/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: token,
        name: repo,
        description: "OpenLearn-Next 本地 Web 服务图形化桌面管理器 (Gitee 镜像)",
        private: true, // Created private initially per Gitee rules
      }),
    });
    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`Failed to create repository on Gitee: ${createRes.status} ${err}`);
    }
    console.log(`[sync-gitee] ✓ Created repo on Gitee.`);
  }

  // Push main branch and tags
  console.log(`[sync-gitee] Pushing code & tags to Gitee via SSH...`);
  const sshKey = path.join(os.homedir(), ".ssh", "gitee", "gitee");
  const sshCmd = fs.existsSync(sshKey)
    ? `ssh -F /dev/null -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes -i "${sshKey}"`
    : `ssh -o StrictHostKeyChecking=accept-new`;

  if (skipPush) {
    console.log(`[sync-gitee] ⏩ --no-push 已指定，跳过代码与标签推送。`);
  } else {
    try {
      // 注意：Windows 的 execSync 走 cmd.exe，`VAR='v' git ...` 这种 POSIX 前缀赋值语法
      // 会被当成命令名而直接失败，所以这里改用 env 选项传递 GIT_SSH_COMMAND。
      execSync(`git push git@gitee.com:${owner}/${repo}.git main --tags --force`, {
        stdio: "inherit",
        env: { ...process.env, GIT_SSH_COMMAND: sshCmd },
      });
    } catch (err) {
      console.warn(`[sync-gitee] Git push warning:`, err.message);
      console.warn(
        `[sync-gitee] 代码/标签未推送成功：请确认 Gitee 已添加本机 SSH 公钥，或改用 --no-push 只同步 Release。`
      );
    }
  }

  // Ensure repository is public
  console.log(`[sync-gitee] Ensuring repository is public...`);
  await apiRequest(`/repos/${owner}/${repo}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: token,
      name: repo,
      private: false,
    }),
  });
}

async function getOrCreateRelease() {
  console.log(`[sync-gitee] Querying existing Gitee releases for ${targetTag}...`);
  const checkRes = await apiRequest(`/repos/${owner}/${repo}/releases/tags/${targetTag}`);

  if (checkRes.ok) {
    const data = await checkRes.json();
    if (data && data.id) {
      console.log(`[sync-gitee] Found existing release ID: ${data.id}`);
      return data.id;
    }
  }

  console.log(`[sync-gitee] Creating new Gitee release for ${targetTag}...`);
  const createRes = await apiRequest(`/repos/${owner}/${repo}/releases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: token,
      tag_name: targetTag,
      name: `OpenLearn Manager ${targetTag} (全平台安装包镜像)`,
      body: `### OpenLearn Manager ${targetTag} 国内镜像下载\n\n本 Release 自动镜像自 GitHub 官方发布版本，为国内用户提供高速直连下载。\n\n- **Windows**: 一键安装包 (\`.exe\`) / 企业 MSI 安装包 (\`.msi\`)\n- **macOS**: DMG 安装镜像 (支持 Apple Silicon M系列)\n- **Linux**: 便携运行包 (\`.AppImage\`) / DEB 安装包\n\n> 💡 说明：根据 Gitee 社区版单文件 100MB 限制，超过 100MB 的文件请下载 AppImage 或前往 [GitHub Releases](https://github.com/aymwoo/openlearn-manager/releases/tag/${targetTag}) 下载。`,
      target_commitish: "main",
      prerelease: false,
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create release on Gitee: ${createRes.status} ${err}`);
  }

  const createdData = await createRes.json();
  console.log(`[sync-gitee] ✓ Successfully created Gitee Release ID: ${createdData.id}`);
  return createdData.id;
}

/**
 * 释放 Gitee 仓库附件配额：只保留最近 KEEP_RELEASES 个版本的安装包附件。
 * 更老版本的 Release 页面与 tag 保留，仅删除附件文件（GitHub 上仍是完整的）。
 */
async function pruneOldReleases() {
  const res = await apiRequest(`/repos/${owner}/${repo}/releases?per_page=100`);
  if (!res.ok) {
    console.warn(`[sync-gitee] ⚠️  无法读取 Gitee Release 列表，跳过旧附件清理。`);
    return;
  }
  const releases = await res.json();
  const sorted = [...releases].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const keep = new Set(sorted.slice(0, KEEP_RELEASES).map((r) => r.id));

  let freedBytes = 0;
  for (const r of sorted) {
    if (keep.has(r.id)) continue;
    const listRes = await apiRequest(`/repos/${owner}/${repo}/releases/${r.id}/attach_files`);
    if (!listRes.ok) continue;
    const files = await listRes.json();
    if (!Array.isArray(files) || files.length === 0) continue;

    console.log(
      `[sync-gitee] 🧹 清理 ${r.tag_name} 的 ${files.length} 个附件（仓库附件配额 1GB，仅保留最近 ${KEEP_RELEASES} 个版本）...`
    );
    for (const f of files) {
      const delRes = await apiRequest(
        `/repos/${owner}/${repo}/releases/${r.id}/attach_files/${f.id}`,
        { method: "DELETE" }
      );
      if (delRes.ok || delRes.status === 204) {
        freedBytes += f.size || 0;
        console.log(`[sync-gitee]    🗑️  已删除 ${f.name}`);
      } else {
        console.warn(`[sync-gitee]    ⚠️  删除失败 ${f.name}: HTTP ${delRes.status}`);
      }
    }
  }

  if (freedBytes > 0) {
    console.log(`[sync-gitee] ✓ 共释放 ${(freedBytes / (1024 * 1024)).toFixed(1)} MB 附件配额。`);
  } else {
    console.log(`[sync-gitee] 旧附件清理：无需清理。`);
  }
}

/** 同步完成后把「缺失的大文件」「保留策略」写进 Release 说明 */
async function updateReleaseBody(releaseId, skippedNames) {
  const missing =
    skippedNames.length > 0
      ? `\n> ⚠️ **本镜像缺失 ${skippedNames.length} 个文件**：受 Gitee 社区版「单文件 100MB」限制，以下文件无法上传，请前往 [GitHub Releases](https://github.com/${owner}/${repo}/releases/tag/${targetTag}) 下载：\n` +
        skippedNames.map((n) => `> - \`${n}\``).join("\n") +
        `\n`
      : "";

  const body =
    `### OpenLearn Manager ${targetTag} 国内镜像下载\n\n` +
    `本 Release 自动镜像自 GitHub 官方发布版本，为国内用户提供高速直连下载。\n\n` +
    `- **Windows**：一键安装包 \`.exe\` / 企业部署 MSI \`.msi\` / 绿色免安装版 \`.zip\`\n` +
    `- **macOS**：DMG 安装镜像（Intel x64 与 Apple Silicon aarch64 各含 Lite / Full 两版）\n` +
    `- **Linux**：AppImage 便携运行包 / DEB 安装包\n\n` +
    `**Windows 绿色版**：下载 \`*_x64-portable-*.zip\`，解压即用、无需安装。压缩包内带 \`portable.txt\` 标记文件，` +
    `程序会自动把配置和数据库存放在解压目录下的 \`data/\` 中，整个文件夹拷到 U 盘或另一台电脑即可继续使用；` +
    `首次运行会自动迁移已有的 \`~/openlearn-next\` 数据。\n\n` +
    `Lite 版体积小、首次启动会联网安装 OpenLearn Next；Full 版内置 Node 与依赖，离线可直接启动。\n` +
    missing +
    `\n> 另外，Gitee 仓库附件总配额为 1 GB，镜像仅保留最近 ${KEEP_RELEASES} 个版本的安装包；历史版本的安装包请在 GitHub 获取。\n`;

  const res = await apiRequest(`/repos/${owner}/${repo}/releases/${releaseId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: token,
      tag_name: targetTag, // Gitee 的 PATCH 要求必填，否则 400 tag_name is missing
      name: `OpenLearn Manager ${targetTag} (全平台安装包镜像)`,
      body,
    }),
  });

  if (res.ok) {
    console.log(`[sync-gitee] ✓ Release 说明已更新。`);
  } else {
    console.warn(`[sync-gitee] ⚠️  Release 说明更新失败: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

/** GitHub → 本地；网络不稳时用 curl -C - 断点续传，直到字节数与 GitHub 一致 */
function downloadAssetWithResume(asset, filePath, maxAttempts = 30) {
  const url = `https://github.com/${owner}/${repo}/releases/download/${targetTag}/${asset.name}`;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const have = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    if (have >= asset.size) return true;
    if (attempt === 1 || attempt % 5 === 0) {
      console.log(
        `[sync-gitee]    ↓ 第 ${attempt} 次续传：${(have / (1024 * 1024)).toFixed(1)} / ${(
          asset.size /
          (1024 * 1024)
        ).toFixed(1)} MB`
      );
    }
    try {
      execSync(`curl -sL -C - -o "${filePath}" "${url}"`, { stdio: "pipe" });
    } catch {
      /* 网络抖动，下一轮继续续传 */
    }
  }
  const have = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
  return have >= asset.size;
}

async function syncAssetsStreaming(releaseId, downloadDir) {
  fs.mkdirSync(downloadDir, { recursive: true });

  // 1. Get Gitee existing attachments
  const listRes = await apiRequest(`/repos/${owner}/${repo}/releases/${releaseId}/attach_files`);
  const giteeExisting = new Set();
  if (listRes.ok) {
    const files = await listRes.json();
    for (const f of files) {
      if (f.name) giteeExisting.add(f.name);
    }
  }

  // 2. Query GitHub assets list
  console.log(`[sync-gitee] Fetching asset list from GitHub release ${targetTag}...`);
  const ghListRaw = execSync(`"${GH_BIN}" release view ${targetTag} --repo ${owner}/${repo} --json assets`, {
    encoding: "utf8",
  });
  const ghAssets = JSON.parse(ghListRaw).assets || [];

  // Filter and sort: small files & Windows installers first
  const eligibleAssets = ghAssets
    .filter((a) => a.size <= MAX_ATTACHMENT_SIZE_BYTES)
    .sort((a, b) => {
      // Prioritize smaller files (e.g. Lite packages 1~3MB) and Windows setup
      return a.size - b.size;
    });

  const skippedOver100MB = ghAssets.filter((a) => a.size > MAX_ATTACHMENT_SIZE_BYTES);
  for (const s of skippedOver100MB) {
    console.log(
      `[sync-gitee] ⚠️  Skipping ${s.name} (${(s.size / (1024 * 1024)).toFixed(2)} MB): Exceeds Gitee 100MB limit.`
    );
  }

  console.log(`[sync-gitee] Eligible assets to mirror: ${eligibleAssets.length}`);

  for (let i = 0; i < eligibleAssets.length; i++) {
    const asset = eligibleAssets[i];
    const fileName = asset.name;
    const filePath = path.join(downloadDir, fileName);

    if (giteeExisting.has(fileName)) {
      console.log(`[sync-gitee] (${i + 1}/${eligibleAssets.length}) ⏩ Already on Gitee: ${fileName}`);
      continue;
    }

    console.log(
      `\n[sync-gitee] (${i + 1}/${eligibleAssets.length}) 📥 Downloading ${fileName} (${(
        asset.size /
        (1024 * 1024)
      ).toFixed(2)} MB)...`
    );

    // 直接用 curl 断点续传（gh release download 在大文件上经常卡死且无法续传）
    const ok = downloadAssetWithResume(asset, filePath);
    if (!ok) {
      const have = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
      console.error(
        `[sync-gitee] ❌ 下载不完整，跳过：${fileName}（${have} / ${asset.size} 字节）`
      );
      continue;
    }

    console.log(`[sync-gitee] ⬆️  Uploading ${fileName} to Gitee...`);
    try {
      const curlOut = execSync(
        `curl -s -S -X POST "https://gitee.com/api/v5/repos/${owner}/${repo}/releases/${releaseId}/attach_files" -F "access_token=${token}" -F "file=@${filePath}"`,
        { encoding: "utf8" }
      );
      const resJson = JSON.parse(curlOut);
      if (resJson && resJson.id) {
        console.log(`[sync-gitee] ✓ Successfully uploaded ${fileName} to Gitee! (Asset ID: ${resJson.id})`);
      } else {
        console.warn(`[sync-gitee] Upload response: ${curlOut}`);
      }
      // Clean downloaded file to save disk
      try {
        fs.unlinkSync(filePath);
      } catch {}
    } catch (err) {
      console.error(`[sync-gitee] ❌ Failed to upload ${fileName}:`, err.message);
    }
  }
}

async function main() {
  const downloadDir = path.resolve(ROOT_DIR, ".cache", "release-downloads", targetTag);

  await ensureGiteeRepo();
  const releaseId = await getOrCreateRelease();
  // 先腾出配额再上传，否则会撞上「文件大小已超出仓库附件配额：1 GB」
  await pruneOldReleases();
  await syncAssetsStreaming(releaseId, downloadDir);

  const skippedOver100MB = (
    JSON.parse(
      execSync(`"${GH_BIN}" release view ${targetTag} --repo ${owner}/${repo} --json assets`, {
        encoding: "utf8",
      })
    ).assets || []
  ).filter((a) => a.size > MAX_ATTACHMENT_SIZE_BYTES);
  await updateReleaseBody(
    releaseId,
    skippedOver100MB.map((a) => a.name)
  );

  console.log(`\n========================================================`);
  console.log(`[sync-gitee] 🎉 Gitee Release Mirror Completed!`);
  console.log(`             Release URL: https://gitee.com/${owner}/${repo}/releases/tag/${targetTag}`);
  console.log(`========================================================`);
}

main().catch((err) => {
  console.error(`[sync-gitee] Error:`, err);
  process.exit(1);
});
