// Скрывает консольное окно в Windows при сборке в release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

#[tauri::command]
fn open_in_browser(url: String) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Invalid URL protocol".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        std::process::Command::new("cmd")
            .raw_arg(format!("/c start \"\" \"{}\"", url))
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        #[cfg(target_os = "macos")]
        let cmd = "open";
        #[cfg(not(target_os = "macos"))]
        let cmd = "xdg-open";

        std::process::Command::new(cmd)
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[tauri::command]
async fn install_desktop_update(
    app: tauri::AppHandle,
    download_url: String,
    is_installer: bool,
) -> Result<(), String> {
    if !download_url.starts_with("http://") && !download_url.starts_with("https://") {
        return Err("Invalid URL protocol".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let temp_dir = std::env::temp_dir();
        let temp_file = temp_dir.join("sentinel_music_latest.exe");

        // 1. Скачиваем файл обновления через нативный curl Windows
        let download_status = std::process::Command::new("curl.exe")
            .arg("-L")
            .arg("-f")
            .arg("-s")
            .arg("-S")
            .arg("-o")
            .arg(&temp_file)
            .arg(&download_url)
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|e| format!("Не удалось запустить загрузчик curl: {}", e))?;

        if !download_status.success() {
            return Err("Ошибка при скачивании файла обновления с GitHub".to_string());
        }

        // 2. Проверяем, что файл действительно скачался и имеет достаточный размер
        let metadata = std::fs::metadata(&temp_file)
            .map_err(|e| format!("Ошибка чтения загруженного файла: {}", e))?;
        if metadata.len() < 100_000 {
            return Err("Загруженный файл поврежден или имеет неверный размер".to_string());
        }

        // 3. Запуск обновления и перезапуск
        let current_exe = std::env::current_exe()
            .map_err(|e| format!("Не удалось определить путь текущего файла: {}", e))?;

        if is_installer {
            // Запуск установщика
            std::process::Command::new("cmd")
                .raw_arg(format!("/c start \"\" \"{}\"", temp_file.display()))
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| format!("Не удалось запустить установщик: {}", e))?;
        } else {
            // Для Portable .exe: ждем 1 сек (ping 127.0.0.1 -n 2), заменяем и запускаем
            let replace_cmd = format!(
                "/c ping 127.0.0.1 -n 2 >nul & move /y \"{}\" \"{}\" & start \"\" \"{}\"",
                temp_file.display(),
                current_exe.display(),
                current_exe.display()
            );
            std::process::Command::new("cmd")
                .raw_arg(replace_cmd)
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| format!("Не удалось инициировать замену программы: {}", e))?;
        }

        // Завершаем текущий экземпляр приложения
        app.exit(0);
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        open_in_browser(download_url)
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_in_browser, install_desktop_update])
        .setup(|app| {
            // Создаем меню для системного трея
            let quit_i = MenuItem::with_id(app, "quit", "Выход из Sentinel Music", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Показать плеер", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            // Инициализируем иконку в системном трее
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("Sentinel Music")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
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
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // При нажатии на крестик окно скрывается в трей, чтобы музыка не прерывалась
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
