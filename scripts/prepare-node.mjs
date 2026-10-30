#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const RESOURCES_DIR = path.resolve(ROOT_DIR, "src-tauri", "resources");
const NODE_TARGET_DIR = path.resolve(RESOURCES_DIR, "node");
const CACHE_DIR = path.resolve(ROOT_DIR, ".cache", "node-dist");

// Default Node.js LTS version to bundle
const DEFAULT_NODE_VERSION = "22.11.0";

// Parse CLI flags
const args = process.argv.slice(2);
function getArg(name, defaultValue = null) {
  const index = args.indexOf(`--${name}`);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return defaultValue;
}

const edition = (getArg("edition") || "full").toLowerCase();
const version = getArg("version") || DEFAULT_NODE_VERSION;
let targetPlatform = getArg("platform");

// Detect current host platform if not specified
if (!targetPlatform) {
  const plat = process.platform;
  const arch = process.arch;

  if (plat === "win32") {
    targetPlatform = arch === "arm64" ? "win-arm64" : "win-x64";
  } else if (plat === "darwin") {
    targetPlatform = arch === "arm64" ? "darwin-arm64" : "darwin-x64";
  } else if (plat === "linux") {
    targetPlatform = arch === "arm64" ? "linux-arm64" : "linux-x64";
  } else {
    targetPlatform = `${plat}-${arch}`;
  }
}

console.log(`[prepare-node] Target Mode: ${edition}`);
console.log(`[prepare-node] Platform: ${targetPlatform}, Node Version: ${version}`);

// Ensure base resources directory and placeholder keep file exist
fs.mkdirSync(RESOURCES_DIR, { recursive: true });
const keepFile = path.join(RESOURCES_DIR, ".keep");
if (!fs.existsSync(keepFile)) {
  fs.writeFileSync(keepFile, "");
}

if (edition === "lite") {
  console.log(`[prepare-node] Configuring for Lite Edition...`);
  if (fs.existsSync(NODE_TARGET_DIR)) {
    console.log(`[prepare-node] Removing embedded node from ${NODE_TARGET_DIR}`);
    fs.rmSync(NODE_TARGET_DIR, { recursive: true, force: true });
  }
  console.log(`[prepare-node] ✓ Lite edition ready (zero embedded node binary)`);
  process.exit(0);
}

// Full edition: download and extract Node runtime
fs.mkdirSync(CACHE_DIR, { recursive: true });
fs.mkdirSync(NODE_TARGET_DIR, { recursive: true });

const isWindows = targetPlatform.startsWith("win");
const extension = isWindows ? "zip" : "tar.gz";
const archiveName = `node-v${version}-${targetPlatform}.${extension}`;

// Support custom mirror (e.g. https://npmmirror.com/mirrors/node for fast download in CN)
const mirror = (process.env.NODEJS_MIRROR || getArg("mirror") || "https://nodejs.org/dist").replace(/\/$/, "");
const downloadUrl = `${mirror}/v${version}/${archiveName}`;
const localArchivePath = path.join(CACHE_DIR, archiveName);

async function downloadFile(url, dest) {
  if (fs.existsSync(dest)) {
    console.log(`[prepare-node] Using cached archive: ${dest}`);
    return;
  }
  console.log(`[prepare-node] Downloading Node.js from ${url}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const tempDest = `${dest}.downloading`;
  const fileStream = fs.createWriteStream(tempDest);
  const reader = response.body.getReader();
  let downloadedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const buffer = Buffer.from(value);
      fileStream.write(buffer);
      downloadedBytes += buffer.length;
      if (process.stdout.isTTY) {
        process.stdout.write(
          `\r[prepare-node] Received: ${(downloadedBytes / (1024 * 1024)).toFixed(2)} MB`
        );
      }
    }

    // Wait for the file stream to fully flush to disk
    await new Promise((resolve, reject) => {
      fileStream.on("finish", resolve);
      fileStream.on("error", reject);
      fileStream.end();
    });

    // Atomically rename complete archive
    fs.renameSync(tempDest, dest);
    console.log(`\n[prepare-node] Download completed: ${(downloadedBytes / (1024 * 1024)).toFixed(2)} MB`);
  } catch (err) {
    fileStream.destroy();
    if (fs.existsSync(tempDest)) {
      fs.rmSync(tempDest, { force: true });
    }
    throw err;
  }
}

async function extractAndInstall() {
  await downloadFile(downloadUrl, localArchivePath);

  console.log(`[prepare-node] Extracting archive to ${NODE_TARGET_DIR}...`);
  const tempExtractDir = path.join(CACHE_DIR, `temp-${targetPlatform}-${Date.now()}`);
  fs.mkdirSync(tempExtractDir, { recursive: true });

  try {
    if (isWindows) {
      // Use system tar which is built-in on Windows 10+ and GitHub Windows runners
      execSync(`tar -xf "${localArchivePath}" -C "${tempExtractDir}"`, { stdio: "inherit" });
    } else {
      execSync(`tar -xzf "${localArchivePath}" -C "${tempExtractDir}"`, { stdio: "inherit" });
    }

    const folderName = `node-v${version}-${targetPlatform}`;
    const extractedFolder = path.join(tempExtractDir, folderName);

    if (!fs.existsSync(extractedFolder)) {
      throw new Error(`Expected extracted folder ${extractedFolder} not found.`);
    }

    // Clean node target directory
    fs.rmSync(NODE_TARGET_DIR, { recursive: true, force: true });
    fs.mkdirSync(NODE_TARGET_DIR, { recursive: true });

    // Copy extracted payload
    copyDirectory(extractedFolder, NODE_TARGET_DIR);

    // Ensure binaries are executable on Unix
    if (!isWindows) {
      const binaries = ["node", "npm", "npx"];
      for (const b of binaries) {
        const binPath = path.join(NODE_TARGET_DIR, "bin", b);
        if (fs.existsSync(binPath)) {
          fs.chmodSync(binPath, 0o755);
        }
      }
      // Create convenient root-level symlink/alias node in NODE_TARGET_DIR/node
      const rootNode = path.join(NODE_TARGET_DIR, "node");
      const targetBinNode = path.join(NODE_TARGET_DIR, "bin", "node");
      if (fs.existsSync(targetBinNode) && !fs.existsSync(rootNode)) {
        try {
          fs.symlinkSync(path.join("bin", "node"), rootNode);
        } catch {
          fs.copyFileSync(targetBinNode, rootNode);
          fs.chmodSync(rootNode, 0o755);
        }
      }
    }

    console.log(`[prepare-node] ✓ Successfully prepared embedded Node.js for Full edition:`);
    console.log(`               Path: ${NODE_TARGET_DIR}`);
  } finally {
    fs.rmSync(tempExtractDir, { recursive: true, force: true });
  }
}

function copyDirectory(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isSymbolicLink()) {
      try {
        const linkTarget = fs.readlinkSync(srcPath);
        fs.symlinkSync(linkTarget, destPath);
      } catch {
        // Fallback to copying file if symlink fails
        fs.copyFileSync(srcPath, destPath);
      }
    } else if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

extractAndInstall().catch((err) => {
  console.error(`[prepare-node] Error:`, err);
  process.exit(1);
});
