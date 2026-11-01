//! 便携（绿色版）模式支持
//!
//! 规则很简单：**exe 所在目录下存在 `portable.txt` 就进入便携模式**。
//! 此时配置、备份、以及服务数据库都放到 exe 同级的 `data/` 目录里，
//! 整个文件夹拷到 U 盘就能连数据一起带走。
//!
//! 安装包（NSIS/MSI）的目录里没有这个文件，行为与之前完全一致
//! （配置在 AppData\Roaming、备份在「文档\OpenLearn」），互不影响。

use std::path::PathBuf;
use std::sync::Once;

/// 便携模式标记文件名
pub const MARKER_FILE: &str = "portable.txt";

/// 便携模式下的数据根目录名
const DATA_DIR_NAME: &str = "data";

/// 自动迁移数据库时允许的最大体积（超过就不搬，避免把 U 盘撑爆）
const MAX_DB_MIGRATE_BYTES: u64 = 300 * 1024 * 1024;

/// 数据库迁移同样只做一次
static DB_MIGRATION: Once = Once::new();

/// 便携模式提示只打印一次
static ANNOUNCED: Once = Once::new();

/// 当前 exe 所在目录
fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
}

/// 是否处于便携模式
pub fn is_portable() -> bool {
    exe_dir()
        .map(|dir| dir.join(MARKER_FILE).exists())
        .unwrap_or(false)
}

/// 便携模式下的 `data/` 目录（不存在则创建）。
/// 非便携模式返回 `None`，调用方回退到系统目录。
pub fn data_dir() -> Option<PathBuf> {
    if !is_portable() {
        return None;
    }
    let dir = exe_dir()?.join(DATA_DIR_NAME);
    std::fs::create_dir_all(&dir).ok()?;
    ANNOUNCED.call_once(|| {
        eprintln!("[portable] 便携模式已启用，数据目录: {}", dir.display());
    });
    Some(dir)
}

/// 配置文件目录：便携模式下就是 `data/`
pub fn config_dir() -> Option<PathBuf> {
    data_dir()
}

/// 备份目录：便携模式下是 `data/backups`
pub fn backup_dir() -> Option<PathBuf> {
    let dir = data_dir()?.join("backups");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

/// 便携模式下 openlearn-next 数据库的默认路径：`data/openlearn-next/data.db`
///
/// 注意只作为**兜底**：用户在设置里显式填过的 db_path 优先级更高。
pub fn default_db_path() -> Option<String> {
    migrate_default_db_once();
    let file = data_dir()?.join("openlearn-next").join("data.db");
    if let Some(parent) = file.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    Some(file.to_string_lossy().to_string())
}

/// openlearn-next 在非便携模式下的默认数据目录：`~/openlearn-next`
fn system_default_db_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join("openlearn-next"))
}

/// 便携版首次启动时，把 `~/openlearn-next` 里已有的数据库搬进 `data/`，
/// 这样老用户换绿色版不会「数据不见了」。
fn migrate_default_db_once() {
    DB_MIGRATION.call_once(|| {
        let (Some(src), Some(dest_root)) = (system_default_db_dir(), data_dir()) else {
            return;
        };
        let dest = dest_root.join("openlearn-next");
        // 目标已有库、或源目录根本没库，都不需要搬
        if dest.join("data.db").exists() || !src.join("data.db").exists() {
            return;
        }
        if dir_size(&src) > MAX_DB_MIGRATE_BYTES {
            eprintln!(
                "[portable] 检测到 {} 体积超过 300MB，跳过自动迁移；\
                 请改用「备份 / 恢复」功能手动迁移数据。",
                src.display()
            );
            return;
        }
        if copy_dir_skip_backups(&src, &dest).is_ok() {
            eprintln!("[portable] 已迁移数据库到便携目录: {}", dest.display());
        }
    });
}

/// 目录总大小（递归）
fn dir_size(dir: &std::path::Path) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                total += dir_size(&path);
            } else if let Ok(meta) = entry.metadata() {
                total += meta.len();
            }
        }
    }
    total
}

/// 递归复制目录，跳过 `backups`（便携版备份另有 data/backups）
fn copy_dir_skip_backups(src: &std::path::Path, dest: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dest)?;
    for entry in std::fs::read_dir(src)?.flatten() {
        let name = entry.file_name();
        if entry.path().is_dir() && name == "backups" {
            continue;
        }
        let target = dest.join(&name);
        if entry.path().is_dir() {
            copy_dir_skip_backups(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

/// 决定最终使用的数据库路径：用户显式配置 > 便携默认 > 不传（CLI 自己的默认）
pub fn resolve_db_path(user_choice: Option<String>) -> Option<String> {
    match user_choice {
        Some(p) if !p.trim().is_empty() => Some(p.trim().to_string()),
        _ => default_db_path(),
    }
}

/// 从配置里取出最终数据库路径（便携模式下为空时补上便携默认值）
pub fn db_path_from_config(config: &crate::models::AppConfig) -> Option<String> {
    resolve_db_path(config.db_path.clone())
}

/// 给前端展示用：当前实际使用的数据目录 + 是否便携模式
pub fn data_dir_display() -> (bool, Option<String>) {
    let portable = is_portable();
    let dir = if portable {
        data_dir().map(|d| d.to_string_lossy().to_string())
    } else {
        // 非便携模式：配置所在目录更能代表「数据在哪」
        Some(
            crate::config::system_config_dir()
                .to_string_lossy()
                .to_string(),
        )
    };
    (portable, dir)
}
