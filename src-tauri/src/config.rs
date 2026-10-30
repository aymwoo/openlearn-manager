use std::fs;
use std::path::PathBuf;
use crate::models::AppConfig;

pub fn get_config_dir() -> PathBuf {
    let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("openlearn-manager")
}

pub fn get_config_path() -> PathBuf {
    get_config_dir().join("config.json")
}

pub fn load_config() -> AppConfig {
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
