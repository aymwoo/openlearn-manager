use std::fs;
use std::path::PathBuf;
use chrono::Local;
use crate::models::BackupInfo;

pub fn get_backup_dir() -> PathBuf {
    // 便携（绿色版）模式：备份落在 exe 同级的 data/backups
    if let Some(dir) = crate::portable::backup_dir() {
        return dir;
    }
    let docs = dirs::document_dir().unwrap_or_else(|| {
        dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")).join("Documents")
    });
    docs.join("OpenLearn").join("backups")
}

pub fn ensure_backup_dir() -> Result<PathBuf, String> {
    let dir = get_backup_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("创建备份目录失败: {}", e))?;
    }
    Ok(dir)
}

pub fn generate_backup_filename() -> String {
    let now = Local::now();
    format!("openlearn-{}.db", now.format("%Y%m%d-%H%M%S"))
}

pub fn list_backups() -> Result<Vec<BackupInfo>, String> {
    let dir = ensure_backup_dir()?;
    let mut backups = Vec::new();

    let entries = fs::read_dir(&dir).map_err(|e| format!("读取备份目录失败: {}", e))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with("openlearn-") && name.ends_with(".db") {
                    let metadata = entry.metadata().ok();
                    let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
                    let created = metadata
                        .and_then(|m| m.modified().ok())
                        .map(|t| {
                            let dt: chrono::DateTime<Local> = t.into();
                            dt.format("%Y-%m-%d %H:%M:%S").to_string()
                        })
                        .unwrap_or_else(|| "未知时间".to_string());

                    backups.push(BackupInfo {
                        filename: name.to_string(),
                        filepath: path.to_string_lossy().to_string(),
                        size_bytes: size,
                        created_at: created,
                    });
                }
            }
        }
    }

    // Sort newest first
    backups.sort_by(|a, b| b.filename.cmp(&a.filename));
    Ok(backups)
}
