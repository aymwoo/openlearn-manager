use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub port: u16,
    pub cli_version: Option<String>,
    pub db_path: Option<String>,
    pub theme: String,
    /// npm 镜像源（npx 拉包用）。`None` = 使用内置默认镜像
    /// （DEFAULT_NPM_REGISTRY，即 registry.npmmirror.com）。
    /// 加 `#[serde(default)]` 是为了让老版本配置文件（没有这个字段）仍能正常反序列化，
    /// 否则 load_config 会解析失败并退回全默认配置，把用户已有设置全部冲掉。
    #[serde(default)]
    pub npm_registry: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            // openlearn-next 服务默认端口是 9000（CLI `-p` 缺省值）
            port: 9000,
            cli_version: None,
            db_path: None,
            theme: "system".to_string(),
            npm_registry: None,
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
    /// 实际探测到的 Node 版本号（已去掉 `v` 前缀，如 `24.22.3`）。
    /// 探测失败或未检测到 Node 时为 `None`。
    #[serde(default)]
    pub node_version: Option<String>,
    /// 该版本能否跑得动 openlearn-next（要求 >= 22.12：其产物里有 require(esm)）。
    /// 版本未知时按 `true` 处理，避免探测失败反而把用户吓一跳。
    #[serde(default = "default_true")]
    pub node_version_supported: bool,
    pub is_full_edition: bool,
}

fn default_true() -> bool {
    true
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
