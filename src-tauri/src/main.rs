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

#[derive(serde::Serialize)]
struct AppInfo {
    version: String,
    is_installed: bool,
    exe_path: String,
}

#[tauri::command]
fn get_app_info(app: tauri::AppHandle) -> AppInfo {
    let version = app.package_info().version.to_string();
    let exe_path = std::env::current_exe().unwrap_or_default();
    let exe_str = exe_path.to_string_lossy().to_lowercase();
    let is_installed = if let Some(parent) = exe_path.parent() {
        parent.join("uninstall.exe").exists()
            || exe_str.contains("program files")
            || exe_str.contains("local\\programs")
    } else {
        false
    };

    AppInfo {
        version,
        is_installed,
        exe_path: exe_path.to_string_lossy().to_string(),
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
        let target_filename = if is_installer {
            "sentinel_music_setup_latest.exe"
        } else {
            "sentinel_music_portable_latest.exe"
        };
        let temp_file = temp_dir.join(target_filename);

        // Удаляем старый файл, если он остался от предыдущих обновлений
        let _ = std::fs::remove_file(&temp_file);

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
        if metadata.len() < 500_000 {
            return Err("Загруженный файл поврежден или имеет неверный размер".to_string());
        }

        // 3. Формируем надежный PowerShell-скрипт обновления
        let current_exe = std::env::current_exe()
            .map_err(|e| format!("Не удалось определить путь текущего файла: {}", e))?;
        let current_pid = std::process::id();
        let script_file = temp_dir.join("sentinel_updater.ps1");

        let script_content = if is_installer {
            format!(
                r#"# Sentinel Music Installer Launcher
$procId = {pid}
$installer = '{installer}'

for ($i = 0; $i -lt 30; $i++) {{
    if (-not (Get-Process -Id $procId -ErrorAction SilentlyContinue)) {{ break }}
    Start-Sleep -Milliseconds 300
}}

Start-Process -FilePath $installer
"#,
                pid = current_pid,
                installer = temp_file.display().to_string().replace('\'', "''")
            )
        } else {
            format!(
                r#"# Sentinel Music Portable Self-Updater
$procId = {pid}
$temp = '{temp}'
$target = '{target}'
$backup = "$target.old"

# 1. Ждем завершения старого процесса
for ($i = 0; $i -lt 40; $i++) {{
    if (-not (Get-Process -Id $procId -ErrorAction SilentlyContinue)) {{ break }}
    Start-Sleep -Milliseconds 300
}}

# 2. Ротация и замена файлов с повторами при файловых блокировках Windows
$replaced = $false
for ($attempt = 0; $attempt -lt 15; $attempt++) {{
    try {{
        if (Test-Path -LiteralPath $backup) {{
            Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
        }}
        Move-Item -LiteralPath $target -Destination $backup -Force -ErrorAction Stop
        Move-Item -LiteralPath $temp -Destination $target -Force -ErrorAction Stop
        $replaced = $true
        break
    }} catch {{
        Start-Sleep -Milliseconds 500
    }}
}}

# 3. Запуск обновленной программы
if ($replaced) {{
    Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
    Start-Process -FilePath $target
}} else {{
    # В случае неудачи восстанавливаем резервную копию и запускаем
    if (Test-Path -LiteralPath $backup) {{
        Move-Item -LiteralPath $backup -Destination $target -Force -ErrorAction SilentlyContinue
    }}
    Start-Process -FilePath $target
}}
"#,
                pid = current_pid,
                temp = temp_file.display().to_string().replace('\'', "''"),
                target = current_exe.display().to_string().replace('\'', "''")
            )
        };

        std::fs::write(&script_file, script_content)
            .map_err(|e| format!("Не удалось создать скрипт обновления: {}", e))?;

        // 4. Запускаем PowerShell в фоновом режиме без окна
        std::process::Command::new("powershell.exe")
            .arg("-NoProfile")
            .arg("-NonInteractive")
            .arg("-ExecutionPolicy")
            .arg("Bypass")
            .arg("-WindowStyle")
            .arg("Hidden")
            .arg("-File")
            .arg(&script_file)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Не удалось запустить скрипт обновления: {}", e))?;

        // 5. Завершаем текущий экземпляр приложения
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
        .invoke_handler(tauri::generate_handler![open_in_browser, install_desktop_update, get_app_info])
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
