mod backup;
mod config;
mod models;
mod process_manager;
mod tray;

use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

use crate::models::{
    AppConfig, BackupInfo, CommandOutputResult, LogEntry, PortCheckResult, ServiceStatus,
};
use crate::process_manager::ServiceManager;

pub struct AppState {
    pub service_manager: Arc<ServiceManager>,
}

#[tauri::command]
async fn get_status(app: AppHandle, state: State<'_, AppState>) -> Result<ServiceStatus, String> {
    Ok(state.service_manager.get_status(&app).await)
}

#[tauri::command]
async fn check_port(port: u16, state: State<'_, AppState>) -> Result<PortCheckResult, String> {
    Ok(state.service_manager.check_port(port).await)
}

#[tauri::command]
async fn start_service(
    app: AppHandle,
    port: u16,
    cli_version: Option<String>,
    db_path: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .service_manager
        .start_service(app, port, cli_version, db_path)
        .await
}

#[tauri::command]
async fn stop_service(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.service_manager.stop_service(&app).await
}

#[tauri::command]
async fn get_logs(state: State<'_, AppState>) -> Result<Vec<LogEntry>, String> {
    Ok(state.service_manager.get_logs().await)
}

#[tauri::command]
async fn clear_logs(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.service_manager.clear_logs(&app).await;
    Ok(())
}

#[tauri::command]
fn get_config() -> AppConfig {
    config::load_config()
}

#[tauri::command]
fn save_config(cfg: AppConfig) -> Result<(), String> {
    config::save_config(&cfg)
}

#[tauri::command]
fn get_backups() -> Result<Vec<BackupInfo>, String> {
    backup::list_backups()
}

#[tauri::command]
async fn create_backup(app: AppHandle, state: State<'_, AppState>) -> Result<BackupInfo, String> {
    let dir = backup::ensure_backup_dir()?;
    let filename = backup::generate_backup_filename();
    let filepath = dir.join(&filename);
    let filepath_str = filepath.to_string_lossy().to_string();

    let cfg = config::load_config();
    let res = state
        .service_manager
        .run_cli_command(app.clone(), "backup", Some(filepath_str.clone()), &cfg, false)
        .await?;

    if !res.success {
        return Err(format!("备份命令执行失败: {}", res.output));
    }

    let meta = std::fs::metadata(&filepath).map_err(|e| format!("读取备份文件信息失败: {}", e))?;
    let now = chrono::Local::now();

    Ok(BackupInfo {
        filename,
        filepath: filepath_str,
        size_bytes: meta.len(),
        created_at: now.format("%Y-%m-%d %H:%M:%S").to_string(),
    })
}

#[tauri::command]
async fn restore_backup(
    app: AppHandle,
    filepath: String,
    force: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let cfg = config::load_config();
    let res = state
        .service_manager
        .run_cli_command(app.clone(), "restore", Some(filepath), &cfg, force)
        .await?;

    if !res.success {
        return Err(format!("恢复备份失败: {}", res.output));
    }
    Ok(())
}

#[tauri::command]
fn open_backup_directory() -> Result<(), String> {
    let dir = backup::get_backup_dir();
    let _ = backup::ensure_backup_dir();
    let path_str = dir.to_string_lossy().to_string();
    tauri_plugin_opener::reveal_item_in_dir(path_str).map_err(|e| format!("打开备份文件夹失败: {}", e))
}

#[tauri::command]
async fn run_cli_command(
    app: AppHandle,
    command_type: String,
    extra_arg: Option<String>,
    state: State<'_, AppState>,
) -> Result<CommandOutputResult, String> {
    let cfg = config::load_config();
    state
        .service_manager
        .run_cli_command(app, &command_type, extra_arg, &cfg, false)
        .await
}

#[tauri::command]
fn preview_command(
    port: u16,
    cli_version: Option<String>,
    db_path: Option<String>,
) -> String {
    ServiceManager::build_command_str(port, cli_version.as_deref(), db_path.as_deref())
}

#[tauri::command]
fn open_browser(port: u16) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{}", port);
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| format!("打开系统浏览器失败: {}", e))
}

#[tauri::command]
async fn exit_app(
    app: AppHandle,
    stop_service_first: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if stop_service_first {
        let _ = state.service_manager.stop_service(&app).await;
    }
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn hide_to_tray(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| format!("最小化到托盘失败: {}", e))?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let service_manager = Arc::new(ServiceManager::new());
    let sm_tray = service_manager.clone();
    let sm_window = service_manager.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .manage(AppState {
            service_manager: service_manager.clone(),
        })
        .setup(move |app| {
            let handle = app.handle();
            let _ = tray::setup_tray(handle, sm_tray);
            Ok(())
        })
        .on_window_event(move |window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let sm = sm_window.clone();
                let is_running = {
                    let rt = tokio::runtime::Handle::try_current();
                    if let Ok(handle) = rt {
                        handle.block_on(async {
                            let state = sm.state.lock().await;
                            state.is_running
                        })
                    } else {
                        false
                    }
                };

                if is_running {
                    api.prevent_close();
                    let _ = window.emit("app:confirm-close", ());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_status,
            check_port,
            start_service,
            stop_service,
            get_logs,
            clear_logs,
            get_config,
            save_config,
            get_backups,
            create_backup,
            restore_backup,
            open_backup_directory,
            run_cli_command,
            preview_command,
            open_browser,
            exit_app,
            hide_to_tray,
        ])
        .run(tauri::generate_context!())
        .expect("运行 OpenLearn Manager 发生致命错误");
}
