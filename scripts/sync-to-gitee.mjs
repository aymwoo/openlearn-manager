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
let targetTag = args[0];
if (!targetTag) {
  try {
    targetTag = execSync("git describe --tags --abbrev=0", { encoding: "utf8" }).trim();
  } catch {
    targetTag = "v0.1.0";
  }
}

const owner = "aymwoo";
const repo = "openlearn-manager";

console.log(`[sync-gitee] Starting Gitee Release Mirror for tag: ${targetTag}`);
console.log(`[sync-gitee] Target Repo: ${owner}/${repo}`);

async function apiRequest(endpoint, options = {}) {
  const url = new URL(`https://gitee.com/api/v5${endpoint}`);
  const method = options.method || "GET";
  const headers = { ...options.headers };

  if (method === "GET") {
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

  try {
    execSync(`GIT_SSH_COMMAND='${sshCmd}' git push git@gitee.com:${owner}/${repo}.git main --tags --force`, {
      stdio: "inherit",
    });
  } catch (err) {
    console.warn(`[sync-gitee] Git push warning:`, err.message);
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
  const ghListRaw = execSync(`gh release view ${targetTag} --json assets`, { encoding: "utf8" });
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

    execSync(`gh release download ${targetTag} --pattern "${fileName}" --dir "${downloadDir}" --clobber`, {
      stdio: "inherit",
    });

    if (!fs.existsSync(filePath)) {
      console.error(`[sync-gitee] File not downloaded: ${fileName}`);
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
  await syncAssetsStreaming(releaseId, downloadDir);

  console.log(`\n========================================================`);
  console.log(`[sync-gitee] 🎉 Gitee Release Mirror Completed!`);
  console.log(`             Release URL: https://gitee.com/${owner}/${repo}/releases/tag/${targetTag}`);
  console.log(`========================================================`);
}

main().catch((err) => {
  console.error(`[sync-gitee] Error:`, err);
  process.exit(1);
});
