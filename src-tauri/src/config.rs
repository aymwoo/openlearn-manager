use std::fs;
use std::path::PathBuf;
use std::sync::Once;
use crate::models::AppConfig;

/// 便携模式迁移只做一次（进程内）
static MIGRATION: Once = Once::new();

/// 系统级配置目录（非便携模式使用）：Windows 上是
/// `C:\Users\<user>\AppData\Roaming\openlearn-manager`
pub fn system_config_dir() -> PathBuf {
    let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("openlearn-manager")
}

/// 实际使用的配置目录：便携模式下是 exe 同级的 `data/`
pub fn get_config_dir() -> PathBuf {
    crate::portable::config_dir().unwrap_or_else(system_config_dir)
}

pub fn get_config_path() -> PathBuf {
    get_config_dir().join("config.json")
}

/// 便携模式首次启动时，把系统目录里已有的 config.json 带过来，
/// 避免老用户一换绿色版就「设置全丢了」。
fn migrate_system_config_once() {
    MIGRATION.call_once(|| {
        if !crate::portable::is_portable() {
            return;
        }
        let Some(dest_dir) = crate::portable::config_dir() else {
            return;
        };
        let src = system_config_dir().join("config.json");
        let dst = dest_dir.join("config.json");
        if !dst.exists() {
            if let Ok(bytes) = fs::read(&src) {
                if fs::write(&dst, bytes).is_ok() {
                    eprintln!(
                        "[portable] 已迁移配置文件到便携目录: {}",
                        dst.display()
                    );
                }
            }
        }
    });
}

pub fn load_config() -> AppConfig {
    migrate_system_config_once();
    let path = get_config_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(config) = serde_json::from_str::<AppConfig>(&content) {
                return config;
            }
        }
    }
    AppConfig::default()
}

pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let dir = get_config_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建配置目录: {}", e))?;
    let path = get_config_path();
    let json = serde_json::to_string_pretty(config).map_err(|e| format!("序列化配置失败: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("保存配置文件失败: {}", e))?;
    Ok(())
}
