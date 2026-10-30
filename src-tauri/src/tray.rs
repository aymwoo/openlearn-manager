use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

use crate::process_manager::ServiceManager;

pub fn setup_tray(app: &AppHandle, service_manager: Arc<ServiceManager>) -> Result<(), Box<dyn std::error::Error>> {
    let open_item = MenuItem::with_id(app, "open_window", "打开", true, None::<&str>)?;
    let browser_item = MenuItem::with_id(app, "open_browser", "打开浏览器", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "stop_and_quit", "停止并退出", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&open_item, &browser_item, &quit_item])?;

    let sm_clone = service_manager.clone();
    let tray = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("OpenLearn Manager")
        .on_menu_event(move |app, event| {
            match event.id.as_ref() {
                "open_window" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
                "open_browser" => {
                    let sm = sm_clone.clone();
                    let app_handle = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let status = sm.get_status(&app_handle).await;
                        let url = format!("http://127.0.0.1:{}", status.port);
                        let _ = tauri_plugin_opener::open_url(url, None::<&str>);
                    });
                }
                "stop_and_quit" => {
                    let sm = sm_clone.clone();
                    let app_handle = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = sm.stop_service(&app_handle).await;
                        app_handle.exit(0);
                    });
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        });

    #[cfg(desktop)]
    {
        if let Some(icon) = app.default_window_icon() {
            let _ = tray.icon(icon.clone()).build(app)?;
            return Ok(());
        }
    }

    let _ = tray.build(app)?;
    Ok(())
}
