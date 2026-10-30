use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub port: u16,
    pub cli_version: Option<String>,
    pub db_path: Option<String>,
    pub theme: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            port: 3000,
            cli_version: None,
            db_path: None,
            theme: "system".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceStatus {
    pub is_running: bool,
    pub is_starting: bool,
    pub pid: Option<u32>,
    pub port: u16,
    pub cli_version: Option<String>,
    pub node_detected: bool,
    pub node_path: Option<String>,
    pub is_full_edition: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortCheckResult {
    pub available: bool,
    pub occupied_by_self: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub stream: String, // "stdout" | "stderr" | "system"
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupInfo {
    pub filename: String,
    pub filepath: String,
    pub size_bytes: u64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandOutputResult {
    pub success: bool,
    pub output: String,
}
