use std::fs;
use std::path::Path;

#[test]
fn test_tauri_config_exists_and_is_valid() {
    let conf_path = Path::new("tauri.conf.json");
    assert!(conf_path.exists(), "tauri.conf.json must exist in src-tauri");

    let content = fs::read_to_string(conf_path).expect("Failed to read tauri.conf.json");
    let json: serde_json::Value = serde_json::from_str(&content).expect("tauri.conf.json must be valid JSON");

    assert_eq!(json["productName"], "Sentinel Music");
    assert_eq!(json["identifier"], "com.sentinelmusic.desktop");
    assert_eq!(json["version"], "0.0.1");
}

#[test]
fn test_window_configuration() {
    let content = fs::read_to_string("tauri.conf.json").expect("Failed to read tauri.conf.json");
    let json: serde_json::Value = serde_json::from_str(&content).unwrap();

    let windows = json["app"]["windows"].as_array().expect("windows must be an array");
    assert!(!windows.is_empty(), "Must have at least one window defined");

    let main_window = &windows[0];
    assert_eq!(main_window["label"], "main");
    assert_eq!(main_window["title"], "Sentinel Music — Домашний Стриминг");

    let width = main_window["width"].as_u64().unwrap_or(0);
    let height = main_window["height"].as_u64().unwrap_or(0);
    assert!(width >= 800, "Window width should be at least 800");
    assert!(height >= 600, "Window height should be at least 600");
}

#[test]
fn test_bundle_icons_exist() {
    let content = fs::read_to_string("tauri.conf.json").expect("Failed to read tauri.conf.json");
    let json: serde_json::Value = serde_json::from_str(&content).unwrap();

    let icons = json["bundle"]["icon"].as_array().expect("bundle.icon must be an array");
    assert!(!icons.is_empty(), "Icon list must not be empty");

    for icon in icons {
        let rel_path = icon.as_str().unwrap();
        let path = Path::new(rel_path);
        assert!(path.exists(), "Icon file {:?} must exist on disk", path);
    }
}
