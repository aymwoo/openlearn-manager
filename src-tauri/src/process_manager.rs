use std::collections::VecDeque;
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, Instant};

use chrono::Local;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::TcpStream;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::models::{AppConfig, CommandOutputResult, LogEntry, PortCheckResult, ServiceStatus};

const MAX_LOG_LINES: usize = 2000;
/// 失败时用于回溯的最近输出行数（stdout/stderr 合并，按时间顺序）
const MAX_RECENT_OUTPUT: usize = 80;
/// 等待服务真正就绪的最长时间：首次 npx 需要联网下载 CLI 包，给足时间
const START_TIMEOUT: Duration = Duration::from_secs(180);
/// 就绪探测间隔
const READY_POLL_INTERVAL: Duration = Duration::from_millis(500);
/// 每多久向日志汇报一次「仍在等待」
const PROGRESS_REPORT_INTERVAL: Duration = Duration::from_secs(10);
/// 停止后等待端口释放的时间。
/// openlearn-next 的 cli.mjs 收到 SIGTERM 后会转发给真正监听端口的
/// node server 子进程，并预留最长 35s 优雅关机缓冲，因此这里不能只等几秒。
const PORT_RELEASE_TIMEOUT: Duration = Duration::from_secs(15);

pub struct ProcessState {
    pub child: Option<Child>,
    pub pid: Option<u32>,
    pub port: u16,
    pub is_running: bool,
    pub is_starting: bool,
    pub cli_version: Option<String>,
    pub logs: VecDeque<LogEntry>,
    /// 日志序号发号器，只增不减（清空日志也不归零）
    pub next_log_id: u64,
    /// 当前这次启动过程中的原始输出，启动失败时用于拼错误信息
    pub recent_output: VecDeque<String>,
}

impl ProcessState {
    pub fn new() -> Self {
        Self {
            child: None,
            pid: None,
            // 与 openlearn-next CLI 的默认端口保持一致
            port: 9000,
            is_running: false,
            is_starting: false,
            cli_version: None,
            logs: VecDeque::with_capacity(MAX_LOG_LINES),
            next_log_id: 0,
            recent_output: VecDeque::with_capacity(MAX_RECENT_OUTPUT),
        }
    }

    pub fn append_log(&mut self, stream: &str, message: &str) -> LogEntry {
        let id = self.next_log_id;
        self.next_log_id = self.next_log_id.wrapping_add(1);
        let entry = LogEntry {
            id,
            timestamp: Local::now().format("%H:%M:%S").to_string(),
            stream: stream.to_string(),
            message: message.to_string(),
        };

        if self.logs.len() >= MAX_LOG_LINES {
            self.logs.pop_front();
        }
        self.logs.push_back(entry.clone());
        entry
    }

    /// 记录子进程原始输出：既进日志面板，也留一份供失败时回溯
    pub fn append_output(&mut self, stream: &str, line: &str) -> LogEntry {
        if self.recent_output.len() >= MAX_RECENT_OUTPUT {
            self.recent_output.pop_front();
        }
        self.recent_output.push_back(line.to_string());
        self.append_log(stream, line)
    }

    /// 取最近 n 行原始输出，用于失败信息
    pub fn tail_output(&self, n: usize) -> String {
        let start = self.recent_output.len().saturating_sub(n);
        self.recent_output
            .iter()
            .skip(start)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    }
}

pub struct ServiceManager {
    pub state: Arc<Mutex<ProcessState>>,
}

/// 常见 Node 安装位置兜底（桌面 GUI 从启动器拉起时 PATH 往往被精简）
fn candidate_node_paths() -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    #[cfg(target_os = "windows")]
    {
        for base in [
            std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".to_string()),
            std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| String::new()),
            std::env::var("LOCALAPPDATA").unwrap_or_else(|_| String::new()),
        ] {
            if base.is_empty() {
                continue;
            }
            candidates.push(PathBuf::from(base).join("nodejs").join("node.exe"));
        }
        if let Some(home) = dirs::home_dir() {
            candidates.push(home.join("AppData").join("Roaming").join("nvm"));
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Some(home) = dirs::home_dir() {
            // nvm：取版本号最大的那个
            let nvm_root = home.join(".nvm").join("versions").join("node");
            if let Ok(entries) = std::fs::read_dir(&nvm_root) {
                let mut dirs: Vec<PathBuf> = entries
                    .flatten()
                    .map(|e| e.path())
                    .filter(|p| p.is_dir())
                    .collect();
                dirs.sort();
                dirs.reverse();
                for d in dirs {
                    candidates.push(d.join("bin").join("node"));
                }
            }
            candidates.push(home.join(".volta").join("bin").join("node"));
            candidates.push(home.join(".local").join("bin").join("node"));
        }
        candidates.push(PathBuf::from("/usr/local/bin/node"));
        candidates.push(PathBuf::from("/opt/homebrew/bin/node"));
        candidates.push(PathBuf::from("/usr/bin/node"));
        candidates.push(PathBuf::from("/opt/local/bin/node"));
    }

    candidates
}

/// 在 Node 所在目录或其同级 bin/ 目录下找 npx（Windows 上是 npx.cmd）
fn resolve_npx(node_path: Option<&str>) -> Option<PathBuf> {
    let dir = PathBuf::from(node_path?).parent()?.to_path_buf();

    #[cfg(target_os = "windows")]
    let names = ["npx.cmd", "npx.exe", "npx"];
    #[cfg(not(target_os = "windows"))]
    let names = ["npx"];

    for name in names {
        // 1. 同目录下找
        let candidate = dir.join(name);
        if candidate.exists() {
            return Some(candidate);
        }
        // 2. dir/bin 目录下找（如果 node 在根目录）
        let candidate_bin = dir.join("bin").join(name);
        if candidate_bin.exists() {
            return Some(candidate_bin);
        }
    }
    None
}

/// 把 Node 所在目录拼到 PATH 最前面，保证 npx 及其拉起的 node 可被找到
fn build_path_env(node_path: Option<&str>) -> Option<String> {
    let dir = PathBuf::from(node_path?).parent()?.to_path_buf();
    let dir_str = dir.to_string_lossy().to_string();
    if dir_str.is_empty() {
        return None;
    }

    #[cfg(target_os = "windows")]
    let sep = ";";
    #[cfg(not(target_os = "windows"))]
    let sep = ":";

    let existing = std::env::var("PATH").unwrap_or_default();
    Some(format!("{}{}{}", dir_str, sep, existing))
}

/// 端口是否已在监听（TCP 连接成功即视为服务已起来）
async fn port_is_listening(port: u16) -> bool {
    let addr = format!("127.0.0.1:{}", port);
    matches!(
        tokio::time::timeout(Duration::from_millis(800), TcpStream::connect(addr)).await,
        Ok(Ok(_))
    )
}

/// 端口是否空闲
fn port_is_free(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

async fn wait_port_release(port: u16) -> bool {
    let deadline = Instant::now() + PORT_RELEASE_TIMEOUT;
    while Instant::now() < deadline {
        if port_is_free(port) {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    port_is_free(port)
}

fn process_alive(pid: u32) -> bool {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("tasklist")
            .args(["/FI", &format!("PID eq {}", pid)])
            .output()
            .map(|o| {
                let out = String::from_utf8_lossy(&o.stdout).to_string();
                out.contains(&pid.to_string())
            })
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("kill")
            .args(["-0", &pid.to_string()])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
}

/// 结束整个进程树：npx 只是包装器，真正的服务是它 fork 出来的 node 子进程，
/// 只杀 npx 会让服务变孤儿进程继续占着端口 —— 那正是「显示已停止但实际还在跑」的根源。
async fn kill_process_tree(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .output()
            .await;
    }

    #[cfg(not(target_os = "windows"))]
    {
        // spawn 时设置了 process_group(0)，pgid == pid，整组一起收掉
        let _ = Command::new("kill")
            .args(["-TERM", &format!("-{}", pid)])
            .output()
            .await;

        for _ in 0..10 {
            if !process_alive(pid) {
                return;
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }

        let _ = Command::new("kill")
            .args(["-KILL", &format!("-{}", pid)])
            .output()
            .await;
        let _ = Command::new("kill")
            .args(["-KILL", &pid.to_string()])
            .output()
            .await;
    }
}

impl ServiceManager {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(ProcessState::new())),
        }
    }

    /// Detect Node.js environment
    pub async fn detect_node(&self, app_handle: &AppHandle) -> (bool, Option<String>, bool) {
        // 0. Check explicit custom embedded node path via env var (for development / testing)
        if let Ok(custom_embedded) = std::env::var("OPENLEARN_EMBEDDED_NODE") {
            let p = PathBuf::from(custom_embedded.trim());
            if p.exists() {
                return (true, Some(p.to_string_lossy().to_string()), true);
            }
        }

        // 1. Check embedded node in packaged Tauri resources
        if let Ok(resource_dir) = app_handle.path().resource_dir() {
            #[cfg(target_os = "windows")]
            let candidates = [
                resource_dir.join("node").join("node.exe"),
                resource_dir.join("node").join("bin").join("node.exe"),
            ];
            #[cfg(not(target_os = "windows"))]
            let candidates = [
                resource_dir.join("node").join("node"),
                resource_dir.join("node").join("bin").join("node"),
            ];

            for embedded_node in candidates {
                if embedded_node.exists() {
                    return (true, Some(embedded_node.to_string_lossy().to_string()), true);
                }
            }
        }

        // 2. Check dev-mode relative paths (src-tauri/resources/node or resources/node)
        for candidate_dir in [
            PathBuf::from("resources").join("node"),
            PathBuf::from("src-tauri").join("resources").join("node"),
            PathBuf::from("..").join("resources").join("node"),
        ] {
            #[cfg(target_os = "windows")]
            let dev_candidates = [
                candidate_dir.join("node.exe"),
                candidate_dir.join("bin").join("node.exe"),
            ];
            #[cfg(not(target_os = "windows"))]
            let dev_candidates = [
                candidate_dir.join("node"),
                candidate_dir.join("bin").join("node"),
            ];

            for embedded_node in dev_candidates {
                if embedded_node.exists() {
                    if let Ok(canonical) = embedded_node.canonicalize() {
                        return (true, Some(canonical.to_string_lossy().to_string()), true);
                    }
                    return (true, Some(embedded_node.to_string_lossy().to_string()), true);
                }
            }
        }

        // Check simulation flag for Full edition
        let force_full = std::env::var("OPENLEARN_FORCE_FULL")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false);

        // 3. Check system node
        #[cfg(target_os = "windows")]
        let check_cmd = "where node";
        #[cfg(not(target_os = "windows"))]
        let check_cmd = "which node";

        let parts: Vec<&str> = check_cmd.split_whitespace().collect();
        if let Ok(output) = Command::new(parts[0]).args(&parts[1..]).output().await {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if !path.is_empty() {
                    let display_path = if force_full {
                        format!("{} (仿真 Full 模式)", path)
                    } else {
                        path
                    };
                    return (true, Some(display_path), force_full);
                }
            }
        }

        // 4. 常见安装位置兜底：GUI 从桌面启动器拉起时 PATH 常被精简
        for candidate in candidate_node_paths() {
            if candidate.exists() {
                let p_str = candidate.to_string_lossy().to_string();
                let display_path = if force_full {
                    format!("{} (仿真 Full 模式)", p_str)
                } else {
                    p_str
                };
                return (true, Some(display_path), force_full);
            }
        }

        (false, None, false)
    }

    /// Check if port 127.0.0.1:port is available
    pub async fn check_port(&self, port: u16) -> PortCheckResult {
        let state = self.state.lock().await;
        if state.is_running && state.port == port {
            return PortCheckResult {
                available: false,
                occupied_by_self: true,
                message: format!("端口 {} 正在被当前 OpenLearn 管理器服务使用", port),
            };
        }
        drop(state);

        match TcpListener::bind(("127.0.0.1", port)) {
            Ok(_) => PortCheckResult {
                available: true,
                occupied_by_self: false,
                message: format!("端口 {} 可用", port),
            },
            Err(_) => PortCheckResult {
                available: false,
                occupied_by_self: false,
                message: format!("端口 {} 已被其他应用程序占用，请更换端口", port),
            },
        }
    }

    /// Get current service status
    pub async fn get_status(&self, app_handle: &AppHandle) -> ServiceStatus {
        let (node_detected, node_path, is_full_edition) = self.detect_node(app_handle).await;
        let state = self.state.lock().await;

        ServiceStatus {
            is_running: state.is_running,
            is_starting: state.is_starting,
            pid: state.pid,
            port: state.port,
            cli_version: state.cli_version.clone(),
            node_detected,
            node_path,
            is_full_edition,
        }
    }

    /// Build the command string for display
    pub fn build_command_str(port: u16, cli_version: Option<&str>, db_path: Option<&str>) -> String {
        let pkg = match cli_version {
            Some(v) if !v.trim().is_empty() => format!("openlearn-next@{}", v.trim()),
            _ => "openlearn-next@latest".to_string(),
        };

        // 注意：openlearn-next 没有 `start` 子命令，启动服务就是不带子命令直接运行
        let mut cmd = format!("npx {} -p {} -H 127.0.0.1", pkg, port);
        if let Some(dp) = db_path {
            if !dp.trim().is_empty() {
                cmd.push_str(&format!(" --db-path \"{}\"", dp.trim()));
            }
        }
        cmd
    }

    /// 构造启动命令：优先用解析到的 npx 绝对路径，并把 Node 目录注入 PATH
    fn build_start_command(
        node_path: Option<&str>,
        pkg: &str,
        port: u16,
        db_path: Option<&str>,
    ) -> Command {
        let npx = resolve_npx(node_path);

        #[cfg(target_os = "windows")]
        let mut cmd = {
            // Windows 下 npx 是 .cmd 脚本，必须经由 cmd.exe 执行
            let mut c = Command::new("cmd");
            c.arg("/C");
            match npx {
                Some(p) => c.arg(p),
                None => c.arg("npx"),
            };
            c
        };

        #[cfg(not(target_os = "windows"))]
        let mut cmd = match npx {
            Some(p) => Command::new(p),
            None => Command::new("npx"),
        };

        // openlearn-next 的启动入口是「无子命令 + 选项」：
        // `npx openlearn-next@x -p <port> -H 127.0.0.1`。
        // 传 `start` 会被 CLI 当成未知位置参数直接报错退出（正是之前的假成功来源）。
        cmd.arg("-y")
            .arg(pkg)
            .arg("-p")
            .arg(port.to_string())
            .arg("-H")
            .arg("127.0.0.1");

        if let Some(dp) = db_path {
            if !dp.trim().is_empty() {
                cmd.arg("--db-path").arg(dp.trim());
            }
        }

        if let Some(path_env) = build_path_env(node_path) {
            cmd.env("PATH", path_env);
        }

        // Unix：独立进程组，停止时可整组回收（含 npx fork 出的 node 子进程）
        #[cfg(not(target_os = "windows"))]
        cmd.process_group(0);

        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        cmd
    }

    /// Start the service —— 必须等到端口真正开始监听才返回成功
    pub async fn start_service(
        &self,
        app_handle: AppHandle,
        port: u16,
        cli_version: Option<String>,
        db_path: Option<String>,
    ) -> Result<(), String> {
        let (node_detected, node_path, _is_full) = self.detect_node(&app_handle).await;
        if !node_detected {
            return Err("未检测到 Node.js 运行时环境，请先安装 Node.js 22 LTS 或更高版本".to_string());
        }

        let port_check = self.check_port(port).await;
        if !port_check.available && !port_check.occupied_by_self {
            return Err(port_check.message);
        }

        {
            let mut state = self.state.lock().await;
            if state.is_running {
                return Err("服务已在运行中".to_string());
            }
            if state.is_starting {
                return Err("服务正在启动中，请等待本次启动结果".to_string());
            }
            state.is_starting = true;
            state.is_running = false;
            state.port = port;
            state.recent_output.clear();
            let version_tag = cli_version.clone().unwrap_or_else(|| "latest".to_string());
            state.cli_version = Some(version_tag.clone());

            let start_msg = format!(
                "正在启动 OpenLearn-Next 服务 (端口: {}, 版本: {})。首次启动需下载 CLI 包，最长等待 {} 秒...",
                port,
                version_tag,
                START_TIMEOUT.as_secs()
            );
            let entry = state.append_log("system", &start_msg);
            let _ = app_handle.emit("app:log-line", &entry);
        }

        let version_tag = cli_version.unwrap_or_else(|| "latest".to_string());
        let pkg = format!("openlearn-next@{}", version_tag);
        let mut cmd =
            Self::build_start_command(node_path.as_deref(), &pkg, port, db_path.as_deref());

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let mut state = self.state.lock().await;
                state.is_starting = false;
                state.is_running = false;
                let err_msg = format!(
                    "启动失败：无法执行 npx 命令（{}）。请确认 Node.js 已正确安装且包含 npx。",
                    e
                );
                let entry = state.append_log("stderr", &err_msg);
                let _ = app_handle.emit("app:log-line", &entry);
                let _ = app_handle.emit("app:service-status-changed", ());
                return Err(err_msg);
            }
        };

        let pid = child.id();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        {
            let mut state = self.state.lock().await;
            state.child = Some(child);
            state.pid = pid;
            // 注意：此刻仍然是「启动中」，is_running 要等端口真正监听后才置真
            let entry = state.append_log(
                "system",
                &format!(
                    "CLI 进程已创建 [PID: {:?}]，等待 http://127.0.0.1:{} 开始响应...",
                    pid, port
                ),
            );
            let _ = app_handle.emit("app:log-line", &entry);
            let _ = app_handle.emit("app:service-status-changed", ());
        }

        // Stream stdout
        if let Some(stdout) = stdout {
            let app_handle_clone = app_handle.clone();
            let state_clone = self.state.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let mut st = state_clone.lock().await;
                    let entry = st.append_output("stdout", &line);
                    let _ = app_handle_clone.emit("app:log-line", &entry);
                }
            });
        }

        // Stream stderr
        if let Some(stderr) = stderr {
            let app_handle_clone = app_handle.clone();
            let state_clone = self.state.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let mut st = state_clone.lock().await;
                    let entry = st.append_output("stderr", &line);
                    let _ = app_handle_clone.emit("app:log-line", &entry);
                }
            });
        }

        // —— 关键：阻塞等待服务真正就绪，而不是 spawn 成功就报成功 ——
        let started_at = Instant::now();
        let mut last_report = Instant::now();
        let outcome: Result<(), String> = loop {
            // 1) 子进程是否已退出（npx 下载失败 / CLI 参数错误 / 端口被抢占都会在这里暴露）
            let exit_code: Option<Option<i32>> = {
                let mut st = self.state.lock().await;
                match st.child.as_mut() {
                    Some(child) => match child.try_wait() {
                        Ok(Some(status)) => Some(status.code()),
                        Ok(None) => None,
                        Err(_) => Some(None),
                    },
                    None => {
                        // 子进程已被移除：用户主动停止
                        break Err("启动已取消：服务进程被停止".to_string());
                    }
                }
            };

            if let Some(code) = exit_code {
                let tail = {
                    let st = self.state.lock().await;
                    st.tail_output(15)
                };
                let code_desc = match code {
                    Some(c) => format!("退出码 {}", c),
                    None => "被信号终止".to_string(),
                };
                let detail = if tail.trim().is_empty() {
                    "（进程无任何输出）".to_string()
                } else {
                    format!("\n最近输出:\n{}", tail)
                };
                let err_msg = format!(
                    "服务启动失败：CLI 进程在端口开始监听前就已退出（{}）。\n请检查：端口 {} 是否被其他程序占用、openlearn-next@{} 是否存在、网络是否可访问 npm。{}",
                    code_desc, port, version_tag, detail
                );
                self.mark_not_running(&app_handle, &err_msg).await;
                break Err(err_msg);
            }

            // 2) 端口是否已开始监听
            if port_is_listening(port).await {
                let elapsed = started_at.elapsed().as_secs_f32();
                {
                    let mut st = self.state.lock().await;
                    st.is_running = true;
                    st.is_starting = false;
                    let entry = st.append_log(
                        "system",
                        &format!(
                            "服务已就绪：http://127.0.0.1:{} 已开始响应（PID: {:?}，耗时 {:.1}s）",
                            port, pid, elapsed
                        ),
                    );
                    let _ = app_handle.emit("app:log-line", &entry);
                    let _ = app_handle.emit("app:service-status-changed", ());
                }
                self.spawn_exit_monitor(app_handle.clone());
                break Ok(());
            }

            // 3) 超时
            if started_at.elapsed() >= START_TIMEOUT {
                let tail = {
                    let st = self.state.lock().await;
                    st.tail_output(15)
                };
                let detail = if tail.trim().is_empty() {
                    "（进程无任何输出）".to_string()
                } else {
                    format!("\n最近输出:\n{}", tail)
                };
                let err_msg = format!(
                    "服务启动超时：等待 {} 秒后 http://127.0.0.1:{} 仍未开始监听。\n可能是 npx 下载 openlearn-next@{} 过慢或失败，也可能是启动过程卡住。已终止该进程。{}",
                    START_TIMEOUT.as_secs(),
                    port,
                    version_tag,
                    detail
                );
                self.kill_current(&app_handle).await;
                self.mark_not_running(&app_handle, &err_msg).await;
                break Err(err_msg);
            }

            // 4) 进度汇报
            if last_report.elapsed() >= PROGRESS_REPORT_INTERVAL {
                last_report = Instant::now();
                let waited = started_at.elapsed().as_secs();
                let mut st = self.state.lock().await;
                let entry = st.append_log(
                    "system",
                    &format!(
                        "仍在等待服务就绪...（已等待 {}s，上限 {}s）",
                        waited,
                        START_TIMEOUT.as_secs()
                    ),
                );
                let _ = app_handle.emit("app:log-line", &entry);
            }

            tokio::time::sleep(READY_POLL_INTERVAL).await;
        };

        outcome
    }

    /// 服务就绪后持续监控，进程退出时同步状态
    fn spawn_exit_monitor(&self, app_handle: AppHandle) {
        let state_clone = self.state.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_millis(500)).await;
                let mut st = state_clone.lock().await;
                if let Some(ref mut child) = st.child {
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            st.is_running = false;
                            st.is_starting = false;
                            st.child = None;
                            st.pid = None;
                            let msg = format!("本地服务已退出，退出代码: {:?}", status.code());
                            let entry = st.append_log("system", &msg);
                            let _ = app_handle.emit("app:log-line", &entry);
                            let _ = app_handle.emit("app:service-status-changed", ());
                            break;
                        }
                        Ok(None) => {}
                        Err(e) => {
                            st.is_running = false;
                            st.is_starting = false;
                            st.child = None;
                            st.pid = None;
                            let msg = format!("检查服务状态发生错误: {}", e);
                            let entry = st.append_log("stderr", &msg);
                            let _ = app_handle.emit("app:log-line", &entry);
                            let _ = app_handle.emit("app:service-status-changed", ());
                            break;
                        }
                    }
                } else {
                    break;
                }
            }
        });
    }

    /// 结束当前子进程（含进程树），不修改 is_running / is_starting
    async fn kill_current(&self, _app_handle: &AppHandle) {
        let (pid, mut child) = {
            let mut st = self.state.lock().await;
            (st.pid, st.child.take())
        };

        if let Some(pid) = pid {
            kill_process_tree(pid).await;
        }
        if let Some(ref mut c) = child {
            let _ = c.start_kill();
            let _ = c.wait().await;
        }
    }

    /// 统一的状态回落：清空进程引用并广播
    async fn mark_not_running(&self, app_handle: &AppHandle, message: &str) {
        let mut st = self.state.lock().await;
        st.is_running = false;
        st.is_starting = false;
        st.child = None;
        st.pid = None;
        let entry = st.append_log("stderr", message);
        let _ = app_handle.emit("app:log-line", &entry);
        let _ = app_handle.emit("app:service-status-changed", ());
    }

    /// Stop the running service —— 结束后校验端口是否真的释放
    pub async fn stop_service(&self, app_handle: &AppHandle) -> Result<(), String> {
        let port = {
            let mut state = self.state.lock().await;
            if !state.is_running && state.child.is_none() {
                return Ok(());
            }
            let entry = state.append_log("system", "正在停止本地服务...");
            let _ = app_handle.emit("app:log-line", &entry);
            state.port
        };

        self.kill_current(app_handle).await;

        let released = wait_port_release(port).await;

        {
            let mut state = self.state.lock().await;
            state.is_running = false;
            state.is_starting = false;
            state.child = None;
            state.pid = None;
            let entry = if released {
                state.append_log("system", &format!("本地服务已停止，端口 {} 已释放。", port))
            } else {
                state.append_log(
                    "system",
                    &format!(
                        "本地服务进程已结束，但端口 {} 仍被占用，可能残留了未被回收的子进程，请稍候重试或换端口。",
                        port
                    ),
                )
            };
            let _ = app_handle.emit("app:log-line", &entry);
            let _ = app_handle.emit("app:service-status-changed", ());
        }

        Ok(())
    }

    /// Run one-off CLI tool command
    pub async fn run_cli_command(
        &self,
        app_handle: AppHandle,
        command_type: &str,
        extra_arg: Option<String>,
        config: &AppConfig,
        force: bool,
    ) -> Result<CommandOutputResult, String> {
        let version_tag = config.cli_version.as_deref().unwrap_or("latest");
        let pkg = format!("openlearn-next@{}", version_tag);

        let mut args: Vec<String> = vec!["-y".to_string(), pkg];

        match command_type {
            "doctor" => {
                args.push("doctor".to_string());
            }
            "doctor-fix" => {
                args.push("doctor".to_string());
                args.push("--fix".to_string());
            }
            "reset-admin" => {
                args.push("reset-admin".to_string());
                if let Some(pwd) = extra_arg {
                    if !pwd.trim().is_empty() {
                        args.push("--password".to_string());
                        args.push(pwd.trim().to_string());
                    }
                }
            }
            "clean-npx" => {
                args.push("clean".to_string());
                args.push("--npx".to_string());
            }
            "backup" => {
                args.push("backup".to_string());
                // backup 的备份文件路径是位置参数，不是 --output
                if let Some(out) = extra_arg {
                    args.push(out);
                }
            }
            "restore" => {
                // Restore must stop running service first
                self.stop_service(&app_handle).await?;
                args.push("restore".to_string());
                if let Some(file) = extra_arg {
                    args.push(file);
                }
                // 快照来自更新版本时 CLI 默认拒绝恢复，只有显式 --force 才放行
                if force {
                    args.push("--force".to_string());
                }
            }
            other => return Err(format!("未知命令: {}", other)),
        }

        if let Some(ref dp) = config.db_path {
            if !dp.trim().is_empty() {
                args.push("--db-path".to_string());
                args.push(dp.trim().to_string());
            }
        }

        let cmd_str = format!("npx {}", args.join(" "));
        {
            let mut state = self.state.lock().await;
            let log = state.append_log("system", &format!("执行维护命令: {}", cmd_str));
            let _ = app_handle.emit("app:log-line", &log);
        }

        // 与启动保持一致：用解析到的 npx 绝对路径 + 注入 PATH
        let (node_detected, node_path, _) = self.detect_node(&app_handle).await;
        if !node_detected {
            return Err("未检测到 Node.js 运行时环境，无法执行 CLI 命令".to_string());
        }

        #[cfg(target_os = "windows")]
        let mut process = {
            let mut p = Command::new("cmd");
            p.arg("/C");
            match resolve_npx(node_path.as_deref()) {
                Some(npx) => p.arg(npx),
                None => p.arg("npx"),
            };
            p
        };

        #[cfg(not(target_os = "windows"))]
        let mut process = match resolve_npx(node_path.as_deref()) {
            Some(npx) => Command::new(npx),
            None => Command::new("npx"),
        };

        process.args(&args);
        if let Some(path_env) = build_path_env(node_path.as_deref()) {
            process.env("PATH", path_env);
        }

        // output() 会一直阻塞到进程结束，这里确实是在等真实结果
        let output = match process.output().await {
            Ok(o) => o,
            Err(e) => {
                let err = format!("执行命令失败：{}（命令: {}）", e, cmd_str);
                let mut state = self.state.lock().await;
                let entry = state.append_log("stderr", &err);
                let _ = app_handle.emit("app:log-line", &entry);
                return Err(err);
            }
        };
        let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr_str = String::from_utf8_lossy(&output.stderr).to_string();

        let combined = if !stderr_str.is_empty() {
            format!("{}\n{}", stdout_str, stderr_str)
        } else {
            stdout_str
        };

        {
            let mut state = self.state.lock().await;
            for line in combined.lines() {
                let entry = state.append_output("stdout", line);
                let _ = app_handle.emit("app:log-line", &entry);
            }
        }

        // 非零退出码时把结论写清楚，不再让调用方误以为「执行成功」
        let success = output.status.success();
        if !success {
            let mut state = self.state.lock().await;
            let entry = state.append_log(
                "stderr",
                &format!(
                    "命令执行失败（退出码: {:?}）: {}",
                    output.status.code(),
                    cmd_str
                ),
            );
            let _ = app_handle.emit("app:log-line", &entry);
        }

        Ok(CommandOutputResult { success, output: combined })
    }

    /// Read all current logs
    pub async fn get_logs(&self) -> Vec<LogEntry> {
        let state = self.state.lock().await;
        state.logs.iter().cloned().collect()
    }

    /// Clear all logs
    pub async fn clear_logs(&self, app_handle: &AppHandle) {
        let mut state = self.state.lock().await;
        state.logs.clear();
        let entry = state.append_log("system", "日志已被清空。");
        let _ = app_handle.emit("app:log-line", &entry);
    }
}
