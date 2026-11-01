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
            // openlearn-next 服务默认端口是 9000（CLI `-p` 缺省值）
            port: 9000,
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
    /// 进程内单调递增的序号。前端靠它去重：同一条日志被重复投递时只渲染一次。
    /// 序号不随「清空日志」归零，保证跨清空仍然严格递增。
    pub id: u64,
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

/// 当前数据落在哪（关于页展示用）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataDirInfo {
    /// 是否为绿色版（便携）模式
    pub portable: bool,
    /// 数据目录；取不到时为空字符串
    pub path: String,
}
