use std::collections::VecDeque;
use std::net::TcpListener;
use std::process::Stdio;
use std::sync::Arc;
use chrono::Local;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::models::{AppConfig, CommandOutputResult, LogEntry, PortCheckResult, ServiceStatus};

const MAX_LOG_LINES: usize = 2000;

pub struct ProcessState {
    pub child: Option<Child>,
    pub pid: Option<u32>,
    pub port: u16,
    pub is_running: bool,
    pub is_starting: bool,
    pub cli_version: Option<String>,
    pub logs: VecDeque<LogEntry>,
}

impl ProcessState {
    pub fn new() -> Self {
        Self {
            child: None,
            pid: None,
            port: 3000,
            is_running: false,
            is_starting: false,
            cli_version: None,
            logs: VecDeque::with_capacity(MAX_LOG_LINES),
        }
    }

    pub fn append_log(&mut self, stream: &str, message: &str) -> LogEntry {
        let entry = LogEntry {
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
}

pub struct ServiceManager {
    pub state: Arc<Mutex<ProcessState>>,
}

impl ServiceManager {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(ProcessState::new())),
        }
    }

    /// Detect Node.js environment
    pub async fn detect_node(&self, app_handle: &AppHandle) -> (bool, Option<String>, bool) {
        // 1. Check embedded node in resources
        if let Ok(resource_dir) = app_handle.path().resource_dir() {
            #[cfg(target_os = "windows")]
            let embedded_node = resource_dir.join("node").join("node.exe");
            #[cfg(not(target_os = "windows"))]
            let embedded_node = resource_dir.join("node").join("node");

            if embedded_node.exists() {
                return (true, Some(embedded_node.to_string_lossy().to_string()), true);
            }
        }

        // 2. Check system node
        #[cfg(target_os = "windows")]
        let check_cmd = "where node";
        #[cfg(not(target_os = "windows"))]
        let check_cmd = "which node";

        let parts: Vec<&str> = check_cmd.split_whitespace().collect();
        if let Ok(output) = Command::new(parts[0]).args(&parts[1..]).output().await {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return (true, Some(path), false);
                }
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

        let mut cmd = format!("npx {} start -p {} -H 127.0.0.1", pkg, port);
        if let Some(dp) = db_path {
            if !dp.trim().is_empty() {
                cmd.push_str(&format!(" --db-path \"{}\"", dp.trim()));
            }
        }
        cmd
    }

    /// Start the service
    pub async fn start_service(
        &self,
        app_handle: AppHandle,
        port: u16,
        cli_version: Option<String>,
        db_path: Option<String>,
    ) -> Result<(), String> {
        let (node_detected, _node_path, _is_full) = self.detect_node(&app_handle).await;
        if !node_detected {
            return Err("未检测到 Node.js 运行时环境，请先安装 Node.js 22 LTS 或更高版本".to_string());
        }

        // Check port
        let port_check = self.check_port(port).await;
        if !port_check.available && !port_check.occupied_by_self {
            return Err(port_check.message);
        }

        let mut state = self.state.lock().await;
        if state.is_running {
            return Err("服务已在运行中".to_string());
        }

        state.is_starting = true;
        state.port = port;
        let version_tag = cli_version.clone().unwrap_or_else(|| "latest".to_string());
        state.cli_version = Some(version_tag.clone());

        let start_msg = format!("正在启动 OpenLearn-Next 服务 (端口: {}, 版本: {})...", port, version_tag);
        let entry = state.append_log("system", &start_msg);
        let _ = app_handle.emit("app:log-line", &entry);
        drop(state);

        let pkg = format!("openlearn-next@{}", version_tag);
        let mut cmd = if cfg!(target_os = "windows") {
            let mut c = Command::new("cmd");
            c.arg("/C").arg("npx").arg("-y").arg(&pkg).arg("start").arg("-p").arg(port.to_string()).arg("-H").arg("127.0.0.1");
            c
        } else {
            let mut c = Command::new("npx");
            c.arg("-y").arg(&pkg).arg("start").arg("-p").arg(port.to_string()).arg("-H").arg("127.0.0.1");
            c
        };

        if let Some(ref dp) = db_path {
            if !dp.trim().is_empty() {
                cmd.arg("--db-path").arg(dp.trim());
            }
        }

        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let mut state = self.state.lock().await;
                state.is_starting = false;
                let err_msg = format!("启动失败: 无法执行 npx 命令 ({})", e);
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
            state.is_running = true;
            state.is_starting = false;
            let success_entry = state.append_log("system", &format!("服务进程已启动 [PID: {:?}]，监听地址: http://127.0.0.1:{}", pid, port));
            let _ = app_handle.emit("app:log-line", &success_entry);
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
                    let entry = st.append_log("stdout", &line);
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
                    let entry = st.append_log("stderr", &line);
                    let _ = app_handle_clone.emit("app:log-line", &entry);
                }
            });
        }

        // Monitor child process exit
        let app_handle_clone = app_handle.clone();
        let state_clone = self.state.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
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
                            let _ = app_handle_clone.emit("app:log-line", &entry);
                            let _ = app_handle_clone.emit("app:service-status-changed", ());
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
                            let _ = app_handle_clone.emit("app:log-line", &entry);
                            let _ = app_handle_clone.emit("app:service-status-changed", ());
                            break;
                        }
                    }
                } else {
                    break;
                }
            }
        });

        Ok(())
    }

    /// Stop the running service
    pub async fn stop_service(&self, app_handle: &AppHandle) -> Result<(), String> {
        let mut state = self.state.lock().await;
        if !state.is_running && state.child.is_none() {
            return Ok(());
        }

        let entry = state.append_log("system", "正在停止本地服务...");
        let _ = app_handle.emit("app:log-line", &entry);

        #[cfg(target_os = "windows")]
        if let Some(pid) = state.pid {
            let _ = Command::new("taskkill")
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .output()
                .await;
        }

        #[cfg(not(target_os = "windows"))]
        if let Some(ref mut child) = state.child {
            let _ = child.start_kill();
        }

        state.is_running = false;
        state.is_starting = false;
        state.child = None;
        state.pid = None;

        let stopped_entry = state.append_log("system", "本地服务已完全停止。");
        let _ = app_handle.emit("app:log-line", &stopped_entry);
        let _ = app_handle.emit("app:service-status-changed", ());

        Ok(())
    }

    /// Run one-off CLI tool command
    pub async fn run_cli_command(
        &self,
        app_handle: AppHandle,
        command_type: &str,
        extra_arg: Option<String>,
        config: &AppConfig,
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
                if let Some(out) = extra_arg {
                    args.push("--output".to_string());
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

        #[cfg(target_os = "windows")]
        let mut process = Command::new("cmd");
        #[cfg(target_os = "windows")]
        process.arg("/C").arg("npx").args(&args);

        #[cfg(not(target_os = "windows"))]
        let mut process = Command::new("npx");
        #[cfg(not(target_os = "windows"))]
        process.args(&args);

        let output = process.output().await.map_err(|e| format!("执行命令失败: {}", e))?;
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
                let entry = state.append_log("stdout", line);
                let _ = app_handle.emit("app:log-line", &entry);
            }
        }

        Ok(CommandOutputResult {
            success: output.status.success(),
            output: combined,
        })
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
